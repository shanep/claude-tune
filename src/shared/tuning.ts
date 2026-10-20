// What /tune shows: advice from the session transcripts, each with
// its pros and cons, and the skills and agents /tune can write.

export type TipSeverity = 'high' | 'medium' | 'low';

/** A session that shows the problem a tip is about. */
export interface TipSession {
  readonly sessionId: string;
  readonly title: string;
  /** The number that put it on the list, for example "949K peak context". */
  readonly detail: string;
}

/** How a measured number is shown. */
export type ImpactFormat = 'tokens' | 'usd' | 'percent' | 'per100';

/** Which way a number moved, judged by whether lower is better. */
export type ImpactDirection = 'better' | 'worse' | 'same';

/**
 * The overall answer. `early` until enough sessions ran after tracking
 * started, `no-baseline` when nothing ran in the weeks before to compare with.
 */
export type ImpactVerdict = 'better' | 'worse' | 'mixed' | 'same' | 'early' | 'no-baseline';

/** One number compared before and after a tip was taken up. Lower is better for all of them. */
export interface ImpactMetric {
  readonly id: string;
  readonly label: string;
  /** The habit the tip is about, the cost, or a side effect its cons warn about. */
  readonly role: 'target' | 'cost' | 'side-effect';
  /** Why a side effect is worth watching, empty for the others. */
  readonly why: string;
  readonly format: ImpactFormat;
  readonly before: number | null;
  readonly after: number | null;
  /** (after - before) / before, or null when that cannot be worked out. */
  readonly change: number | null;
  /** Null when either side has no data. */
  readonly direction: ImpactDirection | null;
}

/** One week since tracking started. */
export interface ImpactWeek {
  readonly start: number;
  readonly sessions: number;
  /** One value per metric, in the same order as `TipImpact.metrics`. */
  readonly values: readonly (number | null)[];
}

/** What changed since you started following a tip. */
export interface TipImpact {
  readonly trackedSince: number;
  readonly verdict: ImpactVerdict;
  /** One or two sentences that say what moved. */
  readonly summary: string;
  readonly sessionsBefore: number;
  readonly sessionsAfter: number;
  readonly metrics: readonly ImpactMetric[];
  /** Oldest first, at most the last few weeks. */
  readonly weeks: readonly ImpactWeek[];
}

/** What filled the context that each request sent again, or the reply it wrote. */
export type SpendSource =
  | 'setup'
  | 'instructions'
  | 'skills'
  | 'reminders'
  | 'fileReads'
  | 'toolOutput'
  | 'web'
  | 'toolInputs'
  | 'subagentReports'
  | 'conversation'
  | 'output';

/** One source's part of the spend. */
export interface SpendSlice {
  readonly source: SpendSource;
  readonly label: string;
  readonly usd: number;
  /** Share of the spend it is part of, 0 to 1. */
  readonly share: number;
}

/** One thing that sat in a session's context, and what carrying it cost. */
export interface HeavyItem {
  readonly source: SpendSource;
  /** What it was, such as "Read src/app.ts" or "Bash: npm test". */
  readonly label: string;
  readonly tokens: number;
  readonly usd: number;
}

/** A subagent of a costly session. */
export interface CostlySubagent {
  readonly type: string;
  readonly description: string;
  readonly usd: number;
  readonly requests: number;
  readonly peakContext: number;
}

/** Why a session cost what it did, with what fixing it would have saved. */
export interface CostCause {
  readonly id: string;
  readonly text: string;
  /** What this cause cost the session. */
  readonly usd: number;
  /** What the fix would have saved on this session, or null when it cannot be worked out. */
  readonly savedUsd: number | null;
  /** The tip with the fix, or null. */
  readonly tipId: string | null;
}

/** A closer look at one of the most expensive sessions. */
export interface CostlySession {
  readonly sessionId: string;
  readonly title: string;
  readonly cwd: string | null;
  readonly updatedAt: number;
  readonly usd: number;
  readonly subagentUsd: number;
  readonly requests: number;
  readonly averageContext: number;
  readonly peakContext: number;
  /** Main thread and subagents together, biggest first. */
  readonly spend: readonly SpendSlice[];
  /** Biggest saving first. */
  readonly causes: readonly CostCause[];
  /** What cost the most to carry, worst first. */
  readonly heavy: readonly HeavyItem[];
  /** The most expensive subagents, worst first. */
  readonly subagents: readonly CostlySubagent[];
}

