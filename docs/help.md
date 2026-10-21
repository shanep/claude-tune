# tune help

tune reads your Claude Code session transcripts, shows where the tokens went
and offers fixes. Everything runs locally with node. Nothing gets sent
anywhere.

This page covers what tune reads, how to read the report, every tip and fix,
how tracking works and where tune keeps its files. Open it any time with
`/tune help --open` in a Claude Code session, or `tune help --open` in a
terminal once you run `/tune install` (see [Command line](#command-line)).

## Quick start

1. Run `/tune:tune` in a Claude Code session (or `/tune` if nothing else uses
   that name).
2. Claude runs the scan and walks you through the tips, your costliest
   sessions and your hot files.
3. Pick the fixes you want. Claude asks before applying any of them.
4. Run `/tune` again in a week or two to see whether the tips you took helped.

The first scan reads every transcript and can take a few seconds. Later scans
only read what changed.

## What tune reads

Claude Code saves every session as a JSONL file under `~/.claude/projects`,
one folder per working directory. Subagent transcripts sit in a folder next
to the session. tune reads all of them.

It does not matter where the session ran. The CLI, the VS Code extension, the
desktop app, `claude -p` and the Agent SDK all save to the same folder, and
the report tells you which one each session came from:

| Label | Where it ran |
|---|---|
| CLI | `claude` in a terminal |
| VS Code | The Claude Code extension for VS Code |
| Desktop | The Claude desktop app |
| claude -p | `claude -p`, the non-interactive mode scripts use |
| Agent SDK | A program built on the Agent SDK |
| unknown | The transcript does not say |

A few things are left out:

- **Sessions with no requests.** You opened them and left, so they say
  nothing about how you work.
- **Deleted transcripts.** Claude Code deletes a transcript 30 days after its
  last use unless `cleanupPeriodDays` says otherwise. tune keeps what it
  measured for a year, but it cannot measure a session it never saw. The
  `transcript-cleanup` tip covers this.

If you set `CLAUDE_CONFIG_DIR`, tune reads that folder instead of
`~/.claude`, the same way Claude Code does.

### What the dollar figures mean

Every cost is worked out at API list price from the token counts in the
transcripts. That is what the same work would cost on the API. On a Pro or
Max plan you do not pay that amount, but the figures still show which
sessions and habits use up your limits fastest.

## The report

`tune report` prints the report as Markdown. `/tune` reads it and walks you
through it. It has these parts, in order.

**Totals.** The number of sessions, what they cost, how much of it went to
re-reading cached context, what went to subagents, and the average and
largest context. The next line splits sessions and spend by where they ran.

**Where the spend went.** The cost split by what filled the context:

| Slice | What it is |
|---|---|
| System prompt and tool definitions | Claude Code's own prompt and the tool definitions sent with every request |
| CLAUDE.md and memory | Your instruction files, sent with every request |
| Skills | The skill list and the body of each skill a session loaded |
| Hooks and reminders | Hook output and notes Claude Code adds to the conversation as it goes |
| Reading files | Files Claude read, carried for the rest of the session |
| Command and search output | Shell output, search results and other tool results |
| Web and connectors | Web search, web fetch and MCP connector results |
| Code and commands Claude wrote | What Claude put in tool calls, like file edits and commands |
| Subagent reports | What subagents sent back to the main session |
| Prompts, replies and thinking | Your prompts and Claude's replies, carried from turn to turn |
| Writing replies (output tokens) | The tokens Claude wrote in each response |

Every request sends the whole conversation again, so something read early in
a long session is paid for on every request after it. That is why reading files
and command output are often the biggest slices.

**Tips.** What stands out across your sessions, worst first. Each one has a
finding with numbers, advice, what following the advice gives up, when to
skip it, the sessions that show it worst and the fixes on offer. See
[Tips](#tips).

**Costliest sessions.** Up to 8 sessions that cost $3 or more, each with
where and when it ran, its context size, the spend split, the causes that
drove the cost and what fixing each would save, and the heaviest items it
carried.

**Hot files.** Files that sessions kept reading, by what carrying them in
context cost. A file shows up once at least 2 sessions read it. Short,
focused files are cheaper to read, so a big hot file is a good one to split.

**Suggested skills and agents.** Skills and agents tune can write for you,
with the reason it suggests each one. See [Fixes](#fixes).

## Tips

Each tip has an id you use with `fix` and `track`, and a severity: high,
medium or low. A tip only shows when it is worth acting on.

### file-reads (high)

**Files read once are paid for on every later request.** A file read on
request 20 of a 400 request session is sent 380 more times. Hand searches to
a subagent such as scout, read line ranges instead of whole files, and keep
the files sessions read most short.

Fixes: split the hot files (launch), add the scout agent (create).
Skip it for short sessions, which pay little to carry a file.

### context-reread (high)

**Most of the spend is re-reading old context.** The 300th turn of a session
costs far more than the 3rd. Start a new session when you move on to a new
task, use `/clear` when you switch to something unrelated, and `/compact`
with a focus at natural breakpoints.

Fixes: compact at 200K tokens (knob), add the scout agent (create).
Skip it in the middle of hard debugging. Write a handoff note first and
start fresh once that task is done.

### huge-context (high)

**Sessions grow huge without compacting.** Lower `autoCompactWindow` so
Claude Code compacts long before the 1M limit, or write a handoff note and
carry on in a fresh session.

Fixes: compact at 200K tokens (knob), add the handoff skill (create).
Skip it for work that needs a lot in view at once, like a refactor across
many files.

### unused-tools (medium)

**Every request carries tools that never get used.** A tool's definition goes
out with every request whether Claude calls it or not. Adding a tool to
`permissions.deny` leaves it out of the request.

Fix: deny the tools you never use (knob).
Keep a tool you use now and then, even if only in a few sessions.

### heavy-skills (medium)

**Skills cost more to carry than they need to.** A loaded skill stays in
context for the rest of the session. Keep SKILL.md to the steps Claude needs
every time and move reference material into files it reads only when needed.

Fix: slim the heaviest skills (launch).
Skip it for short skills or ones used only in short sessions.

### idle-rewrite (medium)

**Resuming big sessions after a break rewrites the cache.** The prompt cache
expires after a few minutes without a request. Coming back to a 500K session
after lunch writes all of it again, about $2.50 at Opus prices.

Fixes: compact at 200K tokens (knob), add the handoff skill (create).
Skip it for short breaks.

### subagent-model (medium)

**Subagents run on the most expensive models.** Most subagent work is
searching and summarizing, which Sonnet or Haiku do well for a fraction of
the price.

Fixes: run subagents on Sonnet with `CLAUDE_CODE_SUBAGENT_MODEL` (knob), add
the scout agent on Haiku (create).
Keep Opus for agents that review code, plan or debug by giving them
`model: opus` in their frontmatter.

### big-results (medium)

**Huge tool output stays in context.** Filter output before Claude sees it,
ask for line ranges, or cap Bash output with `BASH_MAX_OUTPUT_LENGTH`.

Fixes: cap shell output at 15,000 characters (knob), add the quiet-run skill
(create).
Let the full output through when you do not know yet what you are looking
for.

### repeated-commands (medium)

**The same commands run over and over.** Polling a build, server or CI run
from the main session sends the whole context again each time.

Fixes: add the ci-watch agent, the dev-server skill and the quiet-run skill
(create).
A quick test or build you rerun after each small edit is fine.

### long-sessions (medium)

**Long sessions mix several tasks.** Keep one task per session and put facts
every session needs in CLAUDE.md or a skill.

Fixes: compact at 200K tokens (knob), add the handoff skill (create).
Stay in one session when the tasks build on each other.

### denials (medium)

**Tool calls keep getting denied.** Each denied call is a wasted turn. Add
allow rules for the read-only commands Claude keeps asking for.

Fix: run `/fewer-permission-prompts` in the project with the most denials
(launch).
Keep denying anything that pushes, deletes, deploys or touches production.

### instructions (low)

**CLAUDE.md and memory are sent with every request.** Keep them to one line
per rule.

Fix: have Claude tighten `~/.claude/CLAUDE.md` and the memory index (launch).
Leave a rule long when its detail prevents a costly mistake.

### rereads (low)

**Files are read again and again.** Each read of a whole file adds it to
context again. Ask for the lines you need, or grep for them.

Fix: add the scout agent (create).
A reread after the file changed is worth it.

### tool-errors (low)

**Many tool calls fail.** Put the exact build, test and lint commands, and
the setup they need, in CLAUDE.md.

Fix: have Claude find the failing commands and add the right ones to the
project's CLAUDE.md (launch).
Failing tests and type errors do not count. They are how Claude finds
problems.

### cd-commands (low)

**Commands keep changing folders.** Start sessions in the project folder, so
its CLAUDE.md and skills load, and use absolute paths or `git -C` instead of
`cd`. Claude Code puts the shell back in the session folder after a `cd`
outside it, so every later command there starts with `cd` again.

Fix: add the folders sessions keep going to to
`permissions.additionalDirectories` (knob), so the shell stays after one
`cd`. Sessions can then also read and edit files there.
Work across several repos cannot always avoid it.

### transcript-cleanup (low)

**Claude Code deletes old transcripts.** It shows once your oldest session is
close to the `cleanupPeriodDays` limit (30 days by default) and the setting is
under 90 days. Raising it lets tune measure sessions it never scanned in
time, and lets `/resume` reach them.

Fix: keep transcripts for 90 days (knob).
Transcripts take disk space roughly in proportion to the days kept, so skip
it when disk space is tight.

## Fixes

Every fix has an id like `knob:autoCompactWindow`. The report lists them
under each tip. There are three kinds.

**knob** sets one key in `~/.claude/settings.json`. Environment settings like
`CLAUDE_CODE_SUBAGENT_MODEL` go in its `env` block. If the file is a symlink
into a dotfiles repo, tune writes through the link, so the link stays. A copy
of the old file goes in the backups folder first. A knob already set the way
the fix wants shows as already applied. New sessions pick up the change.

**create** writes a skill or agent into `~/.claude/skills` or
`~/.claude/agents`. It never overwrites a file that is already there, and
one already in the project's `.claude` folder counts as done.

| Id | Kind | What it does |
|---|---|---|
| handoff | skill | Writes a short handoff note so you can /clear or start fresh without losing the thread |
| scout | agent | A read-only search agent on Haiku that returns only the answer |
| quiet-run | skill | Runs builds and tests with output in a log file and brings back only the errors |
| land | skill | Commits, rebases onto the default branch, reruns checks, pushes and removes the worktree |
| ci-watch | agent | Waits on a GitHub Actions run on Haiku and reports only the result or the failing lines |
| dev-server | skill | Starts, restarts and stops local servers in the background and waits until they answer |

**launch** is a task Claude does in the session, like splitting a big file or
trimming a skill. `tune fix <id>` prints the task, the folder to do it in and
whether to make a new worktree. Claude shows it to you and asks before
starting.

Use `--dry-run` to see what a knob or create fix would do without doing it.

## Tracking

Applying a knob or create fix starts tracking the tips it follows. You can
also track a tip by hand with `tune track <tip-id>`, which is how you mark a
habit change, like starting fresh sessions more often.

Once a tip is tracked, a later report compares the sessions that started
after that moment with the sessions from the 30 days before. Sessions that
were already running when tracking started are left out. It compares:

- the habit the tip is about, like average context or denials,
- the cost per prompt,
- the side effects the tip warns about.

The verdict is one of:

| Verdict | Meaning |
|---|---|
| better | The habit improved and nothing it could cost got worse |
| mixed | The habit improved, but a side effect got worse |
| same | Nothing moved more than 10% |
| worse | The habit, or a side effect, got worse |
| early | Fewer than 5 sessions have run since tracking started |
| no-baseline | There were no sessions in the 30 days before to compare with |

A tracked tip stays in the report even once the habit no longer stands out,
so you can still see how it went. Stop tracking it with
`tune track <tip-id> --off`.

## Command line

To run tune in a terminal, from any folder, run this once in a Claude Code
session:

```text
/tune install
```

It writes a `tune` command into `~/.local/bin`. That command finds the
installed plugin each time it runs, so it keeps working when the plugin
updates. If `~/.local/bin` is not on your PATH, it says so. Pass a folder to
put the command somewhere else, like `/tune install ~/bin`. Then:

```bash
tune report                 # Markdown report
tune report --json          # everything, as JSON
tune fix <fix-id> --dry-run # what a fix would do
tune fix <fix-id>           # apply a fix
tune track <tip-id> [--off] # start or stop tracking a tip
tune help                   # the commands
tune help --open            # this page, in your browser
```

With no command, it runs `report`. You can also pass any of these to the
skill, like `/tune fix knob:autoCompactWindow`, without installing anything.

## Files and settings

tune keeps its own files outside the plugin folder, since a plugin update
replaces that folder:

| File | What it holds |
|---|---|
| `tuning.json` | What tune measured for each session, so a rescan only reads transcripts that changed |
| `tuning-tracked.json` | The tips you track and since when |
| `backups/` | Copies of `settings.json` from before each change tune made |

They live in `${XDG_STATE_HOME:-~/.local/state}/claude-tune`. These
environment variables change where things go:

| Variable | Effect |
|---|---|
| `CLAUDE_TUNE_STATE_DIR` | Where tune keeps its own files |
| `XDG_STATE_HOME` | The base for the default state folder |
| `CLAUDE_CONFIG_DIR` | Where Claude Code keeps transcripts and settings, `~/.claude` by default |

tune reads settings the way Claude Code layers them, so it can tell whether a
fix is already in place. From highest to lowest: managed settings, the
project's `.claude/settings.local.json` and `.claude/settings.json`,
`~/.claude/settings.json`, then the environment. It only ever writes the user
file.

After an update that changes what tune measures, the next scan reads every
transcript again. That takes a few seconds once.

## Troubleshooting

**It says there are no sessions.** Check that `~/.claude/projects` (or
`$CLAUDE_CONFIG_DIR/projects`) has `.jsonl` files in it. Sessions with no
requests do not count.

**My VS Code sessions are missing.** They save to the same folder as the
CLI, so they show up under the VS Code label. If you set `CLAUDE_CONFIG_DIR`
in the extension's `claudeCode.environmentVariables` setting, run tune with
the same value.

**A fix says it is not on offer.** Fixes only show while their tip applies.
Run `report` to see the current list. Skills and agents can always be created
with `fix create:<id>`.

**`tune: command not found`.** Run `/tune install` in a session first. If it
said `~/.local/bin` is not on your PATH, add it in your shell profile, like
`export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc` or `~/.bashrc`.

**`help --open` did not open anything.** It uses `open` on macOS and
`xdg-open` on Linux. Without a desktop, like over ssh, open the path it
prints yourself.

**node complains.** tune needs node 22.3 or later on your PATH.
