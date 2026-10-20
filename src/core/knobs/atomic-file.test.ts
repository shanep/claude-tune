import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readOptional, resolveLinkTarget, writeFileAtomic } from './atomic-file.js';

async function names(folder: string): Promise<readonly string[]> {
  const entries = await readdir(folder);
  return entries.toSorted((left, right) => left.localeCompare(right));
}

describe('atomic-file', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-knobs-atomic-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('resolveLinkTarget', () => {
    it('returns a regular or missing file as an absolute path', async () => {
      const file = path.join(dir, 'plain.json');
      await writeFile(file, '{}');
      expect(await resolveLinkTarget(file)).toBe(file);
      expect(await resolveLinkTarget(path.join(dir, 'missing.json'))).toBe(
        path.join(dir, 'missing.json'),
      );
      const relative = path.relative(process.cwd(), file);
      expect(await resolveLinkTarget(relative)).toBe(file);
    });

    it('follows a chain of absolute and relative links, even to a missing file', async () => {
      const target = path.join(dir, 'real', 'settings.json');
      await mkdir(path.dirname(target));
      await writeFile(target, '{}');
      await symlink(target, path.join(dir, 'hop1'));
      await symlink('hop1', path.join(dir, 'hop2'));
      expect(await resolveLinkTarget(path.join(dir, 'hop2'))).toBe(target);
      await symlink('real/not-yet.json', path.join(dir, 'dangling'));
      expect(await resolveLinkTarget(path.join(dir, 'dangling'))).toBe(
        path.join(dir, 'real', 'not-yet.json'),
      );
    });

    it('gives up on a link loop', async () => {
      await symlink(path.join(dir, 'b'), path.join(dir, 'a'));
      await symlink(path.join(dir, 'a'), path.join(dir, 'b'));
      await expect(resolveLinkTarget(path.join(dir, 'a'))).rejects.toThrow(
        `Too many symbolic links at ${path.join(dir, 'a')}`,
      );
    });

    it('rethrows errors other than a missing file', async () => {
      await writeFile(path.join(dir, 'file'), 'x');
      await expect(resolveLinkTarget(path.join(dir, 'file', 'child'))).rejects.toMatchObject({
        code: 'ENOTDIR',
      });
    });
  });

  describe('readOptional', () => {
    it('reads text, returns null for a missing file and rethrows other errors', async () => {
      const file = path.join(dir, 'a.txt');
      await writeFile(file, 'hello');
      expect(await readOptional(file)).toBe('hello');
      expect(await readOptional(path.join(dir, 'missing'))).toBeNull();
      await expect(readOptional(dir)).rejects.toMatchObject({ code: 'EISDIR' });
    });
  });

  describe('writeFileAtomic', () => {
    it('creates parent directories and leaves no temp files', async () => {
      const target = path.join(dir, 'deep', 'er', 'file.json');
      await writeFileAtomic({ target, content: 'new\n', backup: `${target}.bak` });
      expect(await readFile(target, 'utf8')).toBe('new\n');
      expect(await readdir(path.dirname(target))).toStrictEqual(['file.json']);
    });

    it('backs up the previous content and keeps the file mode', async () => {
      const target = path.join(dir, 'file.json');
      await writeFile(target, 'old');
      await chmod(target, 0o600);
      await writeFileAtomic({ target, content: 'new', backup: `${target}.bak` });
      expect(await readFile(target, 'utf8')).toBe('new');
      expect(await readFile(`${target}.bak`, 'utf8')).toBe('old');
      const info = await stat(target);
      const backupInfo = await stat(`${target}.bak`);
      expect(info.mode % 0o1000).toBe(0o600);
      expect(backupInfo.mode % 0o1000).toBe(0o600);
      expect(await names(dir)).toStrictEqual(['file.json', 'file.json.bak']);
    });

    it('skips the backup when asked or when there was no previous file', async () => {
      const target = path.join(dir, 'file.json');
      await writeFile(target, 'old');
      await writeFileAtomic({ target, content: 'new', backup: null });
      expect(await readdir(dir)).toStrictEqual(['file.json']);
      const fresh = path.join(dir, 'fresh.json');
      await writeFileAtomic({ target: fresh, content: 'x', backup: `${fresh}.bak` });
      expect(await names(dir)).toStrictEqual(['file.json', 'fresh.json']);
    });

    it.skipIf(process.getuid?.() === 0)(
      'rethrows the write error when the directory is read-only',
      async () => {
        const locked = path.join(dir, 'locked');
        await mkdir(locked);
        await chmod(locked, 0o500);
        try {
          await expect(
            writeFileAtomic({ target: path.join(locked, 'f.json'), content: 'x', backup: null }),
          ).rejects.toMatchObject({ code: 'EACCES' });
        } finally {
          await chmod(locked, 0o700);
        }
      },
    );

    it('removes the temp file and rethrows when the rename fails', async () => {
      const target = path.join(dir, 'occupied');
      await mkdir(target);
      await writeFile(path.join(target, 'inside'), 'x');
      await expect(writeFileAtomic({ target, content: 'x', backup: null })).rejects.toThrow();
      expect(await readdir(dir)).toStrictEqual(['occupied']);
      const info = await lstat(target);
      expect(info.isDirectory()).toBe(true);
    });
  });
});
