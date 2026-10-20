// Sums of the session measures, for the tips and the suggestions.

import type { CommandFamily, RepeatedCommand, SessionMeasure } from './measure.js';
import { costTotal } from './measure.js';
import type { SpendSplit } from './spend.js';
import { addSpend, zeroSpend } from './spend.js';

/** A context this big is costly to carry on every request. */
export const LARGE_CONTEXT = 200_000;
/** More prompts than this in one session usually means several tasks. */
export const LONG_SESSION_PROMPTS = 30;

export interface Totals {
  readonly sessions: number;
  /** Main threads and subagents, at list price. */
  readonly totalUsd: number;
  readonly cacheReadUsd: number;
  readonly requests: number;
  readonly contextTokens: number;
  readonly largestContext: number;
  readonly largeSessions: number;
  readonly longSessions: number;
  readonly longestPrompts: number;
  readonly homeSessions: number;
  readonly compactions: number;
  readonly idleRewrites: number;
  readonly idleRewriteUsd: number;
  readonly bigResults: number;
  readonly extraReads: number;
  readonly repeatedRuns: number;
  readonly topRepeat: RepeatedCommand | null;
  readonly toolCalls: number;
  readonly toolErrors: number;
  readonly denials: number;
  readonly bashCommands: number;
  readonly cdCommands: number;
  readonly spawns: number;
  readonly exploreSpawns: number;
  readonly subagentRequests: number;
  readonly premiumSubagentRequests: number;
  readonly subagentUsd: number;
  readonly families: Readonly<Record<CommandFamily, number>>;
  /** Main threads and subagents by what filled the context. */
  readonly spend: SpendSplit;
  readonly compactSavingUsd: number;
  /** What moving premium subagent requests to Sonnet would have saved. */
  readonly subagentSavingUsd: number;
  /** What sending each tool's definition cost, by tool name. */
  readonly toolSchemaUsd: Readonly<Record<string, number>>;
  /** Sessions whose requests carried each tool's definition. */
  readonly toolSchemaSessions: Readonly<Record<string, number>>;
  readonly toolUses: Readonly<Record<string, number>>;
  /** Sessions that called each tool at least once. */
  readonly toolUseSessions: Readonly<Record<string, number>>;
  /** What carrying each loaded skill cost, by skill folder. */
  readonly skillUsd: Readonly<Record<string, number>>;
}

function sumRecords(
  measures: readonly SessionMeasure[],
  pick: (m: SessionMeasure) => Readonly<Record<string, number>>,
  each: (value: number) => number = (value) => value,
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const measure of measures) {
    for (const [key, value] of Object.entries(pick(measure))) {
      sums[key] = (sums[key] ?? 0) + each(value);
    }
  }
  return sums;
}

/** Main thread and subagent cost of one session. */
export function sessionUsd(measure: SessionMeasure): number {
  return costTotal(measure.cost) + measure.subagentUsd;
}

function sum(measures: readonly SessionMeasure[], pick: (m: SessionMeasure) => number): number {
  return measures.reduce((total, measure) => total + pick(measure), 0);
}

function topRepeat(measures: readonly SessionMeasure[]): RepeatedCommand | null {
  let best: RepeatedCommand | null = null;
  for (const { topRepeat: repeat } of measures) {
    if (repeat !== null && (best === null || repeat.runs > best.runs)) {
      best = repeat;
    }
  }
  return best;
}

function spendOf(measures: readonly SessionMeasure[]): SpendSplit {
  let total: SpendSplit = zeroSpend();
  for (const measure of measures) {
    total = addSpend(total, addSpend(measure.spend, measure.subagentSpend));
  }
  return total;
}

function spawnsOf(measure: SessionMeasure): number {
  return Object.values(measure.spawns).reduce((total, count) => total + count, 0);
}

/** `home` is the user's home folder, to count sessions started there. */
export function totalsOf(measures: readonly SessionMeasure[], home: string): Totals {
  return {
    sessions: measures.length,
    totalUsd: sum(measures, sessionUsd),
    cacheReadUsd: sum(measures, (m) => m.cost.cacheRead),
    requests: sum(measures, (m) => m.requests),
    contextTokens: sum(measures, (m) => m.contextTokens),
    largestContext: Math.max(0, ...measures.map((m) => m.peakContext)),
    largeSessions: measures.filter((m) => m.peakContext > LARGE_CONTEXT).length,
    longSessions: measures.filter((m) => m.prompts > LONG_SESSION_PROMPTS).length,
    longestPrompts: Math.max(0, ...measures.map((m) => m.prompts)),
    homeSessions: measures.filter((m) => m.cwd === home).length,
    compactions: sum(measures, (m) => m.compactions),
    idleRewrites: sum(measures, (m) => m.idleRewrites),
    idleRewriteUsd: sum(measures, (m) => m.idleRewriteUsd),
    bigResults: sum(measures, (m) => m.bigResults),
    extraReads: sum(measures, (m) => m.extraReads),
    repeatedRuns: sum(measures, (m) => m.repeatedRuns),
    topRepeat: topRepeat(measures),
    toolCalls: sum(measures, (m) => m.toolCalls),
    toolErrors: sum(measures, (m) => m.toolErrors),
    denials: sum(measures, (m) => m.denials),
    bashCommands: sum(measures, (m) => m.bashCommands),
    cdCommands: sum(measures, (m) => m.cdCommands),
    spawns: sum(measures, spawnsOf),
    exploreSpawns: sum(measures, (m) => m.spawns['Explore'] ?? 0),
    subagentRequests: sum(measures, (m) => m.subagentRequests),
    premiumSubagentRequests: sum(measures, (m) => m.premiumSubagentRequests),
    subagentUsd: sum(measures, (m) => m.subagentUsd),
    families: {
      land: sum(measures, (m) => m.families.land),
      ci: sum(measures, (m) => m.families.ci),
      server: sum(measures, (m) => m.families.server),
      buildTest: sum(measures, (m) => m.families.buildTest),
      search: sum(measures, (m) => m.families.search),
    },
    spend: spendOf(measures),
    compactSavingUsd: sum(measures, (m) => m.compactSavingUsd),
    subagentSavingUsd: sum(measures, (m) =>
      m.hours.reduce((total, hour) => total + hour.subagentSavingUsd, 0),
    ),
    toolSchemaUsd: sumRecords(measures, (m) => m.toolSchemas),
    toolSchemaSessions: sumRecords(
      measures,
      (m) => m.toolSchemas,
      () => 1,
    ),
    toolUses: sumRecords(measures, (m) => m.toolUses),
    toolUseSessions: sumRecords(
      measures,
      (m) => m.toolUses,
      () => 1,
    ),
    skillUsd: sumRecords(measures, (m) => m.skills),
  };
}
