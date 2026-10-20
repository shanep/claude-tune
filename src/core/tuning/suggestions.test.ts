import { describe, expect, it } from 'vitest';

import { renderAgent, renderSkill } from '../authoring/render.js';
import { validateAgentFile, validateSkillFile } from '../authoring/validate.js';

import { buildSuggestions, findSuggestion, nameOf, SUGGESTIONS } from './suggestions.js';
import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

const BUSY = measureOf({
  peakContext: 300_000,
  prompts: 31,
  bigResults: 3,
  families: { land: 30, ci: 20, server: 15, buildTest: 100, search: 200 },
});

describe('suggestions', () => {
  it('render to valid skill and agent files named after their ids', () => {
    for (const definition of SUGGESTIONS) {
      const text =
        definition.kind === 'agent' ? renderAgent(definition.spec) : renderSkill(definition.spec);
      const issues =
        definition.kind === 'agent' ? validateAgentFile(text) : validateSkillFile(text);
      expect({ id: definition.id, issues }).toStrictEqual({ id: definition.id, issues: [] });
      expect(nameOf(definition)).toBe(definition.id);
      const both = definition.pros.length > 0 && definition.cons.length > 0;
      expect({ id: definition.id, both }).toStrictEqual({ id: definition.id, both: true });
    }
  });

  it('falls back to the id when a spec has no name', () => {
    const [first] = SUGGESTIONS;
    if (first?.kind !== 'skill') {
      throw new Error('expected a skill first');
    }
    const unnamed = { ...first, spec: { ...first.spec, frontmatter: {} } };
    expect(nameOf(unnamed)).toBe(first.id);
  });

  it('finds a suggestion by id', () => {
    expect(findSuggestion('land')?.kind).toBe('skill');
    expect(findSuggestion('nope')).toBeNull();
  });

  it('gives reasons from busy sessions and none from quiet ones', () => {
    const busy = buildSuggestions(totalsOf([BUSY], HOME), new Set(['land']));
    expect(busy.map((item) => [item.id, item.reason])).toStrictEqual([
      ['handoff', '1 session went past 200K tokens and 1 session ran past 30 prompts.'],
      [
        'scout',
        'Main sessions ran 200 searches and file reads themselves, so all that output stayed in their context.',
      ],
      [
        'quiet-run',
        '100 build or test commands ran in main sessions and 3 tool results were over 40K characters.',
      ],
      [
        'land',
        '30 git fetch, rebase or push commands ran by hand, the same landing routine in session after session.',
      ],
      ['ci-watch', '20 gh run or gh pr checks commands polled CI from main sessions.'],
      ['dev-server', '15 commands started, stopped or killed local servers by hand.'],
    ]);
    expect(busy.filter((item) => item.installed).map((item) => item.id)).toStrictEqual(['land']);
    expect(busy[1]).toMatchObject({ kind: 'agent', name: 'scout' });
    expect(busy[1]?.cons[0]).toMatch(/^Haiku can miss/u);
    const quiet = buildSuggestions(totalsOf([measureOf()], HOME), new Set());
    expect(quiet.every((item) => item.reason === null)).toBe(true);
  });

  it('lists the suggestions with a reason first', () => {
    const one = measureOf({ families: { land: 0, ci: 0, server: 15, buildTest: 0, search: 0 } });
    const ids = buildSuggestions(totalsOf([one], HOME), new Set()).map((item) => item.id);
    expect(ids[0]).toBe('dev-server');
    expect(ids).toHaveLength(SUGGESTIONS.length);
  });

  it('gives each reason on either of its triggers', () => {
    const large = measureOf({ peakContext: 300_000 });
    expect(buildSuggestions(totalsOf([large], HOME), new Set())[0]?.id).toBe('handoff');
    const big = measureOf({ bigResults: 3 });
    expect(buildSuggestions(totalsOf([big], HOME), new Set())[0]?.id).toBe('quiet-run');
  });
});
