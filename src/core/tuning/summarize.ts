// Turns the session measures into what /tune shows.

import type { TuningSessionRow, TuningState } from '../../shared/tuning.js';

import { buildTips, tipsFor } from './build.js';
import { spendSlices, costlySessions, hotFiles } from './costly.js';
import { unusedTools } from './fixes.js';
import type { SessionMeasure } from './measure.js';
import { cacheReadShare } from './rules.js';
import { buildSuggestions } from './suggestions.js';
import { sessionUsd, totalsOf } from './totals.js';

const MAX_ROWS = 200;

export interface SummaryInputs {
  /** Sessions whose transcript is still on disk. */
  readonly measures: readonly SessionMeasure[];
  /** Sessions whose transcript Claude Code has since deleted. */
  readonly history: readonly SessionMeasure[];
  /** When you started following each tracked tip, by tip id. */
  readonly tracked: ReadonlyMap<string, number>;
  readonly now: number;
  /** Ids of suggestions already saved as a skill or agent. */
  readonly installed: ReadonlySet<string>;
  readonly home: string;
  readonly scannedAt: number | null;
  /** The effective value of a Claude Code setting. Unset reads every setting as unset. */
  readonly knob?: (key: string) => unknown;
  /** The repository a session folder belongs to. Unset treats each folder as its own. */
  readonly projectOf?: (cwd: string) => string;
  /** When a path last changed, or null when it is not there. Unset offers no sessions to start. */
  readonly modifiedAt?: (path: string) => number | null;
}

export function summarize(inputs: SummaryInputs): TuningState {
  // A session with no requests was opened and left, so it says nothing about habits.
  const measures = inputs.measures.filter((measure) => measure.requests > 0);
  const totals = totalsOf(measures, inputs.home);
  const projectOf = inputs.projectOf ?? ((cwd: string): string => cwd);
  const hot = hotFiles(measures, projectOf, inputs.modifiedAt);
  const tips = buildTips({
    totals,
    live: measures,
    all: [...measures, ...inputs.history],
    tracked: inputs.tracked,
    now: inputs.now,
    fixEnv: {
      hotFiles: hot,
      knob: inputs.knob ?? ((): unknown => undefined),
      installed: inputs.installed,
      home: inputs.home,
      projectOf,
      modifiedAt: inputs.modifiedAt ?? ((): null => null),
    },
  });
  const unused = new Set(unusedTools(totals).map((tool) => tool.name));
  const rows: TuningSessionRow[] = measures
    .map((measure) => ({
      sessionId: measure.sessionId,
      title: measure.title,
      updatedAt: measure.updatedAt,
      prompts: measure.prompts,
      requests: measure.requests,
      peakContext: measure.peakContext,
      averageContext: measure.contextTokens / measure.requests,
      costUsd: sessionUsd(measure),
      cacheReadShare: cacheReadShare(measure),
      tips: tipsFor(measure, tips),
    }))
    .toSorted((left, right) => right.costUsd - left.costUsd)
    .slice(0, MAX_ROWS);
  return {
    sessions: totals.sessions,
    totalUsd: totals.totalUsd,
    cacheReadUsd: totals.cacheReadUsd,
    averageContext: totals.requests === 0 ? 0 : totals.contextTokens / totals.requests,
    largestContext: totals.largestContext,
    subagentUsd: totals.subagentUsd,
    spend: spendSlices(totals.spend),
    costly: costlySessions(measures, unused),
    hotFiles: hot,
    tips,
    suggestions: buildSuggestions(totals, inputs.installed),
    rows,
    scannedAt: inputs.scannedAt,
  };
}
