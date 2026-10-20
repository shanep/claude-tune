// The tips you said you are following, with when you started. Unlike the
// measures, this cannot be rebuilt from the transcripts, so it has a file of
// its own that a change to the measure never wipes.

import { z } from 'zod';

import { readOptional, writeFileAtomic } from '../knobs/atomic-file.js';

const fileSchema = z.object({
  version: z.literal(1),
  tips: z.record(z.string(), z.object({ since: z.number() })),
});

/** When tracking started, by tip id. A missing or unreadable file tracks nothing. */
export async function loadTracked(file: string): Promise<Map<string, number>> {
  const text = await readOptional(file);
  if (text === null) {
    return new Map();
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return new Map();
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    return new Map();
  }
  return new Map(Object.entries(parsed.data.tips).map(([id, entry]) => [id, entry.since]));
}

export async function saveTracked(
  file: string,
  tracked: ReadonlyMap<string, number>,
): Promise<void> {
  const data: z.input<typeof fileSchema> = {
    version: 1,
    tips: Object.fromEntries([...tracked].map(([id, since]) => [id, { since }])),
  };
  // Keep the previous copy, since a lost file cannot be rebuilt.
  await writeFileAtomic({
    target: file,
    content: `${JSON.stringify(data)}\n`,
    backup: `${file}.bak`,
  });
}
