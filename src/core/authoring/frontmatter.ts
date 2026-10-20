// Splits a Markdown file into its YAML frontmatter and body, and joins them
// back. Claude Code only reads frontmatter that starts on the first line.

import { parseDocument, stringify } from 'yaml';

export type FrontmatterParse =
  | {
      readonly ok: true;
      readonly data: Readonly<Record<string, unknown>>;
      readonly body: string;
    }
  | { readonly ok: false; readonly message: string };

const OPEN = /^\uFEFF?---[ \t]*\r?\n/u;
const CLOSE = /^---[ \t]*(?:\r?\n|$)/mu;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drops the one blank line that separates the closing marker from the body. */
function bodyAfter(rest: string): string {
  return rest.replace(/^\r?\n/u, '');
}

/** 1-based line in the whole file for a character offset. */
function fileLine(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

export function parseFrontmatter(text: string): FrontmatterParse {
  const open = OPEN.exec(text);
  if (open === null) {
    return {
      ok: false,
      message: 'The file must start with a "---" line that opens the frontmatter.',
    };
  }
  const afterOpen = text.slice(open[0].length);
  const close = CLOSE.exec(afterOpen);
  if (close === null) {
    return { ok: false, message: 'The frontmatter has no closing "---" line.' };
  }
  const yamlText = afterOpen.slice(0, close.index);
  const document = parseDocument(yamlText, { prettyErrors: false });
  const [firstError] = document.errors;
  if (firstError !== undefined) {
    const line = fileLine(text, open[0].length + firstError.pos[0]);
    return {
      ok: false,
      message: `The frontmatter is not valid YAML (line ${String(line)}): ${firstError.message}`,
    };
  }
  // An empty frontmatter block parses to null, which means no fields.
  const parsed: unknown = document.toJS() ?? {};
  if (!isRecord(parsed)) {
    return { ok: false, message: 'The frontmatter must be a map of field names to values.' };
  }
  return {
    ok: true,
    data: parsed,
    body: bodyAfter(afterOpen.slice(close.index + close[0].length)),
  };
}

/** One trailing newline, or nothing for an empty body. */
export function normalizeBody(body: string): string {
  const trimmed = body.trimEnd();
  return trimmed === '' ? '' : `${trimmed}\n`;
}

export function joinFrontmatter(data: Readonly<Record<string, unknown>>, body: string): string {
  const yamlText = Object.keys(data).length === 0 ? '' : stringify(data, { lineWidth: 0 });
  const normalized = normalizeBody(body);
  return normalized === '' ? `---\n${yamlText}---\n` : `---\n${yamlText}---\n\n${normalized}`;
}
