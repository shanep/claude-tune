import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICES } from '../transcripts/pricing.js';
import { parseTranscriptLine } from '../transcripts/schemas.js';
import { assistant, usage } from '../transcripts/test-helpers/fixtures.js';

import { addCost, COMPACT_AT, costOfUsage, costTotal, firstUsage, overCap } from './cost.js';

const COST = { input: 1, output: 2, cacheRead: 4, cacheWrite: 8 };

function record(
  messageId: string,
  spec: Parameters<typeof usage>[0] | null,
): ReturnType<typeof parseTranscriptLine> {
  return parseTranscriptLine(
    JSON.stringify(
      assistant({
        uuid: `a-${messageId}`,
        at: 0,
        messageId,
        content: [],
        usage: spec === null ? null : usage(spec),
      }),
    ),
  );
}

describe('costTotal and addCost', () => {
  it('adds every kind of token', () => {
    expect(costTotal(COST)).toBe(15);
    expect(addCost(COST, { input: 10, output: 20, cacheRead: 40, cacheWrite: 80 })).toStrictEqual({
      input: 11,
      output: 22,
      cacheRead: 44,
      cacheWrite: 88,
    });
  });
});

describe('overCap', () => {
  it('is nothing at or under the cap', () => {
    expect(overCap(COST, COMPACT_AT)).toBe(0);
    expect(overCap(COST, 1000)).toBe(0);
  });

  it('is the input side share of the cost above the cap', () => {
    // Input, cache reads and writes are 13, output is left out, and a quarter is over the cap.
    expect(overCap(COST, (COMPACT_AT * 4) / 3)).toBeCloseTo(13 / 4);
    expect(overCap(COST, COMPACT_AT + 1)).toBeCloseTo(13 / (COMPACT_AT + 1));
  });
});

describe('costOfUsage', () => {
  it('prices each kind of token per million, or says it cannot', () => {
    const tokens = {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheWrite: 1_000_000,
    };
    expect(costOfUsage('claude-opus-5-5', tokens, DEFAULT_PRICES)).toStrictEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite: 5,
    });
    expect(costOfUsage('gpt-5', tokens, DEFAULT_PRICES)).toBeNull();
  });
});

describe('firstUsage', () => {
  it('reads a request once, and nothing without usage', () => {
    const seen = new Set<string>();
    const first = record('m1', { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 });
    if (first?.type !== 'assistant') {
      throw new Error('not an assistant record');
    }
    expect(firstUsage(first, seen)).toStrictEqual({
      input: 1,
      output: 2,
      cacheRead: 3,
      cacheWrite: 4,
    });
    expect(firstUsage(first, seen)).toBeNull();
    const bare = record('m2', null);
    if (bare?.type !== 'assistant') {
      throw new Error('not an assistant record');
    }
    expect(firstUsage(bare, seen)).toBeNull();
    expect(seen.has('m2')).toBe(false);
  });
});
