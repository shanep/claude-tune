// The fixes /tune offers for each tip: a setting it writes, a skill or
// agent it creates, or a task Claude carries out in the session to make
// the change. Each says what it does and, where the transcripts allow, what
// it would have saved on the sessions measured.

import type { AutoFix } from '../../shared/tuning.js';

import { KEEP_DAYS, keptDays } from './cleanup.js';
import type { FixContext } from './fix-context.js';
import { stringsOf } from './fix-context.js';
import { cdFix } from './fixes-cd.js';
import type { SessionMeasure } from './measure.js';
import { COMPACT_AT } from './measure.js';
import { skillName } from './spend.js';
import { findSuggestion, nameOf } from './suggestions.js';
import type { Totals } from './totals.js';
import { plural, usd } from './words.js';

/** A tool used in at most this share of the sessions that carried its definition counts as unused. */
const UNUSED_SHARE = 0.05;
const UNUSED_MIN_SESSIONS = 5;
const UNUSED_MIN_USD = 0.5;
const SMALL_OUTPUT = 15_000;
const PROMPT_FILES = 8;
/** Below this, a session to split the files would cost about what it saves. */
const HOT_FIX_MIN_USD = 5;
const HEAVY_SKILLS = 3;
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'css',
  'py',
  'cs',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'rb',
  'php',
  'c',
  'h',
  'cpp',
  'hpp',
]);

export interface UnusedTool {
  readonly name: string;
  readonly usd: number;
  readonly carried: number;
  readonly used: number;
}

/** Tools whose definitions went out with every request but that sessions almost never call. */
export function unusedTools(totals: Totals): UnusedTool[] {
  return Object.entries(totals.toolSchemaUsd)
    .map(([name, value]) => ({
      name,
      usd: value,
      carried: totals.toolSchemaSessions[name] ?? 0,
      used: totals.toolUseSessions[name] ?? 0,
    }))
    .filter(
      (tool) =>
        tool.carried >= UNUSED_MIN_SESSIONS &&
        tool.usd >= UNUSED_MIN_USD &&
        tool.used <= tool.carried * UNUSED_SHARE,
    )
    .toSorted((left, right) => right.usd - left.usd);
}

function knobFix(
  context: FixContext,
  fix: { key: string; value: unknown; title: string; detail: string },
  applied: (current: unknown) => boolean,
): AutoFix {
  return { kind: 'knob', id: `knob:${fix.key}`, ...fix, applied: applied(context.knob(fix.key)) };
}

function compactFix(context: FixContext): AutoFix {
  const saving = context.totals.compactSavingUsd;
  const saved =
    saving > 0 ? ` On the sessions measured that would have saved about ${usd(saving)}.` : '';
  return knobFix(
    context,
    {
      key: 'autoCompactWindow',
      value: COMPACT_AT,
      title: 'Compact every session at 200K tokens',
      detail: `Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit.${saved}`,
    },
    (current) => typeof current === 'number' && current <= COMPACT_AT,
  );
}

function subagentModelFix(context: FixContext): AutoFix {
  const saving = context.totals.subagentSavingUsd;
  const saved = saving > 0 ? ` About ${usd(saving)} saved on the sessions measured.` : '';
  return knobFix(
    context,
    {
      key: 'CLAUDE_CODE_SUBAGENT_MODEL',
      value: 'sonnet',
      title: 'Run subagents on Sonnet',
      detail: `Sets CLAUDE_CODE_SUBAGENT_MODEL to sonnet, so subagents without a model of their own stop running on Opus.${saved} Agents that set model: opus keep it.`,
    },
    (current) => typeof current === 'string' && current !== '',
  );
}

function outputFix(context: FixContext): AutoFix {
  return knobFix(
    context,
    {
      key: 'BASH_MAX_OUTPUT_LENGTH',
      value: String(SMALL_OUTPUT),
      title: 'Cap shell output at 15,000 characters',
      detail:
        'Sets BASH_MAX_OUTPUT_LENGTH so one noisy command cannot put 30,000 characters into the context for the rest of the session.',
    },
    (current) => Number(current) > 0 && Number(current) <= SMALL_OUTPUT,
  );
}

