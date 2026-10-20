// Where a shell command's leading cd goes, to find the folders sessions keep leaving their own for.
import path from 'node:path';

const CD = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/u;

/** The folder a leading cd names, as written, or null when there is none to follow. */
function named(command: string): string | null {
  const match = CD.exec(command);
  const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
  return raw === null || raw.startsWith('$') || raw.startsWith('-') ? null : raw;
}

/** The folder a command's leading cd goes to, absolute or from ~, or null when it stays inside `cwd`. */
export function cdTarget(command: string, cwd: string | null): string | null {
  const raw = named(command);
  if (raw === null || cwd === null) {
    return null;
  }
  const target = raw.startsWith('~') ? raw : path.resolve(cwd, raw);
  const folder = target.length > 1 && target.endsWith('/') ? target.slice(0, -1) : target;
  return folder === cwd || folder.startsWith(`${cwd}/`) ? null : folder;
}
