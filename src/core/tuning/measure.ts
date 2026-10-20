// Measures one session's transcript for /tune: how big its context
// got, where the money went, and the habits that waste tokens (huge tool
// results, rereads, re-running the same command, denied tools). Only counts
// and short labels are kept, never prompt or file text.
// cspell:words uvicorn pytest

import type { CostlySubagent, HeavyItem } from '../../shared/tuning.js';
import { isPlainObject } from '../knobs/json.js';
import { transcriptPrompts } from '../reputation/prompts.js';
import type { PriceTable } from '../transcripts/pricing.js';
import { DEFAULT_PRICES } from '../transcripts/pricing.js';
import type { ContentBlock, TranscriptRecord } from '../transcripts/schemas.js';
import { parseTimestamp, parseTranscriptLine } from '../transcripts/schemas.js';
import { resultText } from '../transcripts/text.js';

import { attribute } from './attribute.js';
import { cdTarget } from './cd-target.js';
import type { CostSplit, Usage } from './cost.js';
import { addCost, costOfUsage, firstUsage, overCap, ZERO_COST } from './cost.js';
import type { CommandFamily } from './families.js';
import { FAMILY_PATTERNS, familyCounts } from './families.js';
import type { SpendHour } from './spend-hours.js';
import { HourTally } from './spend-hours.js';
import type { SpendSplit } from './spend.js';
import { StackTally } from './stack.js';
import type { SubagentInfo } from './subagent-tally.js';
import { measureSubagents } from './subagent-tally.js';

export type { CommandFamily } from './families.js';
export { COMPACT_AT, costTotal } from './cost.js';
export type { SubagentInfo } from './subagent-tally.js';

/** Kinds of shell work that a skill or agent could take over. */

export interface RepeatedCommand {
  readonly command: string;
  readonly runs: number;
}

export interface SessionMeasure {
  readonly sessionId: string;
  readonly title: string;
  readonly cwd: string | null;
  /** Epoch ms of the first record. */
  readonly startedAt: number;
  /** Epoch ms of the last record. */
  readonly updatedAt: number;
  readonly prompts: number;
  /** API requests on the main thread. */
  readonly requests: number;
  /** Largest context sent in one main thread request, in tokens. */
  readonly peakContext: number;
  /** Context tokens summed over every main thread request. */
  readonly contextTokens: number;
  readonly compactions: number;
  /** Main thread cost. */
  readonly cost: CostSplit;
  /** What capping every context at COMPACT_AT would have saved, main thread and subagents. */
  readonly compactSavingUsd: number;
  /** Requests that wrote most of a large context again after a long pause. */
  readonly idleRewrites: number;
  readonly idleRewriteUsd: number;
  /** Tool results over BIG_RESULT_CHARS characters. */
  readonly bigResults: number;
  /** Reads of a file after its second read. */
  readonly extraReads: number;
  /** Runs of a shell command after its second identical run. */
  readonly repeatedRuns: number;
  readonly topRepeat: RepeatedCommand | null;
  readonly toolCalls: number;
  /** Failed tool calls, denials included. */
  readonly toolErrors: number;
  /** Tool calls the person or auto mode refused. */
  readonly denials: number;
  readonly bashCommands: number;
  /** Shell commands that start with cd. */
  readonly cdCommands: number;
  /** Folders outside the session folder that a leading cd went to, with counts, the most used first. */
  readonly cdTargets: Readonly<Record<string, number>>;
  /** Subagents spawned, by agent type. */
  readonly spawns: Readonly<Record<string, number>>;
  readonly subagentRequests: number;
  /** Subagent requests on Opus, Fable or Mythos. */
  readonly premiumSubagentRequests: number;
  readonly subagentUsd: number;
  /** Main thread commands and searches by family. */
  readonly families: Readonly<Record<CommandFamily, number>>;
  /** Spend by clock hour, oldest first, for the plan limit windows. */
  readonly hours: readonly SpendHour[];
  /** Programs run and file extensions touched, with counts, the most used first. */
  readonly stack: Readonly<Record<string, number>>;
  /** Main thread cost by what filled the context. Sums to the main thread cost. */
  readonly spend: SpendSplit;
  /** Subagent cost by what filled their context. */
  readonly subagentSpend: SpendSplit;
  /** What cost the most to carry on the main thread, worst first. */
  readonly heavy: readonly HeavyItem[];
  /** Cost of carrying each file read, main thread and subagents, by absolute path. */
  readonly files: Readonly<Record<string, number>>;
  /** Cost of carrying each loaded skill body, by skill folder. */
  readonly skills: Readonly<Record<string, number>>;
  /** Cost of sending each tool definition on the main thread, by tool name. */
  readonly toolSchemas: Readonly<Record<string, number>>;
  /** Tool calls by tool name, main thread and subagents. */
  readonly toolUses: Readonly<Record<string, number>>;
  /** The most expensive subagents, worst first. */
  readonly subagents: readonly CostlySubagent[];
}

