// The measured effect of taking a tip. Once you say you are following one,
// sessions that start after that moment are compared with the sessions in
// the weeks before: the habit the tip is about, the cost per prompt, and the
// side effects its cons warn about. Sessions that were already running when
// tracking started belong to neither side, so they are left out.

import type {
  ImpactDirection,
  ImpactFormat,
  ImpactMetric,
  ImpactVerdict,
  ImpactWeek,
  TipImpact,
} from '../../shared/tuning.js';

import type { SessionMeasure } from './measure.js';
import { costTotal } from './measure.js';
import { LARGE_CONTEXT, LONG_SESSION_PROMPTS } from './totals.js';
import { percent, plural } from './words.js';

/** How far back the comparison looks for sessions before tracking started. */
export const BASELINE_MS = 30 * 24 * 60 * 60_000;
export const WEEK_MS = 7 * 24 * 60 * 60_000;
/** Fewer sessions than this since tracking started is too few to judge. */
export const MIN_SESSIONS_AFTER = 5;
/** A change smaller than this, either way, is treated as noise. */
const CHANGE_BAND = 0.1;
const MAX_WEEKS = 8;

/** Counts summed over a set of sessions, from which every metric is worked out. */
interface Sums {
  sessions: number;
  prompts: number;
  requests: number;
  usd: number;
  cacheReadUsd: number;
  contextTokens: number;
  largeSessions: number;
  longSessions: number;
  idleRewriteUsd: number;
  subagentRequests: number;
  premiumSubagentRequests: number;
  toolCalls: number;
  bigResults: number;
  extraReads: number;
  failures: number;
  denials: number;
  bashCommands: number;
  repeatedRuns: number;
  cdCommands: number;
  fileReadUsd: number;
  setupUsd: number;
  skillUsd: number;
  instructionUsd: number;
}

export type MetricId =
  | 'costPerPrompt'
  | 'averageContext'
  | 'rereadShare'
  | 'largeShare'
  | 'idleUsd'
  | 'premiumShare'
  | 'bigResults'
  | 'repeats'
  | 'longShare'
  | 'denials'
  | 'extraReads'
  | 'failures'
  | 'cdShare'
  | 'fileReadShare'
  | 'setupShare'
  | 'skillShare'
  | 'instructionShare';

interface MetricDefinition {
  readonly label: string;
  readonly format: ImpactFormat;
  /** Null when the sessions give nothing to divide by. */
  readonly value: (sums: Sums) => number | null;
}

function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

function per100(part: number, whole: number): number | null {
  return whole === 0 ? null : (part * 100) / whole;
}

const METRICS: Readonly<Record<MetricId, MetricDefinition>> = {
  costPerPrompt: {
    label: 'Cost per prompt',
    format: 'usd',
    value: (s) => share(s.usd, s.prompts),
  },
  averageContext: {
    label: 'Context per request',
    format: 'tokens',
    value: (s) => share(s.contextTokens, s.requests),
  },
  rereadShare: {
    label: 'Spend re-reading context',
    format: 'percent',
    value: (s) => share(s.cacheReadUsd, s.usd),
  },
  largeShare: {
    label: `Sessions past ${(LARGE_CONTEXT / 1000).toString()}K context`,
    format: 'percent',
    value: (s) => share(s.largeSessions, s.sessions),
  },
  idleUsd: {
    label: 'Cache rewrites per session',
    format: 'usd',
    value: (s) => share(s.idleRewriteUsd, s.sessions),
  },
  premiumShare: {
    label: 'Subagent requests on Opus or Fable',
    format: 'percent',
    value: (s) => share(s.premiumSubagentRequests, s.subagentRequests),
  },
  bigResults: {
    label: 'Huge results per 100 tool calls',
    format: 'per100',
    value: (s) => per100(s.bigResults, s.toolCalls),
  },
  repeats: {
    label: 'Repeated commands per 100',
    format: 'per100',
    value: (s) => per100(s.repeatedRuns, s.bashCommands),
  },
  longShare: {
    label: `Sessions past ${LONG_SESSION_PROMPTS.toString()} prompts`,
    format: 'percent',
    value: (s) => share(s.longSessions, s.sessions),
  },
  denials: {
    label: 'Denials per 100 tool calls',
    format: 'per100',
    value: (s) => per100(s.denials, s.toolCalls),
  },
  extraReads: {
    label: 'Rereads per 100 tool calls',
    format: 'per100',
    value: (s) => per100(s.extraReads, s.toolCalls),
  },
  failures: {
    label: 'Failures per 100 tool calls',
    format: 'per100',
    value: (s) => per100(s.failures, s.toolCalls),
  },
  cdShare: {
    label: 'Commands that start with cd',
    format: 'percent',
    value: (s) => share(s.cdCommands, s.bashCommands),
  },
  fileReadShare: {
    label: 'Spend carrying files read',
    format: 'percent',
    value: (s) => share(s.fileReadUsd, s.usd),
  },
  setupShare: {
    label: 'Spend on the system prompt and tools',
    format: 'percent',
    value: (s) => share(s.setupUsd, s.usd),
  },
  skillShare: {
    label: 'Spend carrying skills',
    format: 'percent',
    value: (s) => share(s.skillUsd, s.usd),
  },
  instructionShare: {
    label: 'Spend carrying CLAUDE.md and memory',
    format: 'percent',
    value: (s) => share(s.instructionUsd, s.usd),
  },
};

