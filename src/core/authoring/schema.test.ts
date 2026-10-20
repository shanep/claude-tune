// cspell:words xhigh
import { describe, expect, it } from 'vitest';

import {
  AGENT_COLORS,
  AGENT_FIELDS,
  agentFrontmatterSchema,
  EFFORT_LEVELS,
  MEMORY_SCOPES,
  MODEL_ALIASES,
  nameProblems,
  PERMISSION_MODES,
  SKILL_FIELDS,
  skillFrontmatterSchema,
} from './schema.js';

function byText(left: string, right: string): number {
  return left.localeCompare(right);
}

function agentErrors(data: Record<string, unknown>): string[] {
  const result = agentFrontmatterSchema.safeParse({
    name: 'a',
    description: 'd',
    ...data,
  });
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function skillErrors(data: Record<string, unknown>): string[] {
  const result = skillFrontmatterSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('nameProblems', () => {
  it('accepts ordinary names', () => {
    expect(nameProblems('agent', 'code-reviewer')).toStrictEqual([]);
    expect(nameProblems('skill', 'Fix Issue v2')).toStrictEqual([]);
    expect(nameProblems('skill', 'my-anthropic-skills')).toStrictEqual([]);
  });

  it('rejects an empty name with one message', () => {
    expect(nameProblems('agent', '')).toStrictEqual(['Name cannot be empty.']);
  });

  it('rejects a leading hyphen but allows inner hyphens', () => {
    expect(nameProblems('agent', '-x')).toStrictEqual(['Name cannot start with "-".']);
    expect(nameProblems('skill', 'x-')).toStrictEqual([]);
  });

  it('rejects a colon anywhere', () => {
    expect(nameProblems('skill', 'plugin:x')).toStrictEqual([
      'Name cannot contain ":", which is reserved for plugin-scoped names.',
    ]);
  });

  it('rejects leading and trailing spaces', () => {
    const message = 'Name cannot start or end with a space.';
    expect(nameProblems('agent', ' x')).toStrictEqual([message]);
    expect(nameProblems('agent', 'x ')).toStrictEqual([message]);
  });

  it.each([
    ['control', 'a\u0007b'],
    ['zero-width', 'a\u200Bb'],
    ['bidi', 'a\u202Eb'],
    ['private use', 'a\uE000b'],
    ['unassigned', 'a\u0378b'],
    ['line separator', 'a\u2028b'],
    ['no-break space', 'a\u00A0b'],
    ['ideographic space', 'a\u3000b'],
  ])('rejects %s characters', (_label, name) => {
    expect(nameProblems('skill', name)).toStrictEqual([
      'Name cannot contain control, zero-width, bidi or non-plain blank characters.',
    ]);
  });

  it('rejects angle brackets', () => {
    const message = 'Name cannot contain "<" or ">".';
    expect(nameProblems('skill', 'a<b')).toStrictEqual([message]);
    expect(nameProblems('skill', 'a>b')).toStrictEqual([message]);
  });

  it('caps agent names at 256 characters but not skill names', () => {
    expect(nameProblems('agent', 'a'.repeat(256))).toStrictEqual([]);
    expect(nameProblems('agent', 'a'.repeat(257))).toStrictEqual([
      'Name cannot be longer than 256 characters.',
    ]);
    expect(nameProblems('skill', 'a'.repeat(257))).toStrictEqual([]);
  });

  it('reserves anthropic-skills for skills only', () => {
    expect(nameProblems('skill', 'anthropic-skills')).toStrictEqual([
      'Names starting with "anthropic-skills" are reserved.',
    ]);
    expect(nameProblems('agent', 'anthropic-skills')).toStrictEqual([]);
  });

  it('reports every problem at once', () => {
    expect(nameProblems('agent', '-a:b ')).toStrictEqual([
      'Name cannot start with "-".',
      'Name cannot contain ":", which is reserved for plugin-scoped names.',
      'Name cannot start or end with a space.',
    ]);
  });
});

describe('agentFrontmatterSchema', () => {
  it('requires name and description with clear messages', () => {
    const result = agentFrontmatterSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path, issue.message])).toStrictEqual([
      [['name'], 'name is required.'],
      [['description'], 'description is required.'],
    ]);
  });

  it('says when name or description has the wrong type', () => {
    const result = agentFrontmatterSchema.safeParse({ name: 1, description: 5 });
    expect(result.error?.issues.map((issue) => issue.message)).toStrictEqual([
      'name must be a string.',
      'description must be a string.',
    ]);
  });

  it('reports name problems as custom issues', () => {
    const result = agentFrontmatterSchema.safeParse({ name: '-a', description: 'b' });
    expect(result.error?.issues.map((issue) => issue.code)).toStrictEqual(['custom']);
  });

  it('rejects an empty description and a bad name', () => {
    expect(agentErrors({ description: '' })).toStrictEqual(['description cannot be empty.']);
    expect(agentErrors({ name: 'a:b' })).toStrictEqual([
      'Name cannot contain ":", which is reserved for plugin-scoped names.',
    ]);
  });

  it('accepts every documented field', () => {
    const full = {
      name: 'x',
      description: 'y',
      tools: ['Read', 'Grep'],
      disallowedTools: 'Bash',
      model: 'sonnet',
      permissionMode: 'plan',
      maxTurns: 5,
      autoCompactWindow: 200_000,
      skills: ['a'],
      mcpServers: ['github', { playwright: { type: 'stdio', command: 'npx' } }],
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'x' }] }] },
      memory: 'project',
      background: true,
      effort: 'xhigh',
      isolation: 'worktree',
      omitClaudeMd: false,
      color: 'cyan',
      initialPrompt: 'go',
      experimental: { cacheTtl: '1h', other: 1 },
    };
    expect(agentFrontmatterSchema.parse(full)).toStrictEqual(full);
  });

  it('drops unknown fields from the parsed value', () => {
    expect(agentFrontmatterSchema.parse({ name: 'a', description: 'b', extra: 1 })).toStrictEqual({
      name: 'a',
      description: 'b',
    });
  });

  it('names the allowed values for every enum field', () => {
    expect(agentErrors({ permissionMode: 'yolo' })).toStrictEqual([
      `permissionMode must be one of: ${PERMISSION_MODES.join(', ')}.`,
    ]);
    expect(agentErrors({ memory: 'global' })).toStrictEqual([
      'memory must be one of: user, project, local.',
    ]);
    expect(agentErrors({ effort: 'huge' })).toStrictEqual([
      'effort must be one of: low, medium, high, xhigh, max.',
    ]);
    expect(agentErrors({ isolation: 'docker' })).toStrictEqual([
      'isolation must be one of: worktree.',
    ]);
    expect(agentErrors({ color: 'black' })).toStrictEqual([
      'color must be one of: red, blue, green, yellow, purple, orange, pink, cyan.',
    ]);
    expect(agentErrors({ experimental: { cacheTtl: '2h' } })).toStrictEqual([
      'cacheTtl must be one of: 5m, 1h.',
    ]);
  });

  it('checks number fields', () => {
    expect(agentErrors({ maxTurns: 1.5 })).toStrictEqual(['maxTurns must be a whole number.']);
    expect(agentErrors({ maxTurns: 0 })).toHaveLength(1);
    expect(agentErrors({ maxTurns: 1 })).toStrictEqual([]);
    expect(agentErrors({ autoCompactWindow: '200k' })).toStrictEqual([
      'autoCompactWindow must be a whole number of tokens, such as 200000.',
    ]);
    expect(agentErrors({ autoCompactWindow: 99_999 })).toHaveLength(1);
    expect(agentErrors({ autoCompactWindow: 100_000 })).toStrictEqual([]);
    expect(agentErrors({ autoCompactWindow: 1_000_000 })).toStrictEqual([]);
    expect(agentErrors({ autoCompactWindow: 1_000_001 })).toHaveLength(1);
  });

  it('checks list, map and boolean fields', () => {
    expect(agentErrors({ tools: 3 })).toStrictEqual([
      'Expected a comma-separated string or a list of strings.',
    ]);
    expect(agentErrors({ mcpServers: [3] })).toStrictEqual([
      'Each MCP server is a configured server name or a map of name to server config.',
    ]);
    expect(agentErrors({ hooks: [] })).toStrictEqual([
      'Expected a map from hook event name to a list of { matcher, hooks } entries.',
    ]);
    expect(agentErrors({ background: 'yes' })).toStrictEqual(['Expected true or false.']);
    expect(agentErrors({ model: '' })).toHaveLength(1);
    expect(agentErrors({ initialPrompt: ['a'] })).toStrictEqual([
      'Expected a string. Quote values that start with [ or { so YAML does not read them as a list or map.',
    ]);
  });
});

