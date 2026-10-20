// One rescan: measure every session whose transcript changed since the last
// scan, mark sessions whose transcript is gone as history, and forget history
// older than a year.

import type { TuningSession } from './sessions.js';
import { claudeTuningSessions, measureClaudeSession } from './sessions.js';
import type { FileStamp, TuningIndex } from './store.js';

/** How long a measure outlives its transcript. */
export const HISTORY_MS = 365 * 24 * 60 * 60_000;

export interface ScanResult {
  readonly filesRead: number;
  /** Transcripts that went away since the last scan, plus history that expired. */
  readonly filesGone: number;
}

function sameStamp(left: FileStamp | undefined, right: FileStamp): boolean {
  return left?.mtimeMs === right.mtimeMs && left.size === right.size;
}

function markGone(index: TuningIndex, seen: ReadonlySet<string>, now: number): number {
  let changed = 0;
  for (const [file, entry] of index.entries) {
    if (seen.has(file)) {
      continue;
    }
    if (now - entry.measure.updatedAt > HISTORY_MS) {
      index.entries.delete(file);
      changed += 1;
    } else if (entry.live) {
      index.entries.set(file, { ...entry, live: false });
      changed += 1;
    }
  }
  return changed;
}

async function scanFound(
  index: TuningIndex,
  sessions: readonly TuningSession[],
  now: number,
): Promise<ScanResult> {
  const seen = new Set<string>();
  let filesRead = 0;
  for (const session of sessions) {
    seen.add(session.path);
    const stamp: FileStamp = { mtimeMs: session.mtimeMs, size: session.size };
    const known = index.entries.get(session.path);
    if (!sameStamp(known?.stamp, stamp)) {
      index.entries.set(session.path, { stamp, measure: await measureClaudeSession(session), live: true });
      filesRead += 1;
    } else if (known !== undefined && !known.live) {
      // A transcript that came back, for example restored from a backup.
      index.entries.set(session.path, { ...known, live: true });
      filesRead += 1;
    }
  }
  const filesGone = markGone(index, seen, now);
  index.scannedAt = now;
  return { filesRead, filesGone };
}

/**
 * Claude Code's sessions under projectsDir. Updates `index` in place.
 * Running it twice on the same files reads nothing the second time.
 */
export async function scanInto(
  index: TuningIndex,
  projectsDir: string,
  now: number,
): Promise<ScanResult> {
  return scanFound(index, await claudeTuningSessions(projectsDir), now);
}
