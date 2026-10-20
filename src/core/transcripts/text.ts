// Text helpers for transcript records.

import type { ToolResultContent } from './schemas.js';

/** The text parts of a tool result, joined by newlines. Images and documents are skipped. */
export function resultText(content: ToolResultContent): string {
  if (typeof content === 'string') {
    return content;
  }
  const parts: string[] = [];
  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text);
    }
  }
  return parts.join('\n');
}