function cleanupFix(context: FixContext): AutoFix {
  return knobFix(
    context,
    {
      key: 'cleanupPeriodDays',
      value: KEEP_DAYS,
      title: `Keep transcripts for ${KEEP_DAYS.toString()} days`,
      detail: `Sets cleanupPeriodDays to ${KEEP_DAYS.toString()} in your user settings, so Claude Code keeps every session on disk for ${KEEP_DAYS.toString()} days instead of ${keptDays(context.knob('cleanupPeriodDays')).toString()}.`,
    },
    (current) => keptDays(current) >= KEEP_DAYS,
  );
}

function denyFix(context: FixContext): AutoFix | null {
  const tools = unusedTools(context.totals);
  if (tools.length === 0) {
    return null;
  }
  const existing = stringsOf(context.knob('permissions.deny'));
  const names = tools.map((tool) => tool.name);
  const saving = tools.reduce((total, tool) => total + tool.usd, 0);
  const list = tools
    .map(
      (tool) =>
        `${tool.name} (used in ${tool.used.toString()} of ${plural(tool.carried, 'session')})`,
    )
    .join(', ');
  return {
    kind: 'knob',
    id: 'knob:permissions.deny',
    key: 'permissions.deny',
    value: [...new Set([...existing, ...names])],
    title: `Stop sending ${plural(names.length, 'unused tool')} with every request`,
    detail: `Adds ${list} to permissions.deny in your user settings, which takes their definitions out of every request: about ${usd(saving)} on the sessions measured. Remove one from permissions.deny when you want it back.`,
    applied: names.every((name) => existing.includes(name)),
  };
}

function createFix(context: FixContext, id: string, title: string): AutoFix | null {
  const definition = findSuggestion(id);
  if (definition === null) {
    return null;
  }
  return {
    kind: 'create',
    id: `create:${id}`,
    suggestionId: id,
    title,
    detail: `Writes the ${nameOf(definition)} ${definition.kind}: ${definition.spec.frontmatter.description ?? ''}`,
    applied: context.installed.has(id),
  };
}

function launchFix(fix: Omit<Extract<AutoFix, { kind: 'launch' }>, 'kind' | 'applied'>): AutoFix {
  return { kind: 'launch', ...fix, applied: false };
}

/** The repository of the session worst on `metric`, when its folder is still there. */
function worstProject(
  context: FixContext,
  metric: (measure: SessionMeasure) => number,
): string | null {
  const worst = context.live
    .filter((measure) => measure.cwd !== null && metric(measure) > 0)
    .toSorted((left, right) => metric(right) - metric(left))[0];
  if (worst?.cwd === null || worst?.cwd === undefined) {
    return null;
  }
  const project = context.projectOf(worst.cwd);
  return context.modifiedAt(project) === null ? null : project;
}

function lastPart(folder: string): string {
  return folder.split('/').findLast((part) => part !== '') ?? folder;
}

/** Source code, the only kind of file the fix splits. A proposal or a log is left alone. */
function isCode(file: string): boolean {
  const dot = file.lastIndexOf('.');
  return dot !== -1 && CODE_EXTENSIONS.has(file.slice(dot + 1).toLowerCase());
}

