// Which repository a session folder belongs to, so a worktree's sessions count
// with its main checkout's.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Claude Code's own worktrees sit inside the repository they came from. */
const CLAUDE_WORKTREES = `${path.sep}.claude${path.sep}worktrees${path.sep}`;

export type GitRunner = (cwd: string, args: readonly string[]) => string | null;

/** Runs git and returns its trimmed output, or null when it fails. */
export const runGit: GitRunner = (cwd, args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
};

/** The main checkout of the repository at `cwd`, or null when it is not in one. */
export function mainCheckout(cwd: string, git: GitRunner = runGit): string | null {
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common === null || common === '') {
    return null;
  }
  return path.basename(common) === '.git' ? path.dirname(common) : null;
}

/** projectOf for the summary: each folder's main checkout, asking git once per folder. */
export function projectReader(
  git: GitRunner = runGit,
  exists: (folder: string) => boolean = existsSync,
): (cwd: string) => string {
  const known = new Map<string, string>();
  return (cwd) => {
    let found = known.get(cwd);
    if (found === undefined) {
      const marker = cwd.indexOf(CLAUDE_WORKTREES);
      if (marker !== -1) {
        found = cwd.slice(0, marker);
      } else {
        found = exists(cwd) ? (mainCheckout(cwd, git) ?? cwd) : cwd;
      }
      known.set(cwd, found);
    }
    return found;
  };
}

/** The top of the repository /tune runs in, for its project settings, or null outside one. */
export function projectRoot(cwd: string, git: GitRunner = runGit): string | null {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  return top === null || top === '' ? null : top;
}
