import { describe, expect, it } from 'vitest';

import type { TranscriptSource } from './prompts.js';
import { historyPrompts, transcriptPrompts, typedText } from './prompts.js';

const SOURCE: TranscriptSource = { sessionId: 's1', fallbackAt: 42 };
const AT = '2026-10-01T12:00:00.000Z';
const AT_MS = Date.parse(AT);

function user(content: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'user',
    uuid: 'u1',
    timestamp: AT,
    sessionId: 's1',
    entrypoint: 'cli',
    origin: { kind: 'human' },
    message: { role: 'user', content },
    ...extra,
  });
}

function queued(attachment: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'attachment',
    uuid: 'q1',
    timestamp: AT,
    attachment: {
      type: 'queued_command',
      prompt: 'typed while busy',
      commandMode: 'prompt',
      origin: { kind: 'human' },
      ...attachment,
    },
    ...extra,
  });
}

function texts(lines: readonly string[]): string[] {
  return transcriptPrompts(lines, SOURCE).map((prompt) => prompt.text);
}

describe('transcriptPrompts', () => {
  it('reads a typed prompt with its uuid and time', () => {
    expect(transcriptPrompts([user('fix it')], SOURCE)).toStrictEqual([
      { id: 't:u1', sessionId: 's1', at: AT_MS, text: 'fix it' },
    ]);
  });

  it('joins text blocks and skips blocks that are not text', () => {
    expect(
      texts([
        user([
          { type: 'text', text: 'one' },
          { type: 'text', text: 'two' },
        ]),
      ]),
    ).toStrictEqual(['one\ntwo']);
    expect(texts([user([{ type: 'text', text: 'one' }, { type: 'text' }])])).toStrictEqual(['one']);
    expect(
      texts([
        user([
          { type: 'image', source: {} },
          { type: 'text', text: 'see' },
        ]),
      ]),
    ).toStrictEqual([]);
  });

  it('skips tool results even when they slip past the line filter', () => {
    const result = JSON.stringify({
      type: 'user',
      uuid: 'r',
      timestamp: AT,
      message: { content: [{ type: 'tool_result', content: 'out' }] },
    });
    expect(texts([result])).toStrictEqual([]);
    expect(
      texts([user([{ type: 'tool_result', tool_use_id: 'x', content: 'out' }])]),
    ).toStrictEqual([]);
  });

  it('keeps only human origins and, without an origin, anything not from the SDK', () => {
    expect(texts([user('a', { origin: { kind: 'peer' } })])).toStrictEqual([]);
    expect(texts([user('a', { origin: { kind: 'task-notification' } })])).toStrictEqual([]);
    expect(texts([user('a', { origin: null })])).toStrictEqual(['a']);
    expect(texts([user('a', { origin: null, entrypoint: 'sdk-cli' })])).toStrictEqual([]);
    expect(texts([user('a', { origin: null, entrypoint: 'sdk-ts' })])).toStrictEqual([]);
    expect(texts([user('a', { origin: null, entrypoint: null })])).toStrictEqual(['a']);
    expect(texts([user('a', { entrypoint: 'sdk-cli' })])).toStrictEqual(['a']);
  });

  it('skips meta, compact summary and sidechain records', () => {
    expect(texts([user('a', { isMeta: true })])).toStrictEqual([]);
    expect(texts([user('a', { isCompactSummary: true })])).toStrictEqual([]);
    expect(texts([user('a', { isSidechain: true })])).toStrictEqual([]);
    expect(texts([user('a', { isMeta: false, isSidechain: false })])).toStrictEqual(['a']);
  });

  it('reads queued prompts typed while Claude was busy', () => {
    expect(transcriptPrompts([queued({})], SOURCE)).toStrictEqual([
      { id: 't:q1', sessionId: 's1', at: AT_MS, text: 'typed while busy' },
    ]);
    expect(texts([queued({ origin: null })])).toStrictEqual(['typed while busy']);
    expect(texts([queued({ commandMode: 'task-notification' })])).toStrictEqual([]);
    expect(texts([queued({ isMeta: true })])).toStrictEqual([]);
    expect(texts([queued({ origin: { kind: 'peer' } })])).toStrictEqual([]);
  });

  it('skips machine text', () => {
    expect(texts([user('<command-name>/clear</command-name>')])).toStrictEqual([]);
    expect(texts([user('  <task-notification>x</task-notification>')])).toStrictEqual([]);
    expect(texts([user('note <agent-message from="a">x</agent-message>')])).toStrictEqual([]);
    expect(texts([user('<system-reminder>x</system-reminder>  ')])).toStrictEqual([]);
  });

  it('uses a hash id without a uuid and the fallback time without a timestamp', () => {
    const [first] = transcriptPrompts([user('a', { uuid: null, timestamp: 'bad' })], SOURCE);
    expect(first?.id).toMatch(/^t:[0-9a-f]{24}$/u);
    expect(first?.at).toBe(42);
    const [again] = transcriptPrompts([user('a', { uuid: null, timestamp: 'bad' })], SOURCE);
    expect(again?.id).toBe(first?.id);
    const [other] = transcriptPrompts([user('b', { uuid: null, timestamp: 'bad' })], SOURCE);
    expect(other?.id).not.toBe(first?.id);
    const [bare] = transcriptPrompts([user('a', { uuid: null, timestamp: null })], SOURCE);
    expect(bare?.id).toMatch(/^t:[0-9a-f]{24}$/u);
    expect(bare?.id).not.toBe(first?.id);
    const [noTime] = transcriptPrompts([user('a', { timestamp: null })], SOURCE);
    expect(noTime?.at).toBe(42);
  });

  it('ignores lines it cannot use', () => {
    const spaced = JSON.stringify({ type: 'user', uuid: 'x', message: { content: 'a' } }, null, 1);
    expect(
      texts([
        '',
        'not json {"type":"user"}',
        '{"type":"user"}',
        JSON.stringify({ type: 'assistant', message: { content: 'a' } }),
        spaced.replaceAll('\n', ''),
        user('has "tool_use_id" in a key').replace('"origin"', '"tool_use_id":1,"origin"'),
        JSON.stringify({ type: 'attachment', attachment: { type: 'queued_command' } }),
      ]),
    ).toStrictEqual([]);
  });
});