function hotFilesFix(context: FixContext): AutoFix | null {
  const code = context.hotFiles.filter((file) => file.project !== '' && isCode(file.path));
  const project = code.find((file) => context.modifiedAt(file.project) !== null)?.project;
  if (project === undefined) {
    return null;
  }
  const files = code.filter((file) => file.project === project).slice(0, PROMPT_FILES);
  const cost = files.reduce((total, file) => total + file.usd, 0);
  if (cost < HOT_FIX_MIN_USD) {
    return null;
  }
  const list = files
    .map((file) => `- ${file.path}: ${usd(file.usd)} over ${plural(file.sessions, 'session')}`)
    .join('\n');
  return launchFix({
    id: `launch:hot-files:${project}`,
    title: `Make the most read files in ${lastPart(project)} cheaper to read`,
    detail: `Has Claude, in a new worktree of ${project}, split the files sessions keep reading (${usd(cost)} to carry so far) into smaller modules and cut comments that only restate the code, then land the change.`,
    label: 'Make hot files cheaper to read',
    cwd: project,
    worktree: true,
    prompt: `Make these files cheaper for Claude Code sessions to read. Across recent sessions in this project, carrying them in context after reading them cost ${usd(cost)}:
${list}

Every session that reads one of these files pays for all of it on every later request, so size is what costs.
1. For each file over about 300 lines, split it into smaller modules along the seams it already has, so a session that needs one part reads only that part. Keep the public names working, through re-exports if the project already does that.
2. Delete comments that only restate what the code says. Keep comments that explain why, and keep tool directives such as eslint-disable, @public, @ts-expect-error, cspell and secretlint lines.
3. Do not change behavior. Run the checks the project's CLAUDE.md names, commit, and land the change the way it says.
Reply with what you split and how many lines each file lost.`,
  });
}

/**
 * What carrying the skill in `folder` cost in sessions that started after SKILL.md last changed,
 * so a skill already slimmed is priced on its new size and not offered again for the old one.
 */
function costSinceChange(context: FixContext, folder: string): number {
  const changed = context.modifiedAt(`${folder}/SKILL.md`);
  if (changed === null) {
    return 0;
  }
  let total = 0;
  for (const measure of context.live) {
    total += measure.startedAt >= changed ? (measure.skills[folder] ?? 0) : 0;
  }
  return total;
}

function skillFixes(context: FixContext): AutoFix[] {
  return Object.keys(context.totals.skillUsd)
    .map((folder): [string, number] => [folder, costSinceChange(context, folder)])
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, HEAVY_SKILLS)
    .filter(([, cost]) => cost >= 1)
    .map(([folder, cost]) =>
      launchFix({
        id: `launch:skill:${folder}`,
        title: `Slim the ${skillName(folder)} skill`,
        detail: `Has Claude move reference material out of ${skillName(folder)}'s SKILL.md into files it loads only when needed. Carrying its body cost ${usd(cost)} on the sessions measured.`,
        label: `Slim the ${skillName(folder)} skill`,
        cwd: folder,
        worktree: false,
        prompt: `The ${skillName(folder)} skill in ${folder} cost ${usd(cost)} across recent Claude Code sessions, because its SKILL.md loads into context in full whenever it is used and then stays there for every later request.
Make it cheaper to load without changing what it does:
1. Keep SKILL.md to the steps and rules Claude needs every time it runs, in as few words as they take.
2. Move reference material, long examples, tables and lists into files beside it, and have SKILL.md say which file to read for what.
3. Cut anything said twice. Keep the name and description in the frontmatter as they are.
If the folder is a git repository, commit the change. Reply with how many lines SKILL.md lost and where the material went.`,
      }),
    );
}

/** What CLAUDE.md and memory cost in sessions that started after ~/.claude/CLAUDE.md last changed. */
function instructionsSinceChange(context: FixContext): number {
  const changed = context.modifiedAt(`${context.home}/.claude/CLAUDE.md`) ?? 0;
  let total = 0;
  for (const measure of context.live) {
    total +=
      measure.startedAt >= changed
        ? measure.spend.instructions + measure.subagentSpend.instructions
        : 0;
  }
  return total;
}

function instructionsFix(context: FixContext): AutoFix | null {
  const cost = instructionsSinceChange(context);
  if (cost < 1) {
    return null;
  }
  return launchFix({
    id: 'launch:instructions',
    title: 'Tighten CLAUDE.md and memory',
    detail: `Has Claude rewrite ~/.claude/CLAUDE.md and the memory index to say the same in fewer words. They load with every request, which cost ${usd(cost)} on the sessions measured.`,
    label: 'Tighten CLAUDE.md',
    cwd: context.home,
    worktree: false,
    prompt: `~/.claude/CLAUDE.md and the memory files Claude Code loads with it cost ${usd(cost)} across recent sessions, since they are sent with every request of every session and subagent.
Rewrite ~/.claude/CLAUDE.md, and the MEMORY.md index files under ~/.claude/projects, so every rule still says the same thing in fewer words:
1. Drop repetition, examples that only restate a rule, and explanations Claude does not need to follow it.
2. Do not drop or weaken a rule. If two rules overlap, merge them.
3. Save a copy of each file as <name>.bak before changing it.
Reply with each file's size before and after, and anything you were unsure about.`,
  });
}

