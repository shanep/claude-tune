// Where a session ran. Claude Code writes an entrypoint on every record: cli
// for the terminal, claude-vscode for the VS Code extension, claude-desktop
// for the desktop app, and sdk-* for claude -p and the Agent SDK. They all
// save to the same projects folder, so the scan reads them all alike.

import type { SourceSlice } from '../../shared/tuning.js';

import type { SessionMeasure } from './measure.js';
import { sessionUsd } from './totals.js';

const LABELS: Readonly<Record<string, string>> = {
  cli: 'CLI',
  'claude-vscode': 'VS Code',
  'claude-desktop': 'Desktop',
  'sdk-cli': 'claude -p',
};

/** A short name for an entrypoint, the entrypoint itself when it is new to /tune. */
export function sourceOf(entrypoint: string | null): string {
  if (entrypoint === null || entrypoint === '') {
    return 'unknown';
  }
  return LABELS[entrypoint] ?? (entrypoint.startsWith('sdk-') ? 'Agent SDK' : entrypoint);
}

/** Sessions and spend by where they ran, the costliest first. */
export function sourceSlices(measures: readonly SessionMeasure[]): SourceSlice[] {
  const slices = new Map<string, { sessions: number; usd: number }>();
  for (const measure of measures) {
    const label = sourceOf(measure.entrypoint);
    const slice = slices.get(label) ?? { sessions: 0, usd: 0 };
    slices.set(label, { sessions: slice.sessions + 1, usd: slice.usd + sessionUsd(measure) });
  }
  return [...slices]
    .map(([label, slice]) => ({ label, ...slice }))
    .toSorted((left, right) => right.usd - left.usd);
}
