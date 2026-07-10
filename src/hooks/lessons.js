#!/usr/bin/env node
// github-tutor — the teaching payload
//
// Keyed by the gate keys that classify.js emits. Each entry is raw material the
// model turns into a lesson; it is NOT the final user-facing text. Keeping it
// here (rather than trusting the model to recall it) means the expansions and
// gotchas are consistent every single time, not vibes.
//
// `expand`  — what the letters literally stand for. The user asked for this
//             explicitly: abbreviations are the main source of git fog.
// `is`      — one plain sentence: what the command does.
// `why`     — why you'd reach for it at this moment.
// `gotcha`  — the thing that bites beginners. Omit rather than pad.
// `danger`  — present only when the command can destroy work.

const LESSONS = {
  add: {
    is: 'Copies the current state of a file into the staging area (also called the "index") — a holding pen for what will go into your next commit.',
    expand: {
      'git add .': 'stage everything under the current directory',
      'git add -A': '-A = --all, stage everything in the whole repo, including deletions',
      'git add -p': '-p = --patch, step through each change and choose chunk by chunk',
    },
    why: 'Git does not commit what is in your files. It commits what is staged. Staging is the step where you choose what belongs in this commit and what waits for the next one.',
    gotcha: 'Staging takes a SNAPSHOT. Edit the file after `git add` and the new edit is NOT staged — you must add it again.',
  },

  commit: {
    is: 'Takes everything currently staged and records it as a permanent, named checkpoint in your local repository.',
    expand: {
      '-m': '--message, the commit message, inline',
      '-a': '--all, auto-stage every already-tracked file (skips `git add`; does NOT include brand-new files)',
      '--amend': 'replace the previous commit instead of adding a new one',
    },
    why: 'A commit is a save point you can return to. Small, focused commits mean you can undo one mistake without losing the rest.',
    gotcha: 'A commit is LOCAL. It exists only on your machine until you push. Committing is not backing up.',
  },

  push: {
    is: 'Uploads commits from your local branch to the matching branch on the remote (GitHub).',
    expand: {
      '-u': '--set-upstream, permanently links this local branch to the remote one, so future `git push` and `git pull` need no arguments',
      origin: 'the default nickname for the remote repo — an alias for the GitHub URL, so you never retype it',
      'origin main': 'push to the remote named `origin`, to the branch named `main`',
      '--force-with-lease': 'overwrite remote history, but abort if someone else pushed since you last fetched',
    },
    why: 'Until you push, your commits exist on one disk. Pushing publishes them: teammates can see them, CI runs, and your work survives a dead laptop.',
    gotcha: 'Push only sends the branch you are on, not all branches.',
    danger: '`git push --force` can permanently erase commits your teammates pushed. Use `--force-with-lease` instead — it refuses when the remote moved under you.',
  },

  pull: {
    is: 'Two commands in one: `git fetch` (download the remote commits) followed by `git merge` (join them into your branch).',
    expand: {
      '--rebase': 'instead of merging, replay your local commits on top of the downloaded ones — gives a straight, linear history with no merge commit',
      '--ff-only': '--fast-forward-only, refuse to pull if it would need a merge; a safety net',
    },
    why: 'Someone else pushed. Your branch is behind. Pulling brings you level before you add more work on top.',
    gotcha: 'Because pull auto-merges, it can drop you into a conflict without warning. `git fetch` then `git log origin/main` lets you LOOK before you leap.',
  },

  fetch: {
    is: 'Downloads new commits and branches from the remote into your local copy — and changes nothing about your working files.',
    expand: {
      origin: 'the remote to download from',
      '--prune': 'also delete local references to remote branches that no longer exist on GitHub',
      'origin/main': 'your local read-only mirror of the remote `main` — note the slash; this is a different thing from `main`',
    },
    why: 'It is the safe way to answer "what changed on GitHub?" Nothing you have is touched, so it can never cause a conflict.',
    gotcha: 'After fetching, your branch has NOT moved. `git status` may now say "behind by 3 commits". You still need `merge` or `rebase` to actually take them.',
  },

  merge: {
    is: 'Joins another branch\'s history into your current branch.',
    expand: {
      'git merge main': 'take the commits on `main` and bring them into the branch you are standing on',
      '--no-ff': '--no-fast-forward, always create a merge commit even when not strictly needed, so the branch is visible in history',
      'fast-forward': 'when your branch has no new commits, git just slides the pointer forward — no merge commit is created',
    },
    why: 'Combining a finished feature branch back into the main line, or catching a feature branch up with main.',
    gotcha: 'Merge affects the branch you are ON, not the one you name. `git merge main` pulls main INTO your current branch. Check `git branch --show-current` first.',
  },

  rebase: {
    is: 'Lifts your commits off, moves the base of your branch to a new starting point, and replays your commits on top.',
    expand: {
      '-i': '--interactive, opens an editor to reorder, squash, reword, or drop commits',
      'HEAD~3': 'HEAD = where you are standing now; ~3 = three commits back. So "the last 3 commits"',
      'squash': 'combine several commits into one',
    },
    why: 'Produces a clean, linear history — no merge commits — and lets you tidy messy work-in-progress commits before review.',
    gotcha: 'Rebasing REWRITES commits: they get new IDs. Old and new look identical but git treats them as different.',
    danger: 'Never rebase commits you have already pushed and others have pulled. Their history and yours permanently diverge. Rule of thumb: rebase local work, merge public work.',
  },

  checkout: {
    is: 'The old, overloaded command. It both switches branches AND restores files — which is exactly why `switch` and `restore` were created to replace it.',
    expand: {
      '-b': 'create a new branch and move onto it in one step',
      'git checkout main': 'move onto the existing branch `main`',
      'git checkout -- file.js': 'THROW AWAY your uncommitted changes to file.js',
    },
    why: 'Still everywhere in docs and muscle memory, so worth understanding.',
    gotcha: 'Two totally different jobs behind one word. Modern equivalents: `git switch` for branches, `git restore` for files.',
    danger: '`git checkout -- <file>` silently discards uncommitted work with no confirmation and no undo.',
  },

  switch: {
    is: 'Moves you onto a different branch. The modern, single-purpose replacement for `git checkout <branch>`.',
    expand: {
      '-c': '--create, make a new branch and move onto it',
      '-': 'a dash alone means "the branch I was on before", like `cd -`',
    },
    why: 'Clearer and safer than checkout: it only ever touches branches, never quietly destroys file changes.',
    gotcha: 'Uncommitted changes come WITH you to the new branch. If they would be overwritten, git refuses — commit or stash first.',
  },

  branch: {
    is: 'A branch is just a movable label pointing at one commit. Creating one is nearly free — no files are copied.',
    expand: {
      'git branch': 'with no arguments, LIST branches',
      '-d': '--delete, delete a branch, but refuse if it has unmerged commits',
      '-D': 'force delete, even with unmerged commits — this can orphan work',
      '-a': '--all, include remote-tracking branches',
      '--show-current': 'print just the branch you are on',
    },
    why: 'Branches let you develop something risky without disturbing the working main line.',
    gotcha: 'Creating a branch does not move you onto it. `git branch foo` then `git switch foo` — or do both with `git switch -c foo`.',
    danger: '`git branch -D` on an unmerged branch abandons those commits. Recoverable via `git reflog` for a while, then gone for good.',
  },

  worktree: {
    is: 'Checks out a SECOND branch into a separate folder on disk, backed by the same repository. Two branches open at once, no stashing.',
    expand: {
      'git worktree add ../hotfix main': 'create folder ../hotfix with branch `main` checked out',
      'git worktree list': 'show every worktree and which branch each holds',
      'git worktree remove ../hotfix': 'tear the folder down cleanly',
    },
    why: 'An urgent bugfix lands while your feature is half-done and unstageable. Instead of stashing, open main in its own folder, fix, and go back — your feature folder is untouched.',
    gotcha: 'The same branch cannot be checked out in two worktrees at once. Also: `rm -rf` on the folder leaves stale metadata — always use `git worktree remove`.',
  },

  reset: {
    is: 'Moves your branch label backwards to an earlier commit. What happens to your files depends entirely on the flag.',
    expand: {
      '--soft': 'move the branch; keep all changes staged',
      '--mixed': 'the default; move the branch, keep changes as unstaged edits',
      '--hard': 'move the branch and OVERWRITE your files to match. Uncommitted work is destroyed.',
      'HEAD~1': 'one commit before where you are now',
    },
    why: 'Undo a commit you have not pushed, or unstage something you added by accident.',
    gotcha: '`git reset` (no flag) unstages files — a common and totally safe use.',
    danger: '`git reset --hard` deletes uncommitted changes permanently. There is no undo, because that work was never committed. Commit or stash first, always.',
  },

  revert: {
    is: 'Creates a NEW commit that undoes the changes of an earlier one. History is added to, never rewritten.',
    expand: { 'git revert abc123': 'make a new commit that is the exact inverse of commit abc123' },
    why: 'The safe way to undo something already pushed. Because it adds rather than rewrites, nobody else\'s history breaks.',
    gotcha: 'Reverting does not remove the original commit from history. Both are visible — which is the point: it is an audit trail.',
  },

  restore: {
    is: 'Puts files back to a previous state. The modern replacement for the file-restoring half of `git checkout`.',
    expand: {
      'git restore file.js': 'discard uncommitted edits to file.js',
      '--staged': 'unstage a file, keeping the edits',
    },
    why: 'You made a mess in one file and want it back the way it was.',
    danger: '`git restore <file>` discards uncommitted changes permanently.',
  },

  stash: {
    is: 'Shelves your uncommitted changes and hands you a clean working tree, saving them on a stack you can reapply.',
    expand: {
      'git stash': 'shelve tracked changes',
      'git stash pop': 'reapply the most recent stash and remove it from the stack',
      'git stash apply': 'reapply but KEEP it on the stack',
      '-u': '--include-untracked, also shelve brand-new files',
    },
    why: 'You need to switch branches right now but your work is not commit-ready.',
    gotcha: 'Plain `git stash` ignores untracked files — new files stay behind. Use `-u`. And a stash is easy to forget: `git stash list`.',
  },

  'cherry-pick': {
    is: 'Copies one specific commit from another branch onto your current branch.',
    expand: { 'git cherry-pick abc123': 'replay just commit abc123 here' },
    why: 'One fix on a long branch is needed on main right now, and the rest is not ready.',
    gotcha: 'It creates a COPY with a new ID. Merging the branch later can show the change twice.',
  },

  clone: {
    is: 'Downloads a full copy of a remote repository — every commit, every branch — into a new folder, and wires up `origin` for you.',
    expand: {
      origin: 'automatically set to the URL you cloned from',
      '--depth 1': 'a "shallow" clone: latest commit only. Fast, but most history is absent.',
    },
    why: 'How you start working on a repo that already exists.',
    gotcha: 'Clone creates a NEW folder. Run it from the parent directory, not inside an existing repo.',
  },

  init: {
    is: 'Turns the current folder into a git repository by creating a hidden `.git` directory.',
    expand: { '.git': 'where git stores every commit, branch, and config. Delete it and the folder is no longer a repo.' },
    why: 'Starting version control on a project that does not have it yet.',
    gotcha: 'A fresh repo has NO remote. `git push` fails until you add one and create the GitHub repo.',
  },

  remote: {
    is: 'Manages the nicknames pointing at copies of this repo hosted elsewhere.',
    expand: {
      origin: 'convention for "the repo I cloned from" — a nickname, nothing magic',
      upstream: 'convention for "the original repo I forked from"',
      'git remote -v': '-v = --verbose, show each nickname and its real URL',
    },
    why: 'Connecting a local repo to GitHub, or adding the original repo to a fork so you can pull in updates.',
    gotcha: '`origin` has no special power. It is a name. You could call it `github`.',
  },

  clean: {
    is: 'Deletes untracked files from your working directory.',
    expand: { '-f': '--force, required — git will not do this without it', '-d': 'also remove untracked directories', '-n': '--dry-run, show what WOULD be deleted' },
    why: 'Clearing out build artifacts and stray files.',
    danger: 'These files were never in git, so git cannot bring them back. ALWAYS run `git clean -nd` first to see the list.',
  },

  config: {
    is: 'Reads and writes git settings, at repo level or globally for your user.',
    expand: { '--global': 'apply to every repo for this user, stored in ~/.gitconfig', '--local': 'this repo only (the default)' },
    why: 'Setting the name and email that get stamped onto every commit you make.',
    gotcha: 'Without --global you set it for one repo only. Commits made before you fix it keep the old author.',
  },

  tag: { is: 'Puts a permanent name on a specific commit, usually a release version.', expand: { '-a': '--annotate, a full tag object with message and author (preferred for releases)', '-m': 'the tag message' }, why: 'Marking v1.0.0 so you can always find exactly what shipped.', gotcha: 'Tags are NOT pushed by `git push`. You need `git push --tags` or `git push origin v1.0.0`.' },

  submodule: { is: 'Embeds another git repository inside this one, pinned to one exact commit.', expand: { '--init': 'set up submodules listed in .gitmodules', '--recursive': 'do it for submodules of submodules' }, why: 'Depending on another repo at a version you control.', gotcha: 'A fresh clone leaves submodule folders EMPTY until `git submodule update --init`.' },

  apply: { is: 'Applies a patch file to your working directory without creating a commit.', why: 'Trying out a change someone sent as a .patch or .diff.', gotcha: 'Nothing is committed or staged — the changes just appear as edits.' },
  am: { is: 'Applies patches from mailbox files AND creates commits from them.', expand: { am: 'apply mailbox' }, why: 'Email-based patch workflows, like the Linux kernel.' },
  mv: { is: 'Renames or moves a file and stages the change in one step.', why: 'Equivalent to `mv` plus `git add` on both paths.' },
  rm: { is: 'Deletes a file AND stages the deletion.', expand: { '--cached': 'stop tracking the file but keep it on disk' }, why: 'Removing a file from the repo.', danger: 'Without --cached the file is deleted from disk too.' },
  gc: { is: 'Garbage collection — compresses history and drops unreachable objects.', expand: { gc: 'garbage collect' }, gotcha: 'Can permanently remove commits that only `git reflog` was still holding onto.' },
  prune: { is: 'Deletes objects no longer reachable from any branch or tag.', danger: 'This is the step that makes "recoverable" lost commits truly unrecoverable.' },
  'sparse-checkout': { is: 'Checks out only part of a large repo\'s file tree.', why: 'Monorepos where you only need one directory.' },
  'filter-branch': { is: 'Rewrites every commit in history according to a rule.', danger: 'Rewrites all commit IDs. Effectively a new history. Use `git filter-repo` instead — this command is deprecated.' },
  'update-ref': { is: 'Directly moves a branch or ref pointer.', danger: 'A low-level plumbing command that bypasses safety checks.' },
  notes: { is: 'Attaches notes to commits without changing them.' },
  bisect: { is: 'Binary-searches your history to find the commit that introduced a bug.', why: 'Far faster than checking commits one at a time.' },

  // ---- gh CLI ----
  'gh-pr-create': {
    is: 'Opens a pull request on GitHub from your pushed branch into a base branch.',
    expand: { PR: 'pull request — a proposal to merge your branch, plus the review conversation around it', '--base': 'the branch you want to merge INTO', '--draft': 'open it, but mark it not ready for review' },
    why: 'The review step. Code gets discussed before it joins the main line.',
    gotcha: 'The branch must be pushed first — GitHub cannot see commits that only exist on your laptop.',
  },
  'gh-pr-merge': {
    is: 'Merges an open pull request on GitHub.',
    expand: { '--squash': 'flatten every commit on the branch into one commit on main', '--merge': 'keep all commits and add a merge commit', '--rebase': 'replay the commits onto main individually', '-d': '--delete-branch, tidy up after merging' },
    why: 'The change is approved and ready to become part of main.',
    gotcha: 'Merging on GitHub does not update your local repo. You still need `git switch main && git pull`.',
  },
  'gh-pr-checkout': { is: 'Fetches someone else\'s pull request branch and switches you onto it locally.', why: 'Running and testing a PR instead of only reading the diff.' },
  'gh-pr-close': { is: 'Closes a pull request without merging it.', gotcha: 'The branch and its commits still exist; only the PR is closed.' },
  'gh-repo-create': { is: 'Creates a new repository on GitHub.', expand: { '--public': 'anyone can see it', '--private': 'only you and collaborators', '--source=.': 'use the current folder as the source', '--push': 'push the current commits immediately' }, why: 'Giving a local-only repo a home on GitHub.' },
  'gh-repo-fork': { is: 'Makes your own copy of someone else\'s repo under your account.', expand: { upstream: 'the conventional remote name for the original repo you forked from' }, why: 'Contributing to a project you cannot push to directly.' },
  'gh-repo-clone': { is: 'Clones a GitHub repo, using your gh authentication.', why: 'Like `git clone` but resolves `owner/repo` shorthand.' },
  'gh-repo-delete': { is: 'Permanently deletes a repository on GitHub.', danger: 'Irreversible. Every issue, PR, star, and the code itself are gone.' },
  'gh-issue-create': { is: 'Opens a new issue on GitHub.', why: 'Tracking a bug or a task.' },
  'gh-release-create': { is: 'Publishes a release on GitHub, usually attached to a tag.', gotcha: 'The tag must exist and be pushed, or gh will offer to create it.' },
  'gh-workflow-run': { is: 'Manually triggers a GitHub Actions workflow.', expand: { CI: 'continuous integration — automated checks that run on your code' } },
  'gh-auth-login': { is: 'Authenticates the gh CLI with your GitHub account.', why: 'Required before gh can do anything on your behalf.' },
  'gh-api': { is: 'Sends a raw request to the GitHub REST API — here, one that CHANGES something.', expand: { '-X POST': 'the HTTP method; POST/PUT/PATCH/DELETE all write', '-f': '--field, a value sent with the request' }, danger: 'Raw API writes bypass every guardrail the normal commands give you.' },
};

// Fallback for a gated verb with no authored lesson.
function lessonFor(key) {
  if (LESSONS[key]) return LESSONS[key];
  if (key.startsWith('gh-')) {
    return { is: `A GitHub CLI command (\`${key.replace(/-/g, ' ')}\`) that changes something on GitHub.` };
  }
  return { is: `A git command (\`git ${key}\`) that changes the repository.` };
}

module.exports = { LESSONS, lessonFor };
