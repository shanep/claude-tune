import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { knobReader } from '../core/tuning/readers.js';

import { effectiveSettings, flatten, managedSettingsFile, settingsFiles, settingsPath, withKey } from './settings.js';

describe('settingsPath', () => {
  it('puts environment variables under env and splits other keys on dots', () => {
    expect(settingsPath('BASH_MAX_OUTPUT_LENGTH')).toEqual(['env', 'BASH_MAX_OUTPUT_LENGTH']);
    expect(settingsPath('permissions.deny')).toEqual(['permissions', 'deny']);
    expect(settingsPath('autoCompactWindow')).toEqual(['autoCompactWindow']);
  });
});

describe('withKey', () => {
  it('sets a nested key and keeps its siblings', () => {
    expect(withKey({ permissions: { allow: ['Read'] } }, ['permissions', 'deny'], ['Workflow'])).toEqual({
      permissions: { allow: ['Read'], deny: ['Workflow'] },
    });
  });
});

describe('flatten', () => {
  it('keys leaves by dots and keeps lists whole', () => {
    expect([...flatten({ a: { b: 1, c: [1, 2] }, d: 'x' })]).toEqual([
      ['a.b', 1],
      ['a.c', [1, 2]],
      ['d', 'x'],
    ]);
  });
});

describe('settingsFiles', () => {
  it('lists managed, project and user settings, highest first', () => {
    const files = settingsFiles({ platform: 'darwin', userSettings: '/h/.claude/settings.json', projectRoot: '/r' });
    expect(files.map((file) => file.layer)).toEqual(['managed', 'project-local', 'project', 'user']);
    expect(files[0]?.file).toBe(managedSettingsFile('darwin'));
    expect(managedSettingsFile('linux')).toBe('/etc/claude-code/managed-settings.json');
  });
});

describe('effectiveSettings', () => {
  it('lets a higher layer win and the knob reader prefer the user layer', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-settings-'));
    onTestFinished(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const project = path.join(root, 'project.json');
    const user = path.join(root, 'user.json');
    await writeFile(project, JSON.stringify({ autoCompactWindow: 100_000, theme: 'light' }));
    await writeFile(user, JSON.stringify({ autoCompactWindow: 300_000, theme: 'dark' }));
    const effective = await effectiveSettings(
      [
        { layer: 'managed', file: path.join(root, 'missing.json') },
        { layer: 'project', file: project },
        { layer: 'user', file: user },
      ],
      { SOME_VAR: 'on' },
    );
    expect(effective.find((value) => value.key === 'theme')).toMatchObject({ value: 'light', layer: 'project' });
    const knob = knobReader(effective);
    expect(knob('autoCompactWindow')).toBe(300_000);
    expect(knob('SOME_VAR')).toBe('on');
  });

  it('finds an environment variable in the env block of the settings', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-settings-'));
    onTestFinished(async () => {
      await rm(root, { recursive: true, force: true });
    });
    const user = path.join(root, 'user.json');
    await writeFile(user, JSON.stringify({ env: { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' } }));
    const knob = knobReader(await effectiveSettings([{ layer: 'user', file: user }], {}));
    expect(knob('CLAUDE_CODE_SUBAGENT_MODEL')).toBe('sonnet');
  });
});
