// The suggested skills and agents already saved, so they are not offered again.

import { existsSync } from 'node:fs';
import path from 'node:path';

import type { SuggestionDefinition } from '../core/tuning/suggestions.js';
import { nameOf, SUGGESTIONS } from '../core/tuning/suggestions.js';

export interface LibraryDirs {
  readonly skillsDir: string;
  readonly agentsDir: string;
}

/** Where a saved copy of the suggestion would be in one library. */
export function suggestionFile(dirs: LibraryDirs, definition: SuggestionDefinition): string {
  const name = nameOf(definition);
  return definition.kind === 'skill'
    ? path.join(dirs.skillsDir, name, 'SKILL.md')
    : path.join(dirs.agentsDir, `${name}.md`);
}

/** Ids of the suggestions saved in any of the libraries. */
export function installedSuggestions(
  libraries: readonly LibraryDirs[],
  exists: (file: string) => boolean = existsSync,
): Set<string> {
  const installed = new Set<string>();
  for (const definition of SUGGESTIONS) {
    if (libraries.some((dirs) => exists(suggestionFile(dirs, definition)))) {
      installed.add(definition.id);
    }
  }
  return installed;
}

/** The user library and, inside a repository, the project's own. */
export function librariesFor(
  user: LibraryDirs,
  projectRoot: string | null,
): LibraryDirs[] {
  return projectRoot === null
    ? [user]
    : [
        user,
        {
          skillsDir: path.join(projectRoot, '.claude', 'skills'),
          agentsDir: path.join(projectRoot, '.claude', 'agents'),
        },
      ];
}