describe('skillFrontmatterSchema', () => {
  it('accepts an empty frontmatter', () => {
    expect(skillFrontmatterSchema.parse({})).toStrictEqual({});
  });

  it.each([true, false, 0, 1, 'yes', 'NO', 'On', 'off', '1', '0', 'TRUE'])(
    'accepts %s as a boolean',
    (value) => {
      expect(skillErrors({ 'user-invocable': value })).toStrictEqual([]);
    },
  );

  it.each([2, 'maybe', 'yes please', 'true!', null])('rejects %s as a boolean', (value) => {
    expect(skillErrors({ background: value })).toStrictEqual([
      'Expected true or false (yes, no, on, off, 1 and 0 also work).',
    ]);
  });

  it('explains an unquoted argument-hint that YAML read as a list', () => {
    expect(skillErrors({ 'argument-hint': ['issue'] })).toStrictEqual([
      'Expected a string. Quote values that start with [ or { so YAML does not read them as a list or map.',
    ]);
  });

  it('checks enums, metadata and compatibility', () => {
    expect(skillErrors({ context: 'spawn' })).toStrictEqual(['context must be one of: fork.']);
    expect(skillErrors({ shell: 'zsh' })).toStrictEqual([
      'shell must be one of: bash, powershell.',
    ]);
    expect(skillErrors({ metadata: 'x' })).toStrictEqual(['metadata must be a map.']);
    expect(skillErrors({ compatibility: 'a'.repeat(500) })).toStrictEqual([]);
    expect(skillErrors({ compatibility: 'a'.repeat(501) })).toStrictEqual([
      'compatibility can be at most 500 characters.',
    ]);
    expect(skillErrors({ name: 'anthropic-skills:x' })).toHaveLength(2);
    expect(skillErrors({ agent: '' })).toHaveLength(1);
  });
});

describe('field lists', () => {
  it('cover exactly the schema fields', () => {
    expect([...AGENT_FIELDS].toSorted(byText)).toStrictEqual(
      Object.keys(agentFrontmatterSchema.shape).toSorted(byText),
    );
    expect([...SKILL_FIELDS].toSorted(byText)).toStrictEqual(
      Object.keys(skillFrontmatterSchema.shape).toSorted(byText),
    );
    expect(AGENT_FIELDS.slice(0, 2)).toStrictEqual(['name', 'description']);
    expect(SKILL_FIELDS.slice(0, 2)).toStrictEqual(['name', 'description']);
  });

  it('list the documented enum values', () => {
    expect(EFFORT_LEVELS).toStrictEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(MEMORY_SCOPES).toStrictEqual(['user', 'project', 'local']);
    expect(MODEL_ALIASES).toStrictEqual(['sonnet', 'opus', 'haiku', 'fable', 'inherit']);
    expect(AGENT_COLORS).toHaveLength(8);
    expect(PERMISSION_MODES).toStrictEqual([
      'default',
      'acceptEdits',
      'auto',
      'dontAsk',
      'bypassPermissions',
      'plan',
      'manual',
    ]);
  });
});
