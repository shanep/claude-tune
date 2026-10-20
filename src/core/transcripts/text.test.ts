import { describe, expect, it } from 'vitest';

import { resultText } from './text.js';

describe('resultText', () => {
  it('returns strings as they are', () => {
    expect(resultText('plain')).toBe('plain');
  });

  it('joins text parts and skips the rest', () => {
    expect(
      resultText([
        { type: 'text', text: 'one' },
        { type: 'image', text: 'ignored' },
        { type: 'text', text: null },
        { type: 'text' },
        { type: 'text', text: 'two' },
      ]),
    ).toBe('one\ntwo');
    expect(resultText([])).toBe('');
  });
});
