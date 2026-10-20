import { mkdir, symlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanSessions } from './scanner.js';
import type { SessionLayout } from './test-helpers/fixtures.js';
import {
  makeSessionLayout,
  makeTemporaryDirectory,
  removeDir,
  SESSION,
  T0,
} from './test-helpers/fixtures.js';

const SECOND = 1000;

async function setMtime(target: string, ms: number): Promise<void> {
  const when = new Date(ms);
  await utimes(target, when, when);
}

describe('scanSessions', () => {
  let root = '';
  let layout: SessionLayout;

  beforeEach(async () => {
    root = await makeTemporaryDirectory();
    layout = await makeSessionLayout(root);
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it('gives nothing for a missing projects dir', async () => {
    expect(await scanSessions(path.join(root, 'missing'))).toStrictEqual([]);
  });

  it('lists session files newest first with size and mtime', async () => {
    await writeFile(layout.transcriptPath, 'abc\n');
    await setMtime(layout.transcriptPath, T0);
    const otherProject = path.join(layout.projectsDir, '-work-other');
    await mkdir(otherProject);
    const newer = path.join(otherProject, 'sess-0002.jsonl');
    await writeFile(newer, '');
    await setMtime(newer, T0 + 5 * SECOND);
    await writeFile(path.join(layout.projectDir, 'notes.txt'), 'skip');
    await mkdir(path.join(layout.projectDir, 'memory'));
    await writeFile(path.join(layout.projectsDir, 'stray.jsonl'), 'skip');
    await symlink(path.join(root, 'nowhere.jsonl'), path.join(layout.projectDir, 'dangling.jsonl'));

    expect(await scanSessions(layout.projectsDir)).toStrictEqual([
      {
        sessionId: 'sess-0002',
        projectDir: '-work-other',
        transcriptPath: newer,
        sessionDir: path.join(otherProject, 'sess-0002'),
        mtimeMs: T0 + 5 * SECOND,
        size: 0,
      },
      {
        sessionId: SESSION,
        projectDir: '-work-demo',
        transcriptPath: layout.transcriptPath,
        sessionDir: layout.sessionDir,
        mtimeMs: T0,
        size: 4,
      },
    ]);
  });

  it('follows symlinked transcripts', async () => {
    const real = path.join(root, 'real.jsonl');
    await writeFile(real, 'x\n');
    await symlink(real, layout.transcriptPath);
    const [info] = await scanSessions(layout.projectsDir);
    expect(info?.sessionId).toBe(SESSION);
    expect(info?.size).toBe(2);
  });

  it('counts a newer subagents folder as session activity', async () => {
    await writeFile(layout.transcriptPath, '');
    await setMtime(layout.transcriptPath, T0);
    await mkdir(layout.subagentsDir, { recursive: true });
    await setMtime(layout.subagentsDir, T0 + 9 * SECOND);
    const [info] = await scanSessions(layout.projectsDir);
    expect(info?.mtimeMs).toBe(T0 + 9 * SECOND);
    await setMtime(layout.subagentsDir, T0 - 9 * SECOND);
    const [again] = await scanSessions(layout.projectsDir);
    expect(again?.mtimeMs).toBe(T0);
  });
});
