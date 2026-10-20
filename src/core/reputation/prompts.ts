// Pulls the prompts a person typed out of transcript lines and history lines.
// Transcripts also hold tool results, command output, notices from background
// tasks, messages from other agents and summaries Claude Code writes itself,
// all as "user" records, so most of the work here is leaving those out.
// Checked against Claude Code 2.1.260 through 2.1.301.

import { createHash } from 'node:crypto';

import { z } from 'zod';

export interface Prompt {
  /** Stable across rescans, so a prompt is counted once. */
  readonly id: string;
  readonly sessionId: string;
  readonly at: number;
  readonly text: string;
}

const TRANSCRIPT_PREFIX = 't:';
export const HISTORY_PREFIX = 'h:';

const looseString = z.string().nullish().catch(null);
const looseBoolean = z.boolean().nullish().catch(null);
const origin = z.object({ kind: z.string() }).nullish().catch(null);

const block = z.object({ type: z.string(), text: z.string().nullish().catch(null) });

const userSchema = z.object({
  type: z.literal('user'),
  uuid: looseString,
  timestamp: looseString,
  isMeta: looseBoolean,
  isCompactSummary: looseBoolean,
  isSidechain: looseBoolean,
  entrypoint: looseString,
  origin,
  message: z.object({ content: z.union([z.string(), z.array(block)]) }),
});

const queuedSchema = z.object({
  type: z.literal('attachment'),
  uuid: looseString,
  timestamp: looseString,
  attachment: z.object({
    type: z.literal('queued_command'),
    prompt: z.string(),
    commandMode: looseString,
    isMeta: looseBoolean,
    origin,
  }),
});

const recordSchema = z.discriminatedUnion('type', [userSchema, queuedSchema]);

type UserLine = z.infer<typeof userSchema>;
type QueuedLine = z.infer<typeof queuedSchema>;

const historySchema = z.object({
  display: z.string(),
  timestamp: z.number(),
  sessionId: z.string().min(1),
});

/** Text Claude Code writes into user records itself. */
const MACHINE_PREFIXES: readonly string[] = [
  '<command-',
  '<local-command-',
  '<bash-',
  '<task-notification>',
  '<agent-message',
  '<user-prompt-submit-hook>',
  '[Request interrupted',
  '[Subagent hand-back]',
  'Caveat: The messages below',
  'This session is being continued from a previous conversation',
  'Another Claude session sent a message',
  'The app was quit while you were working',
];

const MACHINE_MARKERS: readonly string[] = ['<task-notification>', '<agent-message'];

const REMINDER = /<system-reminder>.*?(?:<\/system-reminder>|$)/gsu;

/** Prompt text with system reminders removed, or null when nothing a person typed is left. */
export function typedText(raw: string): string | null {
  const text = raw.replaceAll(REMINDER, '').trim();
  if (text === '') {
    return null;
  }
  const machine =
    MACHINE_PREFIXES.some((prefix) => text.startsWith(prefix)) ||
    MACHINE_MARKERS.some((marker) => text.includes(marker));
  return machine ? null : text;
}

function parseJson(line: string): unknown {
  try {
    const value: unknown = JSON.parse(line);
    return value;
  } catch {
    return null;
  }
}

/** Typed by a person: the human origin when the record says, else not from an SDK run. */
function fromPerson(kind: string | undefined, entrypoint: string | null | undefined): boolean {
  if (kind !== undefined) {
    return kind === 'human';
  }
  return !(entrypoint ?? '').startsWith('sdk');
}

function userText(record: UserLine): string | null {
  const flagged =
    record.isMeta === true || record.isCompactSummary === true || record.isSidechain === true;
  if (flagged || !fromPerson(record.origin?.kind, record.entrypoint)) {
    return null;
  }
  const { content } = record.message;
  if (typeof content === 'string') {
    return content;
  }
  if (content.some((part) => part.type !== 'text')) {
    return null;
  }
  return content.map((part) => part.text ?? '').join('\n');
}

function queuedText(record: QueuedLine): string | null {
  const { attachment } = record;
  const typed =
    attachment.commandMode === 'prompt' &&
    attachment.isMeta !== true &&
    (attachment.origin?.kind ?? 'human') === 'human';
  return typed ? attachment.prompt : null;
}

function shortHash(...parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24);
}

// Most lines are tool results and assistant turns. Skipping them before
// JSON.parse keeps a first scan of hundreds of MB quick. A literal quote in
// a key only appears unescaped, so prompt text cannot fake these.
function worthParsing(line: string): boolean {
  if (line.includes('"queued_command"')) {
    return true;
  }
  return line.includes('"type":"user"') && !line.includes('"tool_use_id"');
}

export interface TranscriptSource {
  readonly sessionId: string;
  /** Used when a record has no valid timestamp. */
  readonly fallbackAt: number;
}

function promptFrom(line: string, source: TranscriptSource): Prompt | null {
  const parsed = recordSchema.safeParse(parseJson(line));
  if (!parsed.success) {
    return null;
  }
  const record = parsed.data;
  const raw = record.type === 'user' ? userText(record) : queuedText(record);
  const text = raw === null ? null : typedText(raw);
  if (text === null) {
    return null;
  }
  const at = Date.parse(record.timestamp ?? '');
  // Forks and resumes copy records with their uuid, so the uuid alone is the key.
  const key = record.uuid ?? shortHash(source.sessionId, record.timestamp ?? '', text);
  return {
    id: `${TRANSCRIPT_PREFIX}${key}`,
    sessionId: source.sessionId,
    at: Number.isNaN(at) ? source.fallbackAt : at,
    text,
  };
}

/** Typed prompts in a main session transcript. */
export function transcriptPrompts(lines: readonly string[], source: TranscriptSource): Prompt[] {
  const prompts: Prompt[] = [];
  for (const line of lines) {
    const prompt = worthParsing(line) ? promptFrom(line, source) : null;
    if (prompt !== null) {
      prompts.push(prompt);
    }
  }
  return prompts;
}

const PASTED = /\[Pasted text #[^\]]*\]/gu;

/**
 * Typed prompts in ~/.claude/history.jsonl, which keeps what was typed after
 * the transcripts are cleaned up. Slash commands and shell lines are left out,
 * as they are in transcripts, and so are lines with no session id.
 */
export function historyPrompts(lines: readonly string[]): Prompt[] {
  const prompts: Prompt[] = [];
  for (const line of lines) {
    const parsed = historySchema.safeParse(parseJson(line));
    const entry = parsed.success ? parsed.data : null;
    const text = entry?.display.replaceAll(PASTED, ' ').trim() ?? '';
    if (entry !== null && text !== '' && !text.startsWith('/') && !text.startsWith('!')) {
      prompts.push({
        id: `${HISTORY_PREFIX}${shortHash(entry.sessionId, String(entry.timestamp), entry.display)}`,
        sessionId: entry.sessionId,
        at: entry.timestamp,
        text,
      });
    }
  }
  return prompts;
}
