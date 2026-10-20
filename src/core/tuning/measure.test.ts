import { describe, expect, it } from 'vitest';

import {
  assistant,
  attachment,
  system,
  T0,
  text,
  toolResult,
  toolUse,
  usage,
  userPrompt,
} from '../transcripts/test-helpers/fixtures.js';

import type { MeasureInput } from './measure.js';
import { BIG_RESULT_CHARS, costTotal, IDLE_GAP_MS, measureSession } from './measure.js';

const SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Fields = Readonly<Record<string, unknown>>;

function lines(records: readonly Fields[]): string[] {
  return records.map((record) => JSON.stringify(record));
}

function measure(
  main: readonly Fields[],
  extra: Partial<MeasureInput> = {},
): ReturnType<typeof measureSession> {
  return measureSession({
    sessionId: SESSION,
    main: lines(main),
    subagents: [],
    fallbackAt: 42,
    ...extra,
  });
}

function call(id: string, name: string, input: unknown, messageId = `m-${id}`): Fields {
  return assistant({
    uuid: `a-${id}`,
    at: 0,
    messageId,
    content: [toolUse(id, name, input)],
    usage: null,
  });
}

function bash(id: string, command: unknown): Fields {
  return call(id, 'Bash', { command });
}

describe('measureSession', () => {
  it('measures an empty transcript with fallbacks', () => {
    const result = measure([]);
    expect(result).toMatchObject({
      sessionId: SESSION,
      title: 'Session aaaaaaaa',
      cwd: null,
      startedAt: 42,
      updatedAt: 42,
      prompts: 0,
      requests: 0,
      peakContext: 0,
      topRepeat: null,
      spawns: {},
      families: { land: 0, ci: 0, server: 0, buildTest: 0, search: 0 },
    });
    expect(costTotal(result.cost)).toBe(0);
  });

  it('counts requests once per message id, with context, peak and cost by kind', () => {
    const result = measure([
      userPrompt('u1', 0, 'Fix the build'),
      assistant({
        uuid: 'a1',
        at: 1000,
        messageId: 'm1',
        content: [text('one')],
        usage: usage({ input: 100, output: 1000, cacheRead: 1_000_000, cacheCreation: 10_000 }),
      }),
      // A second record for the same message repeats its usage.
      assistant({
        uuid: 'a2',
        at: 1001,
        messageId: 'm1',
        content: [text('two')],
        usage: usage({ input: 100, output: 1000, cacheRead: 1_000_000, cacheCreation: 10_000 }),
      }),
      assistant({
        uuid: 'a3',
        at: 2000,
        messageId: 'm2',
        content: [text('three')],
        usage: usage({ input: 10, cacheRead: 500 }),
      }),
      assistant({ uuid: 'a4', at: 3000, messageId: 'm3', content: [], usage: null }),
    ]);
    expect(result.requests).toBe(2);
    expect(result.peakContext).toBe(1_010_100);
    expect(result.contextTokens).toBe(1_010_100 + 510);
    expect(result.cost.input).toBeCloseTo((110 * 4) / 1_000_000);
    expect(result.cost.output).toBeCloseTo((1000 * 20) / 1_000_000);
    expect(result.cost.cacheRead).toBeCloseTo((1_000_500 * 0.2) / 1_000_000);
    expect(result.cost.cacheWrite).toBeCloseTo((10_000 * 5) / 1_000_000);
    expect(result.prompts).toBe(1);
    expect(result.title).toBe('Fix the build');
    expect(result.cwd).toBe('/work/demo');
    expect(result.startedAt).toBe(Date.parse('2026-10-01T12:00:00.000Z'));
    expect(result.updatedAt).toBe(Date.parse('2026-10-01T12:00:03.000Z'));
  });

  it('leaves unknown models out of the cost but still counts their context', () => {
    const result = measure([
      assistant({
        uuid: 'a1',
        at: 0,
        messageId: 'm1',
        content: [],
        model: 'gpt-x',
        usage: usage({ cacheCreation: 80_000 }),
      }),
      assistant({
        uuid: 'a2',
        at: IDLE_GAP_MS,
        messageId: 'm2',
        content: [],
        model: 'gpt-x',
        usage: usage({ cacheCreation: 80_000 }),
      }),
    ]);
    expect(result.requests).toBe(2);
    expect(costTotal(result.cost)).toBe(0);
    expect(result.idleRewrites).toBe(1);
    expect(result.idleRewriteUsd).toBe(0);
  });

  it('counts a large cache write after a long pause as an idle rewrite', () => {
    const big = usage({ cacheRead: 10_000, cacheCreation: 100_000 });
    const result = measure([
      assistant({ uuid: 'a1', at: 0, messageId: 'm1', content: [], usage: big }),
      // Too soon after the last request.
      assistant({ uuid: 'a2', at: IDLE_GAP_MS - 1, messageId: 'm2', content: [], usage: big }),
      // Long pause and a big write: a rewrite.
      assistant({ uuid: 'a3', at: 2 * IDLE_GAP_MS, messageId: 'm3', content: [], usage: big }),
      // Long pause but a small write.
      assistant({
        uuid: 'a4',
        at: 4 * IDLE_GAP_MS,
        messageId: 'm4',
        content: [],
        usage: usage({ cacheRead: 100_000, cacheCreation: 49_999 }),
      }),
      // Long pause, big write, but most of the context was still cached.
      assistant({
        uuid: 'a5',
        at: 6 * IDLE_GAP_MS,
        messageId: 'm5',
        content: [],
        usage: usage({ cacheRead: 200_000, cacheCreation: 60_000 }),
      }),
      // No timestamp: never a rewrite, and the last request time stays.
      assistant({
        uuid: 'a6',
        at: 0,
        messageId: 'm6',
        content: [],
        usage: big,
        extra: { timestamp: 'not a date' },
      }),
      assistant({ uuid: 'a7', at: 8 * IDLE_GAP_MS, messageId: 'm7', content: [], usage: big }),
    ]);
    expect(result.idleRewrites).toBe(2);
    expect(result.idleRewriteUsd).toBeCloseTo((2 * 100_000 * 5) / 1_000_000);
    expect(result.updatedAt).toBe(Date.parse('2026-10-01T12:40:00.000Z'));
  });

  it('takes the custom title over the AI title in either order', () => {
    const custom = { type: 'custom-title', customTitle: 'Mine' };
    const ai = { type: 'ai-title', aiTitle: 'Theirs' };
    expect(measure([ai, custom]).title).toBe('Mine');
    expect(measure([custom, ai]).title).toBe('Mine');
    expect(measure([ai]).title).toBe('Theirs');
    expect(measure([{ type: 'ai-title', aiTitle: 'x'.repeat(100) }]).title).toBe(
      `${'x'.repeat(77)}...`,
    );
  });

  it('counts compactions and ignores other records', () => {
    const result = measure([
      // A record with no cwd leaves it for a later one to fill.
      system('s0', 0, { subtype: 'informational', cwd: null }),
      system('s1', 0, { subtype: 'compact_boundary' }),
      system('s2', 0, { subtype: 'turn_duration' }),
      attachment('t1', 0, { type: 'queued_command', prompt: 'later' }),
      { type: 'permission-mode', permissionMode: 'auto' },
      { type: 'nonsense' },
    ]);
    expect(result.compactions).toBe(1);
    expect(result.cwd).toBe('/work/demo');
  });

  it('counts tools, rereads, spawns and searches', () => {
    const read = (id: string, file: unknown): Fields => call(id, 'Read', { file_path: file });
    const result = measure([
      read('r1', '/a.ts'),
      read('r2', '/a.ts'),
      read('r3', '/a.ts'),
      read('r4', '/a.ts'),
      read('r5', '/b.ts'),
      read('r6', 7),
      call('r7', 'Read', 'not an object'),
      // The same tool use id seen twice is counted once.
      call('r1', 'Read', { file_path: '/a.ts' }, 'm-again'),
      call('g1', 'Grep', { pattern: 'x' }),
      call('s1', 'Agent', { subagent_type: 'Explore' }),
      call('s2', 'Agent', {}),
      call('s3', 'Task', { subagent_type: 'Explore' }),
      call('e1', 'Edit', {}),
    ]);
    expect(result.toolCalls).toBe(12);
    expect(result.extraReads).toBe(2);
    expect(result.spawns).toStrictEqual({ Explore: 2, 'general-purpose': 1 });
    expect(result.families.search).toBe(8);
  });

  it('counts shell commands, cd prefixes, repeats and families', () => {
    const result = measure([
      bash('b1', 'cd /x && npm test'),
      bash('b2', 'cd /x && npm test'),
      bash('b3', ' cd /x && npm test '),
      bash('b4', 'cd /x && npm test'),
      bash('b5', 'git status'),
      bash('b6', 'git status'),
      bash('b7', 'git status'),
      bash('b8', ' '.repeat(3)),
      bash('b9', 3),
      bash('c1', 'git -C /repo push origin HEAD:main'),
      bash('c2', 'git fetch -q origin'),
      bash('c3', 'git log | grep push'),
      bash('c4', 'gh run watch 1'),
      bash('c5', 'gh pr checks 3'),
      bash('c6', 'lsof -ti tcp:5000 | xargs kill'),
      bash('c7', 'npm run dev'),
      bash('c8', 'npm start'),
      bash('c9', 'dotnet watch'),
      bash('d1', 'pkill node'),
      bash('d2', 'flask run'),
      bash('d3', 'npm run build'),
      bash('d4', 'npx vitest run'),
      bash('d5', 'cargo test'),
      bash('d6', 'make all'),
      bash('d7', "sed -n '1,5p' f"),
      bash('d8', 'rg foo'),
    ]);
    expect(result.bashCommands).toBe(26);
    expect(result.cdCommands).toBe(4);
    expect(result.cdTargets).toStrictEqual({ '/x': 4 });
    // Four runs of one command and three of another: (4 - 2) + (3 - 2).
    expect(result.repeatedRuns).toBe(3);
    expect(result.topRepeat).toStrictEqual({ command: 'cd /x && npm test', runs: 4 });
    expect(result.families).toStrictEqual({
      land: 2,
      ci: 2,
      server: 6,
      buildTest: 8,
      search: 2,
    });
  });

  it('shortens a long repeated command', () => {
    const command = `echo ${'y'.repeat(200)}`;
    const result = measure([
      call('b1', 'Bash', { command }),
      call('b2', 'Bash', { command }),
      call('b3', 'Bash', { command }),
    ]);
    expect(result.topRepeat?.command).toHaveLength(120);
    expect(result.topRepeat?.command.endsWith('...')).toBe(true);
  });

  it('counts big results, errors and denials', () => {
    const big = 'z'.repeat(BIG_RESULT_CHARS + 1);
    const result = measure([
      userPrompt('u0', 0, 'plain text prompt'),
      toolResult('u1', 0, [
        { toolUseId: 't1', text: big },
        { toolUseId: 't2', text: [{ type: 'text', text: big }, { type: 'image' }] },
        { toolUseId: 't3', text: 'z'.repeat(BIG_RESULT_CHARS) },
        { toolUseId: 't4', text: 'Exit code 1', isError: true },
        {
          toolUseId: 't5',
          text: "The user doesn't want to proceed with this tool use.",
          isError: true,
        },
        {
          toolUseId: 't6',
          text: [{ type: 'text', text: 'Denied by the Claude Code auto mode classifier.' }],
          isError: true,
        },
        { toolUseId: 't7', text: 'Permission to use Bash has been denied.', isError: true },
      ]),
      userPrompt('u2', 0, 'see', { message: { role: 'user', content: [text('mixed')] } }),
    ]);
    expect(result.bigResults).toBe(2);
    expect(result.toolErrors).toBe(4);
    expect(result.denials).toBe(3);
  });

  it('adds up subagent requests, premium models and cost', () => {
    const sub = lines([
      assistant({
        uuid: 's1',
        at: 0,
        messageId: 'x1',
        content: [],
        usage: usage({ output: 1000 }),
      }),
      assistant({
        uuid: 's2',
        at: 0,
        messageId: 'x1',
        content: [],
        usage: usage({ output: 1000 }),
      }),
      assistant({
        uuid: 's3',
        at: 0,
        messageId: 'x2',
        content: [],
        model: 'claude-haiku-5-5',
        usage: usage({ output: 1000 }),
      }),
      assistant({
        uuid: 's4',
        at: 0,
        messageId: 'x3',
        content: [],
        model: 'odd',
        usage: usage({}),
      }),
      assistant({ uuid: 's5', at: 0, messageId: 'x4', content: [], usage: null }),
      userPrompt('u1', 0, 'go'),
    ]);
    const result = measure([], { subagents: [[...sub, 'not json'], []] });
    expect(result.subagentRequests).toBe(3);
    expect(result.premiumSubagentRequests).toBe(1);
    expect(result.subagentUsd).toBeCloseTo((1000 * 20 + 1000 * 0.5) / 1_000_000);
  });

  it('splits spend by clock hour into what each habit could save', () => {
    const subagent = lines([
      assistant({
        uuid: 's1',
        at: 30 * MINUTE,
        messageId: 'x1',
        content: [],
        usage: usage({ output: 1000 }),
      }),
    ]);
    const result = measure(
      [
        assistant({
          uuid: 'a1',
          at: 0,
          messageId: 'm1',
          content: [],
          usage: usage({ input: 50_000 }),
        }),
        assistant({
          uuid: 'a2',
          at: HOUR + MINUTE,
          messageId: 'm2',
          content: [],
          model: 'claude-sonnet-5-5',
          usage: usage({ cacheRead: 200_000 }),
        }),
      ],
      { subagents: [subagent] },
    );
    // T0 starts an hour, so the hours count from it.
    const rounded = result.hours.map((hour) =>
      Object.fromEntries(
        Object.entries({ ...hour, at: hour.at - T0 }).map(([key, value]) => [
          key,
          Math.round(value * 1e6) / 1e6,
        ]),
      ),
    );
    expect(rounded).toStrictEqual([
      {
        at: 0,
        usd: 0.22,
        subagentUsd: 0.02,
        premiumUsd: 0.2,
        premiumSavingUsd: 0.1,
        subagentSavingUsd: 0.01,
        bigContextUsd: 0,
        idleRewriteUsd: 0,
      },
      {
        at: HOUR,
        usd: 0.04,
        subagentUsd: 0,
        premiumUsd: 0,
        premiumSavingUsd: 0,
        subagentSavingUsd: 0,
        bigContextUsd: 0.02,
        idleRewriteUsd: 0,
      },
    ]);
  });

  it('uses the price table it is given', () => {
    const result = measure(
      [
        assistant({
          uuid: 'a1',
          at: 0,
          messageId: 'm1',
          content: [],
          usage: usage({ output: 1_000_000 }),
        }),
      ],
      { prices: { 'claude-opus-5-5': { input: 0, output: 1, cacheRead: 0, cacheWrite: 0 } } },
    );
    expect(result.cost.output).toBe(1);
  });
});
