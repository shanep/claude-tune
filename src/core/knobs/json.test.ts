import { describe, expect, it } from 'vitest';

import { errorMessage, isArray, isNotFound, isPlainObject, parseJson } from './json.js';

describe('isPlainObject', () => {
  it('accepts objects and rejects arrays, null and scalars', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject('x')).toBe(false);
    expect(isPlainObject(1)).toBe(false);
  });
});

describe('isArray', () => {
  it('accepts arrays only', () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 'a'])).toBe(true);
    expect(isArray({ length: 0 })).toBe(false);
    expect(isArray('abc')).toBe(false);
  });
});

describe('parseJson', () => {
  it('returns the parsed value or the parse error', () => {
    expect(parseJson('{"a":[1,null]}')).toStrictEqual({ ok: true, value: { a: [1, null] } });
    expect(parseJson('null')).toStrictEqual({ ok: true, value: null });
    const bad = parseJson('{oops');
    expect(bad.ok).toBe(false);
    expect(bad).toHaveProperty('error');
    expect(bad.ok ? '' : bad.error).toMatch(/JSON|token|property/iu);
  });
});

describe('errorMessage', () => {
  it('uses the message of an Error and String() for anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('plain')).toBe('plain');
    expect(errorMessage(42)).toBe('42');
  });
});

describe('isNotFound', () => {
  it('is true only for an Error with code ENOENT', () => {
    expect(isNotFound(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(true);
    expect(isNotFound(Object.assign(new Error('nope'), { code: 'EACCES' }))).toBe(false);
    expect(isNotFound(new Error('no code'))).toBe(false);
    expect(isNotFound({ code: 'ENOENT' })).toBe(false);
  });
});
