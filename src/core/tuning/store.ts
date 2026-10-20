// The tuning index: one measure per session transcript, with the file stamp it
// was taken from, so a rescan only reads transcripts that changed. It lives
// in one JSON file in the /tune state folder. Once a transcript is
// gone its measure stays for a year, marked as history: the tips only look at
// live sessions, since they are about how sessions run now, but tracking the
// impact of a tip compares against sessions Claude Code has since deleted.

import * as z from 'zod/mini';

import { readOptional, writeFileAtomic } from '../knobs/atomic-file.js';

import type { SessionMeasure } from './measure.js';
import { SPEND_SOURCES } from './spend.js';

export interface FileStamp {
  readonly mtimeMs: number;
  readonly size: number;
}

interface IndexEntry {
  readonly stamp: FileStamp;
  readonly measure: SessionMeasure;
  /** False once the transcript is gone. */
  readonly live: boolean;
}

export interface TuningIndex {
  /** Keyed by transcript path. */
  readonly entries: Map<string, IndexEntry>;
  scannedAt: number | null;
}

const count = z.number().check(z.nonnegative());
const counts = z.record(z.string(), count);

const costSchema = z.object({
  input: count,
  output: count,
  cacheRead: count,
  cacheWrite: count,
});

const hourSchema = z.object({
  at: z.number(),
  usd: count,
  subagentUsd: count,
  premiumUsd: count,
  premiumSavingUsd: count,
  subagentSavingUsd: count,
  bigContextUsd: count,
  idleRewriteUsd: count,
});

const spendSchema = z.object({
  setup: count,
  instructions: count,
  skills: count,
  reminders: count,
  fileReads: count,
  toolOutput: count,
  web: count,
  toolInputs: count,
  subagentReports: count,
  conversation: count,
  output: count,
});

const measureSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  cwd: z.nullable(z.string()),
  startedAt: z.number(),
  updatedAt: z.number(),
  prompts: count,
  requests: count,
  peakContext: count,
  contextTokens: count,
  compactions: count,
  cost: costSchema,
  idleRewrites: count,
  idleRewriteUsd: count,
  compactSavingUsd: count,
  bigResults: count,
  extraReads: count,
  repeatedRuns: count,
  topRepeat: z.nullable(z.object({ command: z.string(), runs: count })),
  toolCalls: count,
  toolErrors: count,
  denials: count,
  bashCommands: count,
  cdCommands: count,
  cdTargets: counts,
  spawns: counts,
  subagentRequests: count,
  premiumSubagentRequests: count,
  subagentUsd: count,
  families: z.object({
    land: count,
    ci: count,
    server: count,
    buildTest: count,
    search: count,
  }),
  hours: z.readonly(z.array(hourSchema)),
  stack: counts,
  spend: spendSchema,
  subagentSpend: spendSchema,
  heavy: z.readonly(
    z.array(z.object({ source: z.enum(SPEND_SOURCES), label: z.string(), tokens: count, usd: count })),
  ),
  files: counts,
  skills: counts,
  toolSchemas: counts,
  toolUses: counts,
  subagents: z.readonly(
    z.array(
      z.object({
        type: z.string(),
        description: z.string(),
        usd: count,
        requests: count,
        peakContext: count,
      }),
    ),
  ),
}) satisfies z.ZodMiniType<SessionMeasure>;

/**
 * Bump when the measure changes meaning. A file of another version starts
 * over, since the scan can rebuild it from the transcripts.
 */
const VERSION = 1;

const fileSchema = z.object({
  version: z.literal(VERSION),
  scannedAt: z.nullable(z.number()),
  entries: z.record(
    z.string(),
    z.object({
      stamp: z.object({ mtimeMs: z.number(), size: z.number() }),
      measure: measureSchema,
      live: z.boolean(),
    }),
  ),
});

export function emptyIndex(): TuningIndex {
  return { entries: new Map(), scannedAt: null };
}

function parseIndex(text: string): TuningIndex | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    return null;
  }
  return { entries: new Map(Object.entries(parsed.data.entries)), scannedAt: parsed.data.scannedAt };
}

/** The saved index. A missing, corrupt or older file starts empty, since it can be rebuilt. */
export async function loadIndex(file: string): Promise<TuningIndex> {
  const text = await readOptional(file);
  return (text === null ? null : parseIndex(text)) ?? emptyIndex();
}

export async function saveIndex(file: string, index: TuningIndex): Promise<void> {
  const data: z.input<typeof fileSchema> = {
    version: VERSION,
    scannedAt: index.scannedAt,
    entries: Object.fromEntries(index.entries),
  };
  await writeFileAtomic({ target: file, content: `${JSON.stringify(data)}\n`, backup: null });
}
