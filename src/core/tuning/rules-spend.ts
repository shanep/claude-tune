// The tips about what fills the context: files read, tool definitions,
// skills and CLAUDE.md, each measured from the spend split.


import { unusedTools } from './fixes.js';
import type { SessionMeasure } from './measure.js';
import type { TipRule } from './rule-type.js';
import { ratio } from './rule-type.js';
import { skillName } from './spend.js';
import type { Totals } from './totals.js';
import { sessionUsd } from './totals.js';
import { percent, usd } from './words.js';


function fileReadUsd(measure: SessionMeasure): number {
  return measure.spend.fileReads + measure.subagentSpend.fileReads;
}

function setupUsd(measure: SessionMeasure): number {
  return measure.spend.setup + measure.subagentSpend.setup;
}

function skillUsd(measure: SessionMeasure): number {
  return measure.spend.skills + measure.subagentSpend.skills;
}

function instructionUsd(measure: SessionMeasure): number {
  return measure.spend.instructions + measure.subagentSpend.instructions;
}

function topSkill(totals: Totals): string {
  const top = Object.entries(totals.skillUsd).toSorted((left, right) => right[1] - left[1])[0];
  return top === undefined ? '' : ` ${skillName(top[0])} cost the most, ${usd(top[1])}.`;
}

export const SPEND_RULES: readonly TipRule[] = [
  {
    id: 'file-reads',
    severity: 'high',
    title: 'Files read once are paid for on every later request',
    advice: [
      'Hand searches and reading around to a subagent such as scout, so only its short answer lands in the main context.',
      'Read the lines you need with Read and an offset, or grep for them, instead of cat or sed over a whole file.',
      'Keep the files sessions read most short, so reading one part does not mean reading all of it.',
    ],
    fixes: ['scout'],
    pros: [
      'A file read on request 20 of a 400 request session is sent 380 more times. Reading a tenth as much saves on all of them.',
      'Smaller files also make edits more precise, since Claude sees only the part it is changing.',
    ],
    cons: [
      'Splitting files is a refactor: it touches imports and can conflict with other work in progress.',
      'A subagent does not share what it read, so the main session may ask it again or read the file itself.',
    ],
    track: {
      target: 'fileReadShare',
      watch: [{ metric: 'extraReads', why: 'Reading less at once can mean reading more often.' }],
    },
    skipWhen:
      'A short session, or one that reads a file and is done soon after, pays little to carry it.',
    finding: (t) =>
      t.totalUsd < 1 || ratio(t.spend.fileReads, t.totalUsd) < 0.12
        ? null
        : `${percent(ratio(t.spend.fileReads, t.totalUsd))} of the spend (${usd(t.spend.fileReads)}) went to carrying files after reading them with Read, cat, sed, head or tail: each stayed in context and was sent again with every later request.`,
    flags: (m) => fileReadUsd(m) >= 1 && ratio(fileReadUsd(m), sessionUsd(m)) >= 0.15,
    metric: fileReadUsd,
    detail: (m) => `${usd(fileReadUsd(m))} carrying files`,
  },
  {
    id: 'unused-tools',
    severity: 'medium',
    title: 'Every request carries tools that never get used',
    advice: [
      'Add tools you never use to permissions.deny. A denied tool is left out of the request, so its definition stops costing tokens.',
    ],
    fixes: [],
    pros: [
      'The saving applies to every request of every session and subagent, with nothing to remember.',
    ],
    cons: [
      'A denied tool is gone until you take it off the list, so Claude cannot use it on the rare day it would help.',
    ],
    knobs: ['permissions.deny'],
    track: { target: 'setupShare', watch: [] },
    skipWhen: 'Keep a tool you use now and then, even if only in a few sessions.',
    finding: (t: Totals): string | null => {
      const tools = unusedTools(t);
      const cost = tools.reduce((total, tool) => total + tool.usd, 0);
      return tools.length === 0 || cost < 2
        ? null
        : `The definitions of ${tools.map((tool) => tool.name).join(', ')} went out with every request, about ${usd(cost)} in total, yet sessions almost never call them.`;
    },
    flags: (m) => setupUsd(m) >= 1 && ratio(setupUsd(m), sessionUsd(m)) >= 0.15,
    metric: setupUsd,
    detail: (m) => `${usd(setupUsd(m))} on the system prompt and tools`,
  },
  {
    id: 'heavy-skills',
    severity: 'medium',
    title: 'Skills cost more to carry than they need to',
    advice: [
      'Keep a SKILL.md to the steps Claude needs every time, and move reference material into files it reads only when needed.',
      'Remove skills and plugins you do not use, since the skill list goes out with every request.',
    ],
    fixes: [],
    pros: [
      'A loaded skill stays in context for the rest of the session, so every line cut is saved on each later request.',
    ],
    cons: ['Material moved out of SKILL.md is only read when Claude thinks to read it.'],
    track: { target: 'skillShare', watch: [] },
    skipWhen: 'A short skill, or one used only in short sessions, costs little to carry.',
    finding: (t) =>
      t.totalUsd < 1 || ratio(t.spend.skills, t.totalUsd) < 0.04
        ? null
        : `The skill list and loaded skills cost ${usd(t.spend.skills)}, ${percent(ratio(t.spend.skills, t.totalUsd))} of the spend.${topSkill(t)}`,
    flags: (m) => skillUsd(m) >= 0.5 && ratio(skillUsd(m), sessionUsd(m)) >= 0.05,
    metric: skillUsd,
    detail: (m) => `${usd(skillUsd(m))} carrying skills`,
  },
  {
    id: 'instructions',
    severity: 'low',
    title: 'CLAUDE.md and memory are sent with every request',
    advice: [
      'Keep CLAUDE.md files and the memory index short: one line per rule, no examples that restate it.',
    ],
    fixes: [],
    pros: ['Every request of every session and subagent gets cheaper.'],
    cons: ['A rule cut too short can be misread, and a dropped one is not followed.'],
    track: {
      target: 'instructionShare',
      watch: [{ metric: 'failures', why: 'A rule that got lost can mean more mistakes.' }],
    },
    skipWhen: 'Leave a rule long when its detail keeps Claude from a costly mistake.',
    finding: (t) =>
      t.totalUsd < 1 || ratio(t.spend.instructions, t.totalUsd) < 0.03
        ? null
        : `CLAUDE.md files and memory cost ${usd(t.spend.instructions)}, ${percent(ratio(t.spend.instructions, t.totalUsd))} of the spend, because they go out with every request.`,
    flags: (m) => instructionUsd(m) >= 0.5 && ratio(instructionUsd(m), sessionUsd(m)) >= 0.04,
    metric: instructionUsd,
    detail: (m) => `${usd(instructionUsd(m))} carrying CLAUDE.md`,
  },
];
