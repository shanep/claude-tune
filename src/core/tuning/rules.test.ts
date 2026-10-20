import { describe, expect, it } from 'vitest';


import { buildTips, isTipId, tipsFor, tipsTakenBy } from './build.js';
import type { SessionMeasure } from './measure.js';
import type { TipRule } from './rules.js';
import { cacheReadShare, RULES } from './rules.js';
import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

const NOISY = measureOf({
  sessionId: 'n1',
  title: 'Noisy',
  cwd: HOME,
  prompts: 40,
  requests: 100,
  peakContext: 600_000,
  contextTokens: 30_000_000,
  cost: { input: 0, output: 2, cacheRead: 10, cacheWrite: 1 },
  idleRewrites: 3,
  idleRewriteUsd: 1.5,
  bigResults: 3,
  extraReads: 10,
  repeatedRuns: 10,
  topRepeat: { command: 'npm test', runs: 8 },
  toolCalls: 200,
  toolErrors: 30,
  denials: 10,
  bashCommands: 100,
  cdCommands: 30,
  spawns: { 'general-purpose': 9, Explore: 1 },
  subagentRequests: 50,
  premiumSubagentRequests: 50,
  subagentUsd: 3,
});

const LONG = measureOf({ sessionId: 'n2', title: 'Long', prompts: 35 });
const QUIET = measureOf();

function rule(id: string): TipRule {
  const found = RULES.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`no rule ${id}`);
  }
  return found;
}

function finding(id: string, measures: readonly SessionMeasure[]): string | null {
  return rule(id).finding(totalsOf(measures, HOME));
}

function tipsOf(
  measures: readonly SessionMeasure[],
  tracked: ReadonlyMap<string, number> = new Map(),
): ReturnType<typeof buildTips> {
  return buildTips({
    totals: totalsOf(measures, HOME),
    live: measures,
    all: measures,
    tracked,
    now: 0,
  });
}

