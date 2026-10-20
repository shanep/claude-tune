// Number formatting for tip text, which the host writes as plain sentences.

/** 950, 34K, 1.2M. */
export function tokens(value: number): string {
  if (value >= 999_500) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/u, '')}M`;
  }
  if (value >= 1000) {
    return `${Math.round(value / 1000).toString()}K`;
  }
  return Math.round(value).toString();
}

/** $0.42 below ten dollars, whole dollars from there. */
export function usd(value: number): string {
  return value < 10 ? `$${value.toFixed(2)}` : `$${Math.round(value).toLocaleString('en-US')}`;
}

/** 0.42 reads as 42%. */
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100).toString()}%`;
}

/** "1 session", "3 sessions". Pass `many` when adding an s is wrong. */
export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? word : many}`;
}
