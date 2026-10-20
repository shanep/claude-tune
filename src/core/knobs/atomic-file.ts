// Atomic text file writes that follow symlinks. ~/.claude/settings.json is
// often a link into a dotfiles repo, so a write must land in the link target
// and leave the link itself alone.

import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readlink, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNotFound } from './json.js';

const MAX_LINK_HOPS = 40;

/** Follow symlinks (even dangling ones) to the file a write should replace. */
export async function resolveLinkTarget(file: string): Promise<string> {
  let current = path.resolve(file);
  for (let hop = 0; hop < MAX_LINK_HOPS; hop += 1) {
    let isLink: boolean;
    try {
      const info = await lstat(current);
      isLink = info.isSymbolicLink();
    } catch (error) {
      if (isNotFound(error)) {
        return current;
      }
      throw error;
    }
    if (!isLink) {
      return current;
    }
    current = path.resolve(path.dirname(current), await readlink(current));
  }
  throw new Error(`Too many symbolic links at ${file}`);
}

/** The file's text, or null when it does not exist. */
export async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function existingMode(file: string): Promise<number | undefined> {
  try {
    const info = await stat(file);
    return info.mode % 0o1000;
  } catch {
    return undefined;
  }
}

export interface AtomicWrite {
  /** A real file path (resolve links first). */
  readonly target: string;
  readonly content: string;
  /** Where to copy the previous content, or null for no backup. */
  readonly backup: string | null;
}

/**
 * Write to a temp file in the same directory, then rename it over the target,
 * so readers see the old file or the new one and never half of either. The
 * previous content goes to `backup` first, and the file keeps its mode.
 */
export async function writeFileAtomic(write: AtomicWrite): Promise<void> {
  const dir = path.dirname(write.target);
  await mkdir(dir, { recursive: true });
  const mode = await existingMode(write.target);
  if (write.backup !== null) {
    const previous = await readOptional(write.target);
    if (previous !== null) {
      await writeFile(write.backup, previous, { mode });
    }
  }
  const scratch = path.join(dir, `.${path.basename(write.target)}.${randomUUID()}.tmp`);
  try {
    await writeFile(scratch, write.content, { mode });
    await rename(scratch, write.target);
  } catch (error) {
    await rm(scratch, { force: true });
    throw error;
  }
}
