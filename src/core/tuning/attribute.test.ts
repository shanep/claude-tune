import { describe, expect, it } from 'vitest';

import { isPlainObject } from '../knobs/json.js';
import { DEFAULT_PRICES } from '../transcripts/pricing.js';
import {
  assistant,
  attachment,
  system,
  text,
  toolResult,
  toolUse,
  usage,
  userPrompt,
} from '../transcripts/test-helpers/fixtures.js';

import { attribute } from './attribute.js';
import { addSpend, CHARS_PER_TOKEN, SPEND_SOURCES, skillName, zeroSpend } from './spend.js';

type Fields = Readonly<Record<string, unknown>>;

function lines(records: readonly Fields[]): string[] {
  return records.map((record) => JSON.stringify(record));
}

/** One request on Opus 5.5 that read `cacheRead` tokens of context. */
function request(id: string, cacheRead: number, content: readonly Fields[] = []): Fields {
  return assistant({
    uuid: `a-${id}`,
    at: 0,
    messageId: id,
    content,
    usage: usage({ cacheRead }),
  });
}

function total(spend: Readonly<Record<string, number>>): number {
  return Object.values(spend).reduce((sum, value) => sum + value, 0);
}

const FILE = 'x'.repeat(36_000);
const FILE_TOKENS = FILE.length / CHARS_PER_TOKEN;

