#!/usr/bin/env node
// Plain-node test suite. No dependencies. Run: node tests/classify.test.js
//
// The bar: a false deny is a bug that makes the plugin feel broken.
// Read-only git is used constantly by Claude and MUST pass through.

const { classify } = require('../src/hooks/classify');

let pass = 0;
let fail = 0;

function allow(cmd) {
  const got = classify(cmd);
  if (got === null) { pass++; return; }
  fail++;
  console.error(`  FAIL (expected allow, got gate:${got})\n    ${cmd}`);
}

function gate(cmd, expected) {
  const got = classify(cmd);
  if (got === expected) { pass++; return; }
  fail++;
  console.error(`  FAIL (expected gate:${expected}, got ${got === null ? 'allow' : 'gate:' + got})\n    ${cmd}`);
}

console.log('\n-- read-only git must always pass --');
allow('git status');
allow('git status --short');
allow('git log --oneline -10');
allow('git log --grep="git commit"');            // gated verb inside a quoted string
allow('git log --grep="push to origin"');
allow('git diff HEAD~1');
allow('git diff --staged');
allow('git show abc123');
allow('git blame src/main.js');
allow('git rev-parse --abbrev-ref HEAD');
allow('git ls-files');
allow('git reflog');
allow('git --no-pager log --oneline');
allow('git -C /some/path status');
allow('/usr/bin/git status');
allow('git branch');                              // bare = list
allow('git branch -a');
allow('git branch --show-current');
allow('git branch -v');
allow('git branch --merged main');                // --merged takes a value
allow('git tag');
allow('git tag -l');
allow('git tag --list "v1.*"');
allow('git stash list');
allow('git stash show');
allow('git worktree list');                       // read-only, must not trip raw net
allow('git remote');
allow('git remote -v');
allow('git remote show origin');
allow('git config --get user.email');
allow('git config --list');
allow('git submodule status');
allow('git merge-base main HEAD');                // 'merge-base' != 'merge'
allow('git show-ref');
allow('git for-each-ref');

console.log('-- non-git commands pass --');
allow('ls -la');
allow('npm test');
allow('echo "git push"');                         // quoted, no escape construct
allow('cat README.md | grep git');
allow('rg "git commit" src/');

console.log('-- core gated verbs --');
gate('git commit -m "feat: add login"', 'commit');
gate('git push', 'push');
gate('git push -u origin feature/login', 'push');
gate('git pull', 'pull');
gate('git pull --rebase', 'pull');
gate('git fetch origin', 'fetch');
gate('git merge main', 'merge');
gate('git rebase -i HEAD~3', 'rebase');
gate('git checkout -b feature/x', 'checkout');
gate('git switch main', 'switch');
gate('git reset --hard HEAD~1', 'reset');
gate('git revert abc123', 'revert');
gate('git cherry-pick abc123', 'cherry-pick');
gate('git add .', 'add');
gate('git add -A', 'add');
gate('git clone https://github.com/x/y', 'clone');
gate('git restore src/a.js', 'restore');
gate('git clean -fd', 'clean');

console.log('-- conditional: mutation vs listing --');
gate('git branch feature/new', 'branch');          // bare positional = create
gate('git branch -d old-branch', 'branch');
gate('git branch -D old-branch', 'branch');
gate('git branch -m new-name', 'branch');
gate('git branch -u origin/main', 'branch');
gate('git tag v1.0.0', 'tag');
gate('git tag -a v1.0.0 -m "release"', 'tag');
gate('git tag -d v1.0.0', 'tag');
gate('git stash', 'stash');
gate('git stash pop', 'stash');
gate('git stash push -m wip', 'stash');
gate('git worktree add ../feat feature/x', 'worktree');
gate('git worktree remove ../feat', 'worktree');
gate('git remote add origin git@github.com:x/y.git', 'remote');
gate('git remote set-url origin git@github.com:x/z.git', 'remote');
gate('git config user.email a@b.com', 'config');
gate('git submodule update --init', 'submodule');

console.log('-- compound commands: any gated segment denies --');
gate('git add . && git commit -m "x"', 'add');
gate('git status && git push', 'push');            // first segment allows, second gates
gate('npm test && git push origin main', 'push');
gate('git fetch; git merge origin/main', 'fetch');
gate('git add -A\ngit commit -m "y"', 'add');
gate('cd /repo && git push', 'push');
gate('git status || git init', 'init');

console.log('-- wrapped / escaped invocations --');
gate('sh -c "git push"', 'push');
gate('bash -c \'git commit -m "x"\'', 'commit');
gate('sudo git push', 'push');
gate('GIT_TRACE=1 git push', 'push');
gate('eval "git push origin main"', 'push');       // escape construct + raw net
gate('echo `git push`', 'push');
gate('foo $(git reset --hard)', 'reset');

console.log('-- gh: reads pass, writes gate --');
allow('gh pr list');
allow('gh pr view 42');
allow('gh pr status');
allow('gh pr checks');
allow('gh pr diff 42');
allow('gh issue list');
allow('gh repo view');
allow('gh run list');
allow('gh run watch');
allow('gh auth status');
allow('gh search repos cli');
allow('gh api /repos/x/y');
allow('gh api repos/x/y/pulls');
allow('gh browse');
allow('gh pr');                                    // no verb = help

gate('gh pr create --title x --body y', 'gh-pr-create');
gate('gh pr merge 42 --squash', 'gh-pr-merge');
gate('gh pr close 42', 'gh-pr-close');
gate('gh pr checkout 42', 'gh-pr-checkout');
gate('gh repo create my-repo --public', 'gh-repo-create');
gate('gh repo fork', 'gh-repo-fork');
gate('gh repo delete x/y', 'gh-repo-delete');
gate('gh issue create --title bug', 'gh-issue-create');
gate('gh release create v1.0.0', 'gh-release-create');
gate('gh workflow run deploy.yml', 'gh-workflow-run');
gate('gh api -X POST /repos/x/y/issues', 'gh-api');
gate('gh api /repos/x/y -f name=z', 'gh-api');
gate('gh auth login', 'gh-auth-login');

console.log('-- edge cases --');
allow('');
allow('   ');
gate('git   push   ', 'push');                     // extra whitespace
gate('git push # deploy now', 'push');
allow('# git push');                               // whole line is a comment...

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
