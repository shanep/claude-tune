import { describe, expect, it } from 'vitest';

import { commandPrograms, fileLabel, MAX_LABELS, StackTally } from './stack.js';

describe('stack labels', () => {
  it('names the program each segment of a command runs', () => {
    expect(commandPrograms('cd src && pytest -q | tail -5; cargo build')).toStrictEqual([
      'cd',
      'pytest',
      'tail',
      'cargo',
    ]);
    expect(commandPrograms('FOO=1 sudo -E /usr/bin/python3 x.py')).toStrictEqual(['python3']);
    expect(commandPrograms('npx -y vitest run')).toStrictEqual(['vitest']);
    expect(commandPrograms('  ')).toStrictEqual([]);
    expect(commandPrograms('grep "a|b" file')).toStrictEqual(['grep']);
  });

  it('labels a file by extension, or by name for the few without one', () => {
    expect(fileLabel('/w/src/App.TSX')).toBe('.tsx');
    expect(fileLabel('/w/Dockerfile')).toBe('Dockerfile');
    expect(fileLabel('/w/README')).toBeNull();
    expect(fileLabel('/w/.env')).toBeNull();
  });

  it('keeps the most used labels first, up to the limit', () => {
    const tally = new StackTally();
    tally.command('pytest');
    tally.command('pytest && ruff check');
    tally.file('/a.py');
    tally.file('/b.txt.');
    for (let index = 0; index < MAX_LABELS + 5; index += 1) {
      tally.file(`/f.x${String(index)}`);
    }
    const labels = tally.labels();
    expect(Object.keys(labels)).toHaveLength(MAX_LABELS);
    expect(Object.entries(labels).slice(0, 3)).toStrictEqual([
      ['pytest', 2],
      ['.py', 1],
      ['.x0', 1],
    ]);
  });
});