export interface MeasureInput {
  readonly sessionId: string;
  readonly main: readonly string[];
  /** One list of lines per subagent transcript. */
  readonly subagents: readonly (readonly string[])[];
  /** The meta file of each subagent, in the same order, when there is one. */
  readonly subagentInfo?: readonly (SubagentInfo | null)[];
  /** Used when no record has a valid timestamp. */
  readonly fallbackAt: number;
  readonly prices?: PriceTable;
}

/** About 10K tokens: big enough that leaving it in context for the rest of a session hurts. */
export const BIG_RESULT_CHARS = 40_000;
/** The shortest prompt cache lifetime. A large write after a longer pause is a rewrite. */
export const IDLE_GAP_MS = 5 * 60_000;
const IDLE_REWRITE_MIN_TOKENS = 50_000;
const TITLE_CHARS = 80;
const TOP_FILES = 12;
const COMMAND_CHARS = 120;
const TOP_CD_TARGETS = 8;

const DENIAL =
  /doesn't want to proceed|denied by (?:the )?(?:Claude Code )?auto[- ]mode|permission to use \S+ (?:has been|was) denied/iu;
const CD_FIRST = /^\s*cd\s/u;

const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Read', 'Grep', 'Glob']);
const SPAWN_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);

function oneLine(text: string, max: number): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

function stringField(input: unknown, key: string): string | null {
  const value = isPlainObject(input) ? input[key] : null;
  return typeof value === 'string' ? value : null;
}

