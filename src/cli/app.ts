// The /tune commands: scan and report, apply a fix, and track a tip. Every
// outside input comes in through Env, so tests run against a temp home.

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { renderAgent, renderSkill } from '../core/authoring/render.js';
import type { AdviceStep } from '../core/tuning/build.js';
import { isTipId, tipsTakenBy } from '../core/tuning/build.js';
import { knobReader, modifiedCheck } from '../core/tuning/readers.js';
import { scanInto } from '../core/tuning/scan.js';
import type { ScanResult } from '../core/tuning/scan.js';
import { loadIndex, saveIndex } from '../core/tuning/store.js';
import { findSuggestion, nameOf } from '../core/tuning/suggestions.js';
import { summarize } from '../core/tuning/summarize.js';
import { loadTracked, saveTracked } from '../core/tuning/tracked.js';
import type { AutoFix, TuningState } from '../shared/tuning.js';

import { installedSuggestions, librariesFor, suggestionFile } from './installed.js';
import type { Paths } from './paths.js';
import type { GitRunner } from './projects.js';
import { projectReader, projectRoot } from './projects.js';
import { DEFAULT_REPORT, renderReport } from './report.js';
import { effectiveSettings, settingsFiles, writeSetting } from './settings.js';

export interface Env {
  readonly paths: Paths;
  /** The folder /tune runs in, for the project's settings and library. */
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;
  readonly now: () => number;
  readonly git: GitRunner;
  /** The built help page, dist/help.html beside the bundle. */
  readonly helpFile: string;
  /** Opens a file in the app the system picks for it, a browser for HTML. */
  readonly open: (file: string) => Promise<void>;
}

interface Loaded {
  readonly state: TuningState;
  readonly tracked: Map<string, number>;
  readonly scan: ScanResult;
}

/** Rescans the transcripts that changed, saves the index, and builds the summary. */
export async function load(env: Env): Promise<Loaded> {
  const { paths } = env;
  const now = env.now();
  const index = await loadIndex(paths.indexFile);
  const scan = await scanInto(index, paths.projectsDir, now);
  if (scan.filesRead > 0 || scan.filesGone > 0) {
    await saveIndex(paths.indexFile, index);
  }
  const tracked = await loadTracked(paths.trackedFile);
  const root = projectRoot(env.cwd, env.git);
  const files = settingsFiles({
    platform: env.platform,
    userSettings: paths.userSettings,
    projectRoot: root,
  });
  const items = [...index.entries.values()];
  const state = summarize({
    measures: items.filter((item) => item.live).map((item) => item.measure),
    history: items.filter((item) => !item.live).map((item) => item.measure),
    tracked,
    now,
    installed: installedSuggestions(librariesFor(paths, root)),
    home: paths.home,
    scannedAt: index.scannedAt,
    knob: knobReader(await effectiveSettings(files, env.env)),
    projectOf: projectReader(env.git),
    modifiedAt: modifiedCheck(),
  });
  return { state, tracked, scan };
}

export async function report(env: Env, json: boolean): Promise<string> {
  const { state } = await load(env);
  return json
    ? `${JSON.stringify(state, null, 2)}\n`
    : renderReport(state, { ...DEFAULT_REPORT, home: env.paths.home });
}

interface FoundFix {
  readonly fix: AutoFix;
  /** Every tip that offers it. */
  readonly tipIds: readonly string[];
}

function findFix(state: TuningState, id: string): FoundFix | null {
  let fix: AutoFix | null = null;
  const tipIds: string[] = [];
  for (const tip of state.tips) {
    const match = tip.autoFixes.find((item) => item.id === id);
    if (match !== undefined) {
      fix ??= match;
      tipIds.push(tip.id);
    }
  }
  return fix === null ? null : { fix, tipIds };
}

/** Starts tracking the shown tips this step follows. One already tracked keeps its start. */
async function trackTaken(
  env: Env,
  loaded: Loaded,
  step: AdviceStep,
): Promise<string[]> {
  const shown = new Set(loaded.state.tips.map((tip) => tip.id));
  const fresh = tipsTakenBy(step).filter((id) => shown.has(id) && !loaded.tracked.has(id));
  if (fresh.length > 0) {
    const now = env.now();
    for (const id of fresh) {
      loaded.tracked.set(id, now);
    }
    await saveTracked(env.paths.trackedFile, loaded.tracked);
  }
  return fresh;
}

