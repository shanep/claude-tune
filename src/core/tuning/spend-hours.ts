// A session's spend hour by hour, split into the parts a change of habit
// could save. Spend by the hour shows when the money went, not just where.

import type { PriceTable } from '../transcripts/pricing.js';
import { findPrice } from '../transcripts/pricing.js';

/** Spend in one clock hour of a session, at list price. */
export interface SpendHour {
  /** Epoch ms of the start of the hour. */
  readonly at: number;
  /** Main thread and subagents. */
  readonly usd: number;
  readonly subagentUsd: number;
  /** Main thread spend on Opus, Fable or Mythos. */
  readonly premiumUsd: number;
  /** What the main thread's premium requests would have saved on Sonnet. */
  readonly premiumSavingUsd: number;
  /** What the subagents' premium requests would have saved on Sonnet. */
  readonly subagentSavingUsd: number;
  /** Main thread spend on the context past CONTEXT_BUDGET tokens. */
  readonly bigContextUsd: number;
  readonly idleRewriteUsd: number;
}

export const HOUR_MS = 60 * 60_000;
/** Context past this many tokens is the part that clearing between tasks would drop. */
export const CONTEXT_BUDGET = 100_000;
/** The model premium work is priced against, to say what moving it would save. */
const ROUTINE_MODEL = 'claude-sonnet-5-5';

const PREMIUM = /claude-(?:opus|fable|mythos)/u;

export function isPremium(model: string): boolean {
  return PREMIUM.test(model);
}

/** Token counts, or dollars split the same way. */
interface Split {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** One request, as the tallies see it. */
export interface SpendRequest {
  readonly at: number | null;
  readonly model: string;
  readonly tokens: Split;
  /** At the request's own model's price. */
  readonly cost: Split;
  readonly idleRewriteUsd: number;
}

/** What a request adds, worked out once for both tallies. */
interface Priced {
  readonly bucket: Bucket;
  readonly usd: number;
  /** What moving it to ROUTINE_MODEL would save, zero for a model that is not premium. */
  readonly saving: number;
}

type Bucket = { -readonly [K in keyof SpendHour]: SpendHour[K] };

function emptyBucket(at: number): Bucket {
  return {
    at,
    usd: 0,
    subagentUsd: 0,
    premiumUsd: 0,
    premiumSavingUsd: 0,
    subagentSavingUsd: 0,
    bigContextUsd: 0,
    idleRewriteUsd: 0,
  };
}

/** The price of ROUTINE_MODEL for a request's tokens, or null when it is not in the table. */
function routineCost(tokens: Split, prices: PriceTable): number | null {
  const price = findPrice(ROUTINE_MODEL, prices);
  if (price === null) {
    return null;
  }
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      tokens.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}

/** Adds requests into hour buckets. A request with no timestamp counts nowhere. */
export class HourTally {
  private readonly buckets = new Map<number, Bucket>();

  constructor(private readonly prices: PriceTable) {}

  private bucket(at: number): Bucket {
    const start = Math.floor(at / HOUR_MS) * HOUR_MS;
    let found = this.buckets.get(start);
    if (found === undefined) {
      found = emptyBucket(start);
      this.buckets.set(start, found);
    }
    return found;
  }

  private priced(request: SpendRequest, at: number): Priced {
    const { cost } = request;
    const usd = cost.input + cost.output + cost.cacheRead + cost.cacheWrite;
    const routine = routineCost(request.tokens, this.prices) ?? usd;
    return {
      bucket: this.bucket(at),
      usd,
      saving: isPremium(request.model) ? Math.max(0, usd - routine) : 0,
    };
  }

  main(request: SpendRequest): void {
    if (request.at === null) {
      return;
    }
    const { bucket, usd, saving } = this.priced(request, request.at);
    const { tokens, cost } = request;
    const context = tokens.input + tokens.cacheRead + tokens.cacheWrite;
    bucket.usd += usd;
    bucket.idleRewriteUsd += request.idleRewriteUsd;
    if (context > CONTEXT_BUDGET) {
      const inputUsd = cost.input + cost.cacheRead + cost.cacheWrite;
      bucket.bigContextUsd += (inputUsd * (context - CONTEXT_BUDGET)) / context;
    }
    if (isPremium(request.model)) {
      bucket.premiumUsd += usd;
      bucket.premiumSavingUsd += saving;
    }
  }

  subagent(request: SpendRequest): void {
    if (request.at === null) {
      return;
    }
    const { bucket, usd, saving } = this.priced(request, request.at);
    bucket.usd += usd;
    bucket.subagentUsd += usd;
    bucket.subagentSavingUsd += saving;
  }

  /** Oldest first. */
  hours(): SpendHour[] {
    return [...this.buckets.values()].toSorted((left, right) => left.at - right.at);
  }
}
