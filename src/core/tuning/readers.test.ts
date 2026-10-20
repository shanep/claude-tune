import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EffectiveValue } from '../../shared/knob-model.js';

import { knobReader, modifiedCheck } from './readers.js';

function value(key: string, chain: EffectiveValue['chain']): EffectiveValue {
  const [winner] = chain;
  return { key, value: winner?.value, layer: winner?.layer ?? 'default', chain };
}

describe('knobReader', () => {
  const read = knobReader([
    value('autoCompactWindow', [
      { layer: 'project', value: 100_000, file: 'p' },
      { layer: 'user', value: 300_000, file: 'u' },
    ]),
    value('model', [{ layer: 'project', value: 'opus', file: 'p' }]),
    value('env.CLAUDE_CODE_SUBAGENT_MODEL', [{ layer: 'user', value: 'sonnet', file: 'u' }]),
    value('CLAUDE_CODE_SUBAGENT_MODEL', [{ layer: 'env', value: 'haiku', file: null }]),
    value('env.BASH_MAX_OUTPUT_LENGTH', [{ layer: 'user', value: '15000', file: 'u' }]),
  ]);

  it('takes the user layer over the value that takes effect', () => {
    expect(read('autoCompactWindow')).toBe(300_000);
  });

  it('falls back to the value that takes effect', () => {
    expect(read('model')).toBe('opus');
  });

  it('finds an environment variable under env., but the plain key first', () => {
    expect(read('BASH_MAX_OUTPUT_LENGTH')).toBe('15000');
    expect(read('CLAUDE_CODE_SUBAGENT_MODEL')).toBe('haiku');
  });

  it('is undefined for a setting nothing sets', () => {
    expect(read('other')).toBeUndefined();
  });
});

describe('modifiedCheck', () => {
  it('gives when a file changed, null when it is missing, and asks the disk once', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'readers-'));
    try {
      const file = path.join(dir, 'a.md');
      await writeFile(file, 'x');
      await utimes(file, 1000, 1000);
      const modified = modifiedCheck();
      expect(modified(file)).toBe(1_000_000);
      expect(modified(path.join(dir, 'b.md'))).toBeNull();
      await utimes(file, 2000, 2000);
      await writeFile(path.join(dir, 'b.md'), 'y');
      expect(modified(file)).toBe(1_000_000);
      expect(modified(path.join(dir, 'b.md'))).toBeNull();
      expect(modifiedCheck()(file)).toBe(2_000_000);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
