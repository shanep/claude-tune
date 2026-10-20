// Reads Claude Code's settings files the way it layers them, so a fix can tell
// whether it is already in place, and writes one key to the user settings.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { readOptional, resolveLinkTarget, writeFileAtomic } from '../core/knobs/atomic-file.js';
import { isPlainObject } from '../core/knobs/json.js';
import type { EffectiveValue, SettingsLayer } from '../shared/knob-model.js';

export interface SettingsFile {
  readonly layer: SettingsLayer;
  readonly file: string;
}

/** Where an administrator puts settings that override everyone's. */
export function managedSettingsFile(platform: NodeJS.Platform): string {
  return platform === 'darwin'
    ? '/Library/Application Support/ClaudeCode/managed-settings.json'
    : '/etc/claude-code/managed-settings.json';
}

/** The files Claude Code reads, highest precedence first. */
export function settingsFiles(input: {
  readonly platform: NodeJS.Platform;
  readonly userSettings: string;
  readonly projectRoot: string | null;
}): SettingsFile[] {
  const project: SettingsFile[] =
    input.projectRoot === null
      ? []
      : [
          {
            layer: 'project-local',
            file: path.join(input.projectRoot, '.claude', 'settings.local.json'),
          },
          { layer: 'project', file: path.join(input.projectRoot, '.claude', 'settings.json') },
        ];
  return [
    { layer: 'managed', file: managedSettingsFile(input.platform) },
    ...project,
    { layer: 'user', file: input.userSettings },
  ];
}

/** Every leaf of a settings object by dotted key. Lists are leaves, like permissions.deny. */
export function flatten(value: Record<string, unknown>, prefix = ''): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, child] of Object.entries(value)) {
    const dotted = prefix === '' ? key : `${prefix}.${key}`;
    if (isPlainObject(child)) {
      for (const [inner, leaf] of flatten(child, dotted)) {
        out.set(inner, leaf);
      }
    } else {
      out.set(dotted, child);
    }
  }
  return out;
}

/** A settings file's object, or null when it is missing or not a JSON object. */
async function readSettings(file: string): Promise<Record<string, unknown> | null> {
  let text: string | null;
  try {
    text = await readOptional(file);
  } catch {
    return null;
  }
  if (text === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The value of every key any layer sets, with the chain of layers behind it.
 * Variables in the environment count as the env layer under their plain name,
 * which is how Claude Code passes the settings' env block to the commands it runs.
 */
export async function effectiveSettings(
  files: readonly SettingsFile[],
  env: NodeJS.ProcessEnv,
): Promise<EffectiveValue[]> {
  const chains = new Map<string, EffectiveValue['chain'][number][]>();
  const add = (key: string, link: EffectiveValue['chain'][number]): void => {
    const chain = chains.get(key) ?? [];
    chain.push(link);
    chains.set(key, chain);
  };
  for (const { layer, file } of files) {
    const settings = await readSettings(file);
    if (settings !== null) {
      for (const [key, value] of flatten(settings)) {
        add(key, { layer, value, file });
      }
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      add(key, { layer: 'env', value, file: null });
    }
  }
  return [...chains].map(([key, chain]) => {
    const [winner] = chain;
    return { key, value: winner?.value, layer: winner?.layer ?? 'default', chain };
  });
}

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/u;

/** Where a fix's key goes in settings.json: an environment variable under env, anything else by its dots. */
export function settingsPath(key: string): string[] {
  return ENV_NAME.test(key) ? ['env', key] : key.split('.');
}

/** The indent the file already uses, so a change does not reformat it. */
function indentOf(text: string): string {
  const match = /^\{\s*\n([ \t]+)\S/u.exec(text);
  return match?.[1] ?? '  ';
}

/** A copy of `value` with the key at `keys` set, leaving everything else as it was. */
export function withKey(
  value: Record<string, unknown>,
  keys: readonly string[],
  next: unknown,
): Record<string, unknown> {
  const [first, ...rest] = keys;
  if (first === undefined) {
    return value;
  }
  if (rest.length === 0) {
    return { ...value, [first]: next };
  }
  const child = value[first];
  return { ...value, [first]: withKey(isPlainObject(child) ? child : {}, rest, next) };
}

export interface SettingWrite {
  /** The settings file to change, which may be a link into a dotfiles repository. */
  readonly file: string;
  readonly key: string;
  readonly value: unknown;
  /** The folder that keeps a copy of the file from before the change. */
  readonly backupDir: string;
  readonly now: number;
}

export interface SettingWritten {
  /** The file the change landed in, after following links. */
  readonly target: string;
  /** The copy of the old file, or null when there was no file yet. */
  readonly backup: string | null;
}

/**
 * Sets one key in a settings file. Writes through a symbolic link, so a
 * settings.json that lives in a dotfiles repository stays a link, and refuses
 * to touch a file that is not a JSON object.
 */
export async function writeSetting(write: SettingWrite): Promise<SettingWritten> {
  const target = await resolveLinkTarget(write.file);
  const text = await readOptional(target);
  let current: Record<string, unknown> = {};
  if (text !== null && text.trim() !== '') {
    const parsed: unknown = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      throw new Error(`${write.file} does not hold a JSON object, so /tune left it alone.`);
    }
    current = parsed;
  }
  const next = withKey(current, settingsPath(write.key), write.value);
  const indent = text === null ? '  ' : indentOf(text);
  let backup: string | null = null;
  if (text !== null) {
    await mkdir(write.backupDir, { recursive: true });
    backup = path.join(
      write.backupDir,
      `${path.basename(target)}.${new Date(write.now).toISOString().replaceAll(':', '-')}.bak`,
    );
  }
  await writeFileAtomic({ target, content: `${JSON.stringify(next, null, indent)}\n`, backup });
  return { target, backup };
}
