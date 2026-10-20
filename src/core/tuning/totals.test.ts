import { describe, expect, it } from 'vitest';

import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

describe('totalsOf', () => {
  it('adds up sessions and keeps the most repeated command', () => {
    const totals = totalsOf(
      [
        measureOf({ cwd: HOME, topRepeat: { command: 'a', runs: 5 }, spawns: { Explore: 2 } }),
        measureOf({ topRepeat: { command: 'b', runs: 3 }, spawns: { 'general-purpose': 1 } }),
        measureOf({ topRepeat: { command: 'c', runs: 9 }, subagentUsd: 1 }),
      ],
      HOME,
    );
    expect(totals).toMatchObject({
      sessions: 3,
      homeSessions: 1,
      topRepeat: { command: 'c', runs: 9 },
      spawns: 3,
      exploreSpawns: 2,
      requests: 30,
    });
    expect(totals.totalUsd).toBeCloseTo(3 * 0.36 + 1);
  });

  it('is all zeros with no sessions', () => {
    expect(totalsOf([], HOME)).toMatchObject({
      sessions: 0,
      largestContext: 0,
      longestPrompts: 0,
      topRepeat: null,
    });
  });
});
