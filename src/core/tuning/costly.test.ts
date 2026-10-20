import { describe, expect, it } from 'vitest';

import { costlySessions, hotFiles, spendSlices } from './costly.js';
import { zeroSpend } from './spend.js';
import { measureOf } from './test-helpers/fixtures.js';

const BIG = measureOf({
  sessionId: 'big',
  title: 'Big refactor',
  cwd: '/work/demo',
  requests: 400,
  contextTokens: 400 * 300_000,
  peakContext: 600_000,
  cost: { input: 0, output: 4, cacheRead: 30, cacheWrite: 6 },
  compactSavingUsd: 12,
  subagentUsd: 10,
  spend: { ...zeroSpend(), fileReads: 20, setup: 8, toolInputs: 8, output: 4 },
  subagentSpend: { ...zeroSpend(), fileReads: 6, setup: 4 },
  files: { '/work/demo/src/app.ts': 9, '/other/notes.md': 1 },
  toolSchemas: { Artifact: 3, Bash: 1 },
  heavy: [{ source: 'fileReads', label: 'Read /work/demo/src/app.ts', tokens: 40_000, usd: 9 }],
  subagents: [
    {
      type: 'general-purpose',
      description: 'Build it',
      usd: 10,
      requests: 90,
      peakContext: 300_000,
    },
  ],
  idleRewrites: 2,
  idleRewriteUsd: 5,
});

describe('spendSlices', () => {
  it('lists the sources that cost anything, biggest first, with shares', () => {
    expect(spendSlices({ ...zeroSpend(), setup: 1, fileReads: 3 })).toStrictEqual([
      { source: 'fileReads', label: 'Reading files', usd: 3, share: 0.75 },
      { source: 'setup', label: 'System prompt and tool definitions', usd: 1, share: 0.25 },
    ]);
    expect(spendSlices(zeroSpend())).toStrictEqual([]);
  });
});

