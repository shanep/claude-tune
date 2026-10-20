// The closer look at the most expensive sessions: where each one's money went,
// the causes worth fixing with what fixing them would have saved, and the
// files every session keeps paying to carry.

import type { CostCause, CostlySession, HotFile, SpendSlice } from '../../shared/tuning.js';

import type { SessionMeasure } from './measure.js';
import type { SpendSplit } from './spend.js';
import { addSpend, SPEND_LABELS, SPEND_SOURCES, skillName } from './spend.js';
import { sessionUsd } from './totals.js';
import { plural, tokens, usd } from './words.js';

const COSTLY_SESSIONS = 8;
const COSTLY_MIN_USD = 3;
const HOT_FILES = 15;
/** A file read in one session is a one-off, not a habit worth a refactor. */
const HOT_MIN_SESSIONS = 2;
/** A cause worth naming costs at least this share of its session. */
const CAUSE_SHARE = 0.08;
const BIG_AVERAGE = 150_000;

export function spendSlices(split: SpendSplit): SpendSlice[] {
  const whole = SPEND_SOURCES.reduce((total, source) => total + split[source], 0);
  return SPEND_SOURCES.map((source) => ({
    source,
    label: SPEND_LABELS[source],
    usd: split[source],
    share: whole === 0 ? 0 : split[source] / whole,
  }))
    .filter((slice) => slice.usd > 0)
    .toSorted((left, right) => right.usd - left.usd);
}

function shortPath(file: string, cwd: string | null): string {
  return cwd !== null && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
}

function inputUsd(measure: SessionMeasure): number {
  return measure.cost.input + measure.cost.cacheRead + measure.cost.cacheWrite;
}

function subagentSaving(measure: SessionMeasure): number {
  let saving = 0;
  for (const hour of measure.hours) {
    saving += hour.subagentSavingUsd;
  }
  return saving;
}

function biggest(record: Readonly<Record<string, number>>): [string, number] | undefined {
  return Object.entries(record).toSorted((left, right) => right[1] - left[1])[0];
}

function unusedSchemaUsd(measure: SessionMeasure, unused: ReadonlySet<string>): number {
  let total = 0;
  for (const [name, value] of Object.entries(measure.toolSchemas)) {
    total += unused.has(name) ? value : 0;
  }
  return total;
}

interface CauseInput {
  readonly m: SessionMeasure;
  readonly split: SpendSplit;
  readonly unused: ReadonlySet<string>;
}

function contextCause({ m }: CauseInput): CostCause | null {
  const average = m.requests === 0 ? 0 : m.contextTokens / m.requests;
  if (average < BIG_AVERAGE) {
    return null;
  }
  const sent = `Each of ${plural(m.requests, 'request')} re-sent ${tokens(average)} tokens on average (peak ${tokens(m.peakContext)})`;
  return {
    id: 'context',
    text: `${sent}, so carrying context cost ${usd(inputUsd(m))}. Compacting at 200K would have saved about ${usd(m.compactSavingUsd)}.`,
    usd: inputUsd(m),
    savedUsd: m.compactSavingUsd,
    tipId: 'huge-context',
  };
}

function subagentCause({ m }: CauseInput): CostCause | null {
  const [top] = m.subagents;
  if (m.subagentUsd === 0 || top === undefined) {
    return null;
  }
  const name = `${top.type} "${top.description}"`;
  const worst = ` The biggest, ${name}, cost ${usd(top.usd)} over ${plural(top.requests, 'request')} with a ${tokens(top.peakContext)} peak.`;
  const saving = subagentSaving(m);
  const sonnet = saving > 0 ? ` Running them on Sonnet would have saved about ${usd(saving)}.` : '';
  return {
    id: 'subagents',
    text: `Subagents cost ${usd(m.subagentUsd)}.${worst}${sonnet}`,
    usd: m.subagentUsd,
    savedUsd: saving > 0 ? saving : null,
    tipId: 'subagent-model',
  };
}

function fileCause({ m, split }: CauseInput): CostCause {
  const top = biggest(m.files);
  const worst =
    top === undefined ? '' : `, most of all ${shortPath(top[0], m.cwd)} (${usd(top[1])})`;
  return {
    id: 'file-reads',
    text: `Files read with Read, cat and sed stayed in context and cost ${usd(split.fileReads)} to carry${worst}.`,
    usd: split.fileReads,
    savedUsd: null,
    tipId: 'file-reads',
  };
}

function setupCause({ m, split, unused }: CauseInput): CostCause {
  const saving = unusedSchemaUsd(m, unused);
  const idle = saving > 0 ? ` Tools sessions here rarely call made up ${usd(saving)} of it.` : '';
  return {
    id: 'setup',
    text: `The system prompt and tool definitions went out with every request and cost ${usd(split.setup)}.${idle}`,
    usd: split.setup,
    savedUsd: saving > 0 ? saving : null,
    tipId: saving > 0 ? 'unused-tools' : null,
  };
}

function inputCause({ split }: CauseInput): CostCause {
  return {
    id: 'tool-inputs',
    text: `Files Claude wrote with Write and Edit, and long shell scripts, stayed in context and cost ${usd(split.toolInputs)} to carry. Edit sends less than writing a whole file again.`,
    usd: split.toolInputs,
    savedUsd: null,
    tipId: null,
  };
}

function outputCause({ split }: CauseInput): CostCause {
  return {
    id: 'tool-output',
    text: `Command and search output cost ${usd(split.toolOutput)} to carry.`,
    usd: split.toolOutput,
    savedUsd: null,
    tipId: 'big-results',
  };
}

