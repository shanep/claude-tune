import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { emptyIndex, loadIndex, saveIndex } from './store.js';
import { measureOf } from './test-helpers/fixtures.js';

async function temporaryFile(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-tuning-store-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return path.join(root, 'tuning.json');
}

describe('tips index', () => {
  it('starts empty when the file is missing', async () => {
    expect(await loadIndex(await temporaryFile())).toStrictEqual(emptyIndex());
  });

  it('round trips entries and the scan time', async () => {
    const file = await temporaryFile();
    const index = emptyIndex();
    const measure = measureOf({
      spawns: { Explore: 2 },
      topRepeat: { command: 'ls', runs: 3 },
      hours: [
        {
          at: 3_600_000,
          usd: 1,
          subagentUsd: 0.5,
          premiumUsd: 0.5,
          premiumSavingUsd: 0.25,
          subagentSavingUsd: 0.1,
          bigContextUsd: 0.2,
          idleRewriteUsd: 0,
        },
      ],
    });
    index.entries.set('/p/s.jsonl', { stamp: { mtimeMs: 5, size: 9 }, measure, live: false });
    index.scannedAt = 77;
    await saveIndex(file, index);
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ version: 2, scannedAt: 77 });
    const loaded = await loadIndex(file);
    expect(loaded.scannedAt).toBe(77);
    expect(loaded.entries.get('/p/s.jsonl')).toStrictEqual({
      stamp: { mtimeMs: 5, size: 9 },
      measure,
      live: false,
    });
  });

  it('starts over from bad JSON, a wrong shape or an older version', async () => {
    const file = await temporaryFile();
    for (const text of ['{oops', '{"version":1}', '{"version":6,"scannedAt":null,"entries":{}}']) {
      await writeFile(file, text);
      expect(await loadIndex(file)).toStrictEqual(emptyIndex());
    }
  });
});
