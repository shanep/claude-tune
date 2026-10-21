// The entry point the /tune skill runs: node dist/tune.cjs <command>.

import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import type { Env } from './app.js';
import { pathsFor } from './paths.js';
import { runGit } from './projects.js';
import { run } from './run.js';

/** The system opener: open on macOS, xdg-open on Linux. */
function openFile(file: string): Promise<void> {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  return new Promise((resolve, reject) => {
    execFile(command, [file], (error) => {
      if (error === null) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

function envNow(): Env {
  return {
    paths: pathsFor(process.env, os.homedir()),
    cwd: process.cwd(),
    env: process.env,
    platform: process.platform,
    now: () => Date.now(),
    git: runGit,
    // The build writes help.html next to tune.cjs.
    helpFile: path.join(path.dirname(path.resolve(process.argv[1] ?? '.')), 'help.html'),
    open: openFile,
  };
}

run(process.argv.slice(2), envNow()).then(
  (out) => {
    process.stdout.write(out);
  },
  (error: unknown) => {
    process.stderr.write(`tune: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);