function skillCause({ m, split }: CauseInput): CostCause {
  const top = biggest(m.skills);
  const most = top === undefined ? '' : `, ${skillName(top[0])} the most (${usd(top[1])})`;
  return {
    id: 'skills',
    text: `The skill list and loaded skills cost ${usd(split.skills)}${most}.`,
    usd: split.skills,
    savedUsd: null,
    tipId: 'heavy-skills',
  };
}

function replyCause({ split }: CauseInput): CostCause {
  return {
    id: 'output',
    text: `Claude's own replies and thinking cost ${usd(split.output)} in output tokens.`,
    usd: split.output,
    savedUsd: null,
    tipId: null,
  };
}

function idleCause({ m }: CauseInput): CostCause | null {
  if (m.idleRewrites === 0) {
    return null;
  }
  return {
    id: 'idle',
    text: `${plural(m.idleRewrites, 'time')} the session was picked up after its cache expired and wrote its context again, ${usd(m.idleRewriteUsd)}.`,
    usd: m.idleRewriteUsd,
    savedUsd: m.idleRewriteUsd,
    tipId: 'idle-rewrite',
  };
}

const CAUSES: readonly ((input: CauseInput) => CostCause | null)[] = [
  contextCause,
  subagentCause,
  fileCause,
  setupCause,
  inputCause,
  outputCause,
  skillCause,
  replyCause,
  idleCause,
];

function causesOf(measure: SessionMeasure, unused: ReadonlySet<string>): CostCause[] {
  const split = addSpend(measure.spend, measure.subagentSpend);
  const whole = sessionUsd(measure);
  return CAUSES.flatMap((rule) => {
    const cause = rule({ m: measure, split, unused });
    return cause !== null && cause.usd >= whole * CAUSE_SHARE ? [cause] : [];
  }).toSorted(
    (left, right) => (right.savedUsd ?? 0) - (left.savedUsd ?? 0) || right.usd - left.usd,
  );
}

/** The most expensive sessions, each taken apart. */
export function costlySessions(
  measures: readonly SessionMeasure[],
  unused: ReadonlySet<string>,
): CostlySession[] {
  return measures
    .filter((measure) => sessionUsd(measure) >= COSTLY_MIN_USD)
    .toSorted((left, right) => sessionUsd(right) - sessionUsd(left))
    .slice(0, COSTLY_SESSIONS)
    .map((measure) => ({
      sessionId: measure.sessionId,
      title: measure.title,
      cwd: measure.cwd,
      updatedAt: measure.updatedAt,
      usd: sessionUsd(measure),
      subagentUsd: measure.subagentUsd,
      requests: measure.requests,
      averageContext: measure.requests === 0 ? 0 : measure.contextTokens / measure.requests,
      peakContext: measure.peakContext,
      spend: spendSlices(addSpend(measure.spend, measure.subagentSpend)),
      causes: causesOf(measure, unused),
      heavy: measure.heavy.map((item) => ({
        ...item,
        label: item.label.replace(`${measure.cwd ?? '\0'}/`, ''),
      })),
      subagents: measure.subagents,
    }));
}

/** True for a path relative to the project, not one outside it such as ~/.claude or /tmp. */
function insideProject(file: string): boolean {
  return !file.startsWith('/') && !file.startsWith('~') && !file.startsWith('..');
}

interface FileReads {
  readonly project: string;
  readonly path: string;
  readonly reads: { readonly startedAt: number; readonly usd: number }[];
}

/** The reads of a file since it last changed, none when it is gone, or all of them when `changedAt` is not given. */
function readsSinceChange(
  file: FileReads,
  changedAt: ((path: string) => number | null) | undefined,
): FileReads['reads'] {
  if (changedAt === undefined) {
    return file.reads;
  }
  const changed = changedAt(`${file.project}/${file.path}`);
  return changed === null ? [] : file.reads.filter((read) => read.startedAt >= changed);
}

/**
 * Files that cost the most to carry across sessions, keyed by project and
 * the path inside it, so the same file read from different worktrees adds up.
 * With `changedAt`, only sessions that started after a file last changed count,
 * so a file already split is priced on what it is now.
 */
export function hotFiles(
  measures: readonly SessionMeasure[],
  projectOf: (cwd: string) => string,
  changedAt?: (path: string) => number | null,
): HotFile[] {
  const found = new Map<string, FileReads>();
  for (const measure of measures) {
    const cwd = measure.cwd;
    const project = cwd === null ? '' : projectOf(cwd);
    for (const [file, value] of Object.entries(measure.files)) {
      const base = cwd !== null && file.startsWith(`${cwd}/`) ? cwd : project;
      const inside = shortPath(file, base === '' ? null : base);
      if (project === '' || !insideProject(inside)) {
        continue;
      }
      const key = `${project}\0${inside}`;
      const entry = found.get(key) ?? { project, path: inside, reads: [] };
      entry.reads.push({ startedAt: measure.startedAt, usd: value });
      found.set(key, entry);
    }
  }
  return [...found.values()]
    .filter((file) => file.reads.length >= HOT_MIN_SESSIONS)
    .map((file) => {
      const reads = readsSinceChange(file, changedAt);
      return {
        project: file.project,
        path: file.path,
        usd: reads.reduce((total, read) => total + read.usd, 0),
        sessions: reads.length,
      };
    })
    .filter((file) => file.sessions >= HOT_MIN_SESSIONS)
    .toSorted((left, right) => right.usd - left.usd)
    .slice(0, HOT_FILES);
}