/** A number that could get worse when the advice is followed, and why. */
interface WatchedMetric {
  readonly metric: MetricId;
  readonly why: string;
}

/** What to measure for one tip. */
export interface TipTracking {
  readonly target: MetricId;
  readonly watch: readonly WatchedMetric[];
}

function emptySums(): Sums {
  return {
    sessions: 0,
    prompts: 0,
    requests: 0,
    usd: 0,
    cacheReadUsd: 0,
    contextTokens: 0,
    largeSessions: 0,
    longSessions: 0,
    idleRewriteUsd: 0,
    subagentRequests: 0,
    premiumSubagentRequests: 0,
    toolCalls: 0,
    bigResults: 0,
    extraReads: 0,
    failures: 0,
    denials: 0,
    bashCommands: 0,
    repeatedRuns: 0,
    cdCommands: 0,
    fileReadUsd: 0,
    setupUsd: 0,
    skillUsd: 0,
    instructionUsd: 0,
  };
}

function add(sums: Sums, m: SessionMeasure): void {
  sums.sessions += 1;
  sums.prompts += m.prompts;
  sums.requests += m.requests;
  sums.usd += costTotal(m.cost) + m.subagentUsd;
  sums.cacheReadUsd += m.cost.cacheRead;
  sums.contextTokens += m.contextTokens;
  sums.largeSessions += m.peakContext > LARGE_CONTEXT ? 1 : 0;
  sums.longSessions += m.prompts > LONG_SESSION_PROMPTS ? 1 : 0;
  sums.idleRewriteUsd += m.idleRewriteUsd;
  sums.subagentRequests += m.subagentRequests;
  sums.premiumSubagentRequests += m.premiumSubagentRequests;
  sums.toolCalls += m.toolCalls;
  sums.bigResults += m.bigResults;
  sums.extraReads += m.extraReads;
  sums.failures += m.toolErrors - m.denials;
  sums.denials += m.denials;
  sums.bashCommands += m.bashCommands;
  sums.repeatedRuns += m.repeatedRuns;
  sums.cdCommands += m.cdCommands;
  sums.fileReadUsd += m.spend.fileReads + m.subagentSpend.fileReads;
  sums.setupUsd += m.spend.setup + m.subagentSpend.setup;
  sums.skillUsd += m.spend.skills + m.subagentSpend.skills;
  sums.instructionUsd += m.spend.instructions + m.subagentSpend.instructions;
}

function sumsOf(measures: readonly SessionMeasure[]): Sums {
  const sums = emptySums();
  for (const measure of measures) {
    add(sums, measure);
  }
  return sums;
}

interface MetricSlot {
  readonly id: MetricId;
  readonly role: ImpactMetric['role'];
  readonly why: string;
}

/** The cost, then side effects, each metric once and none the same as the target. */
function othersOf(tracking: TipTracking): MetricSlot[] {
  const candidates: MetricSlot[] = [
    { id: 'costPerPrompt', role: 'cost', why: '' },
    ...tracking.watch.map(({ metric, why }): MetricSlot => ({
      id: metric,
      role: 'side-effect',
      why,
    })),
  ];
  const others: MetricSlot[] = [];
  for (const slot of candidates) {
    if (slot.id !== tracking.target && !others.some((other) => other.id === slot.id)) {
      others.push(slot);
    }
  }
  return others;
}

/** Relative change, or null when there is nothing to compare. */
export function relativeChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null) {
    return null;
  }
  if (before === 0) {
    return after === 0 ? 0 : null;
  }
  return (after - before) / before;
}

/** Lower is better for every metric, and a move inside the band is noise. */
export function directionOf(before: number | null, after: number | null): ImpactDirection | null {
  if (before === null || after === null) {
    return null;
  }
  const change = relativeChange(before, after);
  if (change === null) {
    // From nothing to something.
    return 'worse';
  }
  if (change <= -CHANGE_BAND) {
    return 'better';
  }
  return change >= CHANGE_BAND ? 'worse' : 'same';
}

function metricOf(slot: MetricSlot, before: Sums, after: Sums): ImpactMetric {
  const definition = METRICS[slot.id];
  const beforeValue = before.sessions === 0 ? null : definition.value(before);
  const afterValue = after.sessions === 0 ? null : definition.value(after);
  return {
    id: slot.id,
    label: definition.label,
    role: slot.role,
    why: slot.why,
    format: definition.format,
    before: beforeValue,
    after: afterValue,
    change: relativeChange(beforeValue, afterValue),
    direction: directionOf(beforeValue, afterValue),
  };
}

