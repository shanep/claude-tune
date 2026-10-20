import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { loadTracked, saveTracked } from './tracked.js';

async function temporaryFile(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-tuning-tracked-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return path.join(root, 'tuning-tracked.json');
}

describe('tracked tips', () => {
  it('starts empty when the file is missing', async () => {
    expect(await loadTracked(await temporaryFile())).toStrictEqual(new Map());
  });

  it('round trips, keeping the previous copy as a backup', async () => {
    const file = await temporaryFile();
    await saveTracked(file, new Map([['rereads', 5]]));
    await saveTracked(file, new Map([['denials', 7]]));
    expect(await loadTracked(file)).toStrictEqual(new Map([['denials', 7]]));
    expect(await loadTracked(`${file}.bak`)).toStrictEqual(new Map([['rereads', 5]]));
    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({
      version: 1,
      tips: { denials: { since: 7 } },
    });
  });

  it('tracks nothing from bad JSON or a wrong shape', async () => {
    const file = await temporaryFile();
    for (const text of ['{oops', '{"version":2,"tips":{}}', '{"version":1,"tips":{"a":1}}']) {
      await writeFile(file, text);
      expect(await loadTracked(file)).toStrictEqual(new Map());
    }
  });
});
