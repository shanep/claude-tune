import { describe, expect, it } from 'vitest';

import type { ImpactMetric } from '../../shared/tuning.js';

import type { MetricId, TipTracking } from './impact.js';
import {
  BASELINE_MS,
  directionOf,
  impactOf,
  MIN_SESSIONS_AFTER,
  relativeChange,
  verdictOf,
  WEEK_MS,
} from './impact.js';
import type { SessionMeasure } from './measure.js';
import { measureOf } from './test-helpers/fixtures.js';

const SINCE = 100 * WEEK_MS;

const WATCHED: readonly MetricId[] = [
  'rereadShare',
  'largeShare',
  'idleUsd',
  'premiumShare',
  'bigResults',
  'repeats',
  'longShare',
  'denials',
  'failures',
  'cdShare',
];
const HOUR = 60 * 60_000;

const TRACKING: TipTracking = {
  target: 'extraReads',
  watch: [
    { metric: 'failures', why: 'Edits made against a stale copy fail.' },
    // The cost is always there, so watching it again adds nothing.
    { metric: 'costPerPrompt', why: 'Twice.' },
  ],
};

/** A one hour session starting `at`, with `extraReads` rereads in 100 tool calls. */
function session(
  at: number,
  extraReads: number,
  extra: Partial<SessionMeasure> = {},
): SessionMeasure {
  return measureOf({
    sessionId: `s${at.toString()}`,
    startedAt: at,
    updatedAt: at + HOUR,
    prompts: 10,
    toolCalls: 100,
    extraReads,
    cost: { input: 0, output: 1, cacheRead: 0, cacheWrite: 0 },
    ...extra,
  });
}

function before(count: number, extraReads: number): SessionMeasure[] {
  return Array.from({ length: count }, (_, n) => session(SINCE - (n + 2) * HOUR, extraReads));
}

function after(
  count: number,
  extraReads: number,
  extra: Partial<SessionMeasure> = {},
): SessionMeasure[] {
  return Array.from({ length: count }, (_, n) => session(SINCE + n * HOUR, extraReads, extra));
}

function metric(overrides: Partial<ImpactMetric>): ImpactMetric {
  return {
    id: 'x',
    label: 'X',
    role: 'target',
    why: '',
    format: 'per100',
    before: 1,
    after: 1,
    change: 0,
    direction: 'same',
    ...overrides,
  };
}

describe('relativeChange and directionOf', () => {
  it('compares against the before value, with a noise band', () => {
    expect(relativeChange(null, 1)).toBeNull();
    expect(relativeChange(2, null)).toBeNull();
    expect(relativeChange(0, 0)).toBe(0);
    expect(relativeChange(0, 1)).toBeNull();
    expect(relativeChange(4, 3)).toBe(-0.25);
    expect(directionOf(null, 1)).toBeNull();
    expect(directionOf(0, 0)).toBe('same');
    expect(directionOf(0, 1)).toBe('worse');
    expect(directionOf(10, 9)).toBe('better');
    expect(directionOf(10, 9.5)).toBe('same');
    expect(directionOf(10, 10.5)).toBe('same');
    expect(directionOf(10, 11)).toBe('worse');
  });
});

describe('verdictOf', () => {
  const better = metric({ direction: 'better' });
  const worse = metric({ direction: 'worse' });
  const same = metric({});
  const sideWorse = metric({ role: 'side-effect', direction: 'worse' });
  const costBetter = metric({ role: 'cost', direction: 'better' });

  it('is better only when the habit improved and nothing it could cost got worse', () => {
    expect(verdictOf([better, costBetter])).toBe('better');
    expect(verdictOf([better, sideWorse])).toBe('mixed');
    expect(verdictOf([worse, costBetter])).toBe('worse');
    expect(verdictOf([same, sideWorse])).toBe('worse');
    expect(verdictOf([same, costBetter])).toBe('same');
    expect(verdictOf([metric({ direction: null })])).toBe('same');
  });
});

