// Works out what filled a session's context and what carrying each piece
// cost. Every request sends the whole conversation again, so a file read
// early in a long session is paid for on every later request until a
// compaction drops it. Each request's input cost is split between the fixed
// setup (system prompt and tool definitions, measured from the first request)
// and what the transcript shows was in context then, by size. Only sizes,
// tool names, file paths and short command labels are kept.

import type { HeavyItem } from '../../shared/tuning.js';
import { isArray, isPlainObject } from '../knobs/json.js';
import type { PriceTable } from '../transcripts/pricing.js';
import { findPrice } from '../transcripts/pricing.js';

import type { Piece } from './pieces.js';
import {
  asString,
  attachmentPiece,
  callDetail,
  field,
  filesIn,
  oneLine,
  resultSource,
  talk,
  textLength,
  textPiece,
} from './pieces.js';
import type { SpendSplit } from './spend.js';
import { CHARS_PER_TOKEN, zeroSpend } from './spend.js';

const HEAVY_ITEMS = 6;
const TOP_FILES = 12;

export interface Attribution {
  readonly spend: SpendSplit;
  readonly heavy: readonly HeavyItem[];
  /** Cost of carrying each file read, by path. */
  readonly files: Readonly<Record<string, number>>;
  /** Cost of carrying each loaded skill body, by skill folder. */
  readonly skills: Readonly<Record<string, number>>;
  /** Cost of sending each tool's definition, by tool name, from the request shapes. */
  readonly toolSchemas: Readonly<Record<string, number>>;
  readonly toolUses: Readonly<Record<string, number>>;
}

interface Item extends Piece {
  /** The running cost per character when the item came into context. */
  readonly born: number;
}

interface Shape {
  readonly systemChars: number;
  readonly tools: ReadonlyMap<string, number>;
}

interface ToolCall {
  readonly name: string;
  /** The file path, command or query, for labels. */
  readonly detail: string;
}

function bump(map: Map<string, number>, key: string, by: number): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function readShape(shape: unknown): Shape {
  const tools = new Map<string, number>();
  const list = field(shape, 'tools');
  for (const tool of isArray(list) ? list : []) {
    const name = asString(field(tool, 'name'));
    if (name !== null) {
      tools.set(name, JSON.stringify(tool).length);
    }
  }
  return { systemChars: JSON.stringify(field(shape, 'system') ?? '').length, tools };
}

function tokenCount(usage: Readonly<Record<string, unknown>>, key: string): number {
  const value = usage[key];
  return typeof value === 'number' ? value : 0;
}

function filesOf(call: ToolCall): readonly string[] {
  return call.name === 'Read' ? [call.detail] : filesIn(call.detail);
}

/** Running totals for one transcript, record by record. */
class Tally {
  readonly spend = zeroSpend();
  readonly files = new Map<string, number>();
  readonly skills = new Map<string, number>();
  readonly toolSchemas = new Map<string, number>();
  readonly toolUses = new Map<string, number>();
  heavy: HeavyItem[] = [];
  private live: Item[] = [];
  private liveChars = 0;
  /** Sum over requests of the input cost each character of context took. */
  private perChar = 0;
  private setupTokens: number | null = null;
  private shape: Shape | null = null;
  private readonly calls = new Map<string, ToolCall>();
  private readonly seen = new Set<string>();

  constructor(private readonly prices: PriceTable) {}

  record(record: unknown): void {
    switch (asString(field(record, 'type')) ?? '') {
      case 'assistant': {
        this.assistant(field(record, 'message'));
        break;
      }
      case 'user': {
        this.user(record);
        break;
      }
      case 'attachment': {
        this.add(attachmentPiece(record));
        break;
      }
      case 'api-request-shape': {
        this.shape = readShape(field(record, 'shape'));
        break;
      }
      case 'system': {
        if (field(record, 'subtype') === 'compact_boundary') {
          this.dropAll();
        }
        break;
      }
      default:
    }
  }

  dropAll(): void {
    for (const item of this.live) {
      this.settle(item);
    }
    this.live = [];
    this.liveChars = 0;
  }

  private add(piece: Piece): void {
    if (piece.chars > 0) {
      this.live.push({ ...piece, born: this.perChar });
      this.liveChars += piece.chars;
    }
  }

  private settle(item: Item): void {
    const usd = item.chars * (this.perChar - item.born);
    if (usd <= 0) {
      return;
    }
    this.spend[item.source] += usd;
    if (item.file !== null) {
      bump(this.files, item.file, usd);
    }
    if (item.skill !== null) {
      bump(this.skills, item.skill, usd);
    }
    const smallest = this.heavy.at(-1);
    if (this.heavy.length < HEAVY_ITEMS || (smallest !== undefined && usd > smallest.usd)) {
      const tokens = Math.round(item.chars / CHARS_PER_TOKEN);
      this.heavy = [...this.heavy, { source: item.source, label: item.label, tokens, usd }]
        .toSorted((left, right) => right.usd - left.usd)
        .slice(0, HEAVY_ITEMS);
    }
  }

