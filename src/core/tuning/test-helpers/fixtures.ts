// Session measures for the tips tests. Nothing here comes from a real transcript.

import type { SessionMeasure } from '../measure.js';
import { zeroSpend } from '../spend.js';

export const HOME = '/home/me';

/** A quiet session that trips no tip; override the fields under test. */
export function measureOf(overrides: Partial<SessionMeasure> = {}): SessionMeasure {
  return {
    sessionId: 'aaaaaaaa-1111-4111-8111-111111111111',
    title: 'Quiet session',
    cwd: '/work/demo',
    startedAt: 500,
    updatedAt: 1000,
    prompts: 3,
    requests: 10,
    peakContext: 20_000,
    contextTokens: 150_000,
    compactions: 0,
    cost: { input: 0.01, output: 0.2, cacheRead: 0.05, cacheWrite: 0.1 },
    idleRewrites: 0,
    idleRewriteUsd: 0,
    compactSavingUsd: 0,
    bigResults: 0,
    extraReads: 0,
    repeatedRuns: 0,
    topRepeat: null,
    toolCalls: 20,
    toolErrors: 0,
    denials: 0,
    bashCommands: 10,
    cdCommands: 0,
    cdTargets: {},
    spawns: {},
    subagentRequests: 0,
    premiumSubagentRequests: 0,
    subagentUsd: 0,
    families: { land: 0, ci: 0, server: 0, buildTest: 0, search: 0 },
    hours: [],
    stack: {},
    spend: zeroSpend(),
    subagentSpend: zeroSpend(),
    heavy: [],
    files: {},
    skills: {},
    toolSchemas: {},
    toolUses: {},
    subagents: [],
    ...overrides,
  };
}
