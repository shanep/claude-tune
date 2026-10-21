// How long Claude Code keeps session transcripts, for the transcript-cleanup
// tip and the fix that raises it.

/** Claude Code deletes a transcript this many days after its last use unless cleanupPeriodDays says otherwise. */
const CLEANUP_DEFAULT_DAYS = 30;
/** Keeping transcripts at least this long is enough for /tune and /resume. */
export const KEEP_DAYS = 90;

/** How long Claude Code keeps transcripts with this cleanupPeriodDays. */
export function keptDays(setting: unknown): number {
  return typeof setting === 'number' && setting >= 0 ? setting : CLEANUP_DEFAULT_DAYS;
}
