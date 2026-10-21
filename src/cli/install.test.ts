import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it, onTestFinished } from 'vitest';

import { installShim, pathProblem, PLUGIN_ID } from './install.js';

async function tempDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-install-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

describe('install', () => {
  it('checks that the command name finds the file it wrote', async () => {
    const root = await tempDir();
    const ours = path.join(root, 'ours');
    const other = path.join(root, 'other');
    for (const dir of [ours, other]) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'tune'), '#!/bin/sh\n', { mode: 0o755 });
    }
    const file = path.join(ours, 'tune');
    const pathOf = (...dirs: string[]): string => dirs.join(path.delimiter);

    expect(await pathProblem(file, pathOf('/x', `${ours}/`))).toBeNull();
    expect(await pathProblem(file, pathOf('/x'))).toStrictEqual({ kind: 'not-on-path', dir: ours });
    expect(await pathProblem(file, undefined)).toStrictEqual({ kind: 'not-on-path', dir: ours });
    expect(await pathProblem(file, pathOf(other, ours))).toStrictEqual({
      kind: 'shadowed',
      by: path.join(other, 'tune'),
    });
    expect(await pathProblem(file, pathOf(ours, other))).toBeNull();
  });

  it('writes a command that runs the installed plugin, or the fallback', async () => {
    const root = await tempDir();
    const makeBundle = async (dir: string, says: string): Promise<void> => {
      await mkdir(path.join(dir, 'dist'), { recursive: true });
      await writeFile(
        path.join(dir, 'dist', 'tune.cjs'),
        `process.stdout.write(${JSON.stringify(says)} + process.argv.slice(2).join(','));`,
      );
    };
    const fallback = path.join(root, 'checkout');
    const installed = path.join(root, 'cache', 'abc123');
    await makeBundle(fallback, 'fallback:');
    await makeBundle(installed, 'installed:');
    const shim = await installShim(path.join(root, 'bin'), fallback);
    expect((await stat(shim)).mode & 0o111).not.toBe(0);
    const claudeDir = path.join(root, 'claude');
    const env = { ...process.env, CLAUDE_CONFIG_DIR: claudeDir };
    expect(execFileSync(shim, ['a', 'b'], { env, encoding: 'utf8' })).toBe('fallback:a,b');

    await mkdir(path.join(claudeDir, 'plugins'), { recursive: true });
    const list = {
      version: 2,
      plugins: {
        [PLUGIN_ID]: [
          { scope: 'user', installPath: path.join(root, 'gone') },
          { scope: 'user', installPath: installed },
        ],
      },
    };
    await writeFile(path.join(claudeDir, 'plugins', 'installed_plugins.json'), JSON.stringify(list));
    expect(execFileSync(shim, ['c'], { env, encoding: 'utf8' })).toBe('installed:c');
    expect(await readFile(shim, 'utf8')).toMatch(/^#!\/usr\/bin\/env node\n/u);
  });
});
