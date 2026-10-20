// What the fixes read: the measured sessions and the machine they ran on.

import type { HotFile } from '../../shared/tuning.js';
import { isArray } from '../knobs/json.js';

import type { SessionMeasure } from './measure.js';
import type { Totals } from './totals.js';

export interface FixContext {
  readonly totals: Totals;
  readonly live: readonly SessionMeasure[];
  readonly hotFiles: readonly HotFile[];
  /** The effective value of a Claude Code setting, or undefined when unset. */
  readonly knob: (key: string) => unknown;
  /** Ids of suggestions already saved. */
  readonly installed: ReadonlySet<string>;
  readonly home: string;
  /** The repository a session folder belongs to. */
  readonly projectOf: (cwd: string) => string;
  /** When a file or folder last changed, or null when it is gone. */
  readonly modifiedAt: (path: string) => number | null;
}

/** The strings in a list setting, or none when it is not a list. */
export function stringsOf(value: unknown): string[] {
  return isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
