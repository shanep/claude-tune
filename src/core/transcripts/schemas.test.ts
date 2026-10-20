import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseTimestamp, parseTranscriptLine } from './schemas.js';
import {
  assistant,
  attachment,
  iso,
  system,
  T0,
  text,
  thinking,
  toolResult,
  toolUse,
  usage,
  userPrompt,
} from './test-helpers/fixtures.js';

function parse(record: unknown): ReturnType<typeof parseTranscriptLine> {
  return parseTranscriptLine(JSON.stringify(record));
}

describe('parseTranscriptLine', () => {
  it('returns null for blank, invalid and non-object lines', () => {
    expect(parseTranscriptLine('')).toBeNull();
    expect(parseTranscriptLine('   \t')).toBeNull();
    expect(parseTranscriptLine('{not json')).toBeNull();
    expect(parseTranscriptLine('42')).toBeNull();
    expect(parseTranscriptLine('null')).toBeNull();
    expect(parseTranscriptLine('[1,2]')).toBeNull();
    expect(parseTranscriptLine('"user"')).toBeNull();
  });

  it('returns null for record types it does not read', () => {
    expect(parse({ type: 'file-history-snapshot', snapshot: {} })).toBeNull();
    expect(parse({ type: 'mode', mode: 'normal' })).toBeNull();
    expect(parse({ type: 'api-request', id: 'x' })).toBeNull();
    expect(parse({ notype: true })).toBeNull();
  });

  it('returns null for unknown attachment subtypes and broken known ones', () => {
    expect(parse(attachment('a1', 0, { type: 'date', date: 'today' }))).toBeNull();
    expect(parse(attachment('a1', 0, { type: 'instructions', files: 'nope' }))).toBeNull();
    expect(parse(attachment('a1', 0, { type: 'model', identity: {} }))).toBeNull();
  });

  it('parses a user prompt with its base fields', () => {
    const record = parse(userPrompt('u1', 5, 'hello', { permissionMode: 'plan', isMeta: true }));
    expect(record).toStrictEqual({
      type: 'user',
      uuid: 'u1',
      timestamp: iso(5),
      sessionId: 'sess-0001',
      cwd: '/work/demo',
      gitBranch: 'main',
      version: '2.1.301',
      entrypoint: 'cli',
      isSidechain: false,
      isMeta: true,
      permissionMode: 'plan',
      message: { content: 'hello' },
    });
  });

  it('keeps tool results, their error flag and the async launch status', () => {
    const record = parse(
      toolResult(
        'u2',
        0,
        [
          { toolUseId: 't1', text: 'done', isError: true },
          {
            toolUseId: 't2',
            text: [{ type: 'text', text: 'a' }, { type: 'image', source: {} }, 7],
          },
        ],
        { toolUseResult: { status: 'async_launched', agentId: 'x' } },
      ),
    );
    expect(record?.type).toBe('user');
    if (record?.type !== 'user') {
      return;
    }
    expect(record.toolUseResult).toStrictEqual({ status: 'async_launched' });
    expect(record.message.content).toStrictEqual([
      { type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'done' },
      {
        type: 'tool_result',
        tool_use_id: 't2',
        is_error: false,
        content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'other', text: null }],
      },
    ]);
  });

  it('turns odd values into neutral ones instead of failing', () => {
    const record = parse({
      ...userPrompt('u3', 0, 'x'),
      gitBranch: 42,
      isMeta: 'yes',
      toolUseResult: 'Error: denied',
      message: { content: { weird: true } },
    });
    expect(record).toMatchObject({
      type: 'user',
      gitBranch: null,
      isMeta: null,
      toolUseResult: null,
      message: { content: '' },
    });
  });

  it('parses assistant records with usage and content blocks', () => {
    const record = parse(
      assistant({
        uuid: 'a1',
        at: 0,
        messageId: 'msg_1',
        stop: 'tool_use',
        usage: usage({ input: 3, output: 4, cacheRead: 5, cacheCreation: 6, thinking: 2 }),
        content: [
          thinking('hmm'),
          text('hi'),
          toolUse('t1', 'Bash', { command: 'ls' }),
          { type: 'server_tool_use', id: 's' },
          { type: 'text' },
        ],
      }),
    );
    expect(record).toMatchObject({
      type: 'assistant',
      requestId: 'req-msg_1',
      effort: 'high',
      message: {
        id: 'msg_1',
        model: 'claude-opus-5-5',
        stop_reason: 'tool_use',
        usage: {
          input_tokens: 3,
          output_tokens: 4,
          cache_read_input_tokens: 5,
          cache_creation_input_tokens: 6,
          output_tokens_details: { thinking_tokens: 2 },
        },
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'hi' },
          { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
          { type: 'other' },
          { type: 'other' },
        ],
      },
    });
  });

  it('defaults broken usage numbers to zero and a missing model to unknown', () => {
    const record = parse({
      type: 'assistant',
      message: { id: 'm', usage: { input_tokens: -1, output_tokens: 'x' }, content: 'oops' },
    });
    expect(record).toMatchObject({
      type: 'assistant',
      message: {
        id: 'm',
        model: 'unknown',
        content: [],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
  });

  it('rejects an assistant record without a message id', () => {
    expect(parse({ type: 'assistant', message: { content: [] } })).toBeNull();
  });

  it('parses system records', () => {
    expect(
      parse(system('s1', 0, { subtype: 'compact_boundary', content: 'Compacted' })),
    ).toMatchObject({
      type: 'system',
      subtype: 'compact_boundary',
      content: 'Compacted',
    });
  });

  it('parses the small marker records', () => {
    expect(
      parse({ type: 'permission-mode', permissionMode: 'auto', sessionId: 's' }),
    ).toStrictEqual({
      type: 'permission-mode',
      permissionMode: 'auto',
    });
    expect(parse({ type: 'ai-title', aiTitle: 'Fix the bug' })).toStrictEqual({
      type: 'ai-title',
      aiTitle: 'Fix the bug',
    });
    expect(parse({ type: 'custom-title', customTitle: 'Mine' })).toStrictEqual({
      type: 'custom-title',
      customTitle: 'Mine',
    });
    expect(parse({ type: 'last-prompt', leafUuid: 'x' })).toStrictEqual({
      type: 'last-prompt',
      lastPrompt: '',
    });
  });

  it('parses every attachment subtype it reads', () => {
    const bodies = [
      { type: 'instructions', files: [{ path: '/a/CLAUDE.md', type: 'User', content: 'x' }] },
      {
        type: 'nested_memory',
        path: '/p/CLAUDE.md',
        displayPath: 'p/CLAUDE.md',
        content: {
          path: '/p/CLAUDE.md',
          type: 'Project',
          content: 'y',
          contentDiffersFromDisk: true,
        },
      },
      { type: 'prompt_snapshot', systemPrompt: ['one', 'two'] },
      { type: 'skill_listing', names: ['a'], content: '- a: does a', skillCount: 1 },
      { type: 'invoked_skills', skills: [{ name: 'a', path: 'userSettings:a', content: 'z' }] },
      {
        type: 'mcp_instructions_delta',
        addedNames: ['m'],
        addedBlocks: ['## m\nuse m'],
        removedNames: [],
      },
      { type: 'deferred_tools_delta', addedNames: ['T'], addedLines: ['T'], removedNames: [] },
      { type: 'agent_listing_delta', addedTypes: ['Explore'], removedTypes: [] },
      { type: 'environment', snapshot: { platform: 'darwin' } },
      { type: 'model', identity: { modelId: 'claude-opus-5-5', marketingName: 'Opus' } },
      { type: 'queued_command', prompt: 'later' },
    ];
    for (const body of bodies) {
      const record = parse(attachment('x', 0, body));
      expect(record?.type).toBe('attachment');
      expect(record?.type === 'attachment' ? record.attachment.type : null).toBe(body.type);
    }
  });

  it('fills defaults for optional attachment fields', () => {
    expect(parse(attachment('x', 0, { type: 'instructions', files: [] }))).toMatchObject({
      attachment: { type: 'instructions', files: [], removed: [] },
    });
    expect(
      parse(attachment('x', 0, { type: 'instructions', files: [], reason: 7, removed: 'no' })),
    ).toMatchObject({
      attachment: { type: 'instructions', files: [], removed: [], reason: null },
    });
    expect(
      parse(attachment('x', 0, { type: 'nested_memory', path: '/q', content: { type: 'Local' } })),
    ).toMatchObject({
      attachment: {
        type: 'nested_memory',
        path: '/q',
        content: { type: 'Local', content: '' },
      },
    });
    expect(
      parse(attachment('x', 0, { type: 'queued_command', prompt: { text: 'x' } })),
    ).toMatchObject({
      attachment: { type: 'queued_command', prompt: '' },
    });
  });

  it('never throws on arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (line) => {
        const record = parseTranscriptLine(line);
        expect(record === null || typeof record.type === 'string').toBe(true);
      }),
    );
  });

  it('never throws on arbitrary JSON values with a known type', () => {
    const types = ['user', 'assistant', 'system', 'attachment', 'ai-title', 'permission-mode'];
    fc.assert(
      fc.property(
        fc.constantFrom(...types),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (type, rest) => {
          const record = parseTranscriptLine(JSON.stringify({ ...rest, type }));
          expect(record === null || record.type === type).toBe(true);
        },
      ),
    );
  });

  it('round-trips any user prompt text', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const record = parse(userPrompt('u', 0, value));
        expect(record?.type === 'user' ? record.message.content : null).toBe(value);
      }),
    );
  });
});

describe('parseTimestamp', () => {
  it('parses ISO strings and rejects the rest', () => {
    expect(parseTimestamp(iso(1500))).toBe(T0 + 1500);
    expect(parseTimestamp('not a date')).toBeNull();
    expect(parseTimestamp(null)).toBeNull();
    const absent: { readonly value?: string } = {};
    expect(parseTimestamp(absent.value)).toBeNull();
  });
});
