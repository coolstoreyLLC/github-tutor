# github-tutor

A git tutor sitting beside you at the keyboard.

Claude Code keeps doing everything it normally does — writing code, running tests, debugging, refactoring. But when it reaches for a git command, it gets stopped. Instead of silently running `git push -u origin feature/login`, it explains what the command does, what `-u` stands for, what `origin` actually is, and why this is the right move right now. Then it hands the command to you to type.

You learn git on your own projects, at the moment the command matters, without turning your workday into a course.

```
Claude: I want to push. The tutor blocked me.

  git push -u origin feature/login

  push   send local commits to the remote
  -u     --set-upstream. Links this branch to origin's copy, so
         future `git push` needs no arguments
  origin the default nickname for the remote repo — an alias for
         your GitHub URL

Why now: you have 3 commits that exist only on this laptop. Nobody
else can see them, and there's no backup if the disk dies.

Your turn:

  ! git push -u origin feature/login
```

## Why a plugin and not just a skill

A skill is advice, and advice decays. Three turns into a task the model gets absorbed in the work and quietly runs `git commit` on your behalf, and you learn nothing.

This is a `PreToolUse` hook. It inspects every Bash command *before it runs* and denies the ones worth learning. The model cannot drift past it, cannot forget, and cannot route around it with a shell script.

Read-only git is never blocked. `git status`, `git log`, `git diff` all run freely, because Claude needs them to do its job — and because a lesson grounded in your repo's actual state is worth ten generic ones.

## Install

```bash
git clone https://github.com/coolstoreyLLC/github-tutor.git
```

Then add the marketplace and install:

```
/plugin marketplace add /path/to/github-tutor
/plugin install github-tutor@github-tutor
```

Restart Claude Code. You should see the tutor announce itself at session start.

## Use

It's on as soon as it's installed. Just work normally. The first time Claude tries to commit, the lesson happens.

| Command | Effect |
|---|---|
| `/gh-tutor` | Show current state and what you've learned |
| `/gh-tutor off` | Claude runs git commands normally again |
| `/gh-tutor on` | Re-enable |
| `/gh-tutor verbose` | Full explanations (default) |
| `/gh-tutor brief` | Tight lines, no filler. Danger warnings stay full |
| `/gh-tutor classroom on` | Quiz before revealing commands you've already been taught |
| `/gh-tutor classroom off` | No quizzes (default) |
| `/gh-tutor reset` | Forget learned-command history |

**In a rush? `/gh-tutor off`.** This matters more than it sounds. A learning tool you can't switch off is a tool you stop using. Turn it off, ship the thing, turn it back on tomorrow. State persists across sessions.

You can also just say "turn off the github tutor" in plain English.

## Classroom mode

Off by default, because a quiz you didn't ask for while you're mid-bug is obnoxious.

When on, it only quizzes you on commands **you have already been taught once**. It never ambushes you with new material. `skip` and `tell me` are always honored instantly.

```
You have 3 local commits. origin/main has 2 you don't.
What now?

  a) git push --force
  b) git pull --rebase
  c) git merge origin/main
  d) git fetch, then look
```

Wrong answers get explained, including why the wrong one was tempting.

## What gets gated

**Taught** — anything that changes your repo, your history, or GitHub:

`add` `commit` `push` `pull` `fetch` `merge` `rebase` `checkout` `switch` `restore` `reset` `revert` `cherry-pick` `clone` `init` `clean` `stash` `tag` `branch` (create/delete) `worktree` (add/remove) `remote` (add/set-url) `config` (write) `submodule` · `gh pr create|merge|close|checkout` `gh repo create|fork|delete` `gh issue create` `gh release create` `gh workflow run` `gh api` (writes)

**Never gated** — pure inspection:

`status` `log` `diff` `show` `blame` `reflog` `rev-parse` `ls-files` `branch` (list) `tag -l` `stash list` `worktree list` `remote -v` `config --get` `merge-base` · `gh pr list|view|diff|checks` `gh issue list` `gh repo view` `gh run list|watch` `gh api` (reads)

Compound and wrapped commands are handled too — `git add . && git commit -m x` is gated on the `add`, and `sh -c "git push"`, `eval "git push"`, and `` `git push` `` are all caught.

## Verbosity and caveman

If you also run the [caveman](https://github.com/JuliusBrussee/caveman) plugin, github-tutor notices and inherits brief mode automatically, unless you've explicitly chosen a verbosity.

Brief mode compresses the *prose*. It never compresses a danger warning and never drops the flag expansions — those are the whole point.

## Configuration

State lives at `~/.claude/.gh-tutor-state.json` and persists across sessions.

A repo can ship a default in `.gh-tutor.json`:

```json
{ "enabled": true, "verbosity": "verbose", "classroom": false }
```

Environment override, useful in CI or scripts:

```bash
GH_TUTOR=off claude
```

Escape hatch for a single command — append the sentinel and the gate ignores it:

```bash
git push  #tutor-ok
```

## Safety notes

The gate **fails open**. If the hook crashes, can't parse its input, or the state file is corrupt, commands are allowed through. A broken tutor must never wedge a real session.

When allowing a command, the hook exits silently rather than emitting `permissionDecision: "allow"`. Emitting an explicit allow would short-circuit Claude Code's own permission prompts — so a tutor plugin would end up quietly widening your permissions. It doesn't.

## Development

```bash
node tests/classify.test.js
```

The classifier carries the correctness burden, and the test suite reflects the bias that makes the plugin usable: **a false allow is a shrug, a false deny is a bug.** Blocking `git status` mid-task makes the whole thing feel broken. So read-only inspection always passes, only a curated verb list is gated, and unknown subcommands are allowed.

## License

MIT
