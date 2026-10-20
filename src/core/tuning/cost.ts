// Pricing one request's usage, shared by the main thread and subagent tallies.

import type { PriceTable } from '../transcripts/pricing.js';
import { findPrice } from '../transcripts/pricing.js';
import type { TranscriptRecord } from '../transcripts/schemas.js';

/** US dollars at list price, split by token kind. */
export interface CostSplit {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** The autoCompactWindow the tips suggest. */
export const COMPACT_AT = 200_000;

export const ZERO_COST: CostSplit = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function costTotal(cost: CostSplit): number {
  return cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
}

export function addCost(left: CostSplit, right: CostSplit): CostSplit {
  return {
    input: left.input + right.input,
    output: left.output + right.output,
    cacheRead: left.cacheRead + right.cacheRead,
    cacheWrite: left.cacheWrite + right.cacheWrite,
  };
}

export interface Usage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** The part of a request's input cost above COMPACT_AT tokens of context. */
export function overCap(cost: CostSplit, context: number): number {
  if (context <= COMPACT_AT) {
    return 0;
  }
  return ((cost.input + cost.cacheRead + cost.cacheWrite) * (context - COMPACT_AT)) / context;
}

export function costOfUsage(model: string, usage: Usage, prices: PriceTable): CostSplit | null {
  const price = findPrice(model, prices);
  if (price === null) {
    return null;
  }
  return {
    input: (usage.input * price.input) / 1_000_000,
    output: (usage.output * price.output) / 1_000_000,
    cacheRead: (usage.cacheRead * price.cacheRead) / 1_000_000,
    cacheWrite: (usage.cacheWrite * price.cacheWrite) / 1_000_000,
  };
}

type AssistantRecord = Extract<TranscriptRecord, { type: 'assistant' }>;

/** The usage of a request the first time its message id shows up, or null for repeats. */
export function firstUsage(record: AssistantRecord, seen: Set<string>): Usage | null {
  const { message } = record;
  if (seen.has(message.id) || message.usage === null || message.usage === undefined) {
    return null;
  }
  seen.add(message.id);
  return {
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
    cacheRead: message.usage.cache_read_input_tokens,
    cacheWrite: message.usage.cache_creation_input_tokens,
  };
}
