import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Claude Code puts session worktrees here, each a full copy of the repo,
    // so without this every test runs once per worktree.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
