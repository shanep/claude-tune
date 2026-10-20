import { describe, expect, it } from 'vitest';

import { percent, plural, tokens, usd } from './words.js';

describe('tip words', () => {
  it('writes token counts compactly', () => {
    expect(tokens(950.4)).toBe('950');
    expect(tokens(1000)).toBe('1K');
    expect(tokens(949_442)).toBe('949K');
    expect(tokens(999_500)).toBe('1M');
    expect(tokens(1_234_567)).toBe('1.2M');
  });

  it('writes dollars with cents below ten and whole dollars above', () => {
    expect(usd(0.4)).toBe('$0.40');
    expect(usd(9.99)).toBe('$9.99');
    expect(usd(1468.34)).toBe('$1,468');
  });

  it('writes percents and plurals', () => {
    expect(percent(0.628)).toBe('63%');
    expect(plural(1, 'session')).toBe('1 session');
    expect(plural(1200, 'session')).toBe('1,200 sessions');
    expect(plural(2, 'search', 'searches')).toBe('2 searches');
    expect(plural(1, 'search', 'searches')).toBe('1 search');
  });
});
