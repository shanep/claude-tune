import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.git', path.join('.claude', 'worktrees')]);
const LONG_DASH = /[\u2013\u2014]/u;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (SKIP.has(entry.name) || SKIP.has(path.relative(ROOT, full))) {
      return [];
    }
    return entry.isDirectory() ? files(full) : [full];
  });
}

describe('the repository', () => {
  it('has no en or em dashes, the bundle included', () => {
    const found = files(ROOT).filter((file) => LONG_DASH.test(readFileSync(file, 'utf8')));
    expect(found.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
