import { describe, expect, it } from 'vitest';

import type { AutoFix } from '../../shared/tuning.js';

import type { FixContext } from './fix-context.js';
import { autoFixesFor, unusedTools } from './fixes.js';
import type { SessionMeasure } from './measure.js';
import { zeroSpend } from './spend.js';
import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

function sessions(
  count: number,
  extra: Parameters<typeof measureOf>[0],
): ReturnType<typeof measureOf>[] {
  return Array.from({ length: count }, (_, index) =>
    measureOf({ sessionId: `s${index.toString()}`, ...extra }),
  );
}

const MEASURES = [
  ...sessions(9, { toolSchemas: { Artifact: 0.2, Bash: 0.1 }, toolUses: { Bash: 4 } }),
  measureOf({
    sessionId: 'worst',
    cwd: '/wt/one',
    denials: 9,
    toolSchemas: { Artifact: 0.2, Bash: 0.1 },
    toolUses: { Bash: 1 },
    compactSavingUsd: 7,
    skills: { '/home/me/.claude/skills/voice': 3 },
  }),
];

function contextOf(extra: Partial<FixContext> = {}): FixContext {
  return {
    totals: totalsOf(MEASURES, HOME),
    live: MEASURES,
    hotFiles: [
      { project: '/grant', path: 'proposal.tex', sessions: 5, usd: 20 },
      { project: '/repo', path: 'src/app.ts', sessions: 3, usd: 9 },
    ],
    knob: () => null,
    installed: new Set(),
    home: HOME,
    projectOf: () => '/repo',
    modifiedAt: () => 1,
    ...extra,
  };
}

describe('unusedTools', () => {
  it('finds tools carried by many sessions and called by almost none', () => {
    const tools = unusedTools(totalsOf(MEASURES, HOME));
    expect(tools.map((tool) => [tool.name, tool.carried, tool.used])).toStrictEqual([
      ['Artifact', 10, 0],
    ]);
    expect(tools[0]?.usd).toBeCloseTo(2);
  });
});

describe('autoFixesFor', () => {
  it('denies unused tools on top of the deny rules already set', () => {
    const [deny] = autoFixesFor('unused-tools', contextOf({ knob: () => ['Bash(rm *)'] }));
    expect(deny).toMatchObject({
      kind: 'knob',
      key: 'permissions.deny',
      value: ['Bash(rm *)', 'Artifact'],
      applied: false,
    });
    const [done] = autoFixesFor('unused-tools', contextOf({ knob: () => ['Artifact'] }));
    expect(done?.applied).toBe(true);
  });

  it('puts fixes already applied last, and says what compacting would have saved', () => {
    const fixes = autoFixesFor('huge-context', contextOf({ knob: () => 150_000 }));
    expect(fixes.map((fix) => [fix.id, fix.applied])).toStrictEqual([
      ['create:handoff', false],
      ['knob:autoCompactWindow', true],
    ]);
    expect(fixes[1]?.detail).toContain('about $7.00');
  });

  it('starts sessions in folders that are still there, with prompts that name the files and skills', () => {
    const [hot] = autoFixesFor('file-reads', contextOf());
    expect(hot).toMatchObject({ kind: 'launch', cwd: '/repo', worktree: true });
    expect(hot?.kind === 'launch' ? hot.prompt : '').toContain(
      '- src/app.ts: $9.00 over 3 sessions',
    );
    const [skill] = autoFixesFor('heavy-skills', contextOf());
    expect(skill).toMatchObject({ kind: 'launch', cwd: '/home/me/.claude/skills/voice' });
    const [permissions] = autoFixesFor('denials', contextOf());
    expect(permissions).toMatchObject({
      kind: 'launch',
      cwd: '/repo',
      prompt: '/fewer-permission-prompts',
    });
    expect(
      autoFixesFor('file-reads', contextOf({ modifiedAt: () => null })).map((fix) => fix.kind),
    ).toStrictEqual(['create']);
    expect(autoFixesFor('denials', contextOf({ modifiedAt: () => null }))).toStrictEqual([]);
  });

  it('stops offering to slim a skill changed since a session last loaded it', () => {
    const later = contextOf({ modifiedAt: (path) => (path.endsWith('SKILL.md') ? 5000 : 1) });
    expect(autoFixesFor('heavy-skills', later)).toStrictEqual([]);
  });

  it('offers nothing for a tip it has no fixes for', () => {
    expect(autoFixesFor('no-such-tip', contextOf())).toStrictEqual([]);
    expect(autoFixesFor('instructions', contextOf())).toStrictEqual([]);
  });
});

