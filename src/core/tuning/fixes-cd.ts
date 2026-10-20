// The fix for sessions that keep cd-ing into another repository. Claude Code puts the shell back
// in the session folder after a cd outside it, so every later command there starts with cd again.
// Listing the repository in permissions.additionalDirectories lets the shell stay.

import type { AutoFix } from '../../shared/tuning.js';

import type { FixContext } from './fix-context.js';
import { stringsOf } from './fix-context.js';
import { plural } from './words.js';

const MIN_CDS = 20;
const MIN_SESSIONS = 2;
const MOST_FOLDERS = 5;

interface CdFolder {
  readonly folder: string;
  readonly cds: number;
  readonly sessions: number;
}

function lastPart(folder: string): string {
  return folder.slice(folder.lastIndexOf('/') + 1);
}

function expand(context: FixContext, folder: string): string {
  return folder === '~' || folder.startsWith('~/') ? `${context.home}${folder.slice(1)}` : folder;
}

/** The nearest folder at or above `folder` with a .git, inside the home folder, or null. */
function repositoryOf(context: FixContext, folder: string): string | null {
  let dir = folder;
  while (dir.startsWith(`${context.home}/`)) {
    if (context.modifiedAt(`${dir}/.git`) !== null) {
      return dir;
    }
    dir = dir.slice(0, dir.lastIndexOf('/'));
  }
  return null;
}

/** Main checkouts of other repositories that sessions cd into most, leaving out worktrees and their own. */
function cdFolders(context: FixContext): CdFolder[] {
  const found = new Map<string, { cds: number; sessions: number }>();
  for (const measure of context.live) {
    if (measure.cwd === null) {
      continue;
    }
    const own = context.projectOf(measure.cwd);
    const seen = new Set<string>();
    for (const [target, count] of Object.entries(measure.cdTargets)) {
      const repository = repositoryOf(context, expand(context, target));
      if (
        repository === null ||
        repository === own ||
        context.projectOf(repository) !== repository
      ) {
        continue;
      }
      const entry = found.get(repository) ?? { cds: 0, sessions: 0 };
      found.set(repository, {
        cds: entry.cds + count,
        sessions: entry.sessions + (seen.has(repository) ? 0 : 1),
      });
      seen.add(repository);
    }
  }
  return [...found]
    .map(([folder, entry]) => ({ folder, ...entry }))
    .filter((entry) => entry.cds >= MIN_CDS && entry.sessions >= MIN_SESSIONS)
    .toSorted((left, right) => right.cds - left.cds)
    .slice(0, MOST_FOLDERS);
}

export function cdFix(context: FixContext): Extract<AutoFix, { kind: 'knob' }> | null {
  const folders = cdFolders(context);
  if (folders.length === 0) {
    return null;
  }
  const existing = stringsOf(context.knob('permissions.additionalDirectories'));
  const allowed = existing.map((folder) => expand(context, folder));
  const covered = (folder: string): boolean =>
    allowed.some((dir) => folder === dir || folder.startsWith(`${dir}/`));
  const shown = (folder: string): string => folder.replace(context.home, '~');
  const list = folders
    .map(
      (entry) =>
        `${shown(entry.folder)} (${plural(entry.cds, 'cd')} in ${plural(entry.sessions, 'session')})`,
    )
    .join(', ');
  return {
    kind: 'knob',
    id: 'knob:permissions.additionalDirectories',
    key: 'permissions.additionalDirectories',
    value: [...new Set([...existing, ...folders.map((entry) => entry.folder)])],
    title: `Let sessions stay in ${folders.map((entry) => lastPart(entry.folder)).join(', ')} after a cd`,
    detail: `Adds ${list} to permissions.additionalDirectories in your user settings. Claude Code then leaves the shell there after a cd instead of putting it back in the session folder, so one cd does for the rest of the session. Sessions can also read and edit files there as they do in their own folder.`,
    applied: folders.every((entry) => covered(entry.folder)),
  };
}
