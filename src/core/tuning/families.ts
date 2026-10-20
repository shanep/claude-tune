// Kinds of shell work that a skill or agent could take over, and the
// commands that show a session doing it by hand.
// cspell:words uvicorn pytest

export type CommandFamily = 'land' | 'ci' | 'server' | 'buildTest' | 'search';

// Simple patterns, several per family, so each stays easy to read and check.
export const FAMILY_PATTERNS: readonly (readonly [CommandFamily, readonly RegExp[]])[] = [
  ['land', [/\bgit\b[^|;&]*\s(?:fetch|rebase|push)\b/u]],
  ['ci', [/\bgh\s+run\b/u, /\bgh\s+pr\s+checks\b/u]],
  [
    'server',
    [
      /\blsof\s+-ti\b/u,
      /\bdotnet\s+(?:run|watch)\b/u,
      /\bnpm\s+(?:dev|start)\b/u,
      /\bnpm\s+run\s+(?:dev|start)\b/u,
      /\b(?:uvicorn|pkill)\b/u,
      /\bflask\s+run\b/u,
    ],
  ],
  [
    'buildTest',
    [
      /\bnpm\s+test\b/u,
      /\bnpm\s+run\s+(?:test|build|check)\b/u,
      /\bnpx\s+(?:vitest|jest|tsc)\b/u,
      /\b(?:dotnet|cargo|go)\s+(?:build|test)\b/u,
      /\b(?:pytest|make|mvn|gradle)\b/u,
    ],
  ],
  ['search', [/^\s*(?:grep|rg|find|cat|head|tail|ls)\b/u, /^\s*sed\s+-n\b/u]],
];

export function familyCounts(families: ReadonlyMap<string, number>): Record<CommandFamily, number> {
  return {
    land: families.get('land') ?? 0,
    ci: families.get('ci') ?? 0,
    server: families.get('server') ?? 0,
    buildTest: families.get('buildTest') ?? 0,
    search: families.get('search') ?? 0,
  };
}
