// What the fixes check before they offer themselves: a setting's value and when a file changed.
import { statSync } from 'node:fs';

import type { EffectiveValue } from '../../shared/knob-model.js';

/** A Claude Code setting as the user layer has it, or as it takes effect when that layer does not set it. */
export function knobReader(effective: readonly EffectiveValue[]): (key: string) => unknown {
  return (key) => {
    const found =
      effective.find((value) => value.key === key) ??
      effective.find((value) => value.key === `env.${key}`);
    return found?.chain.find((link) => link.layer === 'user')?.value ?? found?.value;
  };
}

/** When each path last changed, or null when it is not there, asking the disk once per path. */
export function modifiedCheck(): (path: string) => number | null {
  const known = new Map<string, number | null>();
  return (path) => {
    let found = known.get(path);
    if (found === undefined) {
      found = statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? null;
      known.set(path, found);
    }
    return found;
  };
}
