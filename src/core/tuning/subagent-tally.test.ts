import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICES } from '../transcripts/pricing.js';
import {
  assistant,
  toolResult,
  toolUse,
  usage,
  userPrompt,
} from '../transcripts/test-helpers/fixtures.js';

import type { Attribution } from './attribute.js';
import { HourTally } from './spend-hours.js';
import { zeroSpend } from './spend.js';
import { measureSubagents } from './subagent-tally.js';

function request(
  id: string,
  model: string,
  cacheRead: number,
  content: readonly Readonly<Record<string, unknown>>[] = [],
): string {
  return JSON.stringify(
    assistant({
      uuid: `a-${id}`,
      at: 0,
      messageId: id,
      model,
      content,
      usage: usage({ cacheRead }),
    }),
  );
}

const MAIN: Attribution = {
  spend: zeroSpend(),
  heavy: [],
  files: { 'a.ts': 1 },
  skills: {},
  toolSchemas: {},
  toolUses: { Read: 2 },
};

function measure(
  lines: readonly (readonly string[])[],
  info?: Parameters<typeof measureSubagents>[0]['info'],
): ReturnType<typeof measureSubagents> {
  return measureSubagents(
    { lines, info, main: MAIN },
    DEFAULT_PRICES,
    new HourTally(DEFAULT_PRICES),
  );
}

describe('measureSubagents', () => {
  it('tallies each subagent, adds to the totals, and ranks them by cost', () => {
    const cheap = [request('c1', 'claude-haiku-5-5', 1_000_000)];
    const dear = [
      request('d1', 'claude-opus-5-5', 400_000, [toolUse('t1', 'Read', { file_path: 'a.ts' })]),
      request('d1', 'claude-opus-5-5', 400_000),
      JSON.stringify(toolResult('u1', 0, [{ toolUseId: 't1', text: 'x'.repeat(3600) }])),
      request('d2', 'claude-opus-5-5', 1_000_000),
      JSON.stringify(userPrompt('p1', 0, 'hi')),
    ];
    const long = 'x'.repeat(100);
    const parts = measure(
      [cheap, dear],
      [
        { type: 'Explore', description: 'Find it' },
        { type: 'general-purpose', description: long },
      ],
    );
    expect(parts.tally).toMatchObject({ requests: 3, premium: 2 });
    expect(parts.tally.usd).toBeCloseTo(0.01 + 0.2 + 0.08);
    // Every request passed 200K: 0.08 * 200K / 400K, 0.2 * 800K / 1M and 0.01 * 800K / 1M.
    expect(parts.tally.compactSavingUsd).toBeCloseTo(0.16 + 0.04 + 0.01 * 0.8);
    expect(
      parts.subagents.map((agent) => [
        agent.type,
        agent.description.length,
        agent.requests,
        agent.peakContext,
      ]),
    ).toStrictEqual([
      ['general-purpose', 80, 2, 1_000_000],
      ['Explore', 7, 1, 1_000_000],
    ]);
    expect(parts.subagents[0]?.usd).toBeCloseTo(0.28);
    expect(parts.toolUses).toStrictEqual(new Map([['Read', 3]]));
    expect(parts.files.get('a.ts')).toBeGreaterThan(1);
    expect(parts.spend.setup).toBeGreaterThan(0);
  });

  it('calls a subagent with no meta file unknown', () => {
    const parts = measure([[request('u1', 'claude-sonnet-5-5', 10)]]);
    expect(parts.subagents).toStrictEqual([
      {
        type: 'unknown',
        description: '',
        usd: expect.any(Number) as number,
        requests: 1,
        peakContext: 10,
      },
    ]);
    expect(parts.tally.premium).toBe(0);
  });

  it('keeps the five most expensive', () => {
    const lines = [1, 2, 3, 4, 5, 6].map((n) => [
      request(`r${String(n)}`, 'claude-opus-5-5', n * 1000),
    ]);
    const parts = measure(
      lines,
      lines.map((_, index) => ({ type: 'x', description: String(index + 1) })),
    );
    expect(parts.subagents.map((agent) => agent.description)).toStrictEqual([
      '6',
      '5',
      '4',
      '3',
      '2',
    ]);
  });
});
