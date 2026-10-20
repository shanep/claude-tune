// Turns an agent or skill spec into file text with a stable field order, so
// saving the same spec twice gives the same bytes and a clean git diff.

import { joinFrontmatter } from './frontmatter.js';
import { AGENT_FIELDS, SKILL_FIELDS } from './schema.js';
import type { AgentFrontmatter, AgentSpec, SkillFrontmatter, SkillSpec } from './schema.js';

function ordered<T extends object>(
  frontmatter: T,
  fields: readonly (keyof T & string)[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = frontmatter[field];
    if (value !== undefined) {
      out[field] = value;
    }
  }
  return out;
}

export function renderAgent(spec: AgentSpec): string {
  return joinFrontmatter(ordered<AgentFrontmatter>(spec.frontmatter, AGENT_FIELDS), spec.body);
}

export function renderSkill(spec: SkillSpec): string {
  return joinFrontmatter(ordered<SkillFrontmatter>(spec.frontmatter, SKILL_FIELDS), spec.body);
}
