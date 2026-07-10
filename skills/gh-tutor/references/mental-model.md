# The mental model

Read this when the user is confused about *why*, not *how*. Most git confusion is not about commands. It is about not knowing which of several places a change currently lives in.

## The four places a change can be

A single edit to `login.js` passes through four states. Almost every "wait, where did my change go?" is a mix-up between two of them.

```
  working directory  →  staging area  →  local repository  →  remote
     (your files)         (the index)      (your commits)      (GitHub)

        git add ─────────────┘                  │                 │
        git commit ──────────────────────────────┘                │
        git push ─────────────────────────────────────────────────┘
```

**Working directory** — the actual files on disk. What your editor shows you.

**Staging area** — also called the *index*. A holding pen. You put changes here to say "this batch belongs in my next commit." This is the concept with no equivalent in Dropbox or Google Docs, and it is where most people lose their footing.

**Local repository** — the commits. Permanent checkpoints, stored in the hidden `.git` folder. Still only on your machine.

**Remote** — GitHub's copy. The only one your teammates, your CI, and your dead-laptop-recovery plan can see.

Two consequences worth stating out loud:

- **Committing is not backing up.** A commit is local. If the disk dies, the commit dies.
- **Staging is a snapshot, not a subscription.** `git add login.js`, then edit `login.js` again, and the second edit is *not* staged. You have to add it again. `git status` will show the file as both staged and modified, which looks like a bug and is not.

## What a branch actually is

A branch is not a folder. It is not a copy of your code. It is a **sticky note with a commit ID written on it.**

```
        A ── B ── C          ← main
                   \
                    D ── E   ← feature/login
```

`main` is a label pointing at commit C. `feature/login` is a label pointing at E. That's the whole thing. This is why creating a branch is instant even in a huge repo: git writes a 40-character ID into a small file.

When you commit, the label you're standing on slides forward to the new commit. Which label are you standing on? That's `HEAD`.

**HEAD** is a pointer to "the branch you are currently on." `git branch --show-current` prints it. When people say *detached HEAD*, they mean HEAD is pointing straight at a commit instead of at a branch label — so commits you make have no label following them, and are easy to lose.

## Local vs remote, and the mirror in between

This is the source of the second great confusion. There are three different things with confusingly similar names:

| Name | What it is |
|---|---|
| `main` | your local branch |
| `origin/main` | your local, read-only **mirror** of what GitHub's `main` looked like the last time you talked to it |
| GitHub's `main` | the actual branch on the server |

`origin/main` is not GitHub. It is your cached snapshot of GitHub. It only updates when you run `git fetch` (or `git pull`, which fetches first).

So when `git status` says *"your branch is behind 'origin/main' by 3 commits"*, it is telling you about a snapshot that may itself be hours out of date. Fetch first, then trust it.

**`origin`** is just a nickname for a URL. Nothing magic about the word. `git remote -v` shows what it actually points at. You could rename it `github` and everything would work.

## fetch vs pull

- `git fetch` downloads. It touches nothing you have. It cannot cause a conflict. It is always safe.
- `git pull` = `git fetch` + `git merge`. It downloads *and immediately joins the commits into your branch*, which can drop you into a merge conflict you did not ask for.

The habit worth building: `git fetch`, then `git log --oneline HEAD..origin/main` to see exactly what's coming, *then* decide how to take it.

## merge vs rebase

Both answer "someone else's commits and mine need to become one history." They differ in what history looks like afterward.

**Merge** keeps both storylines and ties them together with a merge commit:

```
    A ── B ─────── M     ← main
          \       /
           D ── E        ← your branch
```

Honest and non-destructive. Nothing is rewritten. Your commits keep their IDs. The history shows what actually happened, including the messy parts.

**Rebase** picks your commits up and replays them on the new tip, as if you had started from there all along:

```
    A ── B ── D' ── E'   ← main
```

`D'` and `E'` are **new commits**. Same changes, different IDs. The old `D` and `E` still exist for a while, unreferenced, until git garbage-collects them.

That is exactly why the rule exists:

> **Rebase your own local work. Merge public work.**

If you rebase commits you already pushed, and a teammate has pulled them, their history contains `D` and yours contains `D'`. Git cannot tell they are the same. The repository has two irreconcilable stories, and fixing it is genuinely unpleasant.

## Worktrees

The problem: you're mid-feature, the code doesn't compile, and a production bug lands. You can't switch branches without stashing, and stashing half-broken work is how it gets lost.

A **worktree** checks out a second branch into a second folder, backed by the same repository.

```
  ~/project        ← feature/login, half-finished, untouched
  ~/project-hotfix ← main, clean, fix the bug here
```

```bash
git worktree add ../project-hotfix main   # create it
git worktree list                         # see them all
git worktree remove ../project-hotfix     # tear it down cleanly
```

Two rules: the same branch cannot be checked out in two worktrees at once, and never `rm -rf` a worktree folder — that leaves stale metadata behind. Use `git worktree remove`.

## Why any of this

Git is not a backup tool that got complicated. It is a tool for answering *"what changed, who changed it, and can we safely combine two people's changes?"* — and it stores history as a chain of snapshots so that it can answer those questions cheaply.

Every command makes more sense once you ask which of the four places it moves a change between, and whether it *adds* to history or *rewrites* it.

Commands that add: `commit`, `merge`, `revert`. Safe.
Commands that rewrite: `rebase`, `reset --hard`, `commit --amend`, `push --force`. Powerful, and worth understanding before you run them.
