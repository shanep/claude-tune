// Bundles the /tune command into one CommonJS file. The plugin runs it with
// node straight from the repository, so dist/ is committed and an install
// needs no build step.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

import * as esbuild from 'esbuild';
import { Marked } from 'marked';

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

// The help page, for tune help --open. Built here so it matches the bundle
// and opens without the network.
const marked = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = text.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-|-$/gu, '');
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});
const body = marked.parse(readFileSync('docs/help.md', 'utf8'));
const style = readFileSync('docs/help.css', 'utf8');
writeFileSync(
  'dist/help.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tune help</title>
<style>
${style}</style>
</head>
<body>
<main>
${body}</main>
</body>
</html>
`,
);
