// Synthetic transcript records that mimic the shapes Claude Code writes.
// Nothing here comes from a real transcript.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SESSION = 'sess-0001';
export const T0 = Date.parse('2026-10-01T12:00:00.000Z');

export function iso(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

type Fields = Readonly<Record<string, unknown>>;

function base(at: number, extra: Fields): Fields {
  return {
    parentUuid: null,
    isSidechain: false,
    sessionId: SESSION,
    cwd: '/work/demo',
    gitBranch: 'main',
    version: '2.1.301',
    entrypoint: 'cli',
    timestamp: iso(at),
    ...extra,
  };
}

export function userPrompt(uuid: string, at: number, prompt: string, extra: Fields = {}): Fields {
  return base(at, { type: 'user', uuid, message: { role: 'user', content: prompt }, ...extra });
}

export interface ResultSpec {
  readonly toolUseId: string;
  readonly text?: string | readonly unknown[];
  readonly isError?: boolean;
}

export function toolResult(
  uuid: string,
  at: number,
  results: readonly ResultSpec[],
  extra: Fields = {},
): Fields {
  return base(at, {
    type: 'user',
    uuid,
    message: {
      role: 'user',
      content: results.map((result) => ({
        type: 'tool_result',
        tool_use_id: result.toolUseId,
        content: result.text ?? 'ok',
        is_error: result.isError ?? false,
      })),
    },
    ...extra,
  });
}

export interface UsageSpec {
  readonly input?: number;
  readonly output?: number;
  readonly cacheRead?: number;
  readonly cacheCreation?: number;
  readonly thinking?: number;
}

export function usage(spec: UsageSpec): Fields {
  return {
    input_tokens: spec.input ?? 0,
    output_tokens: spec.output ?? 0,
    cache_read_input_tokens: spec.cacheRead ?? 0,
    cache_creation_input_tokens: spec.cacheCreation ?? 0,
    output_tokens_details: { thinking_tokens: spec.thinking ?? 0 },
    service_tier: 'standard',
  };
}

export interface AssistantSpec {
  readonly uuid: string;
  readonly at: number;
  readonly messageId: string;
  readonly content: readonly Fields[];
  readonly stop?: string | null;
  readonly model?: string;
  readonly usage?: Fields | null;
  readonly extra?: Fields;
}

export function assistant(spec: AssistantSpec): Fields {
  return base(spec.at, {
    type: 'assistant',
    uuid: spec.uuid,
    requestId: `req-${spec.messageId}`,
    effort: 'high',
    message: {
      id: spec.messageId,
      type: 'message',
      role: 'assistant',
      model: spec.model ?? 'claude-opus-5-5',
      stop_reason: spec.stop === undefined ? 'end_turn' : spec.stop,
      usage: spec.usage === undefined ? usage({ input: 10, output: 5 }) : spec.usage,
      content: spec.content,
    },
    ...spec.extra,
  });
}

export function text(value: string): Fields {
  return { type: 'text', text: value };
}

export function thinking(value: string): Fields {
  return { type: 'thinking', thinking: value, signature: 'sig' };
}

export function toolUse(id: string, name: string, input: unknown = {}): Fields {
  return { type: 'tool_use', id, name, input };
}

export function attachment(uuid: string, at: number, body: Fields): Fields {
  return base(at, { type: 'attachment', uuid, attachment: body });
}

export function system(uuid: string, at: number, extra: Fields): Fields {
  return base(at, { type: 'system', uuid, isMeta: false, ...extra });
}

export function jsonl(records: readonly Fields[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('');
}

export async function makeTemporaryDirectory(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'claude-tune-transcripts-'));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export interface SessionLayout {
  readonly projectsDir: string;
  readonly projectDir: string;
  readonly transcriptPath: string;
  readonly sessionDir: string;
  readonly subagentsDir: string;
}

export async function makeSessionLayout(
  root: string,
  sessionId: string = SESSION,
): Promise<SessionLayout> {
  const projectsDir = path.join(root, 'projects');
  const projectDir = path.join(projectsDir, '-work-demo');
  const sessionDir = path.join(projectDir, sessionId);
  const subagentsDir = path.join(sessionDir, 'subagents');
  await mkdir(projectDir, { recursive: true });
  return {
    projectsDir,
    projectDir,
    transcriptPath: path.join(projectDir, `${sessionId}.jsonl`),
    sessionDir,
    subagentsDir,
  };
}

export interface SubagentSpec {
  readonly agentId: string;
  readonly meta: Fields | null;
  readonly records: readonly Fields[];
  readonly subdir?: string;
}

export async function writeSubagent(layout: SessionLayout, spec: SubagentSpec): Promise<string> {
  const dir =
    spec.subdir === undefined ? layout.subagentsDir : path.join(layout.subagentsDir, spec.subdir);
  await mkdir(dir, { recursive: true });
  const transcriptPath = path.join(dir, `agent-${spec.agentId}.jsonl`);
  await writeFile(transcriptPath, jsonl(spec.records));
  if (spec.meta !== null) {
    await writeFile(path.join(dir, `agent-${spec.agentId}.meta.json`), JSON.stringify(spec.meta));
  }
  return transcriptPath;
}

/** Records for a subagent thread: isSidechain set and the agent id on every record. */
export function sidechain(agentId: string, record: Fields): Fields {
  return { ...record, isSidechain: true, agentId };
}