/** Better only when the habit improved and nothing it could cost got worse. */
export function verdictOf(metrics: readonly ImpactMetric[]): ImpactVerdict {
  const target = metrics.find((metric) => metric.role === 'target');
  const othersWorse = metrics.some(
    (metric) => metric.role !== 'target' && metric.direction === 'worse',
  );
  if (target?.direction === 'worse') {
    return 'worse';
  }
  if (target?.direction === 'better') {
    return othersWorse ? 'mixed' : 'better';
  }
  return othersWorse ? 'worse' : 'same';
}

function moved(metric: ImpactMetric): string {
  // Only the first letter, so names such as Opus keep their capital.
  const label = `${metric.label.charAt(0).toLowerCase()}${metric.label.slice(1)}`;
  if (metric.direction === null) {
    return `${label} had nothing to compare on one side`;
  }
  if (metric.change === null) {
    return `${label} went up from none`;
  }
  if (metric.direction === 'same') {
    return `${label} held steady`;
  }
  const verb = metric.change < 0 ? 'fell' : 'rose';
  return `${label} ${verb} ${percent(Math.abs(metric.change))}`;
}

interface SummaryInput {
  readonly verdict: ImpactVerdict;
  readonly target: ImpactMetric;
  readonly others: readonly ImpactMetric[];
  readonly before: number;
  readonly after: number;
}

function summaryOf(input: SummaryInput): string {
  const { verdict, target, before, after } = input;
  if (verdict === 'no-baseline') {
    return 'No sessions ran in the 30 days before you started, so there is nothing to compare with yet.';
  }
  if (verdict === 'early') {
    return `Too early to tell: ${after.toLocaleString('en-US')} of the ${MIN_SESSIONS_AFTER.toString()} sessions needed have run since you started.`;
  }
  const compared = `over ${plural(after, 'session')} since you started, against ${before.toLocaleString('en-US')} in the 30 days before`;
  const costs = input.others.filter(
    (metric) => metric.direction !== null && metric.direction !== 'same',
  );
  const others =
    costs.length === 0 ? '' : ` Meanwhile ${costs.map((metric) => moved(metric)).join(', ')}.`;
  const lead = moved(target);
  return `${lead.charAt(0).toUpperCase()}${lead.slice(1)} ${compared}.${others}`;
}

function weeksOf(
  slots: readonly MetricSlot[],
  after: readonly SessionMeasure[],
  since: number,
  now: number,
): ImpactWeek[] {
  // The week now falls in is the last one, even when it has only just begun.
  const count = Math.max(0, Math.floor((now - since) / WEEK_MS)) + 1;
  const buckets = Array.from({ length: count }, emptySums);
  for (const measure of after) {
    const bucket = buckets[Math.floor((measure.startedAt - since) / WEEK_MS)];
    if (bucket !== undefined) {
      add(bucket, measure);
    }
  }
  return buckets
    .map((sums, index) => ({
      start: since + index * WEEK_MS,
      sessions: sums.sessions,
      values: slots.map((slot) => (sums.sessions === 0 ? null : METRICS[slot.id].value(sums))),
    }))
    .slice(-MAX_WEEKS);
}

export interface ImpactInput {
  readonly tracking: TipTracking;
  readonly since: number;
  /** Every session measured, history included. */
  readonly measures: readonly SessionMeasure[];
  readonly now: number;
}

export function impactOf(input: ImpactInput): TipImpact {
  const { since } = input;
  const used = input.measures.filter((measure) => measure.requests > 0);
  const before = used.filter(
    (m) => m.startedAt >= since - BASELINE_MS && m.startedAt < since && m.updatedAt < since,
  );
  const after = used.filter((m) => m.startedAt >= since);
  const targetSlot: MetricSlot = { id: input.tracking.target, role: 'target', why: '' };
  const otherSlots = othersOf(input.tracking);
  const slots = [targetSlot, ...otherSlots];
  const beforeSums = sumsOf(before);
  const afterSums = sumsOf(after);
  const target = metricOf(targetSlot, beforeSums, afterSums);
  const others = otherSlots.map((slot) => metricOf(slot, beforeSums, afterSums));
  const metrics = [target, ...others];
  let verdict: ImpactVerdict;
  if (before.length === 0) {
    verdict = 'no-baseline';
  } else if (after.length < MIN_SESSIONS_AFTER) {
    verdict = 'early';
  } else {
    verdict = verdictOf(metrics);
  }
  return {
    trackedSince: since,
    verdict,
    summary: summaryOf({ verdict, target, others, before: before.length, after: after.length }),
    sessionsBefore: before.length,
    sessionsAfter: after.length,
    metrics,
    weeks: weeksOf(slots, after, since, input.now),
  };
}