const HOUR = {
  at: 0,
  usd: 0,
  subagentUsd: 0,
  premiumUsd: 0,
  premiumSavingUsd: 0,
  subagentSavingUsd: 4,
  bigContextUsd: 0,
  idleRewriteUsd: 0,
};

const FULL: readonly SessionMeasure[] = [
  ...sessions(4, { toolSchemas: { Artifact: 0.25 } }),
  measureOf({
    sessionId: 'w',
    cwd: '/wt/one',
    denials: 9,
    toolErrors: 20,
    toolSchemas: { Artifact: 0.25 },
    compactSavingUsd: 7,
    hours: [HOUR],
    spend: { ...zeroSpend(), instructions: 1.5 },
    skills: { '/s/voice/': 3, '/s/canvas': 2 },
  }),
];

function fullContext(extra: Partial<FixContext> = {}): FixContext {
  return contextOf({
    totals: totalsOf(FULL, HOME),
    live: FULL,
    hotFiles: [{ project: '/repo', path: 'src/app.ts', sessions: 3, usd: 9 }],
    ...extra,
  });
}

function fixesOf(tip: string): AutoFix[] {
  return autoFixesFor(tip, fullContext());
}

function applied(tip: string, value: unknown): boolean | undefined {
  return autoFixesFor(tip, fullContext({ knob: () => value })).find((fix) => fix.kind === 'knob')
    ?.applied;
}

/** `count` sessions that carried tool `name` for `usd` in all and called it in `used` of them. */
function many(count: number, usd: number, used: number, name: string): SessionMeasure[] {
  return Array.from({ length: count }, (_, index) =>
    measureOf({
      sessionId: `${name}${String(index)}`,
      toolSchemas: { [name]: usd / count },
      toolUses: index < used ? { [name]: 1 } : {},
    }),
  );
}

function names(measures: readonly SessionMeasure[]): string[] {
  return unusedTools(totalsOf(measures, HOME)).map((tool) => tool.name);
}

function splitsAt(usd: number): AutoFix[] {
  return autoFixesFor(
    'file-reads',
    fullContext({ hotFiles: [{ project: '/repo', path: 'a.ts', sessions: 2, usd }] }),
  ).filter((fix) => fix.kind === 'launch');
}

function instructionFixesAt(usd: number): AutoFix[] {
  const live = [measureOf({ spend: { ...zeroSpend(), instructions: usd } })];
  return autoFixesFor('instructions', fullContext({ live, totals: totalsOf(live, HOME) }));
}

