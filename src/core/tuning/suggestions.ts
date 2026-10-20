// Skills and agents that would fix habits the tips find. Each one is a
// complete spec, so Create writes a working file through the same path as
// New Skill and New Agent. The reason says what in the transcripts points at
// it, or is null when nothing does yet.
// cspell:words oneline fuser

import type { Suggestion } from '../../shared/tuning.js';
import type { AgentSpec, SkillSpec } from '../authoring/schema.js';

import type { Totals } from './totals.js';
import { LARGE_CONTEXT, LONG_SESSION_PROMPTS } from './totals.js';
import { plural, tokens } from './words.js';

interface Base {
  readonly id: string;
  readonly summary: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  readonly reason: (totals: Totals) => string | null;
}

export type SuggestionDefinition =
  | (Base & { readonly kind: 'agent'; readonly spec: AgentSpec })
  | (Base & { readonly kind: 'skill'; readonly spec: SkillSpec });

const HANDOFF: SkillSpec = {
  frontmatter: {
    name: 'handoff',
    description:
      'Write a handoff note for the current task so a fresh session can pick it up. Use before /clear, before stepping away from a long session, or when the context is getting large.',
    'argument-hint': '[anything the next session should know]',
    'disable-model-invocation': true,
  },
  body: `Write a handoff note so a new session can continue this work without the old conversation.

1. Write it to \`.claude/handoffs/<YYYY-MM-DD>-<short-slug>.md\` in the project root, creating the folder if needed. Do not commit it unless asked.
2. Use these sections, short and concrete:
   - Goal: what we are trying to get done, in one or two sentences.
   - Done so far: what changed, with file paths and commit hashes.
   - Decisions: choices made and why, including approaches that failed, so they are not tried again.
   - Current state: what works, what is broken, the last command run and its result.
   - Next steps: an ordered list.
   - Read first: the few files the next session should open.
3. Keep it under 60 lines. Point to files instead of pasting them.
4. Add anything from $ARGUMENTS.

Reply with the path and one line to paste into the new session, for example: \`Read .claude/handoffs/2026-10-16-fix-login.md and continue from Next steps.\`
`,
};

const SCOUT: AgentSpec = {
  frontmatter: {
    name: 'scout',
    description:
      'Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.',
    tools: 'Read, Grep, Glob, Bash',
    model: 'haiku',
    color: 'cyan',
  },
  body: `You search so the main session does not have to. The caller only sees your final reply, so everything you read stays out of its context.

- Start broad (file names, symbols, strings), then read only the parts that matter. Prefer Grep and Glob over reading whole files, and read large files in line ranges.
- Do not edit files, install anything or run commands that change state. Use Bash only for read-only commands such as git log, git grep and ls.
- Stop once you can answer with confidence.

Reply in at most 25 lines: the answer first, then the evidence as file paths with line numbers and short quotes. Say plainly what you could not find or confirm.
`,
};

const QUIET_RUN: SkillSpec = {
  frontmatter: {
    name: 'quiet-run',
    description:
      'Run a build, test suite or other noisy command with its full output saved to a log file, and bring back only the exit code, the errors and the last lines. Use instead of running long builds or tests directly.',
    'argument-hint': '<command>',
  },
  body: `Run the command in $ARGUMENTS without flooding the conversation with its output.

1. Send all output to a log file and keep the exit code. Use the session's scratchpad folder if there is one, otherwise the system temp folder:

   \`\`\`sh
   log="\${TMPDIR:-/tmp}/quiet-run-$(date +%s).log"
   ( <command> ) >"$log" 2>&1; status=$?
   echo "exit $status, $(wc -l <"$log" | tr -d ' ') lines in $log"
   \`\`\`

2. If it passed, say so in one line with the log path.
3. If it failed, show only what explains the failure: \`grep -nEi 'error|fail|exception|panic' "$log" | head -n 40\`, then \`tail -n 30 "$log"\`. Read more of the log in line ranges only when that is not enough.
4. Never print the whole log.
`,
};

