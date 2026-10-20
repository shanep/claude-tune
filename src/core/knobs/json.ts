// JSON and fs error helpers shared by the knobs readers and writers.

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

interface JsonObject {
  /** Undefined members are dropped by JSON.stringify, as in fast-check's JsonObject. */
  readonly [key: string]: JsonValue | undefined;
}

export type JsonRecord = Readonly<Record<string, unknown>>;

export function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Array.isArray narrows to any[]; this narrows to readonly unknown[]. */
export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export type ParsedJson =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseJson(text: string): ParsedJson {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
