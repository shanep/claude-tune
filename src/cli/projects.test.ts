import { describe, expect, it } from 'vitest';

import type { GitRunner } from './projects.js';
import { mainCheckout, projectReader, projectRoot } from './projects.js';

describe('mainCheckout', () => {
  it('is the folder above the common .git, and null for a bare repository or no repository', () => {
    expect(mainCheckout('/w', () => '/repo/.git')).toBe('/repo');
    expect(mainCheckout('/w', () => '/repo.git')).toBeNull();
    expect(mainCheckout('/w', () => null)).toBeNull();
  });
});

describe('projectReader', () => {
  it('maps worktrees to their main checkout and asks git once per folder', () => {
    let calls = 0;
    const git: GitRunner = (cwd) => {
      calls += 1;
      return cwd === '/repo-wt' ? '/repo/.git' : null;
    };
    const projectOf = projectReader(git, () => true);
    expect(projectOf('/repo-wt')).toBe('/repo');
    expect(projectOf('/repo-wt')).toBe('/repo');
    expect(projectOf('/repo/.claude/worktrees/x/src')).toBe('/repo');
    expect(projectOf('/plain')).toBe('/plain');
    expect(calls).toBe(2);
  });

  it('leaves a folder that is gone as it is', () => {
    const projectOf = projectReader(() => '/elsewhere/.git', () => false);
    expect(projectOf('/gone')).toBe('/gone');
  });
});

describe('projectRoot', () => {
  it('is the top of the repository, or null outside one', () => {
    expect(projectRoot('/r/src', () => '/r')).toBe('/r');
    expect(projectRoot('/x', () => null)).toBeNull();
  });
});
