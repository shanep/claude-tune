// Zod schemas for subagent and skill frontmatter, from the documented fields
// at code.claude.com/docs/en/sub-agents and /skills (read 2026-10-15).
// cspell:words xhigh

import { z } from 'zod';

export type AuthoringKind = 'agent' | 'skill';

const AGENT_NAME_MAX = 256;
const RESERVED_SKILL_NAME = 'anthropic-skills';

/** Control, format (zero-width, bidi), private-use and unassigned characters, plus line and paragraph separators. */
const HIDDEN_CHARS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
/** Space separators other than the plain space. */
const ODD_BLANKS = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/u;

interface NameRule {
  readonly applies: (kind: AuthoringKind) => boolean;
  readonly broken: (name: string) => boolean;
  readonly message: string;
}

const anyKind = (): boolean => true;

const NAME_RULES: readonly NameRule[] = [
  {
    applies: anyKind,
    broken: (name) => name.startsWith('-'),
    message: 'Name cannot start with "-".',
  },
  {
    applies: anyKind,
    broken: (name) => name.includes(':'),
    message: 'Name cannot contain ":", which is reserved for plugin-scoped names.',
  },
  {
    applies: anyKind,
    broken: (name) => name.trim() !== name,
    message: 'Name cannot start or end with a space.',
  },
  {
    applies: anyKind,
    broken: (name) => HIDDEN_CHARS.test(name) || ODD_BLANKS.test(name),
    message: 'Name cannot contain control, zero-width, bidi or non-plain blank characters.',
  },
  {
    applies: anyKind,
    broken: (name) => name.includes('<') || name.includes('>'),
    message: 'Name cannot contain "<" or ">".',
  },
  {
    applies: (kind) => kind === 'agent',
    broken: (name) => name.length > AGENT_NAME_MAX,
    message: `Name cannot be longer than ${String(AGENT_NAME_MAX)} characters.`,
  },
  {
    applies: (kind) => kind === 'skill',
    broken: (name) => name.startsWith(RESERVED_SKILL_NAME),
    message: `Names starting with "${RESERVED_SKILL_NAME}" are reserved.`,
  },
];

/** Every reason Claude Code would refuse this name. Empty when it is fine. */
export function nameProblems(kind: AuthoringKind, name: string): string[] {
  if (name.length === 0) {
    return ['Name cannot be empty.'];
  }
  return NAME_RULES.filter((rule) => rule.applies(kind) && rule.broken(name)).map(
    (rule) => rule.message,
  );
}

function requiredString(field: string): (issue: { readonly input: unknown }) => string {
  return (issue) =>
    issue.input === undefined ? `${field} is required.` : `${field} must be a string.`;
}

function nameSchema(kind: AuthoringKind): z.ZodType<string> {
  return z.string({ error: requiredString('name') }).superRefine((value, context) => {
    for (const message of nameProblems(kind, value)) {
      context.addIssue({ code: 'custom', message });
    }
  });
}

const text = z.string({
  error:
    'Expected a string. Quote values that start with [ or { so YAML does not read them as a list or map.',
});

/** A comma or space separated string, or a YAML list. */
const stringList = z.union([z.string(), z.array(z.string())], {
  error: 'Expected a comma-separated string or a list of strings.',
});

/** Keeps literal types without a const assertion. */
function tuple<const T extends readonly [string, ...string[]]>(...values: T): T {
  return values;
}

const strictBoolean = z.boolean({ error: 'Expected true or false.' });

/** Skills accept yes/no/on/off/1/0 in any case as well as true/false. */
const LOOSE_BOOLEAN_MESSAGE = 'Expected true or false (yes, no, on, off, 1 and 0 also work).';
const looseBoolean = z.union(
  [
    z.boolean(),
    z.literal(0),
    z.literal(1),
    z.string().regex(/^(?:true|false|yes|no|on|off|1|0)$/iu, { error: LOOSE_BOOLEAN_MESSAGE }),
  ],
  { error: LOOSE_BOOLEAN_MESSAGE },
);

export const EFFORT_LEVELS = tuple('low', 'medium', 'high', 'xhigh', 'max');
export const PERMISSION_MODES = tuple(
  'default',
  'acceptEdits',
  'auto',
  'dontAsk',
  'bypassPermissions',
  'plan',
  'manual',
);
export const MEMORY_SCOPES = tuple('user', 'project', 'local');
export const AGENT_COLORS = tuple(
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
);
export const MODEL_ALIASES = tuple('sonnet', 'opus', 'haiku', 'fable', 'inherit');

