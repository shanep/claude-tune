// Zod schemas for the Claude Code transcript records /tune reads. The
// format is undocumented and changes between versions, so every field we do
// not strictly need falls back to a neutral value instead of failing the line.
// Checked against Claude Code 2.1.260 through 2.1.301.

import * as z from 'zod/mini';

const looseString = z.catch(z.nullish(z.string()), null);
const looseBoolean = z.catch(z.nullish(z.boolean()), null);
const count = z.catch(z.number().check(z.nonnegative()), 0);
const stringList = z.catch(z.array(z.string()), []);

const baseFields = {
  uuid: looseString,
  timestamp: looseString,
  sessionId: looseString,
  cwd: looseString,
  gitBranch: looseString,
  version: looseString,
  entrypoint: looseString,
  isSidechain: looseBoolean,
  agentId: looseString,
};

const resultPart = z.object({
  type: z.catch(z.string(), 'other'),
  text: looseString,
});

// Typed fallbacks, so an unknown part or block is kept as "other" instead of failing the record.
const OTHER_PART: { type: string; text: null } = { type: 'other', text: null };
const OTHER_BLOCK: { type: 'other' } = { type: 'other' };

const lenientPart = z.catch(resultPart, OTHER_PART);

/** Tool result content is a string or a list of parts (text, image, document and so on). */
const toolResultContentSchema = z.catch(z.union([z.string(), z.array(lenientPart)]), '');

export type ToolResultContent = z.infer<typeof toolResultContentSchema>;

const contentBlockSchema = z.catch(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string() }),
    z.object({ type: z.literal('thinking'), thinking: z.catch(z.string(), '') }),
    z.object({
      type: z.literal('tool_use'),
      id: z.string(),
      name: z.string(),
      input: z.unknown(),
    }),
    z.object({
      type: z.literal('tool_result'),
      tool_use_id: z.string(),
      is_error: looseBoolean,
      content: toolResultContentSchema,
    }),
    z.object({ type: z.literal('other') }),
  ]),
  OTHER_BLOCK,
);

export type ContentBlock = z.infer<typeof contentBlockSchema>;

const usageSchema = z.object({
  input_tokens: count,
  output_tokens: count,
  cache_read_input_tokens: count,
  cache_creation_input_tokens: count,
  output_tokens_details: z.catch(z.nullish(z.object({ thinking_tokens: count })), null),
});

export type RawUsage = z.infer<typeof usageSchema>;

const userRecordSchema = z.object({
  type: z.literal('user'),
  ...baseFields,
  isMeta: looseBoolean,
  isCompactSummary: looseBoolean,
  permissionMode: looseString,
  message: z.object({
    content: z.catch(z.union([z.string(), z.array(contentBlockSchema)]), ''),
  }),
  toolUseResult: z.catch(z.nullish(z.object({ status: looseString })), null),
});

const assistantRecordSchema = z.object({
  type: z.literal('assistant'),
  ...baseFields,
  requestId: looseString,
  effort: looseString,
  message: z.object({
    id: z.string(),
    model: z.catch(z.string(), 'unknown'),
    stop_reason: looseString,
    usage: z.catch(z.nullish(usageSchema), null),
    content: z.catch(z.array(contentBlockSchema), []),
  }),
});

const systemRecordSchema = z.object({
  type: z.literal('system'),
  ...baseFields,
  subtype: looseString,
  content: looseString,
});

const memoryFileSchema = z.object({
  path: z.string(),
  type: z.string(),
  content: z.catch(z.string(), ''),
});

const attachmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('instructions'),
    files: z.array(memoryFileSchema),
    removed: stringList,
    reason: looseString,
  }),
  z.object({
    type: z.literal('nested_memory'),
    path: z.string(),
    content: z.object({
      path: looseString,
      type: z.string(),
      content: z.catch(z.string(), ''),
      contentDiffersFromDisk: looseBoolean,
    }),
  }),
  z.object({ type: z.literal('prompt_snapshot'), systemPrompt: z.array(z.string()) }),
  z.object({
    type: z.literal('skill_listing'),
    names: stringList,
    content: z.catch(z.string(), ''),
  }),
  z.object({
    type: z.literal('invoked_skills'),
    skills: z.array(z.object({ name: z.string(), path: looseString })),
  }),
  z.object({
    type: z.literal('mcp_instructions_delta'),
    addedNames: stringList,
    addedBlocks: stringList,
    removedNames: stringList,
  }),
  z.object({
    type: z.literal('deferred_tools_delta'),
    addedNames: stringList,
    removedNames: stringList,
  }),
  z.object({
    type: z.literal('agent_listing_delta'),
    addedTypes: stringList,
    removedTypes: stringList,
  }),
  z.object({ type: z.literal('environment'), snapshot: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('model'), identity: z.object({ modelId: z.string() }) }),
  z.object({ type: z.literal('queued_command'), prompt: z.catch(z.string(), '') }),
]);

export type Attachment = z.infer<typeof attachmentSchema>;

const attachmentRecordSchema = z.object({
  type: z.literal('attachment'),
  ...baseFields,
  attachment: attachmentSchema,
});

const transcriptRecordSchema = z.discriminatedUnion('type', [
  userRecordSchema,
  assistantRecordSchema,
  systemRecordSchema,
  attachmentRecordSchema,
  z.object({ type: z.literal('permission-mode'), permissionMode: z.string() }),
  z.object({ type: z.literal('ai-title'), aiTitle: z.string() }),
  z.object({ type: z.literal('custom-title'), customTitle: z.string() }),
  z.object({ type: z.literal('last-prompt'), lastPrompt: z.catch(z.string(), '') }),
]);

export type TranscriptRecord = z.infer<typeof transcriptRecordSchema>;
export type UserRecord = z.infer<typeof userRecordSchema>;
export type AssistantRecord = z.infer<typeof assistantRecordSchema>;
export type SystemRecord = z.infer<typeof systemRecordSchema>;

function parseJson(line: string): unknown {
  try {
    const value: unknown = JSON.parse(line);
    return value;
  } catch {
    return null;
  }
}

/**
 * Parse one JSONL line. Blank lines, invalid JSON, unknown record types and
 * records that do not match the expected shape all give null.
 */
export function parseTranscriptLine(line: string): TranscriptRecord | null {
  const result = transcriptRecordSchema.safeParse(parseJson(line));
  return result.success ? result.data : null;
}

/** Epoch milliseconds for an ISO timestamp, or null when missing or invalid. */
export function parseTimestamp(value: string | null | undefined): number | null {
  const ms = Date.parse(value ?? '');
  return Number.isNaN(ms) ? null : ms;
}