const CI_WATCH: AgentSpec = {
  frontmatter: {
    name: 'ci-watch',
    description:
      'Waits for a GitHub Actions run to finish and reports the result, with only the failing part of the log when it fails. Use after pushing, instead of polling gh run from the main session.',
    tools: 'Bash',
    model: 'haiku',
    color: 'yellow',
  },
  body: `You watch a CI run so the main session does not poll it.

1. Find the run: use the run id or branch you were given, otherwise the newest run on the current branch: \`gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId,status,conclusion,workflowName\`.
2. Wait for it with \`gh run watch <id> --exit-status --interval 30 >/dev/null 2>&1\`. If the command times out while the run is still going, run it again.
3. On success, reply in one line: workflow, conclusion and how long it took.
4. On failure, run \`gh run view <id> --log-failed | tail -n 80\` and reply with the failing job and step, the error lines, and your best guess at the cause in two sentences. Do not try to fix anything.
`,
};

const LAND: SkillSpec = {
  frontmatter: {
    name: 'land',
    description:
      'Land finished work: commit, rebase onto the latest default branch, rerun the checks, push, and clean up the worktree. Use when the work is done and its checks pass.',
    'argument-hint': '[commit message]',
    'disable-model-invocation': true,
  },
  body: `Land the current branch on the default branch. Stop and report at the first step that fails, and never force push.

1. Find the default branch: \`git symbolic-ref --short refs/remotes/origin/HEAD\` gives something like origin/main. Call the part after origin/ DEFAULT.
2. Check \`git status\` and stage only the files that belong to this work. Commit with $ARGUMENTS as the message, or write a short one that says what changed and why.
3. \`git fetch origin\`, then \`git rebase origin/DEFAULT\`. On conflicts, resolve them, \`git add\` the files and run \`GIT_EDITOR=true git rebase --continue\`.
4. If the rebase pulled in new commits, rerun the project's checks (see CLAUDE.md, package.json, a Makefile or similar) and fix any failure before going on.
5. Push as its own step: \`git push origin HEAD:DEFAULT\`. If it is rejected because someone else landed first, go back to step 3.
6. Confirm it landed: after \`git fetch origin\`, \`git log --oneline -1 origin/DEFAULT\` shows your commit.
7. If this session works in a linked worktree, move to the main checkout, then \`git worktree remove <path>\` and \`git branch -d <branch>\`. Use -d, never -D, so git refuses to delete work that did not land.

Reply with the commit hash and its one-line summary.
`,
};

const DEV_SERVER: SkillSpec = {
  frontmatter: {
    name: 'dev-server',
    description:
      'Start, restart or stop a local development server in the background with its output in a log file, and wait until it answers. Use instead of running servers in the foreground or killing ports by hand.',
    'argument-hint': 'start|restart|stop <port> [command]',
  },
  body: `Manage a dev server without blocking the session or flooding it with logs. $ARGUMENTS gives the action, the port and, to start, the command.

- Log file: \`\${TMPDIR:-/tmp}/dev-server-<port>.log\`.
- Free the port: \`pids=$(lsof -ti tcp:<port> 2>/dev/null); [ -n "$pids" ] && kill $pids\`. Where lsof is missing (some Linux machines), use \`fuser -k <port>/tcp\`.
- Start: free the port, then run the command with the Bash tool's run_in_background option and all output going to the log: \`<command> >"$log" 2>&1\`.
- Wait until it answers: \`curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-connrefused "http://127.0.0.1:<port>/"\`. If it never answers, show \`tail -n 40 "$log"\` and stop.
- Restart: stop, then start. Stop: free the port and check that nothing listens on it.

Reply in one line with the URL or the error from the log. When asked about server errors, read the log with tail or grep, never the whole file.
`,
};

