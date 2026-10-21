// `tune install` puts a `tune` command on the user's PATH, so tune runs from
// any folder. The plugin folder changes with every plugin update, so the
// command it writes looks up the installed plugin each time it runs instead of
// linking to one.

import { access, chmod, constants, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** The plugin's id in Claude Code's installed plugin list. */
export const PLUGIN_ID = 'tune@shanep';

/**
 * The script `tune install` writes. It runs the installed plugin's bundle, or
 * the one `install` ran from when the plugin is not installed (such as a
 * checkout loaded with --plugin-dir).
 */
export function shimScript(fallbackRoot: string): string {
  return `#!/usr/bin/env node
// Written by \`tune install\`. It finds the installed tune plugin on each run,
// so it keeps working when the plugin updates.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 3)) {
  process.stderr.write(
    'tune: it needs Node 22.3 or newer, and \`node\` here is ' + process.version + '.\\n' +
      'Put a newer node first on your PATH.\\n',
  );
  process.exit(1);
}

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const fallback = ${JSON.stringify(fallbackRoot)};

function bundleIn(root) {
  const file = path.join(root, 'dist', 'tune.cjs');
  return fs.existsSync(file) ? file : null;
}

function installed() {
  try {
    const list = JSON.parse(
      fs.readFileSync(path.join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf8'),
    );
    for (const entry of list.plugins[${JSON.stringify(PLUGIN_ID)}] || []) {
      const file = bundleIn(entry.installPath);
      if (file !== null) {
        return file;
      }
    }
  } catch {
    // No list, or not one this script understands, so use the fallback.
  }
  return null;
}

const bundle = installed() || bundleIn(fallback);
if (bundle === null) {
  process.stderr.write(
    'tune: the tune plugin is not installed. Run: claude plugin install ${PLUGIN_ID}\\n',
  );
  process.exit(1);
}
require(bundle);
`;
}

/** Writes the command into dir and returns its path. */
export async function installShim(dir: string, fallbackRoot: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, 'tune');
  await writeFile(file, shimScript(fallbackRoot));
  await chmod(file, 0o755);
  return file;
}

/** Why typing the command would not run the file `tune install` wrote. */
export type PathProblem =
  | { readonly kind: 'not-on-path'; readonly dir: string }
  | { readonly kind: 'shadowed'; readonly by: string };

async function isCommand(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * Checks that the command name finds file: that its folder is on PATH and no
 * other command with the same name comes first.
 */
export async function pathProblem(file: string, pathValue: string | undefined): Promise<PathProblem | null> {
  const dir = path.resolve(path.dirname(file));
  for (const entry of (pathValue ?? '').split(path.delimiter)) {
    if (entry === '') {
      continue;
    }
    if (path.resolve(entry) === dir) {
      return null;
    }
    const other = path.join(path.resolve(entry), path.basename(file));
    if (await isCommand(other)) {
      return { kind: 'shadowed', by: other };
    }
  }
  return { kind: 'not-on-path', dir };
}
