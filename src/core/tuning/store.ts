// The tuning index: one measure per session transcript, with the file stamp it
// was taken from, so a rescan only reads transcripts that changed. It lives
// in one JSON file in the /tune state folder. Once a transcript is
// gone its measure stays for a year, marked as history: the tips only look at
// live sessions, since they are about how sessions run now, but tracking the
// impact of a tip compares against sessions Claude Code has since deleted.

import { z } from 'zod';

import { readOptional, writeFileAtomic } from '../knobs/atomic-file.js';

import type { SessionMeasure } from './measure.js';
import { SPEND_SOURCES, zeroSpend } from './spend.js';

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

const count = z.number().nonnegative();

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

const spendSchema = z
  .object({
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
  })
  .default(zeroSpend);

const spendSourceSchema = z.enum(SPEND_SOURCES);

const measureSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  cwd: z.string().nullable(),
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
  compactSavingUsd: count.default(0),
  bigResults: count,
  extraReads: count,
  repeatedRuns: count,
  topRepeat: z.object({ command: z.string(), runs: count }).nullable(),
  toolCalls: count,
  toolErrors: count,
  denials: count,
  bashCommands: count,
  cdCommands: count,
  cdTargets: z.record(z.string(), count).default({}),
  spawns: z.record(z.string(), count),
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
  // Version 2 files have no hours. They read as none, and the scan measures
  // live transcripts again to fill them in.
  hours: z.array(hourSchema).readonly().default([]),
  // Version 3 files have no stack, so it reads as empty until the next measure.
  stack: z.record(z.string(), count).default({}),
  // Version 4 files have none of the spend split, so it reads as empty until the next measure.
  spend: spendSchema,
  subagentSpend: spendSchema,
  heavy: z
    .array(z.object({ source: spendSourceSchema, label: z.string(), tokens: count, usd: count }))
    .readonly()
    .default([]),
  files: z.record(z.string(), count).default({}),
  skills: z.record(z.string(), count).default({}),
  toolSchemas: z.record(z.string(), count).default({}),
  toolUses: z.record(z.string(), count).default({}),
  subagents: z
    .array(
      z.object({
        type: z.string(),
        description: z.string(),
        usd: count,
        requests: count,
        peakContext: count,
      }),
    )
    .readonly()
    .default([]),
}) satisfies z.ZodType<SessionMeasure>;

const fileSchema = z.object({
  // Bump when the measure changes meaning, so old entries are measured again.
  // Versions 2 to 5 lack the hours, the stack, the spend split or the cd targets, so their live entries are measured again.
  version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  scannedAt: z.number().nullable(),
  entries: z.record(
    z.string(),
    z.object({
      stamp: z.object({ mtimeMs: z.number(), size: z.number() }),
      measure: measureSchema,
      live: z.boolean(),
    }),
  ),
});

/** Matches no file, so the next scan measures the transcript again. */
const STALE_STAMP: FileStamp = { mtimeMs: -1, size: -1 };

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
  const { version, entries, scannedAt } = parsed.data;
  const stale = (entry: IndexEntry): IndexEntry =>
    version < 6 && entry.live ? { ...entry, stamp: STALE_STAMP } : entry;
  return {
    entries: new Map(Object.entries(entries).map(([file, entry]) => [file, stale(entry)])),
    scannedAt,
  };
}

/** The saved index. A missing, corrupt or older file starts empty, since it can be rebuilt. */
export async function loadIndex(file: string): Promise<TuningIndex> {
  const text = await readOptional(file);
  return (text === null ? null : parseIndex(text)) ?? emptyIndex();
}

export async function saveIndex(file: string, index: TuningIndex): Promise<void> {
  const data: z.input<typeof fileSchema> = {
    version: 6,
    scannedAt: index.scannedAt,
    entries: Object.fromEntries(index.entries),
  };
  await writeFileAtomic({ target: file, content: `${JSON.stringify(data)}\n`, backup: null });
}