export const SUGGESTIONS: readonly SuggestionDefinition[] = [
  {
    id: 'handoff',
    kind: 'skill',
    summary:
      'Writes a short handoff note so you can /clear or start fresh without losing the thread.',
    pros: [
      'You choose what carries over, so a fresh session starts with the decisions and dead ends instead of hundreds of thousands of tokens of history.',
    ],
    cons: [
      'The note only holds what Claude writes in it, and detail it leaves out is gone from the new session.',
    ],
    spec: HANDOFF,
    reason: (t) =>
      t.largeSessions === 0 && t.longSessions === 0
        ? null
        : `${plural(t.largeSessions, 'session')} went past ${tokens(LARGE_CONTEXT)} tokens and ${plural(t.longSessions, 'session')} ran past ${LONG_SESSION_PROMPTS.toString()} prompts.`,
  },
  {
    id: 'scout',
    kind: 'agent',
    summary:
      'A read-only search agent on Haiku that returns only the answer, so searches stay out of the main context.',
    pros: [
      'Searches run on Haiku at a fraction of Opus prices, and only the answer lands in your context.',
    ],
    cons: [
      'Haiku can miss or misread subtle code, and you see its summary instead of the files, so a wrong answer is harder to spot.',
    ],
    spec: SCOUT,
    reason: (t) =>
      t.families.search < 200
        ? null
        : `Main sessions ran ${plural(t.families.search, 'search', 'searches')} and file reads themselves, so all that output stayed in their context.`,
  },
  {
    id: 'quiet-run',
    kind: 'skill',
    summary: 'Runs builds and tests with output in a log file and brings back only the errors.',
    pros: [
      'Only the errors and the last lines reach the context, and the full log stays on disk if you need it.',
    ],
    cons: [
      'The search for errors can miss a failure that never says error or fail, such as a hang or a wrong result.',
    ],
    spec: QUIET_RUN,
    reason: (t) =>
      t.bigResults < 3 && t.families.buildTest < 100
        ? null
        : `${plural(t.families.buildTest, 'build or test command')} ran in main sessions and ${plural(t.bigResults, 'tool result')} were over 40K characters.`,
  },
  {
    id: 'land',
    kind: 'skill',
    summary:
      'Commits, rebases onto the default branch, reruns checks, pushes and removes the worktree.',
    pros: [
      'The same safe sequence runs every time, without Claude working out the steps again in each session.',
    ],
    cons: [
      'It pushes straight to the default branch, so a mistake lands for everyone. It only runs when you type /land for that reason.',
    ],
    spec: LAND,
    reason: (t) =>
      t.families.land < 30
        ? null
        : `${plural(t.families.land, 'git fetch, rebase or push command')} ran by hand, the same landing routine in session after session.`,
  },
  {
    id: 'ci-watch',
    kind: 'agent',
    summary:
      'Waits on a GitHub Actions run on Haiku and reports only the result or the failing log lines.',
    pros: ['Waiting on CI costs nothing in the main session, and you get only the failing lines.'],
    cons: [
      'Its guess at the cause comes from Haiku, so treat it as a starting point. It needs the gh CLI signed in.',
    ],
    spec: CI_WATCH,
    reason: (t) =>
      t.families.ci < 20
        ? null
        : `${plural(t.families.ci, 'gh run or gh pr checks command')} polled CI from main sessions.`,
  },
  {
    id: 'dev-server',
    kind: 'skill',
    summary:
      'Starts, restarts and stops local servers in the background and waits until they answer.',
    pros: [
      'Servers run in the background with logs in a file, so they neither block the session nor flood it.',
    ],
    cons: [
      'A background server keeps running until it is stopped, and freeing the port kills whatever holds it, even something that is not yours.',
    ],
    spec: DEV_SERVER,
    reason: (t) =>
      t.families.server < 15
        ? null
        : `${plural(t.families.server, 'command')} started, stopped or killed local servers by hand.`,
  },
];

export function findSuggestion(id: string): SuggestionDefinition | null {
  return SUGGESTIONS.find((suggestion) => suggestion.id === id) ?? null;
}

export function nameOf(definition: SuggestionDefinition): string {
  return definition.spec.frontmatter.name ?? definition.id;
}

/** Every suggestion, the ones the transcripts point at first. */
export function buildSuggestions(totals: Totals, installed: ReadonlySet<string>): Suggestion[] {
  const all = SUGGESTIONS.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    name: nameOf(definition),
    summary: definition.summary,
    pros: definition.pros,
    cons: definition.cons,
    reason: definition.reason(totals),
    installed: installed.has(definition.id),
  }));
  return all.toSorted(
    (left, right) => Number(left.reason === null) - Number(right.reason === null),
  );
}
