// The summary as Markdown for Claude to read and walk you through. It leaves
// out the launch prompts, which `tune fix <id>` prints when you pick one, so
// the report stays small in the session's context.

import { percent, plural, tokens, usd } from '../core/tuning/words.js';
import type {
  AutoFix,
  CostlySession,
  HotFile,
  Tip,
  TipImpact,
  TuningState,
} from '../shared/tuning.js';

export interface ReportOptions {
  /** How many of the costliest sessions to show. */
  readonly costly: number;
  /** How many hot files to show. */
  readonly hotFiles: number;
  /** How many sessions to list under each tip. */
  readonly tipSessions: number;
  /** Folders under home show as ~/..., which reads shorter. */
  readonly home: string;
}

export const DEFAULT_REPORT: Omit<ReportOptions, 'home'> = {
  costly: 5,
  hotFiles: 8,
  tipSessions: 3,
};

function day(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function shortPath(folder: string, home: string): string {
  return home !== '' && (folder === home || folder.startsWith(`${home}/`))
    ? `~${folder.slice(home.length)}`
    : folder;
}

/**
 * Paths inside free text: a home prefix shows as ~, and output Claude Code
 * saved under tool-results shows by its file name, since the session folder
 * around it means nothing to you.
 */
function tidyPaths(text: string, home: string): string {
  const saved = text.replaceAll(/\S*\/tool-results\/([^\s/()]+?)(?=[\s().,:]|$)/gu, 'saved tool output $1');
  return home === '' ? saved : saved.replaceAll(`${home}/`, '~/');
}

/** Titles come from prompts, so keep them to one short line. */
function oneLine(text: string, max = 80): string {
  const flat = text.replaceAll(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

function fixLine(fix: AutoFix): string {
  const status = fix.applied ? ' (already applied)' : '';
  return `- \`${fix.id}\` [${fix.kind}]${status} ${fix.title}. ${fix.detail}`;
}

function impactLines(impact: TipImpact): string[] {
  return [
    `Tracked since ${day(impact.trackedSince)}: **${impact.verdict}** (${plural(impact.sessionsBefore, 'session')} before, ${plural(impact.sessionsAfter, 'session')} after). ${impact.summary}`,
  ];
}

function tipLines(tip: Tip, options: ReportOptions): string[] {
  const lines = [`### ${tip.title} \`${tip.id}\` (${tip.severity})`, '', tip.finding, ''];
  if (tip.impact !== null) {
    lines.push(...impactLines(tip.impact), '');
  }
  lines.push('Advice:', ...tip.advice.map((text) => `- ${text}`), '');
  if (tip.cons.length > 0) {
    lines.push(`Gives up: ${tip.cons.join(' ')}`, `Skip when: ${tip.skipWhen}`, '');
  }
  const sessions = tip.sessions.slice(0, options.tipSessions);
  if (sessions.length > 0) {
    lines.push(
      'Worst sessions:',
      ...sessions.map((session) => `- ${oneLine(session.title)}: ${session.detail}`),
      '',
    );
  }
  if (tip.autoFixes.length > 0) {
    lines.push('Fixes:', ...tip.autoFixes.map((fix) => fixLine(fix)), '');
  }
  return lines;
}

function costlyLines(session: CostlySession, home: string): string[] {
  const where = session.cwd === null ? '' : ` in ${shortPath(session.cwd, home)}`;
  const lines = [
    `### ${oneLine(session.title)}: ${usd(session.usd)}`,
    '',
    `${day(session.updatedAt)}${where}. ${plural(session.requests, 'request')}, ${tokens(session.averageContext)} average and ${tokens(session.peakContext)} peak context, ${usd(session.subagentUsd)} in subagents.`,
  ];
  const spend = session.spend
    .slice(0, 4)
    .map((slice) => `${slice.label} ${usd(slice.usd)}`)
    .join(', ');
  if (spend !== '') {
    lines.push(`Spend: ${spend}.`);
  }
  if (session.causes.length > 0) {
    lines.push(
      '',
      'Causes:',
      ...session.causes.map((cause) => {
        const saved = cause.savedUsd === null ? '' : ` Fixing it saves about ${usd(cause.savedUsd)}.`;
        const tip = cause.tipId === null ? '' : ` (tip \`${cause.tipId}\`)`;
        return `- ${tidyPaths(cause.text, home)}${saved}${tip}`;
      }),
    );
  }
  const heavy = session.heavy.slice(0, 3);
  if (heavy.length > 0) {
    lines.push(
      '',
      'Heaviest items:',
      ...heavy.map((item) => `- ${oneLine(tidyPaths(item.label, home))}: ${tokens(item.tokens)} tokens, ${usd(item.usd)}`),
    );
  }
  lines.push('');
  return lines;
}

function hotLine(file: HotFile, home: string): string {
  const where = file.project === '' ? file.path : `${shortPath(file.project, home)}/${file.path}`;
  return `- ${where}: ${usd(file.usd)} over ${plural(file.sessions, 'session')}`;
}

export function renderReport(state: TuningState, options: ReportOptions): string {
  if (state.sessions === 0) {
    return '# Claude Code tuning\n\nNo sessions with requests yet, so there is nothing to tune.\n';
  }
  const cacheShare = state.totalUsd === 0 ? 0 : state.cacheReadUsd / state.totalUsd;
  const lines = [
    '# Claude Code tuning',
    '',
    `${plural(state.sessions, 'session')}, ${usd(state.totalUsd)} at list price. ${percent(cacheShare)} of it re-read cached context, ${usd(state.subagentUsd)} went to subagents. Average context ${tokens(state.averageContext)} tokens, largest ${tokens(state.largestContext)}.`,
    '',
  ];
  if (state.spend.length > 0) {
    lines.push(
      '## Where the spend went',
      '',
      ...state.spend.map((slice) => `- ${slice.label}: ${usd(slice.usd)} (${percent(slice.share)})`),
      '',
    );
  }
  lines.push('## Tips', '');
  if (state.tips.length === 0) {
    lines.push('Nothing stands out across your sessions.', '');
  }
  for (const tip of state.tips) {
    lines.push(...tipLines(tip, options));
  }
  const costly = state.costly.slice(0, options.costly);
  if (costly.length > 0) {
    lines.push('## Costliest sessions', '');
    for (const session of costly) {
      lines.push(...costlyLines(session, options.home));
    }
  }
  const hot = state.hotFiles.slice(0, options.hotFiles);
  if (hot.length > 0) {
    lines.push(
      '## Hot files',
      '',
      'Files sessions kept reading, by what carrying them in context cost.',
      '',
      ...hot.map((file) => hotLine(file, options.home)),
      '',
    );
  }
  const suggestions = state.suggestions.filter((item) => !item.installed && item.reason !== null);
  if (suggestions.length > 0) {
    lines.push(
      '## Suggested skills and agents',
      '',
      ...suggestions.map(
        (item) => `- \`create:${item.id}\` ${item.name} (${item.kind}): ${item.summary} ${item.reason ?? ''}`.trimEnd(),
      ),
      '',
    );
  }
  if (state.scannedAt !== null) {
    lines.push(`Scanned ${new Date(state.scannedAt).toISOString()}.`);
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
