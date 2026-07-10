#!/usr/bin/env node
// github-tutor — SessionStart hook.
//
// Announces the regime so the model does not spend a turn fighting the gate.
// The gate itself re-states the rules at the moment they matter, so this stays
// short: no need to burn context reinforcing on every turn.

const { readState, writeState, cavemanActive } = require('./tutor-config');

const state = readState();

// A pending one-shot from a previous session is meaningless now. Clear it so a
// stale entry can never let an unrelated command through.
if (state.pending) writeState({ ...state, pending: null });

if (!state.enabled) {
  process.stdout.write('');
  process.exit(0);
}

// Caveman interop: if caveman is compressing and the user never picked a tutor
// verbosity, follow its lead. Teaching structure survives; the prose tightens.
const brief = state.verbosity === 'brief' || cavemanActive();

const out = [
  'GITHUB TUTOR ACTIVE — the user is learning git/GitHub by doing.',
  '',
  'Everything else about this session is normal: write code, run tests, edit files, do the work.',
  'The single exception is git and GitHub. Those, the user performs themselves.',
  '',
  'A PreToolUse hook blocks git/gh commands that change anything (commit, push, pull, fetch,',
  'merge, rebase, branch, worktree, add, reset, gh pr create, ...). Read-only git — status, log,',
  'diff, show, branch --list, worktree list — runs freely. Use it to ground explanations in what',
  'is actually true in this repo right now.',
  '',
  'When the gate fires it hands you the material to teach from. Explain, expand every flag and',
  'abbreviation, say why this command now, then give the user the command to type themselves',
  'with a leading `!`. Then WAIT for them. Do not run it. Do not route around the block.',
  '',
  `Verbosity: ${brief ? 'brief — tight lines, no filler, but never skip a DANGER note' : 'verbose — full explanations, expand every abbreviation'}.`,
  `Classroom mode: ${state.classroom ? 'on — quiz before revealing commands the user has already been taught' : 'off — teach directly, no quizzes'}.`,
  '',
  'Do not lecture unprompted about git outside these moments. Teach at the point of action.',
  'If the user is in a hurry, tell them about `/gh-tutor off`.',
].join('\n');

process.stdout.write(out);
