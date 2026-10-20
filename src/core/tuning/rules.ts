// The tip rules. Each looks at the totals to decide whether it applies at
// all, and at each session to list the ones that show the problem worst.
// Thresholds are set so a tip only shows when it is worth acting on.


import type { SessionMeasure } from './measure.js';
import { costTotal } from './measure.js';
import type { TipRule } from './rule-type.js';
import { ratio } from './rule-type.js';
import { SPEND_RULES } from './rules-spend.js';
import type { Totals } from './totals.js';
import { LARGE_CONTEXT, LONG_SESSION_PROMPTS, sessionUsd } from './totals.js';
import { percent, plural, tokens, usd } from './words.js';

/** Claude Code's own settings, commands or behavior, so the rule fits Claude Code alone. */
export type { TipRule } from './rule-type.js';


function failures(measure: SessionMeasure): number {
  return measure.toolErrors - measure.denials;
}

function exploreNote(totals: Totals): string {
  return totals.spawns < 10
    ? ''
    : ` Only ${totals.exploreSpawns.toLocaleString('en-US')} of ${plural(totals.spawns, 'spawn')} used the read-only Explore agent.`;
}

function homeNote(totals: Totals): string {
  return totals.homeSessions === 0
    ? ''
    : ` ${plural(totals.homeSessions, 'session')} started in your home folder, where no project CLAUDE.md loads.`;
}

