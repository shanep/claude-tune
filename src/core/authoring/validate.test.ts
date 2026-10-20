// cspell:words xhigh
import { describe, expect, it } from 'vitest';

import {
  hasErrors,
  LISTING_DESCRIPTION_LIMIT,
  parseAgentFile,
  parseSkillFile,
  validateAgentFile,
  validateSkillFile,
} from './validate.js';

const GOOD_AGENT = '---\nname: reviewer\ndescription: Reviews code\n---\n\nReview it.\n';

describe('validateAgentFile', () => {
  it('finds nothing wrong with a minimal good file', () => {
    expect(validateAgentFile(GOOD_AGENT)).toStrictEqual([]);
    expect(parseAgentFile(GOOD_AGENT).spec).toStrictEqual({
      frontmatter: { name: 'reviewer', description: 'Reviews code' },
      body: 'Review it.\n',
    });
  });

  it('reports a missing frontmatter block as a file error', () => {
    expect(parseAgentFile('Just text')).toStrictEqual({
      spec: null,
      issues: [
        {
          severity: 'error',
          field: null,
          message: 'The file must start with a "---" line that opens the frontmatter.',
        },
      ],
    });
  });

  it('reports a missing name and description by field', () => {
    expect(validateAgentFile('---\ncolor: red\n---\nx')).toStrictEqual([
      { severity: 'error', field: 'name', message: 'name is required.' },
      { severity: 'error', field: 'description', message: 'description is required.' },
    ]);
  });

  it('reports unknown fields as warnings, after errors', () => {
    expect(validateAgentFile('---\nname: a\nfoo: 1\nbar: 2\n---\nx')).toStrictEqual([
      { severity: 'error', field: 'description', message: 'description is required.' },
      {
        severity: 'warning',
        field: 'foo',
        message: 'Unknown field "foo". Claude Code ignores it.',
      },
      {
        severity: 'warning',
        field: 'bar',
        message: 'Unknown field "bar". Claude Code ignores it.',
      },
    ]);
  });

  it('keeps the spec when only warnings are found', () => {
    const result = parseAgentFile('---\nname: a\ndescription: b\nfoo: 1\n---\nx');
    expect(result.spec).toStrictEqual({ frontmatter: { name: 'a', description: 'b' }, body: 'x' });
    expect(result.issues).toStrictEqual([
      {
        severity: 'warning',
        field: 'foo',
        message: 'Unknown field "foo". Claude Code ignores it.',
      },
    ]);
  });

  it('reports invalid enum values with a dotted path for nested fields', () => {
    expect(
      validateAgentFile(
        '---\nname: a\ndescription: b\neffort: huge\nexperimental:\n  cacheTtl: 2h\n---\nx',
      ),
    ).toStrictEqual([
      {
        severity: 'error',
        field: 'effort',
        message: 'effort must be one of: low, medium, high, xhigh, max.',
      },
      {
        severity: 'error',
        field: 'experimental.cacheTtl',
        message: 'cacheTtl must be one of: 5m, 1h.',
      },
    ]);
  });

  it('warns about unconventional names and an empty body', () => {
    expect(validateAgentFile('---\nname: Code Reviewer\ndescription: b\n---\n  \n')).toStrictEqual([
      {
        severity: 'warning',
        field: 'name',
        message:
          'Names are usually lowercase letters, digits and hyphens, such as "code-reviewer".',
      },
      {
        severity: 'warning',
        field: null,
        message: 'The body is empty, so the subagent has no system prompt.',
      },
    ]);
  });

  it('accepts digits and hyphens as conventional', () => {
    expect(validateAgentFile('---\nname: reviewer-v2\ndescription: b\n---\nx')).toStrictEqual([]);
  });
});

describe('validateSkillFile', () => {
  it('finds nothing wrong with a good file', () => {
    expect(validateSkillFile('---\nname: fix\ndescription: Fixes\n---\nDo it.\n')).toStrictEqual(
      [],
    );
  });

  it('reports structural problems as errors', () => {
    expect(validateSkillFile('---\n[1\n---\n')[0]?.severity).toBe('error');
    expect(parseSkillFile('nope').spec).toBeNull();
  });

  it('warns about a missing name, description and body', () => {
    expect(validateSkillFile('---\n---\n')).toStrictEqual([
      {
        severity: 'warning',
        field: 'name',
        message: 'No name, so Claude Code uses the directory name.',
      },
      {
        severity: 'warning',
        field: 'description',
        message:
          'No description, so Claude uses the first line of the body to decide when to use it.',
      },
      {
        severity: 'warning',
        field: null,
        message: 'The body is empty, so the skill has no instructions.',
      },
    ]);
  });

  it('reports schema errors by field along with unknown fields', () => {
    expect(validateSkillFile('---\nname: a\nshell: zsh\nfoo: 1\n---\nx')).toStrictEqual([
      { severity: 'error', field: 'shell', message: 'shell must be one of: bash, powershell.' },
      {
        severity: 'warning',
        field: 'foo',
        message: 'Unknown field "foo". Claude Code ignores it.',
      },
    ]);
  });

  it('warns when description plus when_to_use passes the listing limit', () => {
    const half = 'a'.repeat(LISTING_DESCRIPTION_LIMIT / 2);
    const atLimit = `---\nname: a\ndescription: ${half}\nwhen_to_use: ${half}\n---\nx`;
    expect(validateSkillFile(atLimit)).toStrictEqual([]);
    const over = `---\nname: a\ndescription: ${half}b\nwhen_to_use: ${half}\n---\nx`;
    expect(validateSkillFile(over)).toStrictEqual([
      {
        severity: 'warning',
        field: 'description',
        message:
          'description plus when_to_use is 1537 characters. The skill listing cuts it at 1536.',
      },
    ]);
    const whenOnly = `---\nname: a\ndescription: d\nwhen_to_use: ${'w'.repeat(1536)}\n---\nx`;
    expect(validateSkillFile(whenOnly)).toHaveLength(1);
    const descriptionOnly = `---\nname: a\ndescription: ${'d'.repeat(1537)}\n---\nx`;
    expect(validateSkillFile(descriptionOnly)).toHaveLength(1);
    const fullDescription = `---\nname: a\ndescription: ${'d'.repeat(1536)}\n---\nx`;
    expect(validateSkillFile(fullDescription)).toStrictEqual([]);
    const fullWhen = `---\nname: a\nwhen_to_use: ${'w'.repeat(1536)}\n---\nx`;
    expect(validateSkillFile(fullWhen).map((issue) => issue.field)).toStrictEqual(['description']);
  });

  it('warns when fork-only fields are set without context: fork', () => {
    const text = '---\nname: a\ndescription: d\nagent: Explore\nbackground: false\n---\nx';
    expect(validateSkillFile(text)).toStrictEqual([
      { severity: 'warning', field: 'agent', message: 'agent only applies with "context: fork".' },
      {
        severity: 'warning',
        field: 'background',
        message: 'background only applies with "context: fork".',
      },
    ]);
    expect(validateSkillFile(text.replace('agent:', 'context: fork\nagent:'))).toStrictEqual([]);
  });

  it('warns about unconventional skill names', () => {
    expect(validateSkillFile('---\nname: Fix_It\ndescription: d\n---\nx')).toHaveLength(1);
  });
});

describe('hasErrors', () => {
  it('is true only when an error is present', () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([{ severity: 'warning', field: null, message: 'm' }])).toBe(false);
    expect(
      hasErrors([
        { severity: 'warning', field: null, message: 'm' },
        { severity: 'error', field: null, message: 'm' },
      ]),
    ).toBe(true);
  });
});