describe('every fix', () => {
  it('says what it does and what it would have saved', () => {
    const expected: Readonly<Record<string, readonly (readonly string[])[]>> = {
      'context-reread': [
        [
          'knob:autoCompactWindow',
          'Compact every session at 200K tokens',
          'Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit. On the sessions measured that would have saved about $7.00.',
        ],
        [
          'create:scout',
          'Add a scout agent for searches',
          'Writes the scout agent: Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.',
        ],
      ],
      'huge-context': [
        [
          'knob:autoCompactWindow',
          'Compact every session at 200K tokens',
          'Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit. On the sessions measured that would have saved about $7.00.',
        ],
        [
          'create:handoff',
          'Add a handoff skill',
          'Writes the handoff skill: Write a handoff note for the current task so a fresh session can pick it up. Use before /clear, before stepping away from a long session, or when the context is getting large.',
        ],
      ],
      'idle-rewrite': [
        [
          'knob:autoCompactWindow',
          'Compact every session at 200K tokens',
          'Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit. On the sessions measured that would have saved about $7.00.',
        ],
        [
          'create:handoff',
          'Add a handoff skill',
          'Writes the handoff skill: Write a handoff note for the current task so a fresh session can pick it up. Use before /clear, before stepping away from a long session, or when the context is getting large.',
        ],
      ],
      'subagent-model': [
        [
          'knob:CLAUDE_CODE_SUBAGENT_MODEL',
          'Run subagents on Sonnet',
          'Sets CLAUDE_CODE_SUBAGENT_MODEL to sonnet, so subagents without a model of their own stop running on Opus. About $4.00 saved on the sessions measured. Agents that set model: opus keep it.',
        ],
        [
          'create:scout',
          'Add a scout agent on Haiku',
          'Writes the scout agent: Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.',
        ],
      ],
      'big-results': [
        [
          'knob:BASH_MAX_OUTPUT_LENGTH',
          'Cap shell output at 15,000 characters',
          'Sets BASH_MAX_OUTPUT_LENGTH so one noisy command cannot put 30,000 characters into the context for the rest of the session.',
        ],
        [
          'create:quiet-run',
          'Add the quiet-run skill',
          'Writes the quiet-run skill: Run a build, test suite or other noisy command with its full output saved to a log file, and bring back only the exit code, the errors and the last lines. Use instead of running long builds or tests directly.',
        ],
      ],
      'repeated-commands': [
        [
          'create:ci-watch',
          'Add a ci-watch agent',
          'Writes the ci-watch agent: Waits for a GitHub Actions run to finish and reports the result, with only the failing part of the log when it fails. Use after pushing, instead of polling gh run from the main session.',
        ],
        [
          'create:dev-server',
          'Add the dev-server skill',
          'Writes the dev-server skill: Start, restart or stop a local development server in the background with its output in a log file, and wait until it answers. Use instead of running servers in the foreground or killing ports by hand.',
        ],
        [
          'create:quiet-run',
          'Add the quiet-run skill',
          'Writes the quiet-run skill: Run a build, test suite or other noisy command with its full output saved to a log file, and bring back only the exit code, the errors and the last lines. Use instead of running long builds or tests directly.',
        ],
      ],
      'long-sessions': [
        [
          'knob:autoCompactWindow',
          'Compact every session at 200K tokens',
          'Sets autoCompactWindow to 200000 in your user settings, so sessions and subagents compact long before the 1M limit. On the sessions measured that would have saved about $7.00.',
        ],
        [
          'create:handoff',
          'Add a handoff skill',
          'Writes the handoff skill: Write a handoff note for the current task so a fresh session can pick it up. Use before /clear, before stepping away from a long session, or when the context is getting large.',
        ],
      ],
      denials: [
        [
          'launch:permissions:/repo',
          'Allow the read-only commands repo keeps asking for',
          'Has Claude run /fewer-permission-prompts in /repo, which reads the transcripts and adds allow rules for read-only commands to the project settings.',
        ],
      ],
      rereads: [
        [
          'create:scout',
          'Add a scout agent for searches',
          'Writes the scout agent: Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.',
        ],
      ],
      'tool-errors': [
        [
          'launch:commands:/repo',
          "Teach repo's CLAUDE.md the commands that keep failing",
          'Has Claude, in a new worktree of /repo, find the tool calls that failed on a wrong command or missing setup and add the right ones to its CLAUDE.md.',
        ],
      ],
      'file-reads': [
        [
          'launch:hot-files:/repo',
          'Make the most read files in repo cheaper to read',
          'Has Claude, in a new worktree of /repo, split the files sessions keep reading ($9.00 to carry so far) into smaller modules and cut comments that only restate the code, then land the change.',
        ],
        [
          'create:scout',
          'Add a scout agent for searches',
          'Writes the scout agent: Finds code, config and facts in the repository and reports only what matters. Use for any search that would read many files or long command output, so the main session keeps a small context.',
        ],
      ],
      'unused-tools': [
        [
          'knob:permissions.deny',
          'Stop sending 1 unused tool with every request',
          'Adds Artifact (used in 0 of 5 sessions) to permissions.deny in your user settings, which takes their definitions out of every request: about $1.25 on the sessions measured. Remove one from permissions.deny when you want it back.',
        ],
      ],
      'heavy-skills': [
        [
          'launch:skill:/s/voice/',
          'Slim the voice skill',
          "Has Claude move reference material out of voice's SKILL.md into files it loads only when needed. Carrying its body cost $3.00 on the sessions measured.",
        ],
        [
          'launch:skill:/s/canvas',
          'Slim the canvas skill',
          "Has Claude move reference material out of canvas's SKILL.md into files it loads only when needed. Carrying its body cost $2.00 on the sessions measured.",
        ],
      ],
      instructions: [
        [
          'launch:instructions',
          'Tighten CLAUDE.md and memory',
          'Has Claude rewrite ~/.claude/CLAUDE.md and the memory index to say the same in fewer words. They load with every request, which cost $1.50 on the sessions measured.',
        ],
      ],
      'transcript-cleanup': [
        [
          'knob:cleanupPeriodDays',
          'Keep transcripts for 90 days',
          'Sets cleanupPeriodDays to 90 in your user settings, so Claude Code keeps every session on disk for 90 days instead of 30.',
        ],
      ],
    };
    for (const [tip, fixes] of Object.entries(expected)) {
      const found = autoFixesFor(tip, fullContext()).map((fix) => [fix.id, fix.title, fix.detail]);
      expect([tip, found]).toStrictEqual([tip, fixes]);
    }
  });

  it('sets these values and starts these sessions', () => {
    expect(fixesOf('huge-context')[0]).toMatchObject({ key: 'autoCompactWindow', value: 200_000 });
    expect(fixesOf('subagent-model')[0]).toMatchObject({
      key: 'CLAUDE_CODE_SUBAGENT_MODEL',
      value: 'sonnet',
    });
    expect(fixesOf('big-results')[0]).toMatchObject({
      key: 'BASH_MAX_OUTPUT_LENGTH',
      value: '15000',
    });
    expect(fixesOf('rereads')[0]).toMatchObject({ kind: 'create', suggestionId: 'scout' });
    const launches = ['denials', 'tool-errors', 'file-reads', 'heavy-skills', 'instructions'].map(
      (tip) => fixesOf(tip)[0],
    );
    expect(
      launches.map((fix) => (fix?.kind === 'launch' ? [fix.label, fix.cwd, fix.worktree] : null)),
    ).toStrictEqual([
      ['Fewer permission prompts', '/repo', false],
      ['Fix failing commands', '/repo', true],
      ['Make hot files cheaper to read', '/repo', true],
      ['Slim the voice skill', '/s/voice/', false],
      ['Tighten CLAUDE.md', HOME, false],
    ]);
    const prompts = launches.map((fix) => (fix?.kind === 'launch' ? fix.prompt : ''));
    expect(prompts[0]).toBe('/fewer-permission-prompts');
    expect(prompts[1]).toContain('Many tool calls in this project');
    expect(prompts[2]).toContain(
      'carrying them in context after reading them cost $9.00:\n- src/app.ts: $9.00 over 3 sessions\n\nEvery session',
    );
    expect(prompts[3]).toContain('The voice skill in /s/voice/ cost $3.00');
    expect(prompts[4]).toContain('cost $1.50 across recent sessions');
  });
});

