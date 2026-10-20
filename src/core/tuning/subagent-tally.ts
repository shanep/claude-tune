// The subagents of a session: what each cost, what filled their context, and
// the counts they add to the session's.

import type { CostlySubagent } from '../../shared/tuning.js';
import type { PriceTable } from '../transcripts/pricing.js';
import { parseTimestamp, parseTranscriptLine } from '../transcripts/schemas.js';

import type { Attribution } from './attribute.js';
import { attribute } from './attribute.js';
import { costOfUsage, costTotal, firstUsage, overCap, ZERO_COST } from './cost.js';
import type { HourTally } from './spend-hours.js';
import { isPremium } from './spend-hours.js';
import type { SpendSplit } from './spend.js';
import { addSpend, zeroSpend } from './spend.js';

const TOP_SUBAGENTS = 5;
const DESCRIPTION_CHARS = 80;

/** What the agent's meta file says about a subagent. */
export interface SubagentInfo {
  readonly type: string;
  readonly description: string;
}

interface SubagentTally {
  requests: number;
  premium: number;
  usd: number;
  compactSavingUsd: number;
}

function tallySubagent(
  lines: readonly string[],
  prices: PriceTable,
  into: SubagentTally,
  hours: HourTally,
): Omit<CostlySubagent, 'type' | 'description'> {
  const seen = new Set<string>();
  const own = { usd: 0, requests: 0, peakContext: 0 };
  for (const line of lines) {
    const record = parseTranscriptLine(line);
    const usage = record?.type === 'assistant' ? firstUsage(record, seen) : null;
    if (record?.type !== 'assistant' || usage === null) {
      continue;
    }
    into.requests += 1;
    into.premium += isPremium(record.message.model) ? 1 : 0;
    const cost = costOfUsage(record.message.model, usage, prices) ?? ZERO_COST;
    into.usd += costTotal(cost);
    own.usd += costTotal(cost);
    own.requests += 1;
    const context = usage.input + usage.cacheRead + usage.cacheWrite;
    own.peakContext = Math.max(own.peakContext, context);
    into.compactSavingUsd += overCap(cost, context);
    const { model } = record.message;
    hours.subagent({
      at: parseTimestamp(record.timestamp),
      model,
      tokens: usage,
      cost,
      idleRewriteUsd: 0,
    });
  }
  return own;
}

function mergeCounts(into: Map<string, number>, counts: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(counts)) {
    into.set(key, (into.get(key) ?? 0) + value);
  }
}

export interface SubagentParts {
  readonly tally: SubagentTally;
  readonly spend: SpendSplit;
  readonly files: Map<string, number>;
  readonly toolUses: Map<string, number>;
  /** The most expensive, worst first. */
  readonly subagents: readonly CostlySubagent[];
}

/** Measures every subagent, adding its counts to the main thread's `main`. */
export function measureSubagents(
  input: {
    readonly lines: readonly (readonly string[])[];
    readonly info: readonly (SubagentInfo | null)[] | undefined;
    readonly main: Attribution;
  },
  prices: PriceTable,
  hours: HourTally,
): SubagentParts {
  const tally: SubagentTally = { requests: 0, premium: 0, usd: 0, compactSavingUsd: 0 };
  let spend: SpendSplit = zeroSpend();
  const files = new Map(Object.entries(input.main.files));
  const toolUses = new Map(Object.entries(input.main.toolUses));
  const subagents: CostlySubagent[] = [];
  for (const [index, lines] of input.lines.entries()) {
    const own = tallySubagent(lines, prices, tally, hours);
    const parts = attribute(lines, prices);
    spend = addSpend(spend, parts.spend);
    mergeCounts(files, parts.files);
    mergeCounts(toolUses, parts.toolUses);
    const info = input.info?.[index] ?? null;
    subagents.push({
      type: info?.type ?? 'unknown',
      description: (info?.description ?? '').slice(0, DESCRIPTION_CHARS),
      ...own,
    });
  }
  return {
    tally,
    spend,
    files,
    toolUses,
    subagents: subagents.toSorted((left, right) => right.usd - left.usd).slice(0, TOP_SUBAGENTS),
  };
}
