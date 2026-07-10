#!/usr/bin/env node
// github-tutor — command classifier
//
// Decides whether a Bash command contains a git/gh operation worth teaching.
//
// Design bias: FALSE ALLOWS ARE CHEAP, FALSE DENIES ARE EXPENSIVE.
// A missed teaching moment is a shrug. A blocked `git status` mid-task makes
// the whole plugin feel broken and gets it uninstalled. So:
//   - read-only inspection always passes through silently
//   - only an explicit, curated set of verbs is gated
//   - unknown subcommands pass through
//
// The gated set is the set of things the user said they don't understand:
// branches, merging, worktrees, push, pull, fetch, and the staging area.

// ---------------------------------------------------------------------------
// Tokenizing
// ---------------------------------------------------------------------------

// Quote-aware split of a command line into argv-ish tokens.
// Not a POSIX shell parser. Good enough to find a subcommand and its flags.
function tokenize(str) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < str.length) {
        cur += str[++i];
      } else if (c === quote) {
        quote = null;
      } else {
        cur += c;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }
    if (c === '\\' && i + 1 < str.length) {
      cur += str[++i];
      started = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur || started) out.push(cur);
      cur = '';
      started = false;
      continue;
    }
    cur += c;
    started = true;
  }
  if (cur || started) out.push(cur);
  return out;
}

// Split a command line on shell operators that start a new command:
//   && || ; | & and newlines. Respects quotes so `git commit -m "a && b"` is safe.
function splitSegments(str) {
  const segs = [];
  let cur = '';
  let quote = null;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];

    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < str.length) { cur += c + str[++i]; continue; }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '\\' && i + 1 < str.length) { cur += c + str[++i]; continue; }

    const two = str.slice(i, i + 2);
    if (two === '&&' || two === '||') { segs.push(cur); cur = ''; i++; continue; }
    if (c === ';' || c === '|' || c === '&' || c === '\n') { segs.push(cur); cur = ''; continue; }

    cur += c;
  }
  segs.push(cur);

  return segs.map(s => s.trim()).filter(Boolean);
}

// Strip the noise that can precede a real command:
//   env assignments, sudo, command, nice, time, env, and a leading subshell paren.
function stripPrefixes(tokens) {
  const t = tokens.slice();
  while (t.length) {
    const head = t[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(head)) { t.shift(); continue; }
    if (['sudo', 'command', 'nice', 'time', 'env', 'nohup', 'exec'].includes(head)) { t.shift(); continue; }
    if (head === '(' || head === '{') { t.shift(); continue; }
    break;
  }
  return t;
}

const SHELLS = ['sh', 'bash', 'zsh', 'dash', 'ksh'];

// ---------------------------------------------------------------------------
// git classification
// ---------------------------------------------------------------------------

// git's own flags that appear BEFORE the subcommand.
const GIT_GLOBAL_VALUE_FLAGS = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'];
const GIT_GLOBAL_BOOL_FLAGS = ['--no-pager', '-P', '--paginate', '--bare', '--literal-pathspecs', '--no-replace-objects'];

function gitSubcommand(tokens) {
  let i = 1; // skip `git`
  while (i < tokens.length) {
    const t = tokens[i];
    if (GIT_GLOBAL_VALUE_FLAGS.includes(t)) { i += 2; continue; }
    if (GIT_GLOBAL_BOOL_FLAGS.includes(t)) { i += 1; continue; }
    if (t.startsWith('--') && t.includes('=')) { i += 1; continue; }
    if (t.startsWith('-')) { i += 1; continue; }
    return { sub: t, rest: tokens.slice(i + 1) };
  }
  return { sub: null, rest: [] };
}

// Always safe: pure inspection. Claude needs these to do its job.
const GIT_READONLY = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'describe', 'shortlog', 'whatchanged',
  'rev-parse', 'rev-list', 'ls-files', 'ls-remote', 'ls-tree', 'cat-file',
  'symbolic-ref', 'name-rev', 'merge-base', 'check-ignore', 'count-objects',
  'verify-commit', 'grep', 'help', 'version', 'cherry', 'reflog', 'range-diff',
  'show-ref', 'for-each-ref', 'var', 'diff-tree', 'diff-index',
]);

// Always taught: mutate history, the index, or the remote.
const GIT_GATED = new Set([
  'commit', 'push', 'pull', 'fetch', 'merge', 'rebase', 'checkout', 'switch',
  'restore', 'reset', 'revert', 'cherry-pick', 'clone', 'init', 'add', 'rm',
  'mv', 'clean', 'apply', 'am', 'gc', 'prune', 'filter-branch', 'update-ref',
  'sparse-checkout',
]);

