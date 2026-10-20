// Client-side cost estimates at list price. This is not billing: it ignores
// batch discounts, fast mode, 1 hour cache writes and partner pricing.

/** Tokens one request used, by kind. */
export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreation: number;
  readonly thinking: number;
}

/** US dollars per million tokens. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  /** 5 minute cache write. */
  readonly cacheWrite: number;
}

/** Keyed by model id prefix. The longest matching prefix wins. */
export type PriceTable = Readonly<Record<string, ModelPrice>>;

/**
 * Anthropic first-party list prices, looked up 2026-10-15 in the claude-api
 * skill (its model table is cached 2026-10-06). Cache writes are 1.25 times
 * input. Haiku 5.5 uses its rate for prompts up to 100K tokens.
 */
export const DEFAULT_PRICES: PriceTable = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  'claude-mythos-5': { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

// After the prefix we accept the end of the id, a "[1m]" style context tag,
// a Vertex "@" version or a dated snapshot suffix, so "claude-opus-5" does
// not price a future "claude-opus-5-9".
const SUFFIX = /^(?:$|\[|@|-\d{8}(?:$|\[|@))/u;

/** Bedrock and other platforms put a region or vendor prefix before the id. */
function bareModelId(model: string): string {
  const at = model.indexOf('claude-');
  return at > 0 ? model.slice(at) : model;
}

export function findPrice(model: string, table: PriceTable): ModelPrice | null {
  const id = bareModelId(model);
  let best: { readonly key: string; readonly price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(table)) {
    const fits = id.startsWith(key) && SUFFIX.test(id.slice(key.length));
    if (fits && (best === null || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

export function costOf(usage: TokenUsage, price: ModelPrice): number {
  const total =
    usage.input * price.input +
    usage.output * price.output +
    usage.cacheRead * price.cacheRead +
    usage.cacheCreation * price.cacheWrite;
  return total / 1_000_000;
}

/** Cost in US dollars, or null when the model is not in the table. */
export function estimateCost(model: string, usage: TokenUsage, table: PriceTable): number | null {
  const price = findPrice(model, table);
  return price === null ? null : costOf(usage, price);
}
