import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { assistant, usage, userPrompt } from '../transcripts/test-helpers/fixtures.js';

import { HISTORY_MS, scanInto } from './scan.js';
import { emptyIndex } from './store.js';

const S1 = 'aaaaaaaa-1111-4111-8111-111111111111';
const S2 = 'bbbbbbbb-2222-4222-8222-222222222222';

interface Home {
  readonly projectsDir: string;
  readonly transcript: (sessionId: string, records: readonly unknown[]) => Promise<string>;
  readonly subagent: (sessionId: string, records: readonly unknown[]) => Promise<void>;
}

function text(records: readonly unknown[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('');
}

async function makeHome(): Promise<Home> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-tuning-scan-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const projectsDir = path.join(root, 'projects');
  const project = path.join(projectsDir, '-work');
  await mkdir(project, { recursive: true });
  return {
    projectsDir,
    transcript: async (sessionId, records): Promise<string> => {
      const file = path.join(project, `${sessionId}.jsonl`);
      await writeFile(file, text(records));
      return file;
    },
    subagent: async (sessionId, records): Promise<void> => {
      const dir = path.join(project, sessionId, 'subagents');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'agent-x1.jsonl'), text(records));
    },
  };
}

const REQUEST = assistant({
  uuid: 'a1',
  at: 0,
  messageId: 'm1',
  content: [],
  usage: usage({ output: 100 }),
});

describe('scanInto', () => {
  it('measures sessions with their subagents once, then only what changed', async () => {
    const home = await makeHome();
    const file = await home.transcript(S1, [userPrompt('u1', 0, 'hello'), REQUEST]);
    await home.subagent(S1, [REQUEST]);
    const index = emptyIndex();
    expect(await scanInto(index, home.projectsDir, 10)).toStrictEqual({
      filesRead: 1,
      filesGone: 0,
    });
    expect(index.scannedAt).toBe(10);
    expect(index.entries.get(file)?.measure).toMatchObject({
      sessionId: S1,
      prompts: 1,
      requests: 1,
      subagentRequests: 1,
    });
    expect(await scanInto(index, home.projectsDir, 20)).toStrictEqual({
      filesRead: 0,
      filesGone: 0,
    });
    await home.transcript(S2, [REQUEST]);
    expect(await scanInto(index, home.projectsDir, 30)).toStrictEqual({
      filesRead: 1,
      filesGone: 0,
    });
  });

  it('keeps a gone transcript as history for a year, then forgets it', async () => {
    const home = await makeHome();
    const file = await home.transcript(S1, [REQUEST]);
    const index = emptyIndex();
    await scanInto(index, home.projectsDir, 10);
    expect(index.entries.get(file)?.live).toBe(true);
    await rm(file);
    expect(await scanInto(index, home.projectsDir, 20)).toStrictEqual({
      filesRead: 0,
      filesGone: 1,
    });
    expect(index.entries.get(file)?.live).toBe(false);
    // Already history, so nothing changes.
    expect(await scanInto(index, home.projectsDir, 30)).toStrictEqual({
      filesRead: 0,
      filesGone: 0,
    });
    const updatedAt = index.entries.get(file)?.measure.updatedAt ?? 0;
    await scanInto(index, home.projectsDir, updatedAt + HISTORY_MS);
    expect(index.entries.size).toBe(1);
    expect(await scanInto(index, home.projectsDir, updatedAt + HISTORY_MS + 1)).toStrictEqual({
      filesRead: 0,
      filesGone: 1,
    });
    expect(index.entries.size).toBe(0);
  });

  it('brings history back to life when its transcript returns unchanged', async () => {
    const home = await makeHome();
    const file = await home.transcript(S1, [REQUEST]);
    const index = emptyIndex();
    await scanInto(index, home.projectsDir, 10);
    const entry = index.entries.get(file);
    if (entry === undefined) {
      throw new Error('not measured');
    }
    index.entries.set(file, { ...entry, live: false });
    expect(await scanInto(index, home.projectsDir, 20)).toStrictEqual({
      filesRead: 1,
      filesGone: 0,
    });
    expect(index.entries.get(file)?.live).toBe(true);
  });
});
