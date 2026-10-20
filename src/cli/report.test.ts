import { describe, expect, it } from 'vitest';

import { summarize } from '../core/tuning/summarize.js';
import { HOME, measureOf } from '../core/tuning/test-helpers/fixtures.js';
import type { TuningState } from '../shared/tuning.js';

import { DEFAULT_REPORT, renderReport } from './report.js';

function stateOf(): TuningState {
  return summarize({
    measures: [
      measureOf({
        sessionId: 'dear',
        title: 'Dear\nsession',
        cwd: `${HOME}/repos/app`,
        peakContext: 300_000,
        requests: 4,
        contextTokens: 400_000,
        cost: { input: 0, output: 1, cacheRead: 3, cacheWrite: 0 },
      }),
    ],
    history: [],
    tracked: new Map(),
    now: 2000,
    installed: new Set(),
    home: HOME,
    scannedAt: 9,
  });
}

describe('renderReport', () => {
  it('shows totals, tips with their fixes, and the costliest sessions', () => {
    const text = renderReport(stateOf(), { ...DEFAULT_REPORT, home: HOME });
    expect(text).toMatch(/^# Claude Code tuning\n\n1 session, \$/u);
    expect(text).toContain('### Sessions grow huge without compacting `huge-context` (high)');
    expect(text).toContain('`knob:autoCompactWindow` [knob] Compact every session at 200K tokens.');
    expect(text).toContain('## Costliest sessions');
    expect(text).toContain('### Dear session: $');
    expect(text).toContain('in ~/repos/app.');
    expect(text).not.toMatch(/[\u2013\u2014]/u);
  });

  it('says so when there is nothing to tune', () => {
    const empty = summarize({
      measures: [],
      history: [],
      tracked: new Map(),
      now: 0,
      installed: new Set(),
      home: HOME,
      scannedAt: null,
    });
    expect(renderReport(empty, { ...DEFAULT_REPORT, home: HOME })).toContain('nothing to tune');
  });
});