export const RULES: readonly TipRule[] = [
  ...SPEND_RULES,
  {
    id: 'context-reread',
    severity: 'high',
    title: 'Most of the spend is re-reading old context',
    advice: [
      'Every request sends the whole conversation again, so the 300th turn of a session costs far more than the 3rd. When you move on to a new task, start a new session instead of continuing the old one.',
      'Use /clear when you switch to something unrelated, and /compact with a focus (for example "/compact keep the plan and the failing test") at natural breakpoints.',
      'Run /context to see what fills the window before deciding what to drop.',
    ],
    fixes: ['handoff', 'scout'],
    pros: [
      'Requests get cheaper in proportion to the context you drop: going from 400K tokens to 40K makes each turn about 10 times cheaper.',
      'A short context keeps Claude focused, since old dead ends and stale copies of files are not there to confuse it.',
    ],
    cons: [
      '/clear and a new session drop everything Claude learned along the way: the decisions, the dead ends and the files it read. Getting back costs a rebuild, and Claude can repeat a mistake it had already ruled out.',
      '/compact keeps a summary, but a summary loses detail such as exact error text or why an approach failed.',
    ],
    track: {
      target: 'averageContext',
      watch: [
        { metric: 'extraReads', why: 'A fresh session reads the files again.' },
        { metric: 'failures', why: 'Claude can repeat a mistake it had already ruled out.' },
      ],
    },
    skipWhen:
      'Keep going in the long session while you are in the middle of hard debugging or a design that took many turns to reach. Write a handoff note first as a safety net, and start fresh once that task is done.',
    finding: (t) =>
      t.totalUsd < 1 || ratio(t.cacheReadUsd, t.totalUsd) < 0.4
        ? null
        : `${percent(ratio(t.cacheReadUsd, t.totalUsd))} of the ${usd(t.totalUsd)} estimated spend (${usd(t.cacheReadUsd)}) went to re-reading cached context. The average request carried ${tokens(ratio(t.contextTokens, t.requests))} tokens of conversation.`,
    flags: (m) => m.cost.cacheRead >= 1 && ratio(m.cost.cacheRead, sessionUsd(m)) >= 0.5,
    metric: (m) => m.cost.cacheRead,
    detail: (m) => `${usd(m.cost.cacheRead)} re-reading context`,
  },
  {
    id: 'huge-context',
    severity: 'high',
    title: 'Sessions grow huge without compacting',
    advice: [
      'Lower autoCompactWindow in ~/.claude/settings.json (for example to 300000) so Claude Code compacts long before the 1M limit. Compaction keeps a summary and drops the bulk.',
      'Before a session gets that large, write a handoff note and carry on in a fresh session.',
    ],
    fixes: ['handoff'],
    pros: [
      'Compaction happens on its own, so no session drags 900K tokens through every turn.',
      'It works on every session without you remembering to do anything.',
    ],
    cons: [
      'Auto compaction picks the moment, sometimes in the middle of a task, and the summary can drop details you still needed.',
      'After a compaction Claude may reread files to get them back, which eats into the savings.',
    ],
    knobs: ['autoCompactWindow'],
    track: {
      target: 'largeShare',
      watch: [{ metric: 'extraReads', why: 'After a compaction Claude may reread files.' }],
    },
    skipWhen:
      'Leave the window large for work that needs a lot in view at once, such as a refactor across many files. You can set autoCompactWindow per project instead of for every session.',
    finding: (t) =>
      t.largeSessions === 0
        ? null
        : `${plural(t.largeSessions, 'session')} went past ${tokens(LARGE_CONTEXT)} tokens of context, the largest to ${tokens(t.largestContext)}. Only ${plural(t.compactions, 'compaction')} happened across all sessions.`,
    flags: (m) => m.peakContext > LARGE_CONTEXT,
    metric: (m) => m.peakContext,
    detail: (m) => `${tokens(m.peakContext)} peak context`,
  },
  {
    id: 'idle-rewrite',
    severity: 'medium',
    title: 'Resuming big sessions after a break rewrites the cache',
    advice: [
      'After a long break, start a new session from a short summary instead of resuming a huge one.',
      'If you plan to come back, run /compact before stepping away so the rewrite is small.',
    ],
    fixes: ['handoff'],
    pros: [
      'Writing a 500K context back into the cache costs about $2.50 at Opus 5.5 prices. A compacted or fresh session costs cents.',
    ],
    cons: [
      'Compacting before a break gives up detail you may want when you come back.',
      'If you come back before the cache expires, the rewrite never happens, so the compaction was for nothing.',
    ],
    track: {
      target: 'idleUsd',
      watch: [{ metric: 'extraReads', why: 'Coming back to a summary means reading files again.' }],
    },
    skipWhen:
      'Skip it for short breaks. The cache lasts at least 5 minutes after the last request, so picking up again soon costs nothing extra.',
    finding: (t) =>
      t.idleRewrites < 3
        ? null
        : `${plural(t.idleRewrites, 'time')} a large session was picked up after its prompt cache expired, so its whole context was written to the cache again, about ${usd(t.idleRewriteUsd)} in total.`,
    flags: (m) => m.idleRewrites > 0,
    metric: (m) => m.idleRewriteUsd,
    detail: (m) => `${plural(m.idleRewrites, 'rewrite')}, ${usd(m.idleRewriteUsd)}`,
  },
  {
    id: 'subagent-model',
    severity: 'medium',
    title: 'Subagents run on the most expensive models',
    advice: [
      'Set CLAUDE_CODE_SUBAGENT_MODEL to sonnet in the env block of ~/.claude/settings.json, or haiku for pure searching, so subagents default to a cheaper model.',
      'Give your own agents a model field in their frontmatter.',
      'Ask for the Explore agent for read-only searches instead of general-purpose.',
    ],
    fixes: ['scout'],
    pros: [
      'Sonnet costs about half of Opus per token and Haiku a small fraction, and most subagent work is searching and summarizing.',
    ],
    cons: [
      'A smaller model can miss subtle problems in a review or a tricky investigation, and a wrong summary costs more than the tokens it saved.',
      'The setting applies to every subagent without its own model, including ones you count on for careful work.',
    ],
    knobs: ['CLAUDE_CODE_SUBAGENT_MODEL'],
    track: {
      target: 'premiumShare',
      watch: [{ metric: 'failures', why: 'A smaller model can get things wrong more often.' }],
    },
    skipWhen:
      'Keep Opus for subagents that review code, plan designs or debug. Set model: opus in those agents and let the cheaper default cover the rest.',
    finding: (t) =>
      t.subagentRequests < 50 || ratio(t.premiumSubagentRequests, t.subagentRequests) < 0.8
        ? null
        : `${percent(ratio(t.premiumSubagentRequests, t.subagentRequests))} of ${plural(t.subagentRequests, 'subagent request')} ran on Opus or Fable, about ${usd(t.subagentUsd)} in total.${exploreNote(t)}`,
    flags: (m) => m.premiumSubagentRequests >= 10,
    metric: (m) => m.subagentUsd,
    detail: (m) => `${usd(m.subagentUsd)} in subagents`,
  },
  {
    id: 'big-results',
    severity: 'medium',
    title: 'Huge tool output stays in context',
    advice: [
      'Filter output before Claude sees it: grep, head and tail, quiet or summary flags, or write it to a file and read only the part that matters.',
      'Ask for line ranges of large files instead of whole files.',
      'BASH_MAX_OUTPUT_LENGTH in the env block of ~/.claude/settings.json caps how many characters of Bash output come back.',
    ],
    fixes: ['quiet-run', 'scout'],
    pros: [
      'A huge result stays in context for every later turn, so trimming it once saves on all of them.',
    ],
    cons: [
      'A filter can hide the line that mattered, such as a warning above the error you grepped for, and then Claude guesses or runs the command again.',
      'BASH_MAX_OUTPUT_LENGTH cuts output off at a fixed size without knowing what is important.',
    ],
    knobs: ['BASH_MAX_OUTPUT_LENGTH'],
    track: {
      target: 'bigResults',
      watch: [
        {
          metric: 'repeats',
          why: 'A filter that hides the line that mattered means running again.',
        },
      ],
    },
    skipWhen:
      'Let the full output through when you do not know yet what you are looking for, such as the first run of an unfamiliar failure. Saving it to a file keeps it available either way.',
    finding: (t) =>
      t.bigResults < 3
        ? null
        : `${plural(t.bigResults, 'tool result')} were over 40K characters (about 10K tokens each), and each stayed in context for the rest of its session.`,
    flags: (m) => m.bigResults > 0,
    metric: (m) => m.bigResults,
    detail: (m) => plural(m.bigResults, 'huge result'),
  },
  {
    id: 'repeated-commands',
    severity: 'medium',
    title: 'The same commands run over and over',
    advice: [
      'Polling a build, server or CI run from the main session sends the whole context again each time. Ask Claude to run it in the background and wait for it, or hand it to an agent.',
      'When a fix and retry loop repeats the same command, stop and ask for a diagnosis before the next attempt.',
    ],
    fixes: ['ci-watch', 'dev-server', 'quiet-run'],
    pros: [
      'Each poll from the main session sends the whole context again. Waiting in the background costs nothing until the result arrives.',
    ],
    cons: [
      'In the background you do not watch progress as it happens, and an agent adds a little startup time.',
      'Stopping a retry loop to diagnose takes a turn that feels slower in the moment.',
    ],
    track: { target: 'repeats', watch: [] },
    skipWhen:
      'A quick command you rerun after each small edit, such as one test or a build that takes seconds, is fine to run directly.',
    finding: (t) =>
      t.repeatedRuns < 10 || t.topRepeat === null
        ? null
        : `Identical commands ran again ${plural(t.repeatedRuns, 'time')} after their second run. The most repeated ran ${plural(t.topRepeat.runs, 'time')}: ${t.topRepeat.command}`,
    flags: (m) => m.repeatedRuns >= 3,
    metric: (m) => m.repeatedRuns,
    detail: (m) => plural(m.repeatedRuns, 'repeat'),
  },
  {
    id: 'long-sessions',
    severity: 'medium',
    title: 'Long sessions mix several tasks',
    advice: [
      'Keep one task per session, and start the next one with /clear or a new Claude tab.',
      'Put facts every session needs in CLAUDE.md or a skill instead of building them up in a long conversation.',
    ],
    fixes: ['handoff'],
    pros: [
      'Each task starts with only what it needs, so it costs less and Claude does not mix up details between tasks.',
    ],
    cons: [
      'Related tasks share a lot: the files, the conventions and the gotchas found along the way. A new session has to learn them again unless they are in CLAUDE.md or a handoff note.',
    ],
    track: {
      target: 'longShare',
      watch: [{ metric: 'extraReads', why: 'Each new session learns the same files again.' }],
    },
    skipWhen:
      'Stay in one session when the tasks build on each other, such as fixing a bug and then the tests it broke. Split when the next task is unrelated.',
    finding: (t) =>
      t.longSessions < 2
        ? null
        : `${plural(t.longSessions, 'session')} ran past ${LONG_SESSION_PROMPTS.toString()} prompts, the longest to ${t.longestPrompts.toLocaleString('en-US')}. Each task in a long session pays for the context of the ones before it.`,
    flags: (m) => m.prompts > LONG_SESSION_PROMPTS,
    metric: (m) => m.prompts,
    detail: (m) => plural(m.prompts, 'prompt'),
  },
  {
    id: 'denials',
    severity: 'medium',
    title: 'Tool calls keep getting denied',
    advice: [
      'Run /fewer-permission-prompts to add allow rules for the read-only commands Claude keeps asking for.',
      'Add permissions.allow rules to your settings for tools you always allow.',
      'Say in CLAUDE.md which commands are off limits, so Claude does not try them.',
    ],
    fixes: [],
    pros: ['Fewer interruptions, and no wasted turns on commands that were going to be refused.'],
    cons: [
      'Every allow rule is a command Claude can run without asking. A broad rule, such as all of Bash, removes a check you may want.',
      'The auto mode classifier denies things for a reason. Allowing around it defeats the point of auto mode.',
    ],
    track: {
      target: 'denials',
      watch: [{ metric: 'failures', why: 'Commands that run without asking can still fail.' }],
    },
    skipWhen:
      'Keep denying commands that change shared state: pushes, deletes, deploys, and anything touching production or the network.',
    finding: (t) =>
      t.denials < 10
        ? null
        : `${plural(t.denials, 'tool call')} were denied by you or by the auto mode classifier. Each denial costs a round trip and usually a retry with another command.`,
    flags: (m) => m.denials >= 2,
    metric: (m) => m.denials,
    detail: (m) => plural(m.denials, 'denial'),
  },
  {
    id: 'rereads',
    severity: 'low',
    title: 'Files are read again and again',
    advice: [
      'Each read of a whole file adds it to context again. Ask for the lines you need, or grep for them.',
      'For files Claude needs in every session, a short summary in CLAUDE.md is cheaper than rereading them.',
    ],
    fixes: ['scout'],
    pros: ['Reading a range or grepping costs a fraction of reading a whole file again.'],
    cons: [
      'After an edit, a reread is how Claude sees the current file. Cutting it risks edits made against a stale copy.',
    ],
    track: {
      target: 'extraReads',
      watch: [{ metric: 'failures', why: 'Edits made against a stale copy fail.' }],
    },
    skipWhen:
      'A reread after the file changed (an edit, a formatter or a git operation) is worth it.',
    finding: (t) =>
      t.extraReads < 10
        ? null
        : `Files were read again ${plural(t.extraReads, 'time')} after their second read in the same session.`,
    flags: (m) => m.extraReads >= 3,
    metric: (m) => m.extraReads,
    detail: (m) => plural(m.extraReads, 'extra read'),
  },
  {
    id: 'tool-errors',
    severity: 'low',
    title: 'Many tool calls fail',
    advice: [
      'Put the exact build, test and lint commands in CLAUDE.md so Claude uses the right ones first.',
      'Note required setup (tools, environment variables, services) in CLAUDE.md so commands do not fail on a missing piece.',
    ],
    fixes: [],
    pros: ['Claude gets the command right the first time instead of trying variations.'],
    cons: [
      'CLAUDE.md loads into every session, so each line costs tokens on every request. Instructions also go stale when the project changes.',
    ],
    track: {
      target: 'failures',
      watch: [
        { metric: 'averageContext', why: 'Every line in CLAUDE.md is sent with each request.' },
      ],
    },
    skipWhen:
      'Some failures are the point: a failing test or a type error is how Claude finds the problem. Only setup mistakes and wrong commands are waste.',
    finding: (t) =>
      t.toolCalls < 100 || ratio(t.toolErrors - t.denials, t.toolCalls) < 0.05
        ? null
        : `${percent(ratio(t.toolErrors - t.denials, t.toolCalls))} of ${plural(t.toolCalls, 'tool call')} failed, not counting denials.`,
    flags: (m) => failures(m) >= 10 && ratio(failures(m), m.toolCalls) >= 0.1,
    metric: failures,
    detail: (m) => plural(failures(m), 'failure'),
  },
  {
    id: 'cd-commands',
    severity: 'low',
    title: 'Commands keep changing folders',
    advice: [
      "Start sessions in the project folder (run claude from the repo) so project CLAUDE.md files and skills load and commands run in the right place.",
      'Claude Code can put the shell back in the session folder between commands, so a cd often has to be repeated. Absolute paths or git -C avoid that.',
    ],
    fixes: [],
    pros: [
      'Project CLAUDE.md files, skills and settings load, and commands run where they belong without a cd each time.',
    ],
    cons: [
      'Work that spans several repos has no single right folder, so some cd commands or absolute paths cannot be avoided.',
    ],
    track: { target: 'cdShare', watch: [] },
    skipWhen:
      'Starting in your home folder is fine for quick questions that are not about one project.',
    finding: (t) =>
      t.bashCommands < 100 || ratio(t.cdCommands, t.bashCommands) < 0.1
        ? null
        : `${percent(ratio(t.cdCommands, t.bashCommands))} of ${plural(t.bashCommands, 'shell command')} started with cd.${homeNote(t)}`,
    flags: (m) => m.cdCommands >= 10 && ratio(m.cdCommands, m.bashCommands) >= 0.2,
    metric: (m) => m.cdCommands,
    detail: (m) =>
      `${m.cdCommands.toLocaleString('en-US')} of ${plural(m.bashCommands, 'command')} start with cd`,
  },
];

/** Share of a session's cost that went to cache reads. */
export function cacheReadShare(measure: SessionMeasure): number {
  return ratio(measure.cost.cacheRead, costTotal(measure.cost) + measure.subagentUsd);
}