/** A file sessions kept reading, and what carrying it cost them. */
export interface HotFile {
  /** The project folder the path is relative to. */
  readonly project: string;
  readonly path: string;
  readonly sessions: number;
  readonly usd: number;
}

/**
 * A fix /tune applies for you: set a setting, write a skill or agent, or
 * hand Claude a task that makes the change.
 */
export type AutoFix =
  | {
      readonly kind: 'knob';
      readonly id: string;
      readonly title: string;
      readonly detail: string;
      readonly key: string;
      readonly value: unknown;
      /** True when the setting already has this value. */
      readonly applied: boolean;
    }
  | {
      readonly kind: 'create';
      readonly id: string;
      readonly title: string;
      readonly detail: string;
      readonly suggestionId: string;
      readonly applied: boolean;
    }
  | {
      readonly kind: 'launch';
      readonly id: string;
      readonly title: string;
      readonly detail: string;
      readonly label: string;
      readonly prompt: string;
      readonly cwd: string;
      /** True to run it in a new worktree, for changes to a repository. */
      readonly worktree: boolean;
      readonly applied: false;
    };

/** One piece of advice, backed by numbers from the session transcripts. */
export interface Tip {
  readonly id: string;
  readonly severity: TipSeverity;
  readonly title: string;
  /** What the transcripts show, with numbers. */
  readonly finding: string;
  /** What to do about it, one step per entry. */
  readonly advice: readonly string[];
  /** The worst sessions, worst first. */
  readonly sessions: readonly TipSession[];
  /** Ids of suggested skills or agents that help with it. */
  readonly fixes: readonly string[];
  /** Fixes /tune can apply for you, the one that saves the most first. */
  readonly autoFixes: readonly AutoFix[];
  /** What following the advice gains. */
  readonly pros: readonly string[];
  /** What it gives up, such as context built up over a long session. */
  readonly cons: readonly string[];
  /** When the advice is not worth following. */
  readonly skipWhen: string;
  /** The measured effect since you started following it, or null when you are not tracking it. */
  readonly impact: TipImpact | null;
}

/** A skill or agent /tune can write for you, with why it would help. */
export interface Suggestion {
  readonly id: string;
  readonly kind: 'skill' | 'agent';
  /** The file name and the name Claude Code shows. */
  readonly name: string;
  readonly summary: string;
  readonly pros: readonly string[];
  readonly cons: readonly string[];
  /** What in the transcripts points at it, or null when nothing does yet. */
  readonly reason: string | null;
  /** True when a skill or agent with this name is already in ~/.claude. */
  readonly installed: boolean;
}

/** One session's numbers in the session table. */
export interface TuningSessionRow {
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly prompts: number;
  readonly requests: number;
  readonly peakContext: number;
  readonly averageContext: number;
  /** Main thread plus subagents, at list price. */
  readonly costUsd: number;
  /** Share of the cost that went to re-reading cached context. */
  readonly cacheReadShare: number;
  /** Ids of the tips that list this session. */
  readonly tips: readonly string[];
}

export interface TuningState {
  readonly sessions: number;
  readonly totalUsd: number;
  readonly cacheReadUsd: number;
  /** Context tokens per main thread request, averaged over every session. */
  readonly averageContext: number;
  readonly largestContext: number;
  readonly subagentUsd: number;
  /** Where the spend went across every session, biggest first. */
  readonly spend: readonly SpendSlice[];
  /** The sessions that cost the most, each with why. */
  readonly costly: readonly CostlySession[];
  /** Files that cost the most to carry after reading them, worst first. */
  readonly hotFiles: readonly HotFile[];
  readonly tips: readonly Tip[];
  readonly suggestions: readonly Suggestion[];
  /** Most expensive first. */
  readonly rows: readonly TuningSessionRow[];
  /** When the transcripts were last measured, or null before the first scan. */
  readonly scannedAt: number | null;
}