describe('buildTips', () => {
  it('gives no tips for quiet sessions', () => {
    expect(tipsOf([QUIET])).toStrictEqual([]);
    expect(tipsOf([])).toStrictEqual([]);
  });

  it('keeps a tracked tip that no longer stands out, with its impact', () => {
    const [tip, ...rest] = tipsOf([QUIET], new Map([['rereads', 100]]));
    expect(rest).toStrictEqual([]);
    expect(tip).toMatchObject({ id: 'rereads', sessions: [] });
    expect(tip?.finding).toMatch(/^This no longer stands out/u);
    expect(tip?.impact).toMatchObject({ trackedSince: 100, verdict: 'no-baseline' });
  });

  it('measures every rule against a target that is not just the cost', () => {
    for (const each of RULES) {
      expect([each.id, each.track.target]).not.toStrictEqual([each.id, 'costPerPrompt']);
    }
  });

  it('gives every tip for noisy sessions, most severe first', () => {
    const measures = [NOISY, LONG, QUIET];
    const tips = tipsOf(measures);
    expect(tips.map((tip) => [tip.id, tip.severity])).toStrictEqual([
      ['context-reread', 'high'],
      ['huge-context', 'high'],
      ['idle-rewrite', 'medium'],
      ['subagent-model', 'medium'],
      ['big-results', 'medium'],
      ['repeated-commands', 'medium'],
      ['long-sessions', 'medium'],
      ['denials', 'medium'],
      ['rereads', 'low'],
      ['tool-errors', 'low'],
      ['cd-commands', 'low'],
    ]);
    expect(tips[0]).toMatchObject({
      title: 'Most of the spend is re-reading old context',
      finding:
        '60% of the $17 estimated spend ($10) went to re-reading cached context. The average request carried 253K tokens of conversation.',
      sessions: [{ sessionId: 'n1', title: 'Noisy', detail: '$10 re-reading context' }],
      fixes: ['handoff', 'scout'],
    });
    expect(tips[0]?.advice).toHaveLength(3);
    expect(tips.find((tip) => tip.id === 'long-sessions')?.sessions).toStrictEqual([
      { sessionId: 'n1', title: 'Noisy', detail: '40 prompts' },
      { sessionId: 'n2', title: 'Long', detail: '35 prompts' },
    ]);
  });

  it('writes each finding with its numbers', () => {
    const measures = [NOISY, LONG];
    expect(finding('huge-context', measures)).toBe(
      '1 session went past 200K tokens of context, the largest to 600K. Only 0 compactions happened across all sessions.',
    );
    expect(finding('idle-rewrite', measures)).toBe(
      '3 times a large session was picked up after its prompt cache expired, so its whole context was written to the cache again, about $1.50 in total.',
    );
    expect(finding('subagent-model', measures)).toBe(
      '100% of 50 subagent requests ran on Opus or Fable, about $3.00 in total. Only 1 of 10 spawns used the read-only Explore agent.',
    );
    expect(finding('big-results', measures)).toBe(
      '3 tool results were over 40K characters (about 10K tokens each), and each stayed in context for the rest of its session.',
    );
    expect(finding('repeated-commands', measures)).toBe(
      'Identical commands ran again 10 times after their second run. The most repeated ran 8 times: npm test',
    );
    expect(finding('long-sessions', measures)).toBe(
      '2 sessions ran past 30 prompts, the longest to 40. Each task in a long session pays for the context of the ones before it.',
    );
    expect(finding('denials', measures)).toBe(
      '10 tool calls were denied by you or by the auto mode classifier. Each denial costs a round trip and usually a retry with another command.',
    );
    expect(finding('rereads', measures)).toBe(
      'Files were read again 10 times after their second read in the same session.',
    );
    expect(finding('tool-errors', measures)).toBe(
      '9% of 220 tool calls failed, not counting denials.',
    );
    expect(finding('cd-commands', measures)).toBe(
      '27% of 110 shell commands started with cd. 1 session started in your home folder, where no project CLAUDE.md loads.',
    );
  });

  it('leaves out the notes that do not apply', () => {
    const fewSpawns = measureOf({
      subagentRequests: 60,
      premiumSubagentRequests: 60,
      spawns: { Explore: 3 },
    });
    expect(finding('subagent-model', [fewSpawns])).toBe(
      '100% of 60 subagent requests ran on Opus or Fable, about $0.00 in total.',
    );
    const awayFromHome = measureOf({ bashCommands: 100, cdCommands: 50 });
    expect(finding('cd-commands', [awayFromHome])).toBe(
      '50% of 100 shell commands started with cd.',
    );
  });

  it('holds back each tip until it is worth acting on', () => {
    const cases: readonly (readonly [string, SessionMeasure])[] = [
      [
        'context-reread',
        measureOf({ cost: { input: 0, output: 0, cacheRead: 0.9, cacheWrite: 0 } }),
      ],
      ['context-reread', measureOf({ cost: { input: 0, output: 9, cacheRead: 5, cacheWrite: 0 } })],
      ['subagent-model', measureOf({ subagentRequests: 49, premiumSubagentRequests: 49 })],
      ['subagent-model', measureOf({ subagentRequests: 100, premiumSubagentRequests: 79 })],
      ['repeated-commands', measureOf({ repeatedRuns: 9, topRepeat: { command: 'x', runs: 9 } })],
      ['repeated-commands', measureOf({ repeatedRuns: 12, topRepeat: null })],
      ['long-sessions', measureOf({ prompts: 31 })],
      ['tool-errors', measureOf({ toolCalls: 99, toolErrors: 99 })],
      ['tool-errors', measureOf({ toolCalls: 100, toolErrors: 14, denials: 10 })],
      ['cd-commands', measureOf({ bashCommands: 99, cdCommands: 99 })],
      ['cd-commands', measureOf({ bashCommands: 100, cdCommands: 9 })],
      ['idle-rewrite', measureOf({ idleRewrites: 2 })],
      ['big-results', measureOf({ bigResults: 2 })],
      ['denials', measureOf({ denials: 9 })],
      ['rereads', measureOf({ extraReads: 9 })],
    ];
    for (const [id, measure] of cases) {
      expect({ id, finding: finding(id, [measure]) }).toStrictEqual({ id, finding: null });
    }
  });
});

describe('tradeoffs', () => {
  it('gives every tip its pros, its cons and when to skip it', () => {
    for (const item of RULES) {
      expect({ id: item.id, pros: item.pros.length > 0, cons: item.cons.length > 0 }).toStrictEqual(
        {
          id: item.id,
          pros: true,
          cons: true,
        },
      );
      expect(item.skipWhen).not.toBe('');
    }
    const measures = [NOISY, LONG];
    const [tip] = tipsOf(measures);
    expect(tip?.cons[0]).toMatch(/^\/clear and a new session drop everything Claude learned/u);
    expect(tip?.skipWhen).toMatch(/^Keep going in the long session/u);
  });
});

