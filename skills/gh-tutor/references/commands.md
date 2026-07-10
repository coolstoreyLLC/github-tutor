# Glossary: commands, flags, and what the letters stand for

Git's abbreviations were chosen by people typing on slow terminals in 2005. They are not mnemonics. Knowing what they *stand for* removes most of the mystery.

## The words

| Word | What it actually means |
|---|---|
| **repo** | repository — a project plus its entire history |
| **origin** | conventional nickname for "the remote I cloned from." A name, not a keyword |
| **upstream** | conventional nickname for "the original repo I forked from." Also: the remote branch yours is linked to |
| **HEAD** | the commit you are standing on right now |
| **HEAD~1** | one commit before HEAD. `HEAD~3` = three before |
| **HEAD^** | the parent of HEAD. Same as `HEAD~1` except after a merge, where `^2` picks the second parent |
| **index** | the staging area. Two names, one thing |
| **ref** | a name that points at a commit — a branch, a tag |
| **SHA / hash** | the 40-character ID of a commit, e.g. `a3f8c91...`. First 7 chars usually suffice |
| **tracked** | git knows about this file |
| **untracked** | git has never been told to care about this file |
| **staged** | this change is queued for the next commit |
| **fast-forward** | your branch had no new commits, so git just slid the label forward. No merge commit needed |
| **detached HEAD** | you're on a commit, not a branch. New commits here have no label and are easy to lose |
| **CI** | continuous integration — automated checks that run on your code |
| **PR** | pull request — a proposal to merge a branch, plus the review conversation |

## Looking around (never blocked)

```bash
git status                    # what's changed, staged, and where you are
git status -s                 # -s = --short, terse output
git log --oneline -10         # last 10 commits, one line each
git log --graph --oneline     # ASCII picture of branching
git log HEAD..origin/main     # commits they have that you don't
git diff                      # unstaged changes
git diff --staged             # what a commit right now would contain
git show abc123               # everything about one commit
git branch --show-current     # which branch am I on
git branch -a                 # -a = --all, include remote-tracking branches
git remote -v                 # -v = --verbose, nicknames and their real URLs
git worktree list             # every worktree and its branch
git reflog                    # every place HEAD has been. Your undo history
```

## Staging and committing

```bash
git add file.js               # stage one file
git add .                     # stage everything under this directory
git add -A                    # -A = --all, whole repo, including deletions
git add -p                    # -p = --patch, choose chunk by chunk
git restore --staged file.js  # unstage, keep the edit
git commit -m "message"       # -m = --message
git commit -a -m "msg"        # -a = --all, auto-stage tracked files. Skips new files
git commit --amend            # replace the last commit instead of adding one
```

`--amend` rewrites. Safe before you push, dangerous after.

## Branches

```bash
git branch                    # list
git branch -a                 # --all, include remotes
git switch main               # move onto main
git switch -c feature/login   # -c = --create, make it and move onto it
git switch -                  # back to the previous branch, like `cd -`
git branch -d old             # -d = --delete, refuses if unmerged
git branch -D old             # force delete. Can orphan commits
git branch -m new-name        # -m = --move, rename
```

`git branch foo` creates the label but does **not** move you onto it. `git switch -c foo` does both.

The older `git checkout` does the jobs of both `switch` and `restore`, which is why it confuses everyone. `git checkout -- file.js` silently discards your uncommitted work in that file.

## Talking to the remote

```bash
git fetch origin              # download. Changes none of your files. Always safe
git fetch --prune             # also drop refs to branches deleted on GitHub
git pull                      # = fetch + merge. Can start a conflict
git pull --rebase             # = fetch + rebase. Linear history
git pull --ff-only            # --fast-forward-only. Refuse if a merge is needed
git push                      # upload the current branch
git push -u origin feature/x  # -u = --set-upstream. Links the branches so later
                              #   pushes and pulls need no arguments
git push --tags               # tags do NOT go with a normal push
git push --force-with-lease   # overwrite remote history, but abort if someone
                              #   else pushed since your last fetch
```

Never `git push --force` on a shared branch. `--force-with-lease` does the same job and refuses when the remote has moved under you.

## Combining work

```bash
git merge main                # bring main's commits INTO the branch you're on
git merge --no-ff main        # --no-fast-forward, always make a merge commit
git rebase main               # replay your commits on top of main
git rebase -i HEAD~3          # -i = --interactive. Reorder/squash/reword/drop
git cherry-pick abc123        # copy one commit onto this branch
```

`git merge main` merges main into you. Not the other way. Check `git branch --show-current` first — this one bites everybody once.

## Undoing

```bash
git restore file.js           # discard uncommitted edits. NO UNDO
git restore --staged file.js  # unstage, keep the edit. Safe
git reset                     # unstage everything. Safe
git reset --soft HEAD~1       # undo last commit, keep changes staged
git reset --mixed HEAD~1      # (default) undo commit, keep changes unstaged
git reset --hard HEAD~1       # undo commit AND delete the changes. NO UNDO
git revert abc123             # new commit that undoes abc123. Safe, public-friendly
git clean -nd                 # -n = --dry-run, -d = directories. LOOK first
git clean -fd                 # -f = --force. Deletes untracked files. NO UNDO
```

`reset` moves your branch label backwards. `revert` adds a new commit. On anything you've pushed, use `revert`.

## Stashing

```bash
git stash                     # shelve tracked changes, clean the tree
git stash -u                  # -u = --include-untracked. New files too
git stash list                # what's on the stack
git stash pop                 # reapply the newest and remove it
git stash apply               # reapply but keep it on the stack
```

Plain `git stash` leaves untracked files behind. That surprise costs people real work.

## Worktrees

```bash
git worktree add ../hotfix main   # check out main in a sibling folder
git worktree list
git worktree remove ../hotfix     # always this, never rm -rf
```

## Remotes

```bash
git remote -v
git remote add origin git@github.com:you/repo.git
git remote set-url origin <new-url>
git remote add upstream git@github.com:original/repo.git   # for forks
```

## GitHub CLI

```bash
gh auth status
gh pr list
gh pr view 42
gh pr diff 42
gh pr checkout 42             # fetch someone's PR branch and switch onto it
gh pr create --title "..." --body "..."
gh pr create --draft          # open it, not ready for review
gh pr merge 42 --squash -d    # --squash: flatten to one commit. -d: delete branch
gh repo create name --public --source=. --push
gh repo fork
gh issue create --title "..."
gh run list                   # CI runs
gh run watch                  # follow the current one
```

Two things people trip on:

- `gh pr create` needs the branch **pushed** first. GitHub cannot see commits on your laptop.
- `gh pr merge` merges on the server. Your local repo knows nothing about it until `git switch main && git pull`.

## Merge conflict, step by step

A conflict means two branches changed the same lines and git will not guess.

```bash
git status                    # lists "both modified" files
```

Open each one. You will find:

```
<<<<<<< HEAD
your version
=======
their version
>>>>>>> main
```

Delete the markers, keep the code you want (often a blend of both), then:

```bash
git add resolved-file.js      # `add` here means "I have resolved this"
git commit                    # completes a merge
# or, if you were rebasing:
git rebase --continue
```

Escape hatches: `git merge --abort` and `git rebase --abort` put everything back exactly as it was. They always work. Reach for them without shame.