function resultChars(block: Extract<ContentBlock, { type: 'tool_result' }>): number {
  const { content } = block;
  if (typeof content === 'string') {
    return content.length;
  }
  return content.reduce((sum, part) => sum + (part.text?.length ?? 0), 0);
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Counts beyond `free` per key, summed: 5 reads of one file with free 2 gives 3. */
function beyond(map: ReadonlyMap<string, number>, free: number): number {
  let extra = 0;
  for (const count of map.values()) {
    extra += Math.max(0, count - free);
  }
  return extra;
}

type AssistantRecord = Extract<TranscriptRecord, { type: 'assistant' }>;
type BaseRecord = Extract<
  TranscriptRecord,
  { type: 'user' | 'assistant' | 'system' | 'attachment' }
>;

const BASE_TYPES: ReadonlySet<string> = new Set(['user', 'assistant', 'system', 'attachment']);

function hasBaseFields(record: TranscriptRecord): record is BaseRecord {
  return BASE_TYPES.has(record.type);
}

/** Running totals for the main thread, mutated record by record. */
class MainTally {
  title: string | null = null;
  cwd: string | null = null;
  firstAt: number | null = null;
  lastAt: number | null = null;
  requests = 0;
  peakContext = 0;
  contextTokens = 0;
  compactions = 0;
  cost: CostSplit = ZERO_COST;
  idleRewrites = 0;
  idleRewriteUsd = 0;
  compactSavingUsd = 0;
  bigResults = 0;
  toolCalls = 0;
  toolErrors = 0;
  denials = 0;
  bashCommands = 0;
  cdCommands = 0;
  readonly cdTargets = new Map<string, number>();
  readonly reads = new Map<string, number>();
  readonly commands = new Map<string, number>();
  readonly spawns = new Map<string, number>();
  readonly families = new Map<string, number>();
  readonly stack = new StackTally();
  private readonly seen = new Set<string>();
  private readonly toolIds = new Set<string>();
  private lastRequestAt: number | null = null;

  constructor(
    private readonly prices: PriceTable,
    private readonly hours: HourTally,
  ) {}

  ingest(record: TranscriptRecord): void {
    if (record.type === 'custom-title') {
      this.title = record.customTitle;
    } else if (record.type === 'ai-title') {
      this.title ??= record.aiTitle;
    } else if (hasBaseFields(record)) {
      this.base(record);
    }
  }

  private base(record: BaseRecord): void {
    this.cwd ??= record.cwd ?? null;
    const at = parseTimestamp(record.timestamp);
    this.firstAt ??= at;
    this.lastAt = at ?? this.lastAt;
    if (record.type === 'system') {
      this.compactions += record.subtype === 'compact_boundary' ? 1 : 0;
    } else if (record.type === 'assistant') {
      this.assistant(record, at);
    } else if (record.type === 'user' && Array.isArray(record.message.content)) {
      this.results(record.message.content);
    }
  }

  private assistant(record: AssistantRecord, at: number | null): void {
    const usage = firstUsage(record, this.seen);
    if (usage !== null) {
      this.request(record.message.model, usage, at);
    }
    for (const block of record.message.content) {
      if (block.type === 'tool_use' && !this.toolIds.has(block.id)) {
        this.toolIds.add(block.id);
        this.tool(block.name, block.input);
      }
    }
  }

  private request(model: string, usage: Usage, at: number | null): void {
    const context = usage.input + usage.cacheRead + usage.cacheWrite;
    this.requests += 1;
    this.contextTokens += context;
    this.peakContext = Math.max(this.peakContext, context);
    const cost = costOfUsage(model, usage, this.prices) ?? ZERO_COST;
    this.cost = addCost(this.cost, cost);
    this.compactSavingUsd += overCap(cost, context);
    const paused =
      at !== null && this.lastRequestAt !== null && at - this.lastRequestAt >= IDLE_GAP_MS;
    const rewrite =
      paused && usage.cacheWrite >= IDLE_REWRITE_MIN_TOKENS && usage.cacheWrite * 2 >= context;
    if (rewrite) {
      this.idleRewrites += 1;
      this.idleRewriteUsd += cost.cacheWrite;
    }
    this.lastRequestAt = at ?? this.lastRequestAt;
    this.hours.main({
      at,
      model,
      tokens: usage,
      cost,
      idleRewriteUsd: rewrite ? cost.cacheWrite : 0,
    });
  }

  private tool(name: string, input: unknown): void {
    this.toolCalls += 1;
    if (SEARCH_TOOLS.has(name)) {
      bump(this.families, 'search');
    }
    const file = stringField(input, 'file_path');
    if (file !== null) {
      this.stack.file(file);
    }
    if (name === 'Read' && file !== null) {
      bump(this.reads, file);
    } else if (name === 'Bash') {
      this.bash(stringField(input, 'command') ?? '');
    } else if (SPAWN_TOOLS.has(name)) {
      bump(this.spawns, stringField(input, 'subagent_type') ?? 'general-purpose');
    }
  }

  private bash(command: string): void {
    this.bashCommands += 1;
    this.stack.command(command);
    this.cdCommands += CD_FIRST.test(command) ? 1 : 0;
    const target = cdTarget(command, this.cwd);
    if (target !== null) {
      bump(this.cdTargets, target);
    }
    const trimmed = command.trim();
    if (trimmed !== '') {
      bump(this.commands, trimmed);
    }
    for (const [family, patterns] of FAMILY_PATTERNS) {
      if (patterns.some((pattern) => pattern.test(command))) {
        bump(this.families, family);
      }
    }
  }

  private results(content: readonly ContentBlock[]): void {
    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue;
      }
      this.bigResults += resultChars(block) > BIG_RESULT_CHARS ? 1 : 0;
      if (block.is_error === true) {
        this.toolErrors += 1;
        this.denials += DENIAL.test(resultText(block.content)) ? 1 : 0;
      }
    }
  }
}

