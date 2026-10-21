import { describe, expect, it } from 'vitest';

import { sourceOf, sourceSlices } from './source.js';
import { measureOf } from './test-helpers/fixtures.js';

describe('sourceOf', () => {
  it('names each place Claude Code runs', () => {
    expect(
      ['cli', 'claude-vscode', 'claude-desktop', 'sdk-cli', 'sdk-ts', 'sdk-py', 'jetbrains', '', null].map(
        sourceOf,
      ),
    ).toStrictEqual([
      'CLI',
      'VS Code',
      'Desktop',
      'claude -p',
      'Agent SDK',
      'Agent SDK',
      'jetbrains',
      'unknown',
      'unknown',
    ]);
  });
});

describe('sourceSlices', () => {
  it('counts sessions and spend by source, the costliest first', () => {
    const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(
      sourceSlices([
        measureOf({ entrypoint: 'cli', cost: { ...cost, output: 1 } }),
        measureOf({ entrypoint: 'claude-vscode', cost: { ...cost, output: 2 } }),
        measureOf({ entrypoint: 'claude-vscode', cost: { ...cost, output: 3 } }),
      ]),
    ).toStrictEqual([
      { label: 'VS Code', sessions: 2, usd: 5 },
      { label: 'CLI', sessions: 1, usd: 1 },
    ]);
  });
});
