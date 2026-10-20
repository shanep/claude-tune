// Where Claude Code keeps its files and where /tune keeps its own. The state
// lives outside the plugin folder, since a plugin update replaces that folder.

import path from 'node:path';

export interface Paths {
  readonly home: string;
  /** ~/.claude, or CLAUDE_CONFIG_DIR when it is set. */
  readonly claudeDir: string;
  readonly projectsDir: string;
  readonly userSettings: string;
  readonly skillsDir: string;
  readonly agentsDir: string;
  readonly stateDir: string;
  /** The measure of every session, so a rescan only reads transcripts that changed. */
  readonly indexFile: string;
  /** The tips you follow and since when, which the transcripts cannot rebuild. */
  readonly trackedFile: string;
  /** Copies of settings.json from before each change /tune made to it. */
  readonly backupDir: string;
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

export function pathsFor(env: NodeJS.ProcessEnv, home: string): Paths {
  const claudeDir = nonEmpty(env['CLAUDE_CONFIG_DIR']) ?? path.join(home, '.claude');
  const stateHome = nonEmpty(env['XDG_STATE_HOME']) ?? path.join(home, '.local', 'state');
  const stateDir = nonEmpty(env['CLAUDE_TUNE_STATE_DIR']) ?? path.join(stateHome, 'claude-tune');
  return {
    home,
    claudeDir,
    projectsDir: path.join(claudeDir, 'projects'),
    userSettings: path.join(claudeDir, 'settings.json'),
    skillsDir: path.join(claudeDir, 'skills'),
    agentsDir: path.join(claudeDir, 'agents'),
    stateDir,
    indexFile: path.join(stateDir, 'tuning.json'),
    trackedFile: path.join(stateDir, 'tuning-tracked.json'),
    backupDir: path.join(stateDir, 'backups'),
  };
}
