import { describe, expect, it } from 'vitest';

import type { SessionMeasure } from './measure.js';
import type { TipRule } from './rule-type.js';
import { SPEND_RULES } from './rules-spend.js';
import { zeroSpend } from './spend.js';
import { HOME, measureOf } from './test-helpers/fixtures.js';
import { totalsOf } from './totals.js';

function rule(id: string): TipRule {
  const found = SPEND_RULES.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`no rule ${id}`);
  }
  return found;
}

/** One session costing `usd`, all of it cache reads, with this much of the spend split. */
function session(
  usd: number,
  main: Partial<SessionMeasure['spend']>,
  extra: Partial<SessionMeasure> = {},
): SessionMeasure {
  return measureOf({
    cost: { input: 0, output: 0, cacheRead: usd, cacheWrite: 0 },
    spend: { ...zeroSpend(), ...main },
    ...extra,
  });
}

function finding(id: string, measures: readonly SessionMeasure[]): string | null {
  return rule(id).finding(totalsOf(measures, HOME));
}

/** Five sessions that carried Artifact for `usd` in all. */
function carrying(usd: number, uses: Readonly<Record<string, number>> = {}): SessionMeasure[] {
  return Array.from({ length: 5 }, (_, index) =>
    session(
      1,
      {},
      { sessionId: `s${String(index)}`, toolSchemas: { Artifact: usd / 5 }, toolUses: uses },
    ),
  );
}

describe('file-reads', () => {
  const tip = rule('file-reads');

  it('shows from 12% of a spend of at least a dollar', () => {
    expect(finding('file-reads', [session(1, { fileReads: 0.12 })])).toBe(
      '12% of the spend ($0.12) went to carrying files after reading them with Read, cat, sed, head or tail: each stayed in context and was sent again with every later request.',
    );
    expect(finding('file-reads', [session(1, { fileReads: 0.119 })])).toBeNull();
    expect(finding('file-reads', [session(0.99, { fileReads: 0.5 })])).toBeNull();
  });

  it('flags a session with at least a dollar and 15% on files, main thread and subagents together', () => {
    const both = session(
      10,
      { fileReads: 0.75 },
      { subagentSpend: { ...zeroSpend(), fileReads: 0.75 } },
    );
    expect(tip.flags(both)).toBe(true);
    expect(tip.metric(both)).toBe(1.5);
    expect(tip.detail(both)).toBe('$1.50 carrying files');
    expect(tip.flags(session(10, { fileReads: 1.49 }))).toBe(false);
    expect(tip.flags(session(5, { fileReads: 0.99 }))).toBe(false);
    expect(tip.flags(session(6.6, { fileReads: 1 }))).toBe(true);
  });
});

describe('unused-tools', () => {
  const tip = rule('unused-tools');

  it('names the tools when they cost at least $2', () => {
    expect(finding('unused-tools', carrying(2))).toBe(
      'The definitions of Artifact went out with every request, about $2.00 in total, yet sessions almost never call them.',
    );
    expect(finding('unused-tools', carrying(1.99))).toBeNull();
    expect(finding('unused-tools', carrying(5, { Artifact: 1 }))).toBeNull();
  });

  it('flags a session that spent at least a dollar and 15% on setup', () => {
    const both = session(10, { setup: 0.75 }, { subagentSpend: { ...zeroSpend(), setup: 0.75 } });
    expect(tip.flags(both)).toBe(true);
    expect(tip.metric(both)).toBe(1.5);
    expect(tip.detail(both)).toBe('$1.50 on the system prompt and tools');
    expect(tip.flags(session(10, { setup: 1.49 }))).toBe(false);
    expect(tip.flags(session(5, { setup: 0.99 }))).toBe(false);
  });
});

describe('heavy-skills', () => {
  const tip = rule('heavy-skills');

  it('shows from 4% of the spend and names the skill that cost the most', () => {
    expect(
      finding('heavy-skills', [
        session(1, { skills: 0.04 }, { skills: { '/s/voice': 0.03, '/s/canvas/': 0.01 } }),
      ]),
    ).toBe(
      'The skill list and loaded skills cost $0.04, 4% of the spend. voice cost the most, $0.03.',
    );
    expect(finding('heavy-skills', [session(1, { skills: 0.04 })])).toBe(
      'The skill list and loaded skills cost $0.04, 4% of the spend.',
    );
    expect(finding('heavy-skills', [session(1, { skills: 0.039 })])).toBeNull();
    expect(finding('heavy-skills', [session(0.99, { skills: 0.5 })])).toBeNull();
  });

  it('flags a session with at least 50 cents and 5% on skills', () => {
    const both = session(10, { skills: 0.25 }, { subagentSpend: { ...zeroSpend(), skills: 0.25 } });
    expect(tip.flags(both)).toBe(true);
    expect(tip.metric(both)).toBe(0.5);
    expect(tip.detail(both)).toBe('$0.50 carrying skills');
    expect(tip.flags(session(10, { skills: 0.49 }))).toBe(false);
    expect(tip.flags(session(20, { skills: 0.99 }))).toBe(false);
  });
});

describe('instructions', () => {
  const tip = rule('instructions');

  it('shows from 3% of a spend of at least a dollar', () => {
    expect(finding('instructions', [session(1, { instructions: 0.03 })])).toBe(
      'CLAUDE.md files and memory cost $0.03, 3% of the spend, because they go out with every request.',
    );
    expect(finding('instructions', [session(1, { instructions: 0.029 })])).toBeNull();
    expect(finding('instructions', [session(0.99, { instructions: 0.5 })])).toBeNull();
  });

  it('flags a session with at least 50 cents and 4% on instructions', () => {
    const both = session(
      10,
      { instructions: 0.25 },
      { subagentSpend: { ...zeroSpend(), instructions: 0.25 } },
    );
    expect(tip.flags(both)).toBe(true);
    expect(tip.metric(both)).toBe(0.5);
    expect(tip.detail(both)).toBe('$0.50 carrying CLAUDE.md');
    expect(tip.flags(session(10, { instructions: 0.49 }))).toBe(false);
    expect(tip.flags(session(20, { instructions: 0.79 }))).toBe(false);
  });
});