describe('costlySessions', () => {
  it('takes the expensive sessions apart, the biggest saving first', () => {
    const [session, ...rest] = costlySessions([measureOf(), BIG], new Set(['Artifact']));
    expect(rest).toStrictEqual([]);
    expect(session).toMatchObject({ sessionId: 'big', usd: 50, averageContext: 300_000 });
    expect(session?.causes).toStrictEqual([
      {
        id: 'context',
        text: 'Each of 400 requests re-sent 300K tokens on average (peak 600K), so carrying context cost $36. Compacting at 200K would have saved about $12.',
        usd: 36,
        savedUsd: 12,
        tipId: 'huge-context',
      },
      {
        id: 'idle',
        text: '2 times the session was picked up after its cache expired and wrote its context again, $5.00.',
        usd: 5,
        savedUsd: 5,
        tipId: 'idle-rewrite',
      },
      {
        id: 'setup',
        text: 'The system prompt and tool definitions went out with every request and cost $12. Tools sessions here rarely call made up $3.00 of it.',
        usd: 12,
        savedUsd: 3,
        tipId: 'unused-tools',
      },
      {
        id: 'file-reads',
        text: 'Files read with Read, cat and sed stayed in context and cost $26 to carry, most of all src/app.ts ($9.00).',
        usd: 26,
        savedUsd: null,
        tipId: 'file-reads',
      },
      {
        id: 'subagents',
        text: 'Subagents cost $10. The biggest, general-purpose "Build it", cost $10 over 90 requests with a 300K peak.',
        usd: 10,
        savedUsd: null,
        tipId: 'subagent-model',
      },
      {
        id: 'tool-inputs',
        text: 'Files Claude wrote with Write and Edit, and long shell scripts, stayed in context and cost $8.00 to carry. Edit sends less than writing a whole file again.',
        usd: 8,
        savedUsd: null,
        tipId: null,
      },
      {
        id: 'output',
        text: "Claude's own replies and thinking cost $4.00 in output tokens.",
        usd: 4,
        savedUsd: null,
        tipId: null,
      },
    ]);
    expect(session?.heavy[0]?.label).toBe('Read src/app.ts');
    expect(session?.spend[0]).toMatchObject({ source: 'fileReads', usd: 26 });
  });

  it('names skills, command output and a Sonnet saving, and leaves out what costs too little', () => {
    const hour = {
      at: 0,
      usd: 0,
      subagentUsd: 0,
      premiumUsd: 0,
      premiumSavingUsd: 0,
      subagentSavingUsd: 1.5,
      bigContextUsd: 0,
      idleRewriteUsd: 0,
    };
    const measure = measureOf({
      cost: { input: 0, output: 0, cacheRead: 20, cacheWrite: 0 },
      contextTokens: 10 * 150_000 - 1,
      subagentUsd: 5,
      subagents: [
        { type: 'Explore', description: 'Scan', usd: 5, requests: 3, peakContext: 50_000 },
      ],
      hours: [hour, { ...hour, subagentSavingUsd: 0.5 }],
      spend: { ...zeroSpend(), toolOutput: 10, skills: 10, fileReads: 1.99 },
      skills: { '/s/voice': 6, '/s/canvas': 4 },
    });
    expect(costlySessions([measure], new Set())[0]?.causes).toStrictEqual([
      {
        id: 'subagents',
        text: 'Subagents cost $5.00. The biggest, Explore "Scan", cost $5.00 over 3 requests with a 50K peak. Running them on Sonnet would have saved about $2.00.',
        usd: 5,
        savedUsd: 2,
        tipId: 'subagent-model',
      },
      {
        id: 'tool-output',
        text: 'Command and search output cost $10 to carry.',
        usd: 10,
        savedUsd: null,
        tipId: 'big-results',
      },
      {
        id: 'skills',
        text: 'The skill list and loaded skills cost $10, voice the most ($6.00).',
        usd: 10,
        savedUsd: null,
        tipId: 'heavy-skills',
      },
    ]);
  });

  it('says less when there is nothing to name', () => {
    const measure = measureOf({
      cost: { input: 0, output: 0, cacheRead: 10, cacheWrite: 0 },
      requests: 0,
      contextTokens: 0,
      subagentUsd: 5,
      spend: { ...zeroSpend(), skills: 4, fileReads: 4, setup: 4 },
    });
    const [session] = costlySessions([measure], new Set());
    expect(session?.averageContext).toBe(0);
    expect(session?.causes.map((cause) => cause.text)).toStrictEqual([
      'Files read with Read, cat and sed stayed in context and cost $4.00 to carry.',
      'The system prompt and tool definitions went out with every request and cost $4.00.',
      'The skill list and loaded skills cost $4.00.',
    ]);
    expect(session?.causes.map((cause) => [cause.savedUsd, cause.tipId])).toStrictEqual([
      [null, 'file-reads'],
      [null, null],
      [null, 'heavy-skills'],
    ]);
  });

  it('counts a context of 150K on average as big', () => {
    const measure = measureOf({
      cost: { input: 0, output: 0, cacheRead: 10, cacheWrite: 0 },
      requests: 2,
      contextTokens: 300_000,
    });
    expect(costlySessions([measure], new Set())[0]?.causes[0]?.id).toBe('context');
  });

  it('keeps the eight costliest of at least $3, costliest first', () => {
    const measures = [2.99, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((usd) =>
      measureOf({
        sessionId: String(usd),
        cost: { input: 0, output: 0, cacheRead: usd, cacheWrite: 0 },
        cwd: null,
        heavy: [{ source: 'fileReads', label: 'Read /x/a.ts', tokens: 1, usd: 1 }],
      }),
    );
    const sessions = costlySessions(measures, new Set());
    expect(sessions.map((session) => session.sessionId)).toStrictEqual([
      '11',
      '10',
      '9',
      '8',
      '7',
      '6',
      '5',
      '4',
    ]);
    expect(sessions[0]?.heavy[0]?.label).toBe('Read /x/a.ts');
    expect(
      costlySessions(measures.slice(0, 2), new Set()).map((session) => session.sessionId),
    ).toStrictEqual(['3']);
  });

  it('leaves out cheap sessions', () => {
    expect(costlySessions([measureOf()], new Set())).toStrictEqual([]);
  });
});

describe('hotFiles', () => {
  it('adds up a file read from worktrees of one project, leaving out one-offs and outside files', () => {
    const one = measureOf({
      cwd: '/wt/a',
      files: {
        '/wt/a/src/app.ts': 2,
        '/home/me/.claude/skills/voice/SKILL.md': 4,
        '/repo/README.md': 3,
        '~/notes.md': 3,
        '../other/x.ts': 3,
      },
    });
    const two = measureOf({
      cwd: '/wt/b',
      files: { '/wt/b/src/app.ts': 3, '/repo/README.md': 4, '~/notes.md': 3, '../other/x.ts': 2 },
    });
    const loose = measureOf({ cwd: null, files: { '/x.ts': 1 } });
    expect(hotFiles([loose, one, two, loose], () => '/repo')).toStrictEqual([
      { project: '/repo', path: 'README.md', usd: 7, sessions: 2 },
      { project: '/repo', path: 'src/app.ts', usd: 5, sessions: 2 },
    ]);
  });

  it('keeps the fifteen that cost most', () => {
    const files = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [`/r/f${String(index)}.ts`, index + 1]),
    );
    const measures = [measureOf({ cwd: '/r', files }), measureOf({ cwd: '/r', files })];
    const hot = hotFiles(measures, (cwd) => cwd);
    expect(hot).toHaveLength(15);
    expect(hot[0]).toStrictEqual({ project: '/r', path: 'f15.ts', usd: 32, sessions: 2 });
    expect(hot.at(-1)?.path).toBe('f1.ts');
  });

  it('counts only the sessions that started after a file last changed, and drops files that are gone', () => {
    const files = { '/r/split.ts': 5, '/r/same.ts': 1, '/r/gone.ts': 9 };
    const measures = [10, 20, 30].map((startedAt) =>
      measureOf({ sessionId: `s${String(startedAt)}`, cwd: '/r', startedAt, files }),
    );
    const changed: Readonly<Record<string, number>> = { '/r/split.ts': 20, '/r/same.ts': 1 };
    expect(
      hotFiles(
        measures,
        (cwd) => cwd,
        (file) => changed[file] ?? null,
      ),
    ).toStrictEqual([
      { project: '/r', path: 'split.ts', usd: 10, sessions: 2 },
      { project: '/r', path: 'same.ts', usd: 3, sessions: 3 },
    ]);
    expect(
      hotFiles(
        measures,
        (cwd) => cwd,
        () => 30,
      ),
    ).toStrictEqual([]);
  });
});