  private assistant(message: unknown): void {
    const id = asString(field(message, 'id'));
    const usage = field(message, 'usage');
    if (id !== null && isPlainObject(usage) && !this.seen.has(id)) {
      this.seen.add(id);
      this.request(asString(field(message, 'model')) ?? '', usage);
    }
    const content = field(message, 'content');
    for (const block of isArray(content) ? content : []) {
      this.assistantBlock(block);
    }
  }

  private assistantBlock(block: unknown): void {
    switch (field(block, 'type')) {
      case 'text': {
        this.add(talk('reply', textLength([block])));
        break;
      }
      case 'thinking': {
        this.add(talk('thinking', asString(field(block, 'thinking'))?.length ?? 0));
        break;
      }
      case 'tool_use': {
        this.toolUse(block);
        break;
      }
      default:
    }
  }

  private toolUse(block: unknown): void {
    const id = asString(field(block, 'id'));
    if (id === null || this.calls.has(id)) {
      return;
    }
    const name = asString(field(block, 'name')) ?? 'tool';
    const input = field(block, 'input');
    const detail = callDetail(input);
    this.calls.set(id, { name, detail });
    bump(this.toolUses, name, 1);
    this.add({
      source: 'toolInputs',
      label: oneLine(`${name} ${detail}`),
      chars: JSON.stringify(input ?? {}).length,
      file: null,
      skill: null,
    });
  }

  private request(model: string, usage: Readonly<Record<string, unknown>>): void {
    const price = findPrice(model, this.prices);
    if (price === null) {
      return;
    }
    const input = tokenCount(usage, 'input_tokens');
    const cacheRead = tokenCount(usage, 'cache_read_input_tokens');
    const cacheWrite = tokenCount(usage, 'cache_creation_input_tokens');
    const context = input + cacheRead + cacheWrite;
    const inputUsd =
      (input * price.input + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) /
      1_000_000;
    this.spend.output += (tokenCount(usage, 'output_tokens') * price.output) / 1_000_000;
    if (context === 0) {
      return;
    }
    this.setupTokens ??= Math.max(0, context - this.liveChars / CHARS_PER_TOKEN);
    const setup = Math.min(context, this.setupTokens);
    const carried = this.liveChars > 0 ? inputUsd * ((context - setup) / context) : 0;
    this.setupCost(inputUsd - carried);
    if (carried > 0) {
      this.perChar += carried / this.liveChars;
    }
  }

  private setupCost(usd: number): void {
    this.spend.setup += usd;
    const { shape } = this;
    if (shape === null) {
      return;
    }
    let whole = shape.systemChars;
    for (const chars of shape.tools.values()) {
      whole += chars;
    }
    for (const [name, chars] of shape.tools) {
      bump(this.toolSchemas, name, (usd * chars) / whole);
    }
  }

  private user(record: unknown): void {
    const content = field(field(record, 'message'), 'content');
    const meta = field(record, 'isMeta') === true;
    if (field(record, 'isCompactSummary') === true) {
      this.dropAll();
      this.add(talk('compact summary', textLength(content)));
      return;
    }
    if (typeof content === 'string') {
      this.add(textPiece(content, meta));
      return;
    }
    for (const block of isArray(content) ? content : []) {
      const type = field(block, 'type');
      if (type === 'tool_result') {
        this.result(block);
      } else if (type === 'text') {
        this.add(textPiece(asString(field(block, 'text')) ?? '', meta));
      }
    }
  }

  private result(block: unknown): void {
    const id = asString(field(block, 'tool_use_id')) ?? '';
    const call = this.calls.get(id) ?? { name: '?', detail: '' };
    const source = resultSource(call.name, call.detail);
    const chars = textLength(field(block, 'content'));
    const label = oneLine(`${call.name} ${call.detail}`);
    const files = source === 'fileReads' ? filesOf(call) : [];
    if (files.length === 0) {
      this.add({ source, label, chars, file: null, skill: null });
      return;
    }
    // A cat of several files splits its output evenly, which is close enough to rank them.
    for (const file of files) {
      const each = files.length === 1 ? label : oneLine(`${call.name} ${file}`);
      this.add({ source, label: each, chars: chars / files.length, file, skill: null });
    }
  }
}

function topOf(map: ReadonlyMap<string, number>, count: number): Record<string, number> {
  return Object.fromEntries([...map].toSorted((left, right) => right[1] - left[1]).slice(0, count));
}

export function attribute(lines: readonly string[], prices: PriceTable): Attribution {
  const tally = new Tally(prices);
  for (const line of lines) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    tally.record(record);
  }
  tally.dropAll();
  return {
    spend: tally.spend,
    heavy: tally.heavy,
    files: topOf(tally.files, TOP_FILES),
    skills: topOf(tally.skills, TOP_FILES),
    toolSchemas: Object.fromEntries(tally.toolSchemas),
    toolUses: Object.fromEntries(tally.toolUses),
  };
}
