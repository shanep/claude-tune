import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SubagentMeta } from './subagents.js';
import {
  agentIdFromFileName,
  listSubagentFiles,
  parseSubagentMeta,
  readSubagentMeta,
} from './subagents.js';
import { makeTemporaryDirectory, removeDir } from './test-helpers/fixtures.js';

const META: SubagentMeta = {
  agentType: 'Explore',
  description: 'Find things',
  toolUseId: 'toolu_1',
  spawnDepth: 2,
  requestShape: 'background',
  model: 'claude-haiku-5-5',
};

describe('agentIdFromFileName', () => {
  it('reads agent ids and rejects other files', () => {
    expect(agentIdFromFileName('agent-abc123.jsonl')).toBe('abc123');
    expect(agentIdFromFileName('agent-a-b.jsonl')).toBe('a-b');
    expect(agentIdFromFileName('agent-abc.meta.json')).toBeNull();
    expect(agentIdFromFileName('journal.jsonl')).toBeNull();
    expect(agentIdFromFileName('xagent-a.jsonl')).toBeNull();
    expect(agentIdFromFileName('agent-a.jsonl.bak')).toBeNull();
    expect(agentIdFromFileName('agent-.jsonl')).toBeNull();
  });
});

describe('parseSubagentMeta', () => {
  it('parses the known fields', () => {
    expect(
      parseSubagentMeta(
        JSON.stringify({
          ...META,
          parentAgentId: 'p1',
          requestNonInteractive: true,
          isFork: false,
        }),
      ),
    ).toStrictEqual({ ...META, parentAgentId: 'p1' });
  });

  it('falls back on defaults for missing or odd fields', () => {
    expect(parseSubagentMeta(JSON.stringify({ spawnDepth: -1, agentType: 3 }))).toStrictEqual({
      agentType: 'unknown',
      description: '',
      spawnDepth: 1,
    });
    expect(parseSubagentMeta(JSON.stringify({ spawnDepth: 1.5 }))?.spawnDepth).toBe(1);
  });

  it('gives null for broken JSON and non-objects', () => {
    expect(parseSubagentMeta('{')).toBeNull();
    expect(parseSubagentMeta('[]')).toBeNull();
    expect(parseSubagentMeta('null')).toBeNull();
  });
});

describe('files on disk', () => {
  let root = '';

  beforeEach(async () => {
    root = await makeTemporaryDirectory();
  });

  afterEach(async () => {
    await removeDir(root);
  });

  it('reads a meta file and gives null when it is missing', async () => {
    const metaPath = path.join(root, 'agent-a.meta.json');
    expect(await readSubagentMeta(metaPath)).toBeNull();
    await writeFile(metaPath, JSON.stringify({ agentType: 'Plan' }));
    expect(await readSubagentMeta(metaPath)).toStrictEqual({
      agentType: 'Plan',
      description: '',
      spawnDepth: 1,
    });
  });

  it('lists subagent transcripts at any depth, sorted, and nothing for a missing folder', async () => {
    expect(await listSubagentFiles(path.join(root, 'none'))).toStrictEqual([]);
    const subagents = path.join(root, 'subagents');
    const workflow = path.join(subagents, 'workflows', 'wf_1');
    await mkdir(workflow, { recursive: true });
    await writeFile(path.join(subagents, 'agent-b.jsonl'), '');
    await writeFile(path.join(subagents, 'agent-a.jsonl'), '');
    await writeFile(path.join(subagents, 'agent-a.meta.json'), '{}');
    await writeFile(path.join(workflow, 'agent-c.jsonl'), '');
    await writeFile(path.join(workflow, 'journal.jsonl'), '');
    expect(await listSubagentFiles(root)).toStrictEqual([
      {
        agentId: 'a',
        transcriptPath: path.join(subagents, 'agent-a.jsonl'),
        metaPath: path.join(subagents, 'agent-a.meta.json'),
      },
      {
        agentId: 'b',
        transcriptPath: path.join(subagents, 'agent-b.jsonl'),
        metaPath: path.join(subagents, 'agent-b.meta.json'),
      },
      {
        agentId: 'c',
        transcriptPath: path.join(workflow, 'agent-c.jsonl'),
        metaPath: path.join(workflow, 'agent-c.meta.json'),
      },
    ]);
  });
});