function oneOf<const T extends readonly [string, ...string[]]>(
  field: string,
  values: T,
): z.ZodEnum<{ [K in T[number]]: K }> {
  return z.enum(values, { error: `${field} must be one of: ${values.join(', ')}.` });
}

const hookEntry = z.looseObject({
  matcher: text.optional(),
  hooks: z.array(z.looseObject({ type: text })),
});

const hooks = z.record(z.string(), z.array(hookEntry), {
  error: 'Expected a map from hook event name to a list of { matcher, hooks } entries.',
});

const mcpServer = z.union([z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))], {
  error: 'Each MCP server is a configured server name or a map of name to server config.',
});

export const agentFrontmatterSchema = z.object({
  name: nameSchema('agent'),
  description: z.string({ error: requiredString('description') }).min(1, {
    error: 'description cannot be empty.',
  }),
  tools: stringList.optional(),
  disallowedTools: stringList.optional(),
  model: text.min(1).optional(),
  permissionMode: oneOf('permissionMode', PERMISSION_MODES).optional(),
  maxTurns: z.int({ error: 'maxTurns must be a whole number.' }).positive().optional(),
  autoCompactWindow: z
    .int({ error: 'autoCompactWindow must be a whole number of tokens, such as 200000.' })
    .min(100_000)
    .max(1_000_000)
    .optional(),
  skills: stringList.optional(),
  mcpServers: z.array(mcpServer).optional(),
  hooks: hooks.optional(),
  memory: oneOf('memory', MEMORY_SCOPES).optional(),
  background: strictBoolean.optional(),
  effort: oneOf('effort', EFFORT_LEVELS).optional(),
  isolation: oneOf('isolation', ['worktree']).optional(),
  omitClaudeMd: strictBoolean.optional(),
  color: oneOf('color', AGENT_COLORS).optional(),
  initialPrompt: text.optional(),
  experimental: z.looseObject({ cacheTtl: oneOf('cacheTtl', ['5m', '1h']).optional() }).optional(),
});

export const skillFrontmatterSchema = z.object({
  name: nameSchema('skill').optional(),
  description: text.optional(),
  when_to_use: text.optional(),
  'argument-hint': text.optional(),
  arguments: stringList.optional(),
  'disable-model-invocation': looseBoolean.optional(),
  'user-invocable': looseBoolean.optional(),
  'allowed-tools': stringList.optional(),
  'disallowed-tools': stringList.optional(),
  model: text.min(1).optional(),
  effort: oneOf('effort', EFFORT_LEVELS).optional(),
  context: oneOf('context', ['fork']).optional(),
  agent: text.min(1).optional(),
  background: looseBoolean.optional(),
  hooks: hooks.optional(),
  paths: stringList.optional(),
  shell: oneOf('shell', ['bash', 'powershell']).optional(),
  metadata: z.record(z.string(), z.unknown(), { error: 'metadata must be a map.' }).optional(),
  license: text.optional(),
  compatibility: text
    .max(500, { error: 'compatibility can be at most 500 characters.' })
    .optional(),
});

export type AgentFrontmatter = z.output<typeof agentFrontmatterSchema>;
export type SkillFrontmatter = z.output<typeof skillFrontmatterSchema>;

/** Field order used when rendering, which is also the order the docs list them. */
export const AGENT_FIELDS: readonly (keyof AgentFrontmatter)[] = [
  'name',
  'description',
  'tools',
  'disallowedTools',
  'model',
  'permissionMode',
  'maxTurns',
  'autoCompactWindow',
  'skills',
  'mcpServers',
  'hooks',
  'memory',
  'background',
  'effort',
  'isolation',
  'omitClaudeMd',
  'color',
  'initialPrompt',
  'experimental',
];

export const SKILL_FIELDS: readonly (keyof SkillFrontmatter)[] = [
  'name',
  'description',
  'when_to_use',
  'argument-hint',
  'arguments',
  'disable-model-invocation',
  'user-invocable',
  'allowed-tools',
  'disallowed-tools',
  'model',
  'effort',
  'context',
  'agent',
  'background',
  'hooks',
  'paths',
  'shell',
  'metadata',
  'license',
  'compatibility',
];

export interface AgentSpec {
  readonly frontmatter: AgentFrontmatter;
  /** The system prompt. */
  readonly body: string;
}

export interface SkillSpec {
  readonly frontmatter: SkillFrontmatter;
  /** The instructions Claude reads when the skill runs. */
  readonly body: string;
}