describe('impactOf', () => {
  it('compares sessions since tracking started with the 30 days before', () => {
    const measures = [
      ...before(4, 8),
      ...after(6, 2, { toolErrors: 1 }),
      // Older than the baseline window.
      session(SINCE - BASELINE_MS - HOUR, 50),
      // Running when tracking started, so on neither side.
      session(SINCE - HOUR / 2, 50),
      // Opened and left, so it says nothing.
      session(SINCE + HOUR, 50, { requests: 0 }),
    ];
    const impact = impactOf({ tracking: TRACKING, since: SINCE, measures, now: SINCE + 10 * HOUR });
    expect(impact).toMatchObject({
      trackedSince: SINCE,
      sessionsBefore: 4,
      sessionsAfter: 6,
      verdict: 'mixed',
    });
    expect(
      impact.metrics.map(({ id, role, before: was, after: now, direction }) => ({
        id,
        role,
        was,
        now,
        direction,
      })),
    ).toStrictEqual([
      { id: 'extraReads', role: 'target', was: 8, now: 2, direction: 'better' },
      { id: 'costPerPrompt', role: 'cost', was: 0.1, now: 0.1, direction: 'same' },
      { id: 'failures', role: 'side-effect', was: 0, now: 1, direction: 'worse' },
    ]);
    expect(impact.metrics[2]?.why).toBe('Edits made against a stale copy fail.');
    expect(impact.summary).toBe(
      'Rereads per 100 tool calls fell 75% over 6 sessions since you started, against 4 in the 30 days before. Meanwhile failures per 100 tool calls went up from none.',
    );
  });

  it('says how each week went, keeping empty weeks and only the last eight', () => {
    const measures = [
      ...before(1, 8),
      session(SINCE, 4),
      session(SINCE + HOUR, 6),
      session(SINCE + 2 * WEEK_MS, 1),
      session(SINCE + 9 * WEEK_MS, 0),
    ];
    const impact = impactOf({
      tracking: { target: 'extraReads', watch: [] },
      since: SINCE,
      measures,
      now: SINCE + 9 * WEEK_MS + HOUR,
    });
    expect(impact.weeks).toHaveLength(8);
    expect(impact.weeks[0]).toStrictEqual({
      start: SINCE + 2 * WEEK_MS,
      sessions: 1,
      values: [1, 0.1],
    });
    expect(impact.weeks[1]).toStrictEqual({
      start: SINCE + 3 * WEEK_MS,
      sessions: 0,
      values: [null, null],
    });
    expect(impact.weeks.at(-1)).toMatchObject({ start: SINCE + 9 * WEEK_MS, sessions: 1 });
    const early = impactOf({
      tracking: { target: 'extraReads', watch: [] },
      since: SINCE,
      measures,
      now: SINCE + HOUR * 2,
    });
    expect(early.weeks).toStrictEqual([{ start: SINCE, sessions: 2, values: [5, 0.1] }]);
  });

  it('waits for enough sessions, and says when there is no baseline', () => {
    const early = impactOf({
      tracking: TRACKING,
      since: SINCE,
      measures: [...before(3, 8), ...after(MIN_SESSIONS_AFTER - 1, 0)],
      now: SINCE,
    });
    expect(early.verdict).toBe('early');
    expect(early.summary).toBe(
      'Too early to tell: 4 of the 5 sessions needed have run since you started.',
    );
    const lonely = impactOf({
      tracking: TRACKING,
      since: SINCE,
      measures: after(9, 0),
      now: SINCE,
    });
    expect(lonely.verdict).toBe('no-baseline');
    expect(lonely.metrics[0]).toMatchObject({ before: null, after: 0, direction: null });
    expect(lonely.summary).toMatch(/^No sessions ran in the 30 days before/u);
  });

  it('says a steady habit held steady', () => {
    const impact = impactOf({
      tracking: { target: 'extraReads', watch: [] },
      since: SINCE,
      measures: [...before(5, 4), ...after(5, 4)],
      now: SINCE,
    });
    expect(impact.verdict).toBe('same');
    expect(impact.summary).toBe(
      'Rereads per 100 tool calls held steady over 5 sessions since you started, against 5 in the 30 days before.',
    );
  });

  it('works out every metric from the sessions', () => {
    const rich = measureOf({
      startedAt: SINCE - 2 * HOUR,
      updatedAt: SINCE - HOUR,
      prompts: 40,
      requests: 10,
      contextTokens: 3_000_000,
      peakContext: 400_000,
      cost: { input: 0, output: 2, cacheRead: 2, cacheWrite: 0 },
      idleRewriteUsd: 1,
      subagentRequests: 10,
      premiumSubagentRequests: 5,
      subagentUsd: 0,
      toolCalls: 50,
      bigResults: 1,
      toolErrors: 6,
      denials: 2,
      bashCommands: 20,
      repeatedRuns: 4,
      cdCommands: 5,
    });
    const values = new Map(
      impactOf({
        tracking: {
          target: 'averageContext',
          watch: WATCHED.map((id) => ({ metric: id, why: '' })),
        },
        since: SINCE,
        measures: [rich],
        now: SINCE,
      }).metrics.map((item) => [item.id, item.before]),
    );
    expect(Object.fromEntries(values)).toStrictEqual({
      averageContext: 300_000,
      costPerPrompt: 0.1,
      rereadShare: 0.5,
      largeShare: 1,
      idleUsd: 1,
      premiumShare: 0.5,
      bigResults: 2,
      repeats: 20,
      longShare: 1,
      denials: 4,
      failures: 8,
      cdShare: 0.25,
    });
  });

  it('says a measure with no data since could not be compared, keeping capitals', () => {
    const impact = impactOf({
      tracking: { target: 'premiumShare', watch: [] },
      since: SINCE,
      measures: [
        ...before(5, 0).map((m) => ({ ...m, subagentRequests: 10, premiumSubagentRequests: 9 })),
        ...after(5, 0),
      ],
      now: SINCE,
    });
    expect(impact.metrics[0]).toMatchObject({ before: 0.9, after: null, direction: null });
    expect(impact.summary).toMatch(
      /^Subagent requests on Opus or Fable had nothing to compare on one side over 5 sessions/u,
    );
  });

  it('has no value where there is nothing to divide by', () => {
    const impact = impactOf({
      tracking: { target: 'premiumShare', watch: [{ metric: 'denials', why: '' }] },
      since: SINCE,
      measures: before(2, 0).map((m) => ({ ...m, toolCalls: 0 })),
      now: SINCE,
    });
    expect(impact.metrics.map((item) => item.before)).toStrictEqual([null, 0.1, null]);
  });

  it('calls a habit that got worse worse, and never lists the target twice', () => {
    const impact = impactOf({
      tracking: { target: 'costPerPrompt', watch: [{ metric: 'costPerPrompt', why: '' }] },
      since: SINCE,
      measures: [
        ...before(5, 0),
        ...after(5, 0, { cost: { input: 0, output: 2, cacheRead: 0, cacheWrite: 0 } }),
      ],
      now: SINCE,
    });
    expect(impact.metrics.map((item) => item.id)).toStrictEqual(['costPerPrompt']);
    expect(impact.verdict).toBe('worse');
    expect(impact.summary).toMatch(/^Cost per prompt rose 100% over 5 sessions/u);
  });
});
