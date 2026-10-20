import { describe, expect, it } from 'vitest';

import { cdTarget } from './cd-target.js';

describe('cdTarget', () => {
  it('finds where a leading cd goes, from the session folder', () => {
    expect(cdTarget('cd /r/other && ls', '/r/me')).toBe('/r/other');
    expect(cdTarget('  cd ../other; ls', '/r/me')).toBe('/r/other');
    expect(cdTarget('cd "/r/a b" && ls', '/r/me')).toBe('/r/a b');
    expect(cdTarget("cd '/r/c'|ls", '/r/me')).toBe('/r/c');
    expect(cdTarget('cd ~/repos/x/', '/r/me')).toBe('~/repos/x');
    expect(cdTarget('cd /', '/r/me')).toBe('/');
    expect(cdTarget('cd /r/other/ && ls', '/r/me')).toBe('/r/other');
  });

  it('is null for a cd that stays in the session folder, or one it cannot follow', () => {
    for (const command of [
      'cd /r/me && ls',
      'cd /r/me/',
      'cd src && ls',
      'cd /r/me/src',
      'cd $HOME',
      'cd -',
      'ls && cd /r/other',
      'cd',
      'echo cd /r/other',
    ]) {
      expect([command, cdTarget(command, '/r/me')]).toStrictEqual([command, null]);
    }
    expect(cdTarget('cd /r/other', null)).toBeNull();
    expect(cdTarget('cd /r/meow', '/r/me')).toBe('/r/meow');
  });
});
