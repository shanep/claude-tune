// Subagent transcripts live next to the main one, in
// <session-id>/subagents/agent-<id>.jsonl with an agent-<id>.meta.json beside
// it (workflow agents sit one or two folders deeper). The meta file names the
// tool use that spawned the agent, which links it to its parent.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const looseString = z.string().nullish().catch(null);

const subagentMetaSchema = z.object({
  agentType: z.string().catch('unknown'),
  description: z.string().catch(''),
  toolUseId: looseString,
  parentAgentId: looseString,
  spawnDepth: z.number().int().nonnegative().catch(1),
  requestShape: looseString,
  model: looseString,
});

export type SubagentMeta = z.infer<typeof subagentMetaSchema>;

export interface SubagentFile {
  readonly agentId: string;
  readonly transcriptPath: string;
  readonly metaPath: string;
}

const AGENT_FILE = /^agent-(.+)\.jsonl$/u;

/** The agent id in an "agent-<id>.jsonl" file name, or null for other files. */
export function agentIdFromFileName(name: string): string | null {
  return AGENT_FILE.exec(name)?.[1] ?? null;
}

export function parseSubagentMeta(text: string): SubagentMeta | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const result = subagentMetaSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Read a meta file. A missing or broken file gives null, since it may not be written yet. */
export async function readSubagentMeta(metaPath: string): Promise<SubagentMeta | null> {
  try {
    return parseSubagentMeta(await readFile(metaPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Every subagent transcript under <sessionDir>/subagents, at any depth. */
export async function listSubagentFiles(sessionDir: string): Promise<SubagentFile[]> {
  const root = path.join(sessionDir, 'subagents');
  let entries: string[];
  try {
    entries = await readdir(root, { recursive: true });
  } catch {
    return [];
  }
  const files: SubagentFile[] = [];
  for (const entry of entries.toSorted((left, right) => left.localeCompare(right))) {
    const agentId = agentIdFromFileName(path.basename(entry));
    if (agentId !== null) {
      const transcriptPath = path.join(root, entry);
      files.push({
        agentId,
        transcriptPath,
        metaPath: transcriptPath.replace(/\.jsonl$/u, '.meta.json'),
      });
    }
  }
  return files;
}
