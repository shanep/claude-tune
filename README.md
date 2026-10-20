# claude-tune

A Claude Code plugin that reads your session transcripts in
`~/.claude/projects`, shows where the tokens went and offers fixes. Everything
runs locally with node. Nothing gets sent anywhere.

## Install

```bash
claude plugin marketplace add shanep/claude-tune
claude plugin install tune@claude-tune
```

You need node 22.3 or later on your PATH. It works on macOS and Linux.

## Use

Run `/tune:tune` in a session (or just `/tune` if nothing else uses that name).
Claude runs the scan and walks you through:

1. The tips, worst first, with dollar figures and the sessions that hit them
   hardest.
2. Your costliest sessions, what drove the cost and what a fix would save.
3. Hot files, the ones sessions keep reading over and over.

Then it offers the fixes and asks before applying any of them. There are three
kinds:

- **knob** - sets one key in `~/.claude/settings.json`. If that file is a
  symlink into a dotfiles repo it writes through the link, so the link stays.
  A copy of the old file goes in the state folder first.
- **create** - writes a skill or agent into `~/.claude/skills` or
  `~/.claude/agents`.
- **launch** - a task Claude does in the session, like splitting a big file or
  trimming a skill. It asks first.

Each fix you apply starts tracking the tip it came from, so a later `/tune`
compares the sessions before and after.

## Command line

The skill runs `dist/tune.cjs`, and you can run it yourself:

```bash
node dist/tune.cjs report           # Markdown report
node dist/tune.cjs report --json    # everything, as JSON
node dist/tune.cjs fix <fix-id> --dry-run
node dist/tune.cjs fix <fix-id>
node dist/tune.cjs track <tip-id> [--off]
```

The index of scanned sessions and the tracked tips live in
`${XDG_STATE_HOME:-~/.local/state}/claude-tune`. Set `CLAUDE_TUNE_STATE_DIR`
to put them somewhere else. `CLAUDE_CONFIG_DIR` is honored the same way
Claude Code honors it.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

`dist/tune.cjs` is committed because a plugin install does not run a build
step. Rebuild and commit it with any change under `src/`.

To try the plugin without installing it, load it for one session:

```bash
claude --plugin-dir .
```
