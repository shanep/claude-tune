import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import { assistant, jsonl, toolResult, toolUse, usage, userPrompt } from '../core/transcripts/test-helpers/fixtures.js';
import type { TuningState } from '../shared/tuning.js';

import type { Env } from './app.js';
import { pathsFor } from './paths.js';
import { run } from './run.js';

const SESSION = 'aaaaaaaa-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-10-02T12:00:00.000Z');

/**
 * A session in `cwd` whose context passes 200K tokens, so the huge-context tip
 * offers autoCompactWindow, and where every command is denied, so the denials
 * tip offers a launch fix in that folder.
 */
function hugeSession(cwd: string): string {
  const extra = { cwd };
  const records = [userPrompt('u1', 0, 'refactor everything', extra)];
  for (let turn = 0; turn < 12; turn += 1) {
    const id = `t${String(turn)}`;
    records.push(
      assistant({
        uuid: `a${String(turn)}`,
        at: (turn * 2 + 1) * 1000,
        messageId: `m${String(turn)}`,
        content: [toolUse(id, 'Bash', { command: 'ls' })],
        stop: 'tool_use',
        usage: usage({ input: 10, cacheRead: 150_000 + turn * 10_000, output: 2000 }),
        extra,
      }),
      toolResult(
        `r${String(turn)}`,
        (turn * 2 + 2) * 1000,
        [{ toolUseId: id, text: "The user doesn't want to proceed with this tool use.", isError: true }],
        extra,
      ),
    );
  }
  return jsonl(records);
}

interface Home {
  readonly root: string;
  readonly env: Env;
}

async function makeHome(settings: unknown = {}): Promise<Home> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'claude-tune-app-'));
  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const paths = pathsFor({}, root);
  const project = path.join(paths.projectsDir, '-work-demo');
  await mkdir(project, { recursive: true });
  await writeFile(path.join(project, `${SESSION}.jsonl`), hugeSession(root));
  await writeFile(paths.userSettings, `${JSON.stringify(settings, null, 4)}\n`);
  const env: Env = {
    paths,
    cwd: root,
    env: {},
    platform: 'linux',
    now: () => NOW,
    git: () => null,
    pluginRoot: root,
    helpFile: path.join(root, 'help.html'),
    open: () => Promise.resolve(),
  };
  return { root, env };
}

async function state(env: Env): Promise<TuningState> {
  return JSON.parse(await run(['report', '--json'], env)) as TuningState;
}

async function settingsOf(env: Env): Promise<unknown> {
  return JSON.parse(await readFile(env.paths.userSettings, 'utf8'));
}

describe('tune report', () => {
  it('finds the huge session and offers the compact window fix', async () => {
    const { env } = await makeHome();
    const found = await state(env);
    const tip = found.tips.find((item) => item.id === 'huge-context');
    expect(tip?.autoFixes.find((item) => item.id === 'knob:autoCompactWindow')).toMatchObject({
      applied: false,
    });
    const markdown = await run(['report'], env);
    expect(markdown).toContain('`huge-context`');
    expect(markdown).toContain('`knob:autoCompactWindow` [knob] Compact');
  });

  it('marks the fix applied when user settings already have it', async () => {
    const { env } = await makeHome({ autoCompactWindow: 200_000 });
    const tip = (await state(env)).tips.find((item) => item.id === 'huge-context');
    expect(tip?.autoFixes.find((item) => item.id === 'knob:autoCompactWindow')).toMatchObject({
      applied: true,
    });
  });

  it('keeps its index in the state folder, not in the Claude folder', async () => {
    const { env } = await makeHome();
    await run(['report'], env);
    expect((await lstat(env.paths.indexFile)).isFile()).toBe(true);
    expect(env.paths.indexFile.startsWith(env.paths.claudeDir)).toBe(false);
  });
});

