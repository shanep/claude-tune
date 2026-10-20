// The spend split: what filled the context a session paid to send, by source.

import type { SpendSource } from '../../shared/tuning.js';

/** Close enough for English and code, and only used to turn sizes into token counts. */
export const CHARS_PER_TOKEN = 3.6;

export const SPEND_SOURCES = [
  'setup',
  'instructions',
  'skills',
  'reminders',
  'fileReads',
  'toolOutput',
  'web',
  'toolInputs',
  'subagentReports',
  'conversation',
  'output',
] as const satisfies readonly SpendSource[];

export type SpendSplit = Readonly<Record<SpendSource, number>>;

export const SPEND_LABELS: Readonly<Record<SpendSource, string>> = {
  setup: 'System prompt and tool definitions',
  instructions: 'CLAUDE.md and memory',
  skills: 'Skills',
  reminders: 'Hooks and reminders',
  fileReads: 'Reading files',
  toolOutput: 'Command and search output',
  web: 'Web and connectors',
  toolInputs: 'Code and commands Claude wrote',
  subagentReports: 'Subagent reports',
  conversation: 'Prompts, replies and thinking',
  output: 'Writing replies (output tokens)',
};

export function zeroSpend(): Record<SpendSource, number> {
  return {
    setup: 0,
    instructions: 0,
    skills: 0,
    reminders: 0,
    fileReads: 0,
    toolOutput: 0,
    web: 0,
    toolInputs: 0,
    subagentReports: 0,
    conversation: 0,
    output: 0,
  };
}

export function addSpend(left: SpendSplit, right: SpendSplit): SpendSplit {
  const sum = zeroSpend();
  for (const source of SPEND_SOURCES) {
    sum[source] = left[source] + right[source];
  }
  return sum;
}

/** The name of a skill from its folder. */
export function skillName(folder: string): string {
  const parts = folder.split('/').filter((part) => part !== '');
  return parts.at(-1) ?? folder;
}
