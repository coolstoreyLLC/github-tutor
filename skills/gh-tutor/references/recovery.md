# "I think I broke it"

Read this the moment something goes wrong. Then tell the user the single most important fact about git:

> **Almost nothing is actually lost. Committed work is nearly impossible to destroy by accident.**

The exceptions are narrow and worth memorizing, because they are the only places git cannot save you:

- Changes you never committed, wiped by `git reset --hard`, `git restore <file>`, or `git checkout -- <file>`.
- Untracked files deleted by `git clean -fd`. Git never knew they existed.
- A branch force-deleted and then garbage-collected weeks later.

Everything else is recoverable. Say that out loud before doing anything — a panicking person makes it worse.

## First move, always: stop and look

Do not run another mutating command. Do not "try something." Run these — they are read-only and cannot make it worse:

```bash
git status
git log --oneline -10
git reflog
```

## reflog: the undo history nobody knows about

`git reflog` is a log of **every position HEAD has been in**, including commits that no branch points at anymore. Reset too far? Deleted a branch? Bad rebase? The commits are still there. Reflog knows where.

```bash
git reflog
```

```
a3f8c91 HEAD@{0}: reset: moving to HEAD~3
7d2e1b4 HEAD@{1}: commit: add password validation
9c4f0a2 HEAD@{2}: commit: add login form
```

`HEAD@{1}` is where you were one move ago. The work is at `7d2e1b4`.

```bash
git reset --hard 7d2e1b4      # go back to exactly there
```

Reflog entries survive about 90 days by default. This is why "I lost commits" is nearly always false. It's also why `git gc` and `git prune` are the commands that make loss permanent.

## By symptom

### "I committed to the wrong branch"

Nothing is lost. The commit exists; it just has the wrong label pointing at it.

```bash
git log --oneline -1          # copy the commit ID
git switch correct-branch
git cherry-pick <id>          # copy it here
git switch wrong-branch
git reset --hard HEAD~1       # remove it from the wrong branch
```

That last line deletes uncommitted changes too — check `git status` is clean before running it.

### "I need to undo my last commit"

Not pushed yet, want to keep the changes:

```bash
git reset --soft HEAD~1       # commit undone, changes still staged
```

Not pushed, want the changes as plain edits:

```bash
git reset HEAD~1              # --mixed, the default
```

Already pushed — do **not** reset. Rewriting public history breaks everyone who pulled it:

```bash
git revert <commit-id>        # new commit that undoes it. Honest and safe
```

### "I reset --hard and lost my commits"

They're in the reflog.

```bash
git reflog                    # find the commit from before the reset
git reset --hard <that-id>
```

If the work was never committed, it is gone. Git cannot recover what it was never shown. Some editors keep local history — worth checking before giving up.

### "I deleted a branch"

```bash
git reflog                    # find the branch's last commit
git branch recovered <that-id>
```

### "My rebase went wrong"

Mid-rebase, before it finished:

```bash
git rebase --abort            # everything back exactly as it was
```

Already finished and it's a mess:

```bash
git reflog                    # find the commit from before the rebase started
git reset --hard <that-id>
```

### "I'm in a merge conflict and I want out"

```bash
git merge --abort
# or
git rebase --abort
```

Both restore the pre-conflict state completely. Always available. Use them freely — an abort costs nothing and there is no prize for pushing through a conflict you don't understand.

### "I'm in detached HEAD state"

You're standing on a commit rather than a branch. Commits made here have no label and will eventually be collected.

Keep the work:

```bash
git switch -c my-work         # -c creates a branch right here, keeping everything
```

Discard it:

```bash
git switch main
```

### "I pushed something secret"

Move fast, and be honest about what this does and doesn't fix.

1. **Rotate the credential immediately.** Assume it is compromised the moment it hit GitHub. Bots scrape public commits within seconds. Everything below is cleanup, not containment.
2. Removing it from history requires rewriting every commit after it — `git filter-repo`, or GitHub's support for cache-purging.
3. Even after rewriting, forks, clones, and GitHub's own cached views may retain it.

Rotating the secret is the fix. History rewriting is hygiene.

### "git says my branch and origin have diverged"

You both committed to the same branch. Look before choosing:

```bash
git fetch origin
git log --oneline HEAD..origin/main    # what they have that you don't
git log --oneline origin/main..HEAD    # what you have that they don't
```

Then either `git pull --rebase` (replay yours on top — linear, clean) or `git pull` (merge them — honest, adds a merge commit).

Never resolve a divergence with `git push --force`. That is the command that erases a teammate's work. If you genuinely must overwrite, `--force-with-lease` refuses when the remote moved since your last fetch.

## What to tell the user

Lead with the reassurance, because it's true and because it's the thing that makes them willing to try again: the commits are almost certainly fine, `git reflog` will find them, and `--abort` always works.

Then show them the read-only commands first. Looking is free. Looking is always the right first move.
