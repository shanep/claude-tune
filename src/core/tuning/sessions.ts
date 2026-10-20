// Claude Code's sessions for the scan: the transcripts under
// ~/.claude/projects with their subagent transcripts beside them, measured by
// tuning/measure.ts, which reads Claude's denial text, model ids and cache
// fields.

import { readFile } from 'node:fs/promises';

import { readAllLines } from '../transcripts/reader.js';
import { scanSessions } from '../transcripts/scanner.js';
import { listSubagentFiles, parseSubagentMeta } from '../transcripts/subagents.js';
import type { SessionMeasure, SubagentInfo } from './measure.js';
import { measureSession } from './measure.js';

const JSONL = '.jsonl';

/** One session's files as the scan sees them. */
export interface TuningSession {
  readonly sessionId: string;
  /** The main file, which keys the session in the index. */
  readonly path: string;
  readonly mtimeMs: number;
  readonly size: number;
}

/** Every session under projectsDir, newest first. */
export async function claudeTuningSessions(projectsDir: string): Promise<TuningSession[]> {
  const found = await scanSessions(projectsDir);
  return found.map((info) => ({
    sessionId: info.sessionId,
    path: info.transcriptPath,
    mtimeMs: info.mtimeMs,
    size: info.size,
  }));
}

async function readInfo(metaPath: string): Promise<SubagentInfo | null> {
  try {
    const meta = parseSubagentMeta(await readFile(metaPath, 'utf8'));
    return meta === null ? null : { type: meta.agentType, description: meta.description };
  } catch {
    return null;
  }
}

/** Reads a session's transcript and its subagents' and measures them. */
export async function measureClaudeSession(session: TuningSession): Promise<SessionMeasure> {
  // The subagents sit in a folder named like the transcript without .jsonl.
  const sessionDir = session.path.slice(0, -JSONL.length);
  const subagents: string[][] = [];
  const subagentInfo: (SubagentInfo | null)[] = [];
  for (const file of await listSubagentFiles(sessionDir)) {
    subagents.push(await readAllLines(file.transcriptPath));
    subagentInfo.push(await readInfo(file.metaPath));
  }
  return measureSession({
    sessionId: session.sessionId,
    main: await readAllLines(session.path),
    subagents,
    subagentInfo,
    fallbackAt: session.mtimeMs,
  });
}