function permissionsFix(context: FixContext): AutoFix | null {
  const project = worstProject(context, (measure) => measure.denials);
  if (project === null) {
    return null;
  }
  return launchFix({
    id: `launch:permissions:${project}`,
    title: `Allow the read-only commands ${lastPart(project)} keeps asking for`,
    detail: `Has Claude run /fewer-permission-prompts in ${project}, which reads the transcripts and adds allow rules for read-only commands to the project settings.`,
    label: 'Fewer permission prompts',
    cwd: project,
    worktree: false,
    prompt: '/fewer-permission-prompts',
  });
}

function commandsFix(context: FixContext): AutoFix | null {
  const project = worstProject(context, (measure) => measure.toolErrors - measure.denials);
  if (project === null) {
    return null;
  }
  return launchFix({
    id: `launch:commands:${project}`,
    title: `Teach ${lastPart(project)}'s CLAUDE.md the commands that keep failing`,
    detail: `Has Claude, in a new worktree of ${project}, find the tool calls that failed on a wrong command or missing setup and add the right ones to its CLAUDE.md.`,
    label: 'Fix failing commands',
    cwd: project,
    worktree: true,
    prompt: `Many tool calls in this project's Claude Code sessions fail. Look through the recent transcripts for this project under ~/.claude/projects (the folder named after this path), find the tool calls that failed because of a wrong command, a wrong path, a missing tool or missing setup, and leave out failing tests and type errors, which are how work finds problems.
Add the right commands and the setup they need to this project's CLAUDE.md in as few lines as it takes. Commit and land it the way CLAUDE.md says. Reply with the failures you found and the lines you added.`,
  });
}

type FixBuilder = (context: FixContext) => readonly (AutoFix | null)[];

const BUILDERS: Readonly<Record<string, FixBuilder>> = {
  'context-reread': (c) => [compactFix(c), createFix(c, 'scout', 'Add a scout agent for searches')],
  'huge-context': (c) => [compactFix(c), createFix(c, 'handoff', 'Add a handoff skill')],
  'idle-rewrite': (c) => [compactFix(c), createFix(c, 'handoff', 'Add a handoff skill')],
  'subagent-model': (c) => [
    subagentModelFix(c),
    createFix(c, 'scout', 'Add a scout agent on Haiku'),
  ],
  'big-results': (c) => [outputFix(c), createFix(c, 'quiet-run', 'Add the quiet-run skill')],
  'repeated-commands': (c) => [
    createFix(c, 'ci-watch', 'Add a ci-watch agent'),
    createFix(c, 'dev-server', 'Add the dev-server skill'),
    createFix(c, 'quiet-run', 'Add the quiet-run skill'),
  ],
  'long-sessions': (c) => [compactFix(c), createFix(c, 'handoff', 'Add a handoff skill')],
  denials: (c) => [permissionsFix(c)],
  rereads: (c) => [createFix(c, 'scout', 'Add a scout agent for searches')],
  'tool-errors': (c) => [commandsFix(c)],
  'file-reads': (c) => [hotFilesFix(c), createFix(c, 'scout', 'Add a scout agent for searches')],
  'unused-tools': (c) => [denyFix(c)],
  'heavy-skills': (c) => skillFixes(c),
  instructions: (c) => [instructionsFix(c)],
  'cd-commands': (c) => [cdFix(c)],
  'transcript-cleanup': (c) => [cleanupFix(c)],
};

/** The fixes for a tip, the ones not yet applied first. */
export function autoFixesFor(tipId: string, context: FixContext): AutoFix[] {
  const fixes = (BUILDERS[tipId]?.(context) ?? []).filter((fix): fix is AutoFix => fix !== null);
  return fixes.toSorted((left, right) => Number(left.applied) - Number(right.applied));
}
