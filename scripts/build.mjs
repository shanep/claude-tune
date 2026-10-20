// Bundles the /tune command into one CommonJS file. The plugin runs it with
// node straight from the repository, so dist/ is committed and an install
// needs no build step.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

import * as esbuild from 'esbuild';

rmSync('dist', { recursive: true, force: true });

await esbuild.build({
  entryPoints: ['src/cli/main.ts'],
  outfile: 'dist/tune.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  minify: false,
  legalComments: 'none',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

// A few comments in the bundled packages use long dashes. Swap them for plain
// hyphens so the committed file has none.
const bundle = readFileSync('dist/tune.cjs', 'utf8');
writeFileSync('dist/tune.cjs', bundle.replaceAll(/[\u2013\u2014]/gu, '-'));
