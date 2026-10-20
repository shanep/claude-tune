import { describe, expect, it } from 'vitest';

import type { TokenUsage } from './pricing.js';

import type { ModelPrice, PriceTable } from './pricing.js';
import { costOf, DEFAULT_PRICES, estimateCost, findPrice } from './pricing.js';

const TABLE: PriceTable = {
  'claude-test-5': { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
  'claude-test-5-5': { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
};

const MILLION: TokenUsage = {
  input: 1_000_000,
  output: 1_000_000,
  cacheRead: 1_000_000,
  cacheCreation: 1_000_000,
  thinking: 1_000_000,
};

describe('findPrice', () => {
  it('matches the exact id', () => {
    expect(findPrice('claude-test-5', TABLE)).toBe(TABLE['claude-test-5']);
    expect(findPrice('claude-test-5-5', TABLE)).toBe(TABLE['claude-test-5-5']);
  });

  it('prefers the longest prefix regardless of key order', () => {
    const reversed: PriceTable = {
      'claude-test-5-5': { input: 10, output: 20, cacheRead: 30, cacheWrite: 40 },
      'claude-test-5': { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
    };
    expect(findPrice('claude-test-5-5[1m]', reversed)?.input).toBe(10);
    expect(findPrice('claude-test-5-5[1m]', TABLE)?.input).toBe(10);
  });

  it('accepts context tags, Vertex versions and dated snapshots', () => {
    expect(findPrice('claude-test-5[1m]', TABLE)?.input).toBe(1);
    expect(findPrice('claude-test-5@20260101', TABLE)?.input).toBe(1);
    expect(findPrice('claude-test-5-20251001', TABLE)?.input).toBe(1);
    expect(findPrice('claude-test-5-20251001[1m]', TABLE)?.input).toBe(1);
    expect(findPrice('claude-test-5-20251001@x', TABLE)?.input).toBe(1);
  });

  it('strips a platform prefix', () => {
    expect(findPrice('us.anthropic.claude-test-5-5', TABLE)?.input).toBe(10);
    expect(findPrice('anthropic.claude-test-5', TABLE)?.input).toBe(1);
  });

  it('does not price a newer version or a different model', () => {
    expect(findPrice('claude-test-5-9', TABLE)).toBeNull();
    expect(findPrice('claude-test-55', TABLE)).toBeNull();
    expect(findPrice('claude-test-5-2025100', TABLE)).toBeNull();
    expect(findPrice('claude-test-5-20251001x', TABLE)).toBeNull();
    expect(findPrice('claude-other', TABLE)).toBeNull();
    expect(findPrice('<synthetic>', TABLE)).toBeNull();
    expect(findPrice('xclaude-test-5', {})).toBeNull();
  });
});

function price(input: number): ModelPrice {
  return { input, output: 0, cacheRead: 0, cacheWrite: 0 };
}

describe('findPrice with dated keys', () => {
  it('picks the longer of two keys that both fit, in either order', () => {
    const shortFirst: PriceTable = { 'claude-z-1': price(1), 'claude-z-1-20250101': price(2) };
    const longFirst: PriceTable = { 'claude-z-1-20250101': price(2), 'claude-z-1': price(1) };
    expect(findPrice('claude-z-1-20250101', shortFirst)?.input).toBe(2);
    expect(findPrice('claude-z-1-20250101', longFirst)?.input).toBe(2);
    expect(findPrice('claude-z-1-20250202', longFirst)?.input).toBe(1);
  });
});

describe('costOf', () => {
  it('weights each token kind by its own rate and ignores thinking', () => {
    expect(costOf(MILLION, { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 })).toBe(10);
    expect(
      costOf(
        { input: 500_000, output: 0, cacheRead: 0, cacheCreation: 0, thinking: 9 },
        { input: 2, output: 100, cacheRead: 100, cacheWrite: 100 },
      ),
    ).toBe(1);
    expect(
      costOf(
        { input: 0, output: 250_000, cacheRead: 0, cacheCreation: 0, thinking: 0 },
        { input: 100, output: 4, cacheRead: 100, cacheWrite: 100 },
      ),
    ).toBe(1);
    expect(
      costOf(
        { input: 0, output: 0, cacheRead: 2_000_000, cacheCreation: 0, thinking: 0 },
        { input: 100, output: 100, cacheRead: 0.5, cacheWrite: 100 },
      ),
    ).toBe(1);
    expect(
      costOf(
        { input: 0, output: 0, cacheRead: 0, cacheCreation: 100_000, thinking: 0 },
        { input: 100, output: 100, cacheRead: 100, cacheWrite: 10 },
      ),
    ).toBe(1);
  });
});

describe('estimateCost', () => {
  it('prices known models and gives null for unknown ones', () => {
    expect(estimateCost('claude-test-5-5', MILLION, TABLE)).toBe(100);
    expect(estimateCost('mystery-model', MILLION, TABLE)).toBeNull();
  });
});

describe('DEFAULT_PRICES', () => {
  it('holds the list prices for the current families', () => {
    expect(findPrice('claude-opus-5-5', DEFAULT_PRICES)).toStrictEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite: 5,
    });
    expect(findPrice('claude-opus-5[1m]', DEFAULT_PRICES)?.input).toBe(5);
    expect(findPrice('claude-sonnet-5-5', DEFAULT_PRICES)?.output).toBe(10);
    expect(findPrice('claude-haiku-4-5-20251001', DEFAULT_PRICES)?.input).toBe(1);
    expect(findPrice('claude-haiku-5-5', DEFAULT_PRICES)?.cacheRead).toBeCloseTo(0.01, 10);
    expect(findPrice('claude-fable-5-1', DEFAULT_PRICES)?.cacheRead).toBe(0.25);
    expect(findPrice('claude-fable-5', DEFAULT_PRICES)?.cacheRead).toBe(1);
    expect(findPrice('claude-opus-4-5-20251101', DEFAULT_PRICES)?.output).toBe(25);
    expect(findPrice('claude-sonnet-4-5-20250929', DEFAULT_PRICES)?.output).toBe(15);
    expect(Object.keys(DEFAULT_PRICES)).toHaveLength(16);
    for (const listed of Object.values(DEFAULT_PRICES)) {
      expect(listed.cacheWrite).toBeCloseTo(listed.input * 1.25, 10);
      expect(listed.output).toBeCloseTo(listed.input * 5, 10);
    }
  });
});