function trackedNote(ids: readonly string[]): string[] {
  return ids.length === 0
    ? []
    : [`Now tracking ${ids.map((id) => `\`${id}\``).join(', ')}, so a later /tune shows the impact.`];
}

async function applyKnob(
  env: Env,
  loaded: Loaded,
  fix: Extract<AutoFix, { kind: 'knob' }>,
  dryRun: boolean,
): Promise<string[]> {
  const value = JSON.stringify(fix.value);
  if (fix.applied) {
    return [`${fix.key} is already set that way. Nothing to change.`];
  }
  if (dryRun) {
    return [`Would set ${fix.key} to ${value} in ${env.paths.userSettings}.`];
  }
  const written = await writeSetting({
    file: env.paths.userSettings,
    key: fix.key,
    value: fix.value,
    backupDir: env.paths.backupDir,
    now: env.now(),
  });
  const via = written.target === env.paths.userSettings ? '' : ` (through the link to ${written.target})`;
  const backup = written.backup === null ? [] : [`The old file is saved at ${written.backup}.`];
  return [
    `Set ${fix.key} to ${value} in ${env.paths.userSettings}${via}. New sessions pick it up.`,
    ...backup,
    ...trackedNote(await trackTaken(env, loaded, { kind: 'knob', key: fix.key })),
  ];
}

async function applyCreate(
  env: Env,
  loaded: Loaded,
  suggestionId: string,
  dryRun: boolean,
): Promise<string[]> {
  const definition = findSuggestion(suggestionId);
  if (definition === null) {
    throw new Error(`There is no suggestion called ${suggestionId}.`);
  }
  const file = suggestionFile(env.paths, definition);
  const label = `the ${nameOf(definition)} ${definition.kind}`;
  if (dryRun) {
    return [`Would write ${label} to ${file}.`];
  }
  const text = definition.kind === 'agent' ? renderAgent(definition.spec) : renderSkill(definition.spec);
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(file, text, { flag: 'wx' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return [`${file} is already there, so /tune left it alone.`];
    }
    throw error;
  }
  return [
    `Wrote ${label} to ${file}. New sessions can use it.`,
    ...trackedNote(await trackTaken(env, loaded, { kind: 'suggestion', id: definition.id })),
  ];
}

function launchLines(fix: Extract<AutoFix, { kind: 'launch' }>, tipIds: readonly string[]): string[] {
  const track = tipIds.map((id) => `tune track ${id}`).join(' and ');
  return [
    `# ${fix.title}`,
    '',
    fix.detail,
    '',
    `Folder: ${fix.cwd}`,
    `New worktree: ${fix.worktree ? 'yes, make one from the default branch first' : 'no'}`,
    `When it is done, run: ${track}`,
    '',
    '## Task',
    '',
    fix.prompt,
  ];
}

/** Applies a knob or create fix, or prints a launch fix's task for Claude to carry out. */
export async function fix(env: Env, id: string, dryRun: boolean): Promise<string> {
  const loaded = await load(env);
  const found = findFix(loaded.state, id);
  let lines: string[];
  if (found === null) {
    // A suggested skill or agent can be created without a tip that offers it.
    if (!id.startsWith('create:')) {
      throw new Error(`No fix called ${id} is on offer right now. Run /tune to see the list.`);
    }
    lines = await applyCreate(env, loaded, id.slice('create:'.length), dryRun);
  } else if (found.fix.kind === 'knob') {
    lines = await applyKnob(env, loaded, found.fix, dryRun);
  } else if (found.fix.kind === 'create') {
    lines = await applyCreate(env, loaded, found.fix.suggestionId, dryRun);
  } else {
    lines = launchLines(found.fix, found.tipIds);
  }
  return `${lines.join('\n')}\n`;
}

/** Starts tracking a tip from now, or stops when `on` is false. */
export async function track(env: Env, tipId: string, on: boolean): Promise<string> {
  if (!isTipId(tipId)) {
    throw new Error(`There is no tip called ${tipId}.`);
  }
  const tracked = await loadTracked(env.paths.trackedFile);
  if (on && tracked.has(tipId)) {
    return `Already tracking ${tipId}.\n`;
  }
  if (on) {
    tracked.set(tipId, env.now());
  } else if (!tracked.delete(tipId)) {
    return `${tipId} was not tracked.\n`;
  }
  await saveTracked(env.paths.trackedFile, tracked);
  return on
    ? `Tracking ${tipId} from now. A later /tune compares the sessions before and after.\n`
    : `Stopped tracking ${tipId}.\n`;
}

/** Opens the help page, or says where it is when nothing can open it, like over ssh. */
export async function help(env: Env): Promise<string> {
  try {
    await access(env.helpFile);
  } catch {
    throw new Error(`${env.helpFile} is missing. Run npm run build to make it.`);
  }
  try {
    await env.open(env.helpFile);
  } catch {
    return `Could not open a browser. The help page is at ${env.helpFile}.\n`;
  }
  return `Opened ${env.helpFile}.\n`;
}