// Subcommands whose safety depends on their arguments.
// Returns true when the invocation is read-only.
const GIT_CONDITIONAL = {
  // `git branch` lists. `git branch foo` creates. `git branch -d foo` deletes.
  branch(rest) {
    const mutators = ['-d', '-D', '--delete', '-m', '-M', '--move', '-c', '-C',
      '--copy', '-u', '--set-upstream-to', '--unset-upstream', '--edit-description'];
    if (rest.some(a => mutators.includes(a) || a.startsWith('--set-upstream-to='))) return false;
    // An explicit list flag takes an optional glob — the glob is not a new branch.
    if (rest.some(a => a === '-l' || a === '--list')) return true;
    // A bare positional (not a flag, not a flag's value) means "create".
    return !hasPositional(rest, ['--contains', '--no-contains', '--merged', '--no-merged',
      '--sort', '--format', '--color', '--column', '--points-at']);
  },

  // `git tag` / `git tag -l` list. `git tag v1` creates.
  tag(rest) {
    const mutators = ['-a', '-d', '--delete', '-s', '-f', '--force', '-m', '-F', '-u'];
    if (rest.some(a => mutators.includes(a))) return false;
    if (rest.some(a => a === '-l' || a === '--list')) return true;
    return !hasPositional(rest, ['--sort', '--format', '--contains', '--points-at', '--merged']);
  },

  stash(rest) {
    const sub = firstPositional(rest);
    return sub === 'list' || sub === 'show';
  },

  worktree(rest) {
    return firstPositional(rest) === 'list';
  },

  remote(rest) {
    const sub = firstPositional(rest);
    return sub === null || sub === 'show' || sub === 'get-url';
  },

  config(rest) {
    const readers = ['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'];
    return rest.some(a => readers.includes(a));
  },

  submodule(rest) {
    const sub = firstPositional(rest);
    return sub === 'status' || sub === 'summary' || sub === null;
  },

  notes(rest) {
    const sub = firstPositional(rest);
    return sub === 'list' || sub === 'show' || sub === null;
  },

  bisect(rest) {
    const sub = firstPositional(rest);
    return sub === 'log' || sub === 'visualize' || sub === 'view';
  },
};

// First token that isn't a flag and isn't consumed as a flag's value.
function firstPositional(rest, valueFlags = []) {
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i];
    if (valueFlags.includes(t)) { i++; continue; }
    if (t === '--') continue;
    if (t.startsWith('-')) continue;
    return t;
  }
  return null;
}

function hasPositional(rest, valueFlags = []) {
  return firstPositional(rest, valueFlags) !== null;
}

// ---------------------------------------------------------------------------
// gh classification
// ---------------------------------------------------------------------------

// For gh, an unknown noun passes through. We only gate the nouns whose verbs
// change something on GitHub — those are the ones with real consequences.
const GH_READONLY_VERBS = {
  pr: ['list', 'view', 'status', 'checks', 'diff'],
  issue: ['list', 'view', 'status'],
  repo: ['list', 'view'],
  run: ['list', 'view', 'watch'],
  release: ['list', 'view', 'download'],
  workflow: ['list', 'view'],
  label: ['list'],
  gist: ['list', 'view'],
  cache: ['list'],
  auth: ['status', 'token'],
  config: ['get', 'list'],
  extension: ['list'],
  secret: ['list'],
  variable: ['list'],
  ruleset: ['list', 'view'],
};

// Nouns with no mutating verbs at all.
const GH_SAFE_NOUNS = new Set(['search', 'status', 'browse', 'help', 'version', 'alias']);

