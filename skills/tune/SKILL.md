---
name: tune
description: Show where your Claude Code sessions spend tokens, from the transcripts in ~/.claude/projects, and apply the fixes you pick.
disable-model-invocation: true
argument-hint: "[report | fix <fix-id> | track <tip-id> [--off] | help [--open]]"
allowed-tools: Bash(node:*)
---

# /tune

The tune command reads the session transcripts, works out what cost the most
and why, and offers fixes. It never sends anything anywhere. Run it with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/tune.cjs" <command>
```

Arguments: $ARGUMENTS

If arguments were given, run the command with them and show the output. If
not, follow the steps below. When I ask how tune works or for its docs, run
`help --open`, which opens the full guide in my browser.

## 1. Report

Run `node "${CLAUDE_PLUGIN_ROOT}/dist/tune.cjs" report`. The first run reads
every transcript and can take a few seconds. Later runs only read what changed.

Walk me through it in this order, keeping the dollar figures:

1. One line of totals.
2. The tips, worst first. For each one: the finding, the worst sessions, what
   it gives up, and the fixes on offer. Mark fixes already applied as done and
   do not offer them. If a tip is tracked, give its verdict.
3. The costliest sessions, with their causes and what fixing each would save.
4. The hot files.

Keep it short. Do not paste the whole report back.

## 2. Offer the fixes

List the fixes that are not applied yet by id, and ask which ones to apply.
Apply nothing without a yes. Each kind works differently:

- **knob**: changes one setting in ~/.claude/settings.json. Say the key and
  value before asking. Apply it with `fix <fix-id>`, which writes through a
  symlink, keeps a backup and starts tracking the tip. Never edit the settings
  file by hand.
- **create**: writes a skill or agent into ~/.claude. Apply it with
  `fix <fix-id>`.
- **launch**: work you do in this session. Run `fix <fix-id>` to print the
  task, show me the title and detail, and ask before starting. Do the work in
  the folder it names. When it says to make a new worktree, make one from a
  freshly fetched default branch and work there. When the work is done, run
  the `track` command it printed.

Use `fix <fix-id> --dry-run` when I ask what a fix would do.

## 3. After

Say what changed and where. Settings take effect in new sessions. A later
/tune compares the sessions before and after each tracked tip.