describe('when a fix counts as done', () => {
  it('reads the settings the knob fixes write', () => {
    expect(
      [200_000, 200_001, '150000'].map((value) => applied('huge-context', value)),
    ).toStrictEqual([true, false, false]);
    expect(['opus', '', 3].map((value) => applied('subagent-model', value))).toStrictEqual([
      true,
      false,
      false,
    ]);
    expect(
      ['15000', '15001', '0', undefined].map((value) => applied('big-results', value)),
    ).toStrictEqual([true, false, false, false]);
    expect(
      [90, 365, 89, 0, '90', undefined].map((value) => applied('transcript-cleanup', value)),
    ).toStrictEqual([true, true, false, false, false, false]);
    expect(applied('unused-tools', ['Artifact', 7])).toBe(true);
    expect(
      autoFixesFor('unused-tools', fullContext({ knob: () => ['Bash(rm *)', 7] }))[0],
    ).toMatchObject({
      value: ['Bash(rm *)', 'Artifact'],
    });
  });

  it('marks a skill or agent it already wrote', () => {
    const fixes = autoFixesFor(
      'repeated-commands',
      fullContext({ installed: new Set(['ci-watch', 'quiet-run']) }),
    );
    expect(fixes.map((fix) => [fix.id, fix.applied])).toStrictEqual([
      ['create:dev-server', false],
      ['create:ci-watch', true],
      ['create:quiet-run', true],
    ]);
  });
});