describe('attribute', () => {
  it('charges setup for the first request and a file for every request it stays in context', () => {
    const result = attribute(
      lines([
        request('r1', 10_000, [toolUse('t1', 'Read', { file_path: '/work/demo/src/app.ts' })]),
        toolResult('u1', 1, [{ toolUseId: 't1', text: FILE }]),
        request('r2', 10_000 + FILE_TOKENS),
        request('r3', 10_000 + FILE_TOKENS),
      ]),
      DEFAULT_PRICES,
    );
    const perRequest = (FILE_TOKENS * 0.2) / 1_000_000;
    expect(result.spend.fileReads + result.spend.toolInputs).toBeCloseTo(2 * perRequest, 9);
    expect(result.spend.fileReads).toBeGreaterThan(2 * perRequest * 0.99);
    expect(total(result.spend)).toBeCloseTo(((30_000 + 2 * FILE_TOKENS) * 0.2) / 1_000_000, 9);
    expect(result.files).toStrictEqual({ '/work/demo/src/app.ts': result.spend.fileReads });
    expect(result.heavy[0]).toMatchObject({
      source: 'fileReads',
      label: 'Read /work/demo/src/app.ts',
      tokens: 10_000,
    });
    expect(result.toolUses).toStrictEqual({ Read: 1 });
  });

  it('stops charging what a compaction dropped', () => {
    const result = attribute(
      lines([
        request('r1', 1000, [toolUse('t1', 'Bash', { command: 'cat a.ts b.ts' })]),
        toolResult('u1', 1, [{ toolUseId: 't1', text: FILE }]),
        request('r2', 1000 + FILE_TOKENS),
        system('s1', 2, { subtype: 'compact_boundary' }),
        request('r3', 1000),
        request('r4', 1000),
      ]),
      DEFAULT_PRICES,
    );
    const charged = result.spend.fileReads;
    expect(charged).toBeGreaterThan(0);
    expect(
      Object.keys(result.files).toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual(['a.ts', 'b.ts']);
    expect(result.spend.setup).toBeCloseTo((4 * 1000 * 0.2) / 1_000_000, 9);
    expect(
      result.heavy.map((item) => item.label).toSorted((left, right) => left.localeCompare(right)),
    ).toStrictEqual(['Bash a.ts', 'Bash b.ts', 'Bash cat a.ts b.ts']);
  });

  it('sorts skills, instructions, reminders, prompts and output into their own sources', () => {
    const result = attribute(
      lines([
        request('r1', 5000),
        userPrompt('p1', 1, 'Fix the login bug'),
        userPrompt(
          'p2',
          2,
          'Base directory for this skill: /home/me/.claude/skills/voice\n\nBody',
          {
            isMeta: true,
          },
        ),
        userPrompt(
          'p3',
          3,
          '<system-reminder>Contents of /home/me/CLAUDE.md: rules</system-reminder>',
          {
            isMeta: true,
          },
        ),
        {
          ...attachment('t1', 4, {
            type: 'hook_additional_context',
            content: ['claude-tune says hi'],
            hookName: 'SessionStart',
          }),
        },
        {
          ...attachment('t2', 5, { type: 'skill_listing' }),
          rendered: [{ content: 'skills: a, b' }],
        },
        assistant({
          uuid: 'a2',
          at: 6,
          messageId: 'r2',
          content: [text('Done.'), toolUse('t9', 'WebFetch', { url: 'https://example.com' })],
          usage: usage({ cacheRead: 6000, output: 1000 }),
        }),
        toolResult('u9', 7, [{ toolUseId: 't9', text: 'page text' }]),
        request('r3', 6100),
      ]),
      DEFAULT_PRICES,
    );
    for (const source of [
      'skills',
      'instructions',
      'reminders',
      'conversation',
      'web',
      'output',
    ] as const) {
      expect([source, result.spend[source] > 0]).toStrictEqual([source, true]);
    }
    expect(Object.keys(result.skills)).toStrictEqual(['/home/me/.claude/skills/voice']);
    expect(result.spend.output).toBeCloseTo((1000 * 20) / 1_000_000, 9);
  });

  it('splits setup between tool definitions by size when the request shape is logged', () => {
    const result = attribute(
      [
        JSON.stringify({
          type: 'api-request-shape',
          shape: {
            system: [{ type: 'text', text: 'You are Claude Code.' }],
            tools: [
              { name: 'Big', d: 'x'.repeat(900) },
              { name: 'Small', d: 'x' },
            ],
          },
        }),
        ...lines([request('r1', 10_000), request('r2', 10_000)]),
        'not json',
      ],
      DEFAULT_PRICES,
    );
    const big = result.toolSchemas['Big'] ?? 0;
    const small = result.toolSchemas['Small'] ?? 0;
    expect(big).toBeGreaterThan(small * 30);
    expect(big + small).toBeLessThan(result.spend.setup);
  });

  it('adds spend splits and names skills by folder', () => {
    const one = { ...zeroSpend(), setup: 1 };
    expect(addSpend(one, one).setup).toBe(2);
    expect(SPEND_SOURCES).toHaveLength(11);
    expect(skillName('/home/me/.claude/skills/voice/')).toBe('voice');
  });
});

/** An assistant record with exactly this usage on Opus 5.5. */
function exact(
  id: string,
  spec: Parameters<typeof usage>[0],
  content: readonly Fields[] = [],
  model: string | null = 'claude-opus-5-5',
): Fields {
  const record = assistant({ uuid: `a-${id}`, at: 0, messageId: id, content, usage: usage(spec) });
  const message = record['message'];
  if (!isPlainObject(message)) {
    throw new Error('no message');
  }
  return { ...record, message: { ...message, model: model ?? undefined } };
}

const PROMPT = 'p'.repeat(3600);

describe('attribute, to the cent', () => {
  it('splits each request between setup and what was in context, by size', () => {
    const result = attribute(
      lines([
        exact('r1', { input: 1000, cacheRead: 2000, cacheCreation: 7000, output: 50 }),
        userPrompt('p1', 1, PROMPT),
        exact('r2', { cacheRead: 11_000 }),
      ]),
      DEFAULT_PRICES,
    );
    // r1: 1000 * $4 + 2000 * $0.2 + 7000 * $5 per million, all setup. r2: $0.0022, a tenth of it the prompt.
    expect(result.spend.setup).toBeCloseTo(0.0394 + 0.002, 12);
    expect(result.spend.conversation).toBeCloseTo(0.0002, 12);
    expect(result.spend.output).toBeCloseTo(0.001, 12);
    expect(result.heavy).toStrictEqual([
      {
        source: 'conversation',
        label: 'prompt',
        tokens: 1000,
        usd: expect.closeTo(0.0002, 12) as number,
      },
    ]);
  });

  it('measures setup from the first request, less what was already in context', () => {
    const result = attribute(
      lines([userPrompt('p1', 0, PROMPT), exact('r1', { cacheRead: 10_000 })]),
      DEFAULT_PRICES,
    );
    expect(result.spend.setup).toBeCloseTo(0.0018, 12);
    expect(result.spend.conversation).toBeCloseTo(0.0002, 12);
  });

  it('waits for a request with context before measuring setup, and counts each request once', () => {
    const result = attribute(
      lines([
        exact('r0', { output: 10 }),
        exact('r0', { output: 10 }),
        userPrompt('p1', 0, PROMPT),
        exact('r1', { cacheRead: 2000 }),
        exact('r1', { cacheRead: 2000 }),
        exact('r2', { cacheRead: 3000 }),
      ]),
      DEFAULT_PRICES,
    );
    expect(result.spend.output).toBeCloseTo(0.0002, 12);
    // r1 sets setup at 1000 tokens, so the prompt is half of r1 and two thirds of r2.
    expect(result.spend.setup).toBeCloseTo(0.0002 + 0.0002, 12);
    expect(result.spend.conversation).toBeCloseTo(0.0002 + 0.0004, 12);
  });

  it('charges nothing for a model it has no price for, or a usage it cannot read', () => {
    const result = attribute(
      lines([
        exact('r1', { cacheRead: 5000 }, [], null),
        exact('r2', { cacheRead: 5000 }, [], 'gpt-5'),
        {
          ...exact('r3', {}),
          message: {
            id: 'r3',
            model: 'claude-opus-5-5',
            content: [],
            usage: { input_tokens: '9' },
          },
        },
      ]),
      DEFAULT_PRICES,
    );
    expect(Object.values(result.spend).every((value) => value === 0)).toBe(true);
  });

  it('keeps the six heaviest pieces, heaviest first', () => {
    const records: Fields[] = [exact('r0', { cacheRead: 1000 })];
    for (const size of [1, 7, 3, 5, 2, 6, 4]) {
      records.push(userPrompt(`p${String(size)}`, 0, 'x'.repeat(size * 360)));
    }
    records.push(exact('r1', { cacheRead: 1000 + 28 * 100 }));
    const result = attribute(lines(records), DEFAULT_PRICES);
    expect(result.heavy.map((item) => item.tokens)).toStrictEqual([700, 600, 500, 400, 300, 200]);
  });

  it('records nothing for a piece that never went out with a request', () => {
    const result = attribute(
      lines([
        exact('r1', { cacheRead: 1000 }, [toolUse('t1', 'Read', { file_path: '/r/a.ts' })]),
        toolResult('u1', 1, [{ toolUseId: 't1', text: FILE }]),
      ]),
      DEFAULT_PRICES,
    );
    expect(result.files).toStrictEqual({});
    expect(result.heavy).toStrictEqual([]);
  });

  it('sorts user text, compaction summaries, results and assistant blocks', () => {
    const result = attribute(
      lines([
        exact('r1', { cacheRead: 1000 }, [
          text('r'.repeat(360)),
          { type: 'thinking', thinking: 't'.repeat(720) },
          { type: 'thinking' },
          toolUse('t1', 'Bash', { command: 'npm test a.ts' }),
          toolUse('t1', 'Bash', { command: 'npm test a.ts' }),
          { type: 'tool_use', id: 't2' },
          { type: 'tool_use', name: 'Read' },
        ]),
        toolResult('u1', 1, [
          { toolUseId: 't1', text: 'o'.repeat(360) },
          { toolUseId: 'missing', text: 'm'.repeat(360) },
        ]),
        userPrompt('m1', 1, 'reminder text', { isMeta: true }),
        {
          ...userPrompt('m2', 1, ''),
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'typed' }, { type: 'text' }, { type: 'image' }],
          },
        },
        exact('r2', { cacheRead: 10_000 }),
      ]),
      DEFAULT_PRICES,
    );
    expect(result.toolUses).toStrictEqual({ Bash: 1, tool: 1 });
    expect(result.files).toStrictEqual({});
    const labels = result.heavy.map((item) => [item.source, item.label]);
    expect(labels).toContainEqual(['conversation', 'thinking']);
    expect(labels).toContainEqual(['conversation', 'reply']);
    expect(labels).toContainEqual(['toolOutput', 'Bash npm test a.ts']);
    expect(labels).toContainEqual(['toolOutput', '?']);
    expect(result.spend.reminders).toBeGreaterThan(0);
    expect(result.spend.toolInputs).toBeGreaterThan(0);
  });

  it('starts over after a compaction summary', () => {
    const result = attribute(
      lines([
        exact('r1', { cacheRead: 1000 }),
        userPrompt('p1', 0, PROMPT),
        { ...userPrompt('c1', 0, 's'.repeat(360)), isCompactSummary: true },
        exact('r2', { cacheRead: 1100 }),
      ]),
      DEFAULT_PRICES,
    );
    expect(result.spend.conversation).toBeCloseTo(0.00002, 12);
    expect(result.heavy.map((item) => item.label)).toStrictEqual(['compact summary']);
  });

  it('splits a cat of several files evenly, and keeps the twelve that cost most', () => {
    const names = Array.from({ length: 13 }, (_, index) => `f${String(index).padStart(2, '0')}.ts`);
    const result = attribute(
      lines([
        exact('r1', { cacheRead: 1000 }, [
          toolUse('t1', 'Bash', { command: `cat ${names.join(' ')}` }),
          toolUse('t2', 'Read', { file_path: '/r/big.ts' }),
        ]),
        toolResult('u1', 1, [
          { toolUseId: 't1', text: 'x'.repeat(13 * 360) },
          { toolUseId: 't2', text: 'y'.repeat(3600) },
        ]),
        exact('r2', { cacheRead: 3000 }),
      ]),
      DEFAULT_PRICES,
    );
    const files = Object.keys(result.files);
    expect(files).toHaveLength(12);
    expect(files[0]).toBe('/r/big.ts');
    expect(result.heavy[0]).toMatchObject({ label: 'Read /r/big.ts', tokens: 1000 });
    expect(result.heavy[1]).toMatchObject({ label: 'Bash f00.ts', tokens: 100 });
  });

  it('splits setup between the system prompt and each named tool', () => {
    const shape = { system: 'x', tools: [{ name: 'A' }, { d: 1 }] };
    const result = attribute(
      [
        JSON.stringify({ type: 'api-request-shape', shape }),
        ...lines([exact('r1', { cacheRead: 15_000 })]),
      ],
      DEFAULT_PRICES,
    );
    // '"x"' is 3 characters and '{"name":"A"}' is 12, so A gets 12 of 15.
    expect(result.toolSchemas).toStrictEqual({ A: expect.closeTo(0.003 * 0.8, 12) as number });
    const bare = attribute(
      [
        JSON.stringify({ type: 'api-request-shape', shape: { tools: [{ name: 'A' }] } }),
        ...lines([exact('r1', { cacheRead: 14_000 })]),
      ],
      DEFAULT_PRICES,
    );
    // No system prompt reads as '""', 2 characters.
    expect(bare.toolSchemas['A']).toBeCloseTo(0.0028 * (12 / 14), 12);
  });
});
