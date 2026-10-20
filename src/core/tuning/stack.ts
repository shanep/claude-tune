// What a session works with: the programs its shell commands run and the
// kinds of files it reads and edits, as short labels with counts, so /tune
// can look for skills and agents that fit the work. Only the
// program name or file extension is kept, never the rest of the command.

import path from 'node:path';

/** Labels kept per session, the most used first. */
export const MAX_LABELS = 40;

/** Words that run the next word as the program. */
const WRAPPERS: ReadonlySet<string> = new Set([
  'sudo',
  'time',
  'env',
  'nohup',
  'exec',
  'command',
  'npx',
  'uvx',
  'bunx',
  'pnpx',
]);
const SEGMENT = /&&|\|\||[;|\n]/u;
const ASSIGNMENT = /^[A-Za-z_]\w*=/u;
const LABEL = /^[\w.+-]{1,32}$/u;
/** Files with no extension that still say what the work is. */
const NAMED_FILES: ReadonlySet<string> = new Set(['Dockerfile', 'Makefile', 'Gemfile', 'Rakefile']);

function program(segment: string): string | null {
  const words = segment.trim().split(/\s+/u);
  let index = 0;
  while (index < words.length) {
    const word = words[index] ?? '';
    const skip = ASSIGNMENT.test(word) || WRAPPERS.has(word) || word.startsWith('-');
    if (!skip) {
      break;
    }
    index += 1;
  }
  const word = words[index];
  if (word === undefined || word === '') {
    return null;
  }
  const base = path.posix.basename(word);
  return LABEL.test(base) ? base : null;
}

/** The programs a shell command runs, one per segment between &&, ||, ; and pipes. */
export function commandPrograms(command: string): string[] {
  return command.split(SEGMENT).flatMap((segment) => program(segment) ?? []);
}

/** ".py" for a Python file, "Dockerfile" for a Dockerfile, else null. */
export function fileLabel(filePath: string): string | null {
  const base = path.basename(filePath);
  if (NAMED_FILES.has(base)) {
    return base;
  }
  const extension = path.extname(base).toLowerCase();
  return extension.length > 1 && LABEL.test(extension) ? extension : null;
}

export class StackTally {
  private readonly counts = new Map<string, number>();

  private add(label: string | null): void {
    if (label !== null) {
      this.counts.set(label, (this.counts.get(label) ?? 0) + 1);
    }
  }

  command(command: string): void {
    for (const name of commandPrograms(command)) {
      this.add(name);
    }
  }

  file(filePath: string): void {
    this.add(fileLabel(filePath));
  }

  /** The most used labels, at most MAX_LABELS. */
  labels(): Record<string, number> {
    const top = [...this.counts]
      .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, MAX_LABELS);
    return Object.fromEntries(top);
  }
}
