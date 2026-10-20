// The entry point the /tune skill runs: node dist/tune.cjs <command>.

import os from 'node:os';
import process from 'node:process';

import type { Env } from './app.js';
import { pathsFor } from './paths.js';
import { runGit } from './projects.js';
import { run } from './run.js';

function envNow(): Env {
  return {
    paths: pathsFor(process.env, os.homedir()),
    cwd: process.cwd(),
    env: process.env,
    platform: process.platform,
    now: () => Date.now(),
    git: runGit,
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