describe('what each fix picks', () => {
  it('counts a tool unused at 5 sessions, 50 cents and 5% use, most costly first', () => {
    expect(names([...many(20, 1, 1, 'A'), ...many(5, 2, 0, 'B')])).toStrictEqual(['B', 'A']);
    expect(names(many(20, 1, 2, 'A'))).toStrictEqual([]);
    expect(names(many(4, 1, 0, 'A'))).toStrictEqual([]);
    expect(names(many(5, 0.49, 0, 'A'))).toStrictEqual([]);
    expect(names(many(5, 0.5, 0, 'A'))).toStrictEqual(['A']);
  });

  it('starts sessions in the project of the worst session that has a folder', () => {
    const live = [
      measureOf({ sessionId: 'a', cwd: null, denials: 50 }),
      measureOf({ sessionId: 'b', cwd: '/x/one', denials: 0 }),
      measureOf({ sessionId: 'c', cwd: '/x/two', denials: 3 }),
      measureOf({ sessionId: 'd', cwd: '/x/three/', denials: 5 }),
    ];
    const [fix] = autoFixesFor('denials', fullContext({ live, projectOf: (cwd) => cwd }));
    expect(fix).toMatchObject({
      cwd: '/x/three/',
      title: 'Allow the read-only commands three keeps asking for',
    });
    const errors = [
      measureOf({ sessionId: 'e', cwd: '/x/e', toolErrors: 9, denials: 9 }),
      measureOf({ sessionId: 'f', cwd: '/x/f', toolErrors: 3, denials: 0 }),
    ];
    expect(
      autoFixesFor('tool-errors', fullContext({ live: errors, projectOf: (cwd) => cwd }))[0],
    ).toMatchObject({
      cwd: '/x/f',
    });
    expect(autoFixesFor('tool-errors', fullContext({ live: live.slice(1, 2) }))).toStrictEqual([]);
  });

  it('splits only code, from one project, at most eight files', () => {
    const hotFiles = [
      { project: '', path: 'a.ts', sessions: 9, usd: 50 },
      { project: '/gone', path: 'b.ts', sessions: 9, usd: 40 },
      ...Array.from({ length: 9 }, (_, index) => ({
        project: '/repo',
        path: `f${String(index)}.TS`,
        sessions: 2,
        usd: 9 - index,
      })),
      { project: '/repo', path: 'notes.md', sessions: 9, usd: 30 },
      { project: '/repo', path: 'go', sessions: 9, usd: 30 },
      { project: '/other', path: 'c.py', sessions: 9, usd: 1 },
    ];
    const [fix] = autoFixesFor(
      'file-reads',
      fullContext({ hotFiles, modifiedAt: (path) => (path === '/gone' ? null : 1) }),
    );
    const prompt = fix?.kind === 'launch' ? fix.prompt : '';
    expect(fix).toMatchObject({ cwd: '/repo' });
    expect(prompt).toContain('cost $44:');
    expect(prompt).toContain('- f7.TS: $2.00');
    expect(prompt).not.toContain('f8.TS');
    expect(prompt).not.toContain('notes.md');
    expect(prompt).not.toContain('- go:');
  });

  it('offers no split worth less than five dollars', () => {
    expect(splitsAt(5)).toHaveLength(1);
    expect(splitsAt(4.99)).toStrictEqual([]);
  });

  it('offers the three most costly skills of at least a dollar', () => {
    const skills = { '/s/a': 5, '/s/b': 4, '/s/c': 0.99, '/s/d': 3 };
    const live = [measureOf({ startedAt: 10, skills })];
    const fixes = autoFixesFor('heavy-skills', fullContext({ live, totals: totalsOf(live, HOME) }));
    expect(fixes.map((fix) => fix.id)).toStrictEqual([
      'launch:skill:/s/a',
      'launch:skill:/s/b',
      'launch:skill:/s/d',
    ]);
    const edited = autoFixesFor(
      'heavy-skills',
      fullContext({
        live,
        totals: totalsOf(live, HOME),
        modifiedAt: (path) => (path === '/s/b/SKILL.md' ? 11 : 10),
      }),
    );
    expect(edited.map((fix) => fix.id)).toStrictEqual(['launch:skill:/s/a', 'launch:skill:/s/d']);
  });

  it('prices a skill on the sessions that loaded it after SKILL.md last changed', () => {
    const live = [
      measureOf({ sessionId: 'old', startedAt: 5, skills: { '/s/a': 9, '/s/b': 9 } }),
      measureOf({ sessionId: 'new', startedAt: 20, skills: { '/s/a': 0.5, '/s/b': 1.5 } }),
    ];
    const fixes = autoFixesFor(
      'heavy-skills',
      fullContext({ live, totals: totalsOf(live, HOME), modifiedAt: () => 10 }),
    );
    expect(fixes.map((fix) => [fix.id, /cost (\$[\d.]+)/u.exec(fix.detail)?.[1]])).toStrictEqual([
      ['launch:skill:/s/b', '$1.50'],
    ]);
  });

  it('tightens CLAUDE.md once it costs a dollar', () => {
    expect(instructionFixesAt(1).map((fix) => fix.id)).toStrictEqual(['launch:instructions']);
    expect(instructionFixesAt(0.99)).toStrictEqual([]);
  });

  it('prices CLAUDE.md on the sessions that started after it last changed', () => {
    const live = [
      measureOf({ sessionId: 'old', startedAt: 5, spend: { ...zeroSpend(), instructions: 9 } }),
      measureOf({
        sessionId: 'new',
        startedAt: 20,
        spend: { ...zeroSpend(), instructions: 0.5 },
        subagentSpend: { ...zeroSpend(), instructions: 0.75 },
      }),
    ];
    const at = (changed: number | null): AutoFix[] =>
      autoFixesFor(
        'instructions',
        fullContext({
          live,
          totals: totalsOf(live, HOME),
          modifiedAt: (file) => (file === `${HOME}/.claude/CLAUDE.md` ? changed : 1),
        }),
      );
    expect(at(20)[0]?.detail).toContain('cost $1.25 on');
    expect(at(21)).toStrictEqual([]);
    expect(at(null)[0]?.detail).toContain('cost $10 on');
  });
});
