// The commands by name, as the /tune skill and the tests call them.

import { fix, help, install, report, track } from './app.js';
import type { Env } from './app.js';

export const USAGE = `Usage: tune <command>

  report [--json]          Scan the transcripts and print the tips, costliest
                           sessions and hot files (Markdown, or JSON).
  fix <fix-id> [--dry-run] Apply a setting or create fix, or print the task
                           for a launch fix. Tracks the tips it follows.
  track <tip-id> [--off]   Start or stop tracking a tip by hand.
  help [--open]            Show this, or open the full guide in your browser.
  install [dir]            Put a tune command in ~/.local/bin (or dir), so
                           tune runs from any folder.
`;

export async function run(argv: readonly string[], env: Env): Promise<string> {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const [command = 'report', target] = argv.filter((arg) => !arg.startsWith('--'));
  switch (command) {
    case 'report': {
      return report(env, flags.has('--json'));
    }
    case 'fix': {
      if (target === undefined) {
        throw new Error('Name the fix to apply, like: tune fix knob:autoCompactWindow');
      }
      return fix(env, target, flags.has('--dry-run'));
    }
    case 'track': {
      if (target === undefined) {
        throw new Error('Name the tip to track, like: tune track huge-context');
      }
      return track(env, target, !flags.has('--off'));
    }
    case 'help': {
      return flags.has('--open') ? help(env) : `${USAGE}\nRun tune help --open for the full guide.\n`;
    }
    case 'install': {
      return install(env, target);
    }
    default: {
      throw new Error(`Unknown command ${command}.\n\n${USAGE}`);
    }
  }
}
