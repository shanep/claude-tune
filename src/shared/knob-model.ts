// Settings layers and the value that takes effect.

export type SettingsLayer =
  'managed' | 'cli' | 'project-local' | 'project' | 'user' | 'env' | 'default';

export interface EffectiveValue {
  readonly key: string;
  readonly value: unknown;
  readonly layer: SettingsLayer;
  /** Every layer that set this key, highest precedence first, including the winner. */
  readonly chain: readonly {
    readonly layer: SettingsLayer;
    readonly value: unknown;
    readonly file: string | null;
  }[];
}
