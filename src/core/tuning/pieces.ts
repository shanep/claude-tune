// The pieces a transcript puts in context, sorted by source: what a text
// block, a tool result or an attachment is, and how big.

import type { SpendSource } from '../../shared/tuning.js';
import { isArray, isPlainObject } from '../knobs/json.js';

import { skillName } from './spend.js';

const LABEL_CHARS = 100;
const SKILL_BODY = 'Base directory for this skill:';
const FILE_COMMANDS: ReadonlySet<string> = new Set(['cat', 'head', 'tail', 'nl', 'less', 'bat']);
const PATH_CHARS = /^[\w./~-]+$/u;
const EXTENSION = /^[A-Za-z]\w{0,5}$/u;

export interface Piece {
  readonly source: SpendSource;
  readonly label: string;
  readonly chars: number;
  readonly file: string | null;
  readonly skill: string | null;
}

export function talk(label: string, chars: number): Piece {
  return { source: 'conversation', label, chars, file: null, skill: null };
}

export function oneLine(text: string): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length > LABEL_CHARS ? `${flat.slice(0, LABEL_CHARS - 3)}...` : flat;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function field(value: unknown, key: string): unknown {
  return isPlainObject(value) ? value[key] : undefined;
}

export function textLength(content: unknown): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (!isArray(content)) {
    return 0;
  }
  let total = 0;
  for (const part of content) {
    total += typeof part === 'string' ? part.length : (asString(field(part, 'text'))?.length ?? 0);
  }
  return total;
}

/** The command after a leading "cd somewhere &&", which Claude often adds. */
function afterCd(command: string): string {
  const trimmed = command.trimStart();
  if (!trimmed.startsWith('cd ')) {
    return trimmed;
  }
  const and = trimmed.indexOf('&&');
  const semi = trimmed.indexOf(';');
  const cut = [and, semi].filter((at) => at >= 0).toSorted((left, right) => left - right)[0];
  if (cut === undefined) {
    return '';
  }
  return trimmed.slice(cut + (cut === and ? 2 : 1)).trimStart();
}

/** True for a shell command that prints files, such as cat or sed -n. */
function dumpsFiles(command: string): boolean {
  const [first, second] = afterCd(command).split(/\s+/u);
  return first !== undefined && (FILE_COMMANDS.has(first) || (first === 'sed' && second === '-n'));
}

/** The words of a command that look like file paths, such as src/app.ts. */
export function filesIn(command: string): string[] {
  return command.split(/[\s"&'();<>`|]+/u).filter((word) => {
    const dot = word.lastIndexOf('.');
    return (
      dot > 0 &&
      dot > word.lastIndexOf('/') &&
      PATH_CHARS.test(word) &&
      EXTENSION.test(word.slice(dot + 1))
    );
  });
}

const INSTRUCTION_ATTACHMENTS: ReadonlySet<string> = new Set([
  'instructions',
  'nested_memory',
  'memory',
  'claude_md',
  'relevant_memories',
]);
const SKILL_ATTACHMENTS: ReadonlySet<string> = new Set(['skill_listing', 'invoked_skills']);
const FILE_ATTACHMENTS: ReadonlySet<string> = new Set(['edited_text_file', 'file']);

function attachmentSource(type: string): SpendSource {
  if (INSTRUCTION_ATTACHMENTS.has(type)) {
    return 'instructions';
  }
  if (SKILL_ATTACHMENTS.has(type)) {
    return 'skills';
  }
  return FILE_ATTACHMENTS.has(type) ? 'fileReads' : 'reminders';
}

export function resultSource(tool: string, command: string): SpendSource {
  if (tool === 'Read' || (tool === 'Bash' && dumpsFiles(command))) {
    return 'fileReads';
  }
  if (tool === 'Agent' || tool === 'Task') {
    return 'subagentReports';
  }
  if (tool === 'WebFetch' || tool === 'WebSearch' || tool.startsWith('mcp__')) {
    return 'web';
  }
  return 'toolOutput';
}

export function callDetail(input: unknown): string {
  for (const key of ['file_path', 'command', 'pattern', 'url', 'query', 'skill', 'description']) {
    const value = asString(field(input, key));
    if (value !== null) {
      return value;
    }
  }
  return '';
}

/** A text block of a user message, sorted by what it is. */
export function textPiece(text: string, meta: boolean): Piece {
  if (text.startsWith(SKILL_BODY)) {
    const skill = text.slice(SKILL_BODY.length).trimStart().split(/\s/u, 1)[0] ?? '';
    const label = `skill ${skillName(skill)}`;
    return { source: 'skills', label, chars: text.length, file: null, skill };
  }
  if (text.startsWith('<system-reminder>') && text.includes('Contents of ')) {
    return {
      source: 'instructions',
      label: 'CLAUDE.md',
      chars: text.length,
      file: null,
      skill: null,
    };
  }
  return meta
    ? { source: 'reminders', label: 'reminder', chars: text.length, file: null, skill: null }
    : talk('prompt', text.length);
}

export function attachmentPiece(record: unknown): Piece {
  const attachment = field(record, 'attachment');
  const type = asString(field(attachment, 'type')) ?? 'attachment';
  const rendered = field(record, 'rendered');
  let chars = 0;
  for (const part of isArray(rendered) ? rendered : []) {
    chars += asString(field(part, 'content'))?.length ?? 0;
  }
  if (chars === 0 && type === 'hook_additional_context') {
    chars = textLength(field(attachment, 'content'));
  }
  const label = asString(field(attachment, 'hookName')) ?? type.replaceAll('_', ' ');
  const file = FILE_ATTACHMENTS.has(type) ? asString(field(attachment, 'filename')) : null;
  return { source: attachmentSource(type), label: oneLine(label), chars, file, skill: null };
}
