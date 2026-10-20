import { describe, expect, it } from 'vitest';

import type { FixContext } from './fix-context.js';
import { cdFix } from './fixes-cd.js';
import type { SessionMeasure } from './measure.js';
import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

/** Folders under HOME with a .git, the rest are plain folders. */
const REPOSITORIES = new Set([
  `${HOME}/r/site`,
  `${HOME}/r/tools`,
  `${HOME}/r/notes`,
  `${HOME}/r/site/.claude/worktrees/w`,
]);

function session(
  id: string,
  cwd: string,
  cdTargets: Readonly<Record<string, number>>,
): SessionMeasure {
  return measureOf({ sessionId: id, cwd, cdTargets });
}

function contextOf(live: readonly SessionMeasure[], extra: Partial<FixContext> = {}): FixContext {
  return {
    totals: totalsOf(live, HOME),
    live,
    hotFiles: [],
    knob: () => null,
    installed: new Set(),
    home: HOME,
    projectOf: (cwd) => cwd.replace(/\/\.claude\/worktrees\/.*/u, ''),
    modifiedAt: (file) => (REPOSITORIES.has(file.replace(/\/\.git$/u, '')) ? 1 : null),
    ...extra,
  };
}

const SITE = `${HOME}/r/site`;
const LIVE = [
  session('a', SITE, { [`${HOME}/r/tools/packages/core`]: 15, '~/r/notes': 12, '/tmp/x': 50 }),
  session('b', `${SITE}/.claude/worktrees/w`, {
    [`${HOME}/r/tools`]: 6,
    '~/r/notes': 8,
    [SITE]: 40,
  }),
  session('c', `${HOME}/r/tools`, {
    [`${SITE}/.claude/worktrees/w`]: 30,
    [`${HOME}/plain/dir`]: 30,
  }),
];

function withListed(value: unknown): ReturnType<typeof cdFix> {
  return cdFix(
    contextOf(LIVE, {
      knob: (key) => (key === 'permissions.additionalDirectories' ? value : undefined),
    }),
  );
}

describe('cdFix', () => {
  it('lets sessions stay in the other repositories they cd into most', () => {
    expect(cdFix(contextOf(LIVE))).toStrictEqual({
      kind: 'knob',
      id: 'knob:permissions.additionalDirectories',
      key: 'permissions.additionalDirectories',
      value: [`${HOME}/r/tools`, `${HOME}/r/notes`],
      title: 'Let sessions stay in tools, notes after a cd',
      detail:
        'Adds ~/r/tools (21 cds in 2 sessions), ~/r/notes (20 cds in 2 sessions) to permissions.additionalDirectories in your user settings. Claude Code then leaves the shell there after a cd instead of putting it back in the session folder, so one cd does for the rest of the session. Sessions can also read and edit files there as they do in their own folder.',
      applied: false,
    });
  });

  it('wants 20 cds from 2 sessions, and keeps the five most used', () => {
    expect(
      cdFix(
        contextOf([
          session('a', SITE, { '~/r/tools': 19 }),
          session('b', SITE, { '~/r/tools': 1 }),
        ]),
      )?.value,
    ).toStrictEqual([`${HOME}/r/tools`]);
    expect(
      cdFix(
        contextOf([
          session('a', SITE, { '~/r/tools': 19 }),
          session('b', SITE, { '~/r/notes': 1 }),
        ]),
      ),
    ).toBeNull();
    expect(cdFix(contextOf([session('a', SITE, { '~/r/tools': 40 })]))).toBeNull();
    expect(
      cdFix(
        contextOf([
          session('a', SITE, { '~/r/tools': 40 }),
          measureOf({ cwd: null, cdTargets: { '~/r/tools': 40 } }),
        ]),
      ),
    ).toBeNull();
    const many = Array.from({ length: 6 }, (_, index) => `${HOME}/m${String(index)}`);
    const context = contextOf(
      ['a', 'b'].map((id) =>
        session(id, SITE, Object.fromEntries(many.map((folder, index) => [folder, 20 + index]))),
      ),
      { modifiedAt: (file) => (file.startsWith(`${HOME}/m`) ? 1 : null) },
    );
    expect(cdFix(context)?.value).toStrictEqual(many.slice(1).toReversed());
  });

  it('adds to the folders already listed, and counts as done when they cover every one', () => {
    expect(withListed(['/keep'])?.value).toStrictEqual([
      '/keep',
      `${HOME}/r/tools`,
      `${HOME}/r/notes`,
    ]);
    expect(withListed(['/keep'])?.applied).toBe(false);
    expect(withListed(['~/r/tools', `${HOME}/r/notes`])?.applied).toBe(true);
    expect(withListed([`${HOME}/r`])?.applied).toBe(true);
    expect(withListed([`${HOME}/r/tool`, `${HOME}/r/notes`])?.applied).toBe(false);
    expect(withListed('not a list')?.value).toStrictEqual([`${HOME}/r/tools`, `${HOME}/r/notes`]);
  });

  it('offers nothing when no cd leaves for another repository', () => {
    expect(cdFix(contextOf([]))).toBeNull();
    expect(
      cdFix(contextOf([session('a', SITE, { '~': 40 }), session('b', SITE, { '~': 40 })])),
    ).toBeNull();
  });
});
