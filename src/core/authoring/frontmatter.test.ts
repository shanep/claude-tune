import { describe, expect, it } from 'vitest';

import { isRecord, joinFrontmatter, normalizeBody, parseFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  it('splits fields from the body and drops the separating blank line', () => {
    expect(parseFrontmatter('---\nname: a\ncount: 2\n---\n\nBody text\n')).toStrictEqual({
      ok: true,
      data: { name: 'a', count: 2 },
      body: 'Body text\n',
    });
  });

  it('keeps extra leading blank lines in the body', () => {
    expect(parseFrontmatter('---\na: 1\n---\n\n\nBody')).toStrictEqual({
      ok: true,
      data: { a: 1 },
      body: '\nBody',
    });
  });

  it('accepts a body right after the closing line', () => {
    expect(parseFrontmatter('---\na: 1\n---\nBody\nmore\n')).toStrictEqual({
      ok: true,
      data: { a: 1 },
      body: 'Body\nmore\n',
    });
    expect(parseFrontmatter('---\na: 1\n---')).toStrictEqual({
      ok: true,
      data: { a: 1 },
      body: '',
    });
  });

  it('handles CRLF line endings, a BOM and trailing spaces on markers', () => {
    expect(parseFrontmatter('\uFEFF--- \r\na: 1\r\n---\t\r\n\r\nBody\r\n')).toStrictEqual({
      ok: true,
      data: { a: 1 },
      body: 'Body\r\n',
    });
  });

  it('treats an empty block as no fields', () => {
    expect(parseFrontmatter('---\n---\n')).toStrictEqual({ ok: true, data: {}, body: '' });
    expect(parseFrontmatter('---\n# just a comment\n---\nx')).toStrictEqual({
      ok: true,
      data: {},
      body: 'x',
    });
  });

  it('requires the opening marker on the first line', () => {
    const expected = {
      ok: false,
      message: 'The file must start with a "---" line that opens the frontmatter.',
    };
    expect(parseFrontmatter('name: a\n')).toStrictEqual(expected);
    expect(parseFrontmatter('\n---\na: 1\n---\n')).toStrictEqual(expected);
    expect(parseFrontmatter('----\na: 1\n---\n')).toStrictEqual(expected);
  });

  it('requires a closing marker', () => {
    expect(parseFrontmatter('---\na: 1\n--- x\n')).toStrictEqual({
      ok: false,
      message: 'The frontmatter has no closing "---" line.',
    });
  });

  it('reports YAML errors', () => {
    const result = parseFrontmatter('---\na: [1, 2\n---\n');
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.message).toMatch(
      /^The frontmatter is not valid YAML \(line 3\): Flow sequence/u,
    );
    // One line, without the code frame YAML adds in pretty mode.
    expect(result.ok ? '' : result.message).not.toContain('\n');
    const second = parseFrontmatter('---\nok: 1\nok: 2\n---\n');
    expect(second.ok ? '' : second.message).toMatch(
      /^The frontmatter is not valid YAML \(line 3\): \S/u,
    );
  });

  it('reports duplicate keys as YAML errors', () => {
    const result = parseFrontmatter('---\na: 1\na: 2\n---\n');
    expect(result.ok ? '' : result.message).toContain('not valid YAML');
  });

  it('rejects frontmatter that is not a map', () => {
    const expected = {
      ok: false,
      message: 'The frontmatter must be a map of field names to values.',
    };
    expect(parseFrontmatter('---\n- a\n---\n')).toStrictEqual(expected);
    expect(parseFrontmatter('---\nhello\n---\n')).toStrictEqual(expected);
  });
});

describe('normalizeBody', () => {
  it('ends a body with exactly one newline', () => {
    expect(normalizeBody('a\n\n  \n')).toBe('a\n');
    expect(normalizeBody('  a')).toBe('  a\n');
    expect(normalizeBody(' \n\t')).toBe('');
  });
});

describe('joinFrontmatter', () => {
  it('writes YAML between markers and a blank line before the body', () => {
    expect(joinFrontmatter({ name: 'a', tools: ['Read'] }, 'Body')).toBe(
      '---\nname: a\ntools:\n  - Read\n---\n\nBody\n',
    );
  });

  it('writes nothing after the markers for an empty body', () => {
    expect(joinFrontmatter({ name: 'a' }, '\n')).toBe('---\nname: a\n---\n');
  });

  it('writes empty markers for no fields', () => {
    expect(joinFrontmatter({}, 'x')).toBe('---\n---\n\nx\n');
  });

  it('does not fold long lines', () => {
    const long = 'word '.repeat(60).trim();
    expect(joinFrontmatter({ description: long }, '')).toBe(`---\ndescription: ${long}\n---\n`);
  });
});

describe('isRecord', () => {
  it('accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });
});
