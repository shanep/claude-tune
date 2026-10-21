// The shape of a tip rule, shared by the rule lists.

import type { TipSeverity } from '../../shared/tuning.js';

import type { TipTracking } from './impact.js';
import type { SessionMeasure } from './measure.js';
import type { Totals } from './totals.js';

/** What a finding can see beyond the sessions. */
export interface RuleEnv {
  /** The effective value of a Claude Code setting, or undefined when unset. */
  readonly knob: (key: string) => unknown;
  readonly now: number;
}

export interface TipRule {
  readonly id: string;
  readonly severity: TipSeverity;
  readonly title: string;
  readonly advice: readonly string[];
  /** Suggestion ids that help. */
  readonly fixes: readonly string[];
  readonly pros: readonly string[];
  /** What following the advice gives up, so the choice is an informed one. */
  readonly cons: readonly string[];
  readonly skipWhen: string;
  /** What to compare once you start following it, or null for a tip about setup that no session measure would show. */
  readonly track: TipTracking | null;
  /** Knobs the advice says to set. Setting one from /tune starts tracking the tip. */
  readonly knobs?: readonly string[];
  /** What the transcripts show, or null when the tip does not apply. */
  readonly finding: (totals: Totals, env: RuleEnv) => string | null;
  /** True when this session shows the problem. */
  readonly flags: (measure: SessionMeasure) => boolean;
  /** How badly, for ordering. */
  readonly metric: (measure: SessionMeasure) => number;
  readonly detail: (measure: SessionMeasure) => string;
}

export function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}
