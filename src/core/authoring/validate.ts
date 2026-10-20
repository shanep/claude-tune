// Checks an agent or skill file the way Claude Code reads it. Errors mean
// Claude Code would skip the file or a field. Warnings mean it would load but
// probably not as intended (unknown fields are silently ignored, for example).

import type { z } from 'zod';

import { parseFrontmatter } from './frontmatter.js';
import {
  AGENT_FIELDS,
  agentFrontmatterSchema,
  SKILL_FIELDS,
  skillFrontmatterSchema,
} from './schema.js';
import type { AgentSpec, SkillFrontmatter, SkillSpec } from './schema.js';

export interface AuthoringIssue {
  readonly severity: 'error' | 'warning';
  /** Frontmatter field, dotted for nested values, or null for the whole file. */
  readonly field: string | null;
  readonly message: string;
}

export interface ParseResult<S> {
  /** Null when there is at least one error. */
  readonly spec: S | null;
  readonly issues: readonly AuthoringIssue[];
}

/** Skill descriptions plus when_to_use are cut at this length in the skill listing. */
export const LISTING_DESCRIPTION_LIMIT = 1536;

const FORK_ONLY: readonly ('agent' | 'background')[] = ['agent', 'background'];

const CONVENTIONAL_NAME = /^[a-z0-9-]+$/u;

function zodIssues(error: z.ZodError): AuthoringIssue[] {
  return error.issues.map((issue) => ({
    severity: 'error',
    // The input is always a map, so every issue has a path.
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function unknownFields(
  data: Readonly<Record<string, unknown>>,
  known: readonly string[],
): AuthoringIssue[] {
  const knownSet = new Set(known);
  return Object.keys(data)
    .filter((key) => !knownSet.has(key))
    .map((key) => ({
      severity: 'warning',
      field: key,
      message: `Unknown field "${key}". Claude Code ignores it.`,
    }));
}

function nameStyle(name: string): AuthoringIssue[] {
  if (CONVENTIONAL_NAME.test(name)) {
    return [];
  }
  return [
    {
      severity: 'warning',
      field: 'name',
      message: 'Names are usually lowercase letters, digits and hyphens, such as "code-reviewer".',
    },
  ];
}

function emptyBody(body: string, what: string): AuthoringIssue[] {
  if (body.trim() !== '') {
    return [];
  }
  return [{ severity: 'warning', field: null, message: `The body is empty, so ${what}.` }];
}

function skillWarnings(frontmatter: SkillFrontmatter): AuthoringIssue[] {
  const issues: AuthoringIssue[] = [];
  if (frontmatter.name === undefined) {
    issues.push({
      severity: 'warning',
      field: 'name',
      message: 'No name, so Claude Code uses the directory name.',
    });
  } else {
    issues.push(...nameStyle(frontmatter.name));
  }
  if (frontmatter.description === undefined) {
    issues.push({
      severity: 'warning',
      field: 'description',
      message:
        'No description, so Claude uses the first line of the body to decide when to use it.',
    });
  }
  const listed = `${frontmatter.description ?? ''}${frontmatter.when_to_use ?? ''}`;
  if (listed.length > LISTING_DESCRIPTION_LIMIT) {
    issues.push({
      severity: 'warning',
      field: 'description',
      message: `description plus when_to_use is ${String(listed.length)} characters. The skill listing cuts it at ${String(LISTING_DESCRIPTION_LIMIT)}.`,
    });
  }
  if (frontmatter.context !== 'fork') {
    for (const field of FORK_ONLY) {
      if (frontmatter[field] !== undefined) {
        issues.push({
          severity: 'warning',
          field,
          message: `${field} only applies with "context: fork".`,
        });
      }
    }
  }
  return issues;
}

export function parseAgentFile(text: string): ParseResult<AgentSpec> {
  const split = parseFrontmatter(text);
  if (!split.ok) {
    return { spec: null, issues: [{ severity: 'error', field: null, message: split.message }] };
  }
  const unknown = unknownFields(split.data, AGENT_FIELDS);
  const result = agentFrontmatterSchema.safeParse(split.data);
  if (!result.success) {
    return { spec: null, issues: [...zodIssues(result.error), ...unknown] };
  }
  const issues = [
    ...unknown,
    ...nameStyle(result.data.name),
    ...emptyBody(split.body, 'the subagent has no system prompt'),
  ];
  return { spec: { frontmatter: result.data, body: split.body }, issues };
}

export function parseSkillFile(text: string): ParseResult<SkillSpec> {
  const split = parseFrontmatter(text);
  if (!split.ok) {
    return { spec: null, issues: [{ severity: 'error', field: null, message: split.message }] };
  }
  const unknown = unknownFields(split.data, SKILL_FIELDS);
  const result = skillFrontmatterSchema.safeParse(split.data);
  if (!result.success) {
    return { spec: null, issues: [...zodIssues(result.error), ...unknown] };
  }
  const issues = [
    ...unknown,
    ...skillWarnings(result.data),
    ...emptyBody(split.body, 'the skill has no instructions'),
  ];
  return { spec: { frontmatter: result.data, body: split.body }, issues };
}

export function validateAgentFile(text: string): readonly AuthoringIssue[] {
  return parseAgentFile(text).issues;
}

export function validateSkillFile(text: string): readonly AuthoringIssue[] {
  return parseSkillFile(text).issues;
}

export function hasErrors(issues: readonly AuthoringIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
