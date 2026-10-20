import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { normalizeBody } from './frontmatter.js';
import { renderAgent, renderSkill } from './render.js';
import { AGENT_COLORS, EFFORT_LEVELS, MEMORY_SCOPES, PERMISSION_MODES } from './schema.js';
import type { AgentSpec, SkillSpec } from './schema.js';
import { hasErrors, parseAgentFile, parseSkillFile } from './validate.js';

const name = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,30}$/u);
const text = fc.string({ unit: 'grapheme', maxLength: 80 });
const nonEmpty = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 80 });
const tools = fc.oneof(fc.string({ maxLength: 30 }), fc.array(fc.string({ maxLength: 12 })));
const body = fc.string({ unit: 'grapheme', maxLength: 200 });

const agentFrontmatter = fc.record(
  {
    name,
    description: nonEmpty,
    tools,
    disallowedTools: tools,
    model: fc.constantFrom('sonnet', 'opus', 'inherit', 'claude-opus-5-5'),
    permissionMode: fc.constantFrom(...PERMISSION_MODES),
    maxTurns: fc.integer({ min: 1, max: 1000 }),
    autoCompactWindow: fc.integer({ min: 100_000, max: 1_000_000 }),
    skills: fc.array(name, { maxLength: 3 }),
    memory: fc.constantFrom(...MEMORY_SCOPES),
    background: fc.boolean(),
    effort: fc.constantFrom(...EFFORT_LEVELS),
    isolation: fc.constant('worktree'),
    omitClaudeMd: fc.boolean(),
    color: fc.constantFrom(...AGENT_COLORS),
    initialPrompt: text,
  },
  { requiredKeys: ['name', 'description'], noNullPrototype: true },
);

const skillFrontmatter = fc.record(
  {
    name,
    description: text,
    when_to_use: text,
    'argument-hint': text,
    arguments: tools,
    'disable-model-invocation': fc.boolean(),
    'user-invocable': fc.boolean(),
    'allowed-tools': tools,
    paths: fc.array(fc.constantFrom('src/**/*.ts', '*.md'), { maxLength: 2 }),
    effort: fc.constantFrom(...EFFORT_LEVELS),
    context: fc.constant('fork'),
    agent: fc.constantFrom('Explore', 'general-purpose'),
    shell: fc.constantFrom('bash', 'powershell'),
    license: text,
  },
  { requiredKeys: [], noNullPrototype: true },
);

describe('renderAgent', () => {
  it('writes fields in the documented order regardless of input order', () => {
    const spec: AgentSpec = {
      frontmatter: { color: 'red', model: 'opus', description: 'Does things', name: 'thing' },
      body: 'You do things.',
    };
    expect(renderAgent(spec)).toBe(
      '---\nname: thing\ndescription: Does things\nmodel: opus\ncolor: red\n---\n\nYou do things.\n',
    );
  });

  it('round trips through validation with no errors and the same fields', () => {
    fc.assert(
      fc.property(agentFrontmatter, body, (frontmatter, bodyText) => {
        const parsed = parseAgentFile(renderAgent({ frontmatter, body: bodyText }));
        expect(hasErrors(parsed.issues)).toBe(false);
        expect(parsed.spec).toStrictEqual({ frontmatter, body: normalizeBody(bodyText) });
      }),
    );
  });

  it('is stable when rendered twice', () => {
    fc.assert(
      fc.property(agentFrontmatter, body, (frontmatter, bodyText) => {
        const once = renderAgent({ frontmatter, body: bodyText });
        const spec = parseAgentFile(once).spec;
        expect(spec === null ? null : renderAgent(spec)).toBe(once);
      }),
    );
  });
});

describe('renderSkill', () => {
  it('writes hyphenated keys and quotes a bracketed hint', () => {
    const spec: SkillSpec = {
      frontmatter: { 'argument-hint': '[issue]', name: 'fix', arguments: ['issue'] },
      body: 'Fix $issue.',
    };
    expect(renderSkill(spec)).toBe(
      '---\nname: fix\nargument-hint: "[issue]"\narguments:\n  - issue\n---\n\nFix $issue.\n',
    );
  });

  it('writes bare markers for a skill with no fields', () => {
    expect(renderSkill({ frontmatter: {}, body: 'x' })).toBe('---\n---\n\nx\n');
  });

  it('round trips through validation with no errors and the same fields', () => {
    fc.assert(
      fc.property(skillFrontmatter, body, (frontmatter, bodyText) => {
        const parsed = parseSkillFile(renderSkill({ frontmatter, body: bodyText }));
        expect(hasErrors(parsed.issues)).toBe(false);
        expect(parsed.spec).toStrictEqual({ frontmatter, body: normalizeBody(bodyText) });
      }),
    );
  });
});
