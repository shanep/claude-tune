import { describe, expect, it } from 'vitest';

import { findSuggestion } from '../core/tuning/suggestions.js';

import { installedSuggestions, librariesFor, suggestionFile } from './installed.js';

const USER = { skillsDir: '/h/.claude/skills', agentsDir: '/h/.claude/agents' };

describe('installedSuggestions', () => {
  it('counts a suggestion saved in the user or the project library', () => {
    const scout = findSuggestion('scout');
    const handoff = findSuggestion('handoff');
    expect(scout?.kind).toBe('agent');
    expect(handoff?.kind).toBe('skill');
    if (scout === null || handoff === null) {
      return;
    }
    const libraries = librariesFor(USER, '/repo');
    const saved = new Set([suggestionFile(USER, scout), '/repo/.claude/skills/handoff/SKILL.md']);
    expect(suggestionFile(USER, scout)).toBe('/h/.claude/agents/scout.md');
    const installed = installedSuggestions(libraries, (file) => saved.has(file));
    expect(installed.has('scout')).toBe(true);
    expect(installed.has('handoff')).toBe(true);
    expect(installedSuggestions([USER], () => false).size).toBe(0);
  });
});
