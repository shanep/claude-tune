// Turns the agent and skill specs /tune ships into file text with a stable
// field order, so writing the same spec twice gives the same bytes. Only the
// frontmatter fields the suggestions use are here, from the documented fields
// at code.claude.com/docs/en/sub-agents and /skills.

export interface AgentFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly tools?: string;
  readonly model?: string;
  readonly color?: string;
}

export interface SkillFrontmatter {
  readonly name?: string;
  readonly description?: string;
  readonly 'argument-hint'?: string;
  readonly 'disable-model-invocation'?: boolean;
}

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

/** Field order when rendering, which is also the order the docs list them. */
const AGENT_FIELDS: readonly (keyof AgentFrontmatter)[] = ['name', 'description', 'tools', 'model', 'color'];
const SKILL_FIELDS: readonly (keyof SkillFrontmatter)[] = [
  'name',
  'description',
  'argument-hint',
  'disable-model-invocation',
];

/** Words YAML would read as something other than a string. */
const YAML_WORDS = /^(?:true|false|yes|no|on|off|null|~)$/iu;
/** Text that stays a plain string in YAML without quotes. */
const PLAIN = /^[A-Za-z][\w ,.'()/-]*$/u;

/**
 * One YAML scalar. Text that would not read back as the same string goes in
 * double quotes, and a JSON string is a valid YAML double-quoted string.
 */
function scalar(value: string | boolean): string {
  if (typeof value === 'boolean') {
    return String(value);
  }
  const plain = PLAIN.test(value) && !value.endsWith(' ') && !YAML_WORDS.test(value);
  return plain ? value : JSON.stringify(value);
}

/** One trailing newline, or nothing for an empty body. */
export function normalizeBody(body: string): string {
  const trimmed = body.trimEnd();
  return trimmed === '' ? '' : `${trimmed}\n`;
}

function render<T extends object>(frontmatter: T, fields: readonly (keyof T & string)[], body: string): string {
  const lines = fields.flatMap((field) => {
    const value: unknown = frontmatter[field];
    return typeof value === 'string' || typeof value === 'boolean' ? [`${field}: ${scalar(value)}\n`] : [];
  });
  const head = `---\n${lines.join('')}---\n`;
  const normalized = normalizeBody(body);
  return normalized === '' ? head : `${head}\n${normalized}`;
}

export function renderAgent(spec: AgentSpec): string {
  return render(spec.frontmatter, AGENT_FIELDS, spec.body);
}

export function renderSkill(spec: SkillSpec): string {
  return render(spec.frontmatter, SKILL_FIELDS, spec.body);
}