describe('session flags', () => {
  it('flags only the sessions that show the problem', () => {
    const cases: readonly (readonly [string, SessionMeasure, boolean])[] = [
      [
        'context-reread',
        measureOf({ cost: { input: 0, output: 0, cacheRead: 0.9, cacheWrite: 0 } }),
        false,
      ],
      [
        'context-reread',
        measureOf({ cost: { input: 0, output: 2, cacheRead: 1, cacheWrite: 0 } }),
        false,
      ],
      [
        'context-reread',
        measureOf({ cost: { input: 0, output: 1, cacheRead: 1, cacheWrite: 0 } }),
        true,
      ],
      ['tool-errors', measureOf({ toolCalls: 50, toolErrors: 9 }), false],
      ['tool-errors', measureOf({ toolCalls: 200, toolErrors: 15 }), false],
      ['tool-errors', measureOf({ toolCalls: 100, toolErrors: 10 }), true],
      ['cd-commands', measureOf({ bashCommands: 20, cdCommands: 9 }), false],
      ['cd-commands', measureOf({ bashCommands: 100, cdCommands: 19 }), false],
      ['cd-commands', measureOf({ bashCommands: 50, cdCommands: 10 }), true],
    ];
    for (const [id, measure, flagged] of cases) {
      expect({ id, flagged: rule(id).flags(measure) }).toStrictEqual({ id, flagged });
    }
  });

  it('lists the tips that flag a session, among those that apply', () => {
    const measures = [NOISY, LONG];
    const tips = tipsOf(measures);
    expect(tipsFor(NOISY, tips)).toHaveLength(11);
    expect(tipsFor(LONG, tips)).toStrictEqual(['long-sessions']);
    expect(tipsFor(NOISY, [])).toStrictEqual([]);
  });

  it('describes each session in its own words', () => {
    expect(RULES.map((item) => item.detail(NOISY))).toStrictEqual([
      '$0.00 carrying files',
      '$0.00 on the system prompt and tools',
      '$0.00 carrying skills',
      '$0.00 carrying CLAUDE.md',
      '$10 re-reading context',
      '600K peak context',
      '3 rewrites, $1.50',
      '$3.00 in subagents',
      '3 huge results',
      '10 repeats',
      '40 prompts',
      '10 denials',
      '10 extra reads',
      '20 failures',
      '30 of 100 commands start with cd',
    ]);
  });

  it('ranks sessions by how badly each shows the problem', () => {
    expect(RULES.map((item) => item.metric(NOISY))).toStrictEqual([
      0, 0, 0, 0, 10, 600_000, 1.5, 3, 3, 10, 40, 10, 10, 20, 30,
    ]);
  });

  it('keeps at most five sessions per tip, worst first', () => {
    const measures = [1, 2, 3, 4, 5, 6].map((n) =>
      measureOf({ sessionId: `s${n.toString()}`, bigResults: n }),
    );
    const [tip] = tipsOf(measures);
    expect(tip?.sessions.map((session) => session.sessionId)).toStrictEqual([
      's6',
      's5',
      's4',
      's3',
      's2',
    ]);
  });
});

describe('cacheReadShare', () => {
  it('is the share of the cost spent on cache reads, or 0 with no cost', () => {
    expect(cacheReadShare(NOISY)).toBeCloseTo(10 / 16);
    expect(
      cacheReadShare(measureOf({ cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })),
    ).toBe(0);
  });
});

describe('tipsTakenBy and isTipId', () => {
  it('finds the tips a knob or a suggestion follows', () => {
    expect(tipsTakenBy({ kind: 'knob', key: 'autoCompactWindow' })).toStrictEqual(['huge-context']);
    expect(tipsTakenBy({ kind: 'knob', key: 'model' })).toStrictEqual([]);
    expect(tipsTakenBy({ kind: 'suggestion', id: 'ci-watch' })).toStrictEqual([
      'repeated-commands',
    ]);
    expect(isTipId('rereads')).toBe(true);
    expect(isTipId('nope')).toBe(false);
  });
});
