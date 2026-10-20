import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { SUGGESTIONS } from '../tuning/suggestions.js';

import { normalizeBody, renderAgent, renderSkill } from './render.js';
import type { AgentSpec, SkillSpec } from './render.js';

/** The frontmatter and body of rendered text, read back with a real YAML parser. */
function readBack(text: string): { frontmatter: unknown; body: string } {
  const match = /^---\n(.*?)---\n(?:\n(.*))?$/su.exec(text);
  return { frontmatter: parse(match?.[1] ?? '') ?? {}, body: match?.[2] ?? '' };
}

const name = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,30}$/u);
const text = fc.string({ unit: 'grapheme', maxLength: 80 });
const body = fc.string({ unit: 'grapheme', maxLength: 200 });

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

  it('reads back as the same fields for any text', () => {
    fc.assert(
      fc.property(name, text, text, body, (agentName, description, tools, bodyText) => {
        const frontmatter = { name: agentName, description, tools };
        const back = readBack(renderAgent({ frontmatter, body: bodyText }));
        expect(back).toStrictEqual({ frontmatter, body: normalizeBody(bodyText) });
      }),
    );
  });
});

describe('renderSkill', () => {
  it('quotes a bracketed hint and writes booleans bare', () => {
    const spec: SkillSpec = {
      frontmatter: { 'disable-model-invocation': true, 'argument-hint': '[issue]', name: 'fix' },
      body: 'Fix $issue.',
    };
    expect(renderSkill(spec)).toBe(
      '---\nname: fix\nargument-hint: "[issue]"\ndisable-model-invocation: true\n---\n\nFix $issue.\n',
    );
  });

  it('quotes words YAML would read as something else', () => {
    expect(renderSkill({ frontmatter: { description: 'yes' }, body: '' })).toBe(
      '---\ndescription: "yes"\n---\n',
    );
  });

  it('writes bare markers for a skill with no fields', () => {
    expect(renderSkill({ frontmatter: {}, body: 'x' })).toBe('---\n---\n\nx\n');
  });
});

describe('the suggestions', () => {
  it('all render to frontmatter that reads back the same', () => {
    for (const definition of SUGGESTIONS) {
      const rendered =
        definition.kind === 'agent' ? renderAgent(definition.spec) : renderSkill(definition.spec);
      expect(readBack(rendered).frontmatter).toStrictEqual(definition.spec.frontmatter);
    }
  });
});