function ghClassify(tokens) {
  const rest = tokens.slice(1).filter(t => t !== '--');
  const noun = firstPositional(rest);
  if (!noun) return 'allow';

  if (GH_SAFE_NOUNS.has(noun) || noun.startsWith('-')) return 'allow';

  // `gh api` is a read unless an explicit write method or field is present.
  if (noun === 'api') {
    const writes = rest.some((a, i) =>
      (a === '-X' || a === '--method') && /^(post|put|patch|delete)$/i.test(rest[i + 1] || '')
    ) || rest.some(a => a === '-f' || a === '--field' || a === '--input');
    return writes ? 'gate:gh-api' : 'allow';
  }

  const readVerbs = GH_READONLY_VERBS[noun];
  if (!readVerbs) return 'allow'; // unknown noun — don't be a nuisance

  const idx = rest.indexOf(noun);
  const verb = firstPositional(rest.slice(idx + 1));
  if (!verb) return 'allow'; // `gh pr` with no verb prints help
  if (readVerbs.includes(verb)) return 'allow';

  return `gate:gh-${noun}-${verb}`;
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

// Returns null when nothing should be gated, else a gate key like 'push'
// or 'gh-pr-create' identifying what the user is about to learn.
function classifySegment(segment, depth = 0) {
  if (depth > 3) return null;

  let tokens = stripPrefixes(tokenize(segment));
  if (!tokens.length) return null;

  const cmd = tokens[0].split('/').pop(); // handle /usr/bin/git

  // Recurse into `sh -c "git push"` and friends.
  if (SHELLS.includes(cmd)) {
    const ci = tokens.indexOf('-c');
    if (ci !== -1 && tokens[ci + 1]) {
      for (const seg of splitSegments(tokens[ci + 1])) {
        const hit = classifySegment(seg, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  }

  // `eval "git push"` — tokenize already stripped the quotes, so the payload is
  // a plain argument. Recurse into it rather than relying on the raw-regex net,
  // which cannot see inside quoted spans.
  if (cmd === 'eval') {
    for (const seg of splitSegments(tokens.slice(1).join(' '))) {
      const hit = classifySegment(seg, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  // `xargs -n1 git push` — skip xargs' own flags, then treat the rest as a command.
  if (cmd === 'xargs') {
    let i = 1;
    while (i < tokens.length && tokens[i].startsWith('-')) {
      if (['-n', '-P', '-I', '-d', '-L', '-s', '-a', '-E'].includes(tokens[i])) i++;
      i++;
    }
    if (i < tokens.length) return classifySegment(tokens.slice(i).join(' '), depth + 1);
    return null;
  }

  if (cmd === 'git') {
    const { sub, rest } = gitSubcommand(tokens);
    if (!sub) return null;
    if (GIT_READONLY.has(sub)) return null;
    if (GIT_CONDITIONAL[sub]) return GIT_CONDITIONAL[sub](rest) ? null : sub;
    if (GIT_GATED.has(sub)) return sub;
    return null; // unknown subcommand — allow
  }

  if (cmd === 'gh') {
    const res = ghClassify(tokens);
    return res.startsWith('gate:') ? res.slice(5) : null;
  }

  return null;
}

// Secondary net: catches gated verbs hidden in constructs the tokenizer does not
// model — command substitution, eval, xargs. It is NOT a general fallback.
//
// Two rules keep it from causing surprise denies:
//   1. It only runs when an escape construct is actually present. Otherwise the
//      structured pass above is authoritative and its "allow" is final.
//   2. Quoted spans are blanked first, so `git log --grep="git commit"` and
//      `git commit -m "revert the push"` never trip it.
//
// Note `worktree` is matched only with a mutating verb — `git worktree list` is
// read-only and must stay silent.
const ESCAPE_CONSTRUCT = /(`|\$\(|\beval\b|\bxargs\b)/;

const RAW_NET = new RegExp(
  String.raw`\bgit\s+(?:-[^\s]+\s+)*(` +
  ['commit', 'push', 'pull', 'fetch', 'merge', 'rebase', 'checkout', 'switch',
    'reset', 'revert', 'cherry-pick', 'clone'].join('|') +
  String.raw`)\b|\bgit\s+worktree\s+(add|remove|prune|move)\b`,
  'i'
);

// Replace the *contents* of quoted spans with spaces, preserving length.
// `$(...)` inside double quotes still expands, so its content is kept.
function blankQuoted(str) {
  let out = '';
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      if (c === '\\' && quote === '"' && i + 1 < str.length) { out += '  '; i++; continue; }
      if (c === quote) { quote = null; out += c; continue; }
      // Preserve command substitution inside double quotes — it still runs.
      if (quote === '"' && c === '$' && str[i + 1] === '(') {
        const close = str.indexOf(')', i);
        const end = close === -1 ? str.length : close + 1;
        out += str.slice(i, end);
        i = end - 1;
        continue;
      }
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    out += c;
  }
  return out;
}

function classify(command) {
  if (typeof command !== 'string' || !command.trim()) return null;

  for (const seg of splitSegments(command)) {
    const hit = classifySegment(seg);
    if (hit) return hit;
  }

  const scrubbed = blankQuoted(command);
  if (ESCAPE_CONSTRUCT.test(scrubbed)) {
    const m = RAW_NET.exec(scrubbed);
    if (m) return (m[1] || `worktree`).toLowerCase();
  }

  return null;
}

module.exports = { classify, classifySegment, tokenize, splitSegments };