describe('tune fix', () => {
  it('sets a knob, keeps the rest of the settings and starts tracking the tip', async () => {
    const { env } = await makeHome({ model: 'opus', env: { FOO: '1' } });
    const out = await run(['fix', 'knob:autoCompactWindow'], env);
    expect(out).toContain('Set autoCompactWindow to 200000');
    expect(out).toContain('`huge-context`');
    expect(await settingsOf(env)).toEqual({ model: 'opus', env: { FOO: '1' }, autoCompactWindow: 200_000 });
    expect(await readFile(env.paths.userSettings, 'utf8')).toMatch(/^\{\n {4}"model"/u);
    const tip = (await state(env)).tips.find((item) => item.id === 'huge-context');
    expect(tip?.autoFixes.find((item) => item.id === 'knob:autoCompactWindow')).toMatchObject({
      applied: true,
    });
    expect(await run(['fix', 'knob:autoCompactWindow'], env)).toContain('already set');
  });

  it('writes through a settings.json that links into a dotfiles folder', async () => {
    const { root, env } = await makeHome();
    const real = path.join(root, 'dot-files', 'settings.json');
    await mkdir(path.dirname(real), { recursive: true });
    await writeFile(real, '{\n  "theme": "dark"\n}\n');
    await rm(env.paths.userSettings);
    await symlink(real, env.paths.userSettings);
    const out = await run(['fix', 'knob:autoCompactWindow'], env);
    expect(out).toContain(`through the link to ${real}`);
    expect((await lstat(env.paths.userSettings)).isSymbolicLink()).toBe(true);
    expect(await readlink(env.paths.userSettings)).toBe(real);
    expect(JSON.parse(await readFile(real, 'utf8'))).toEqual({ theme: 'dark', autoCompactWindow: 200_000 });
    const backups = out.match(/saved at (\S+)\./u);
    expect(backups?.[1]?.startsWith(env.paths.backupDir)).toBe(true);
  });

  it('changes nothing on a dry run', async () => {
    const { env } = await makeHome({ theme: 'dark' });
    expect(await run(['fix', 'knob:autoCompactWindow', '--dry-run'], env)).toContain('Would set');
    expect(await settingsOf(env)).toEqual({ theme: 'dark' });
  });

  it('refuses a settings file that is not a JSON object', async () => {
    const { env } = await makeHome();
    await writeFile(env.paths.userSettings, '[1, 2]\n');
    await expect(run(['fix', 'knob:autoCompactWindow'], env)).rejects.toThrow('left it alone');
    expect(await readFile(env.paths.userSettings, 'utf8')).toBe('[1, 2]\n');
  });

  it('creates a suggested agent once and leaves an existing one alone', async () => {
    const { env } = await makeHome();
    const out = await run(['fix', 'create:scout'], env);
    expect(out).toContain(path.join(env.paths.agentsDir, 'scout.md'));
    const text = await readFile(path.join(env.paths.agentsDir, 'scout.md'), 'utf8');
    expect(text).toMatch(/^---\nname: scout\n/u);
    expect(await run(['fix', 'create:scout'], env)).toContain('already there');
  });

  it('prints the task for a launch fix instead of doing it', async () => {
    const { env } = await makeHome();
    const tip = (await state(env)).tips.find((item) => item.id === 'denials');
    const launch = tip?.autoFixes.find((item) => item.kind === 'launch');
    expect(launch).toMatchObject({ cwd: env.cwd });
    const out = await run(['fix', launch?.id ?? ''], env);
    expect(out).toContain(`Folder: ${env.cwd}`);
    expect(out).toContain('## Task');
    expect(out).toContain('tune track denials');
  });

  it('rejects a fix that is not on offer', async () => {
    const { env } = await makeHome();
    await expect(run(['fix', 'knob:nope'], env)).rejects.toThrow('No fix called knob:nope');
  });
});

describe('tune track', () => {
  it('starts and stops tracking a tip', async () => {
    const { env } = await makeHome();
    expect(await run(['track', 'huge-context'], env)).toContain('Tracking huge-context');
    expect(await run(['track', 'huge-context'], env)).toContain('Already tracking');
    expect(await run(['track', 'huge-context', '--off'], env)).toContain('Stopped');
    expect(await run(['track', 'huge-context', '--off'], env)).toContain('was not tracked');
    await expect(run(['track', 'nope'], env)).rejects.toThrow('no tip called nope');
  });
});

describe('tune help', () => {
  it('lists the commands and points at the full guide', async () => {
    const { env } = await makeHome();
    const out = await run(['help'], env);
    expect(out).toContain('help [--open]');
    expect(out).toContain('Run tune help --open for the full guide.');
  });

  it('opens the help page, or says where it is when nothing can open it', async () => {
    const { env } = await makeHome();
    await writeFile(env.helpFile, '<html></html>');
    const opened: string[] = [];
    const opener: Env = {
      ...env,
      open: (file) => {
        opened.push(file);
        return Promise.resolve();
      },
    };
    expect(await run(['help', '--open'], opener)).toBe(`Opened ${env.helpFile}.\n`);
    expect(opened).toStrictEqual([env.helpFile]);
    const failing: Env = { ...env, open: () => Promise.reject(new Error('no display')) };
    expect(await run(['help', '--open'], failing)).toBe(
      `Could not open a browser. The help page is at ${env.helpFile}.\n`,
    );
  });

  it('says how to build the help page when it is missing', async () => {
    const { env } = await makeHome();
    await expect(run(['help', '--open'], env)).rejects.toThrow('Run npm run build');
  });
});

describe('tune install', () => {
  it('writes the tune command and says when PATH will not find it', async () => {
    const { root, env } = await makeHome();
    const bin = path.join(root, 'bin');
    expect(await run(['install', bin], env)).toBe(
      `Installed ${path.join(bin, 'tune')}. Run tune help --open from any folder.\n` +
        `${bin} is not on your PATH. Add it in your shell profile.\n`,
    );
    const onPath: Env = { ...env, env: { PATH: bin } };
    expect(await run(['install', bin], onPath)).toBe(
      `Installed ${path.join(bin, 'tune')}. Run tune help --open from any folder.\n`,
    );
  });

  it('puts the command in ~/.local/bin by default', async () => {
    const { root, env } = await makeHome();
    expect(await run(['install'], env)).toContain(`Installed ${path.join(root, '.local', 'bin', 'tune')}.`);
  });
});