function topRepeat(commands: ReadonlyMap<string, number>): RepeatedCommand | null {
  let best: RepeatedCommand | null = null;
  for (const [command, runs] of commands) {
    if (runs > 2 && (best === null || runs > best.runs)) {
      best = { command: oneLine(command, COMMAND_CHARS), runs };
    }
  }
  return best;
}

export function measureSession(input: MeasureInput): SessionMeasure {
  const prices = input.prices ?? DEFAULT_PRICES;
  const hours = new HourTally(prices);
  const main = new MainTally(prices, hours);
  for (const line of input.main) {
    const record = parseTranscriptLine(line);
    if (record !== null) {
      main.ingest(record);
    }
  }
  const mainParts = attribute(input.main, prices);
  const subs = measureSubagents(
    { lines: input.subagents, info: input.subagentInfo, main: mainParts },
    prices,
    hours,
  );
  const sub = subs.tally;
  const prompts = transcriptPrompts(input.main, {
    sessionId: input.sessionId,
    fallbackAt: input.fallbackAt,
  });
  const fallbackTitle = prompts[0]?.text ?? `Session ${input.sessionId.slice(0, 8)}`;
  return {
    sessionId: input.sessionId,
    title: oneLine(main.title ?? fallbackTitle, TITLE_CHARS),
    cwd: main.cwd,
    startedAt: main.firstAt ?? input.fallbackAt,
    updatedAt: main.lastAt ?? input.fallbackAt,
    prompts: prompts.length,
    requests: main.requests,
    peakContext: main.peakContext,
    contextTokens: main.contextTokens,
    compactions: main.compactions,
    cost: main.cost,
    idleRewrites: main.idleRewrites,
    idleRewriteUsd: main.idleRewriteUsd,
    compactSavingUsd: main.compactSavingUsd + sub.compactSavingUsd,
    bigResults: main.bigResults,
    extraReads: beyond(main.reads, 2),
    repeatedRuns: beyond(main.commands, 2),
    topRepeat: topRepeat(main.commands),
    toolCalls: main.toolCalls,
    toolErrors: main.toolErrors,
    denials: main.denials,
    bashCommands: main.bashCommands,
    cdCommands: main.cdCommands,
    cdTargets: Object.fromEntries(
      [...main.cdTargets].toSorted((left, right) => right[1] - left[1]).slice(0, TOP_CD_TARGETS),
    ),
    spawns: Object.fromEntries(main.spawns),
    subagentRequests: sub.requests,
    premiumSubagentRequests: sub.premium,
    subagentUsd: sub.usd,
    families: familyCounts(main.families),
    hours: hours.hours(),
    stack: main.stack.labels(),
    spend: mainParts.spend,
    subagentSpend: subs.spend,
    heavy: mainParts.heavy,
    files: Object.fromEntries(
      [...subs.files].toSorted((left, right) => right[1] - left[1]).slice(0, TOP_FILES),
    ),
    skills: mainParts.skills,
    toolSchemas: mainParts.toolSchemas,
    toolUses: Object.fromEntries(subs.toolUses),
    subagents: subs.subagents,
  };
}