describe('typedText', () => {
  it('drops reminders and keeps the rest', () => {
    expect(typedText('<system-reminder>x</system-reminder>\nfix it ')).toBe('fix it');
    expect(typedText('fix it <system-reminder>x')).toBe('fix it');
    expect(
      typedText('a<system-reminder>x</system-reminder>b<system-reminder>y</system-reminder>c'),
    ).toBe('abc');
    expect(typedText(' '.repeat(3))).toBeNull();
  });

  it('knows the text Claude Code writes itself', () => {
    const machine = [
      '<command-message>x',
      '<local-command-stdout>x',
      '<bash-input>ls',
      '<bash-stdout>x',
      '<task-notification>x',
      '<agent-message from="a">',
      '<user-prompt-submit-hook>x',
      '[Request interrupted by user]',
      '[Subagent hand-back] done',
      'Caveat: The messages below were generated by the user while running local commands.',
      'This session is being continued from a previous conversation that ran out of context.',
      'Another Claude session sent a message:',
      'The app was quit while you were working. Please continue.',
      'please read <task-notification> above',
      'see <agent-message here',
    ];
    for (const text of machine) {
      expect(typedText(text)).toBeNull();
    }
    expect(typedText('why <command- here')).toBe('why <command- here');
    expect(typedText('I see [Request interrupted')).toBe('I see [Request interrupted');
  });
});

function line(display: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    display,
    pastedContents: {},
    timestamp: 1000,
    project: '/work',
    sessionId: 's9',
    ...extra,
  });
}

describe('historyPrompts', () => {
  it('reads typed lines with a stable hash id', () => {
    const [first] = historyPrompts([line('fix it')]);
    expect(first?.id).toMatch(/^h:[0-9a-f]{24}$/u);
    expect(first).toStrictEqual({ id: first?.id, sessionId: 's9', at: 1000, text: 'fix it' });
    expect(historyPrompts([line('fix it')])[0]?.id).toBe(first?.id);
    expect(historyPrompts([line('fix it', { timestamp: 1001 })])[0]?.id).not.toBe(first?.id);
    expect(historyPrompts([line('fix it', { sessionId: 's8' })])[0]?.id).not.toBe(first?.id);
    expect(historyPrompts([line('fix it!')])[0]?.id).not.toBe(first?.id);
  });

  it('keeps the id parts apart, so moving characters between them changes the id', () => {
    const joined = historyPrompts([line('x', { sessionId: 's9', timestamp: 1000 })])[0]?.id;
    const moved = historyPrompts([line('x', { sessionId: 's9100', timestamp: 0 })])[0]?.id;
    expect(joined).not.toBe(moved);
  });

  it('drops pasted text markers and skips commands, shell lines and empty lines', () => {
    expect(historyPrompts([line('look [Pasted text #1 +20 lines] here')])[0]?.text).toBe(
      'look   here',
    );
    expect(
      historyPrompts([
        line('/agents '),
        line('!ls'),
        line('  '),
        line('[Pasted text #2]'),
        line('x', { sessionId: '' }),
        line('x', { sessionId: null }),
        line('x', { timestamp: 'soon' }),
        'not json',
      ]),
    ).toStrictEqual([]);
  });
});
