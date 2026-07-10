#!/usr/bin/env node
// End-to-end hook tests. Runs the real hook scripts as subprocesses, feeding
// them the JSON Claude Code actually sends on stdin.
//
// Uses a throwaway CLAUDE_CONFIG_DIR so the developer's real tutor state is
// never touched.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'src/hooks/tutor-gate.js');
const TRACKER = path.join(ROOT, 'src/hooks/tutor-tracker.js');
const ACTIVATE = path.join(ROOT, 'src/hooks/tutor-activate.js');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-tutor-test-'));

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.error(`  FAIL: ${name}${detail ? '\n    ' + detail : ''}`);
}

function run(script, payload, env = {}) {
  const out = execFileSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: TMP, GH_TUTOR: '', ...env },
  });
  return out.trim();
}

function gate(command, extra = {}, env = {}) {
  return run(GATE, {
    tool_name: 'Bash',
    tool_input: { command },
    prompt_id: 'p1',
    session_id: 's1',
    ...extra,
  }, env);
}

function isDeny(out) {
  if (!out) return false;
  try {
    const j = JSON.parse(out);
    return j.hookSpecificOutput
      && j.hookSpecificOutput.permissionDecision === 'deny'
      && typeof j.hookSpecificOutput.permissionDecisionReason === 'string';
  } catch (e) { return false; }
}

function denyReason(out) {
  return JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
}

function resetState(obj) {
  fs.writeFileSync(path.join(TMP, '.gh-tutor-state.json'), JSON.stringify({
    enabled: true, verbosity: 'verbose', classroom: false, taught: [], ungated: [], pending: null, ...obj,
  }));
}

function stateNow() {
  return JSON.parse(fs.readFileSync(path.join(TMP, '.gh-tutor-state.json'), 'utf8'));
}

console.log('\n-- gate: allow paths produce NO output (never an explicit allow) --');
resetState();
check('git status is silent', gate('git status') === '', `got: ${gate('git status')}`);
check('git log is silent', gate('git log --oneline') === '');
check('npm test is silent', gate('npm test') === '');

resetState();
const nonBash = run(GATE, { tool_name: 'Edit', tool_input: { file_path: '/x' }, prompt_id: 'p1' });
check('non-Bash tool is silent', nonBash === '');

console.log('-- gate: mutating git is denied with a teaching reason --');
resetState();
const pushOut = gate('git push -u origin feature/login');
check('git push denied', isDeny(pushOut), `got: ${pushOut.slice(0, 120)}`);

const reason = denyReason(pushOut);
check('reason contains the command', reason.includes('git push -u origin feature/login'));
check('reason expands -u', reason.includes('--set-upstream'));
check('reason explains origin', /origin/.test(reason));
check('reason tells user to type it with bang', reason.includes('! git push -u origin feature/login'));
check('reason forbids routing around', /Do NOT (run|retry)/.test(reason));
check('reason mentions the off switch', reason.includes('/gh-tutor off'));

resetState();
const resetOut = gate('git reset --hard HEAD~1');
check('reset --hard denied', isDeny(resetOut));
check('reset --hard reason carries DANGER', denyReason(resetOut).includes('DANGER'));

console.log('-- gate: disabled tutor allows everything --');
resetState({ enabled: false });
check('disabled => push allowed', gate('git push') === '');

resetState();
check('GH_TUTOR=off => push allowed', gate('git push', {}, { GH_TUTOR: 'off' }) === '');

resetState();
check('#tutor-ok sentinel allowed', gate('git push  #tutor-ok') === '');

resetState();
check('sentinel inside a commit message does NOT bypass',
  isDeny(gate('git commit -m "note: #tutor-ok is a thing"')));

console.log('-- gate: one-shot pass so the user can type the command themselves --');
resetState();
const first = gate('git push', { prompt_id: 'turn-1' });
check('first attempt denied', isDeny(first));

// Model retries inside the SAME turn: still denied.
const retrySameTurn = gate('git push', { prompt_id: 'turn-1' });
check('same-prompt retry still denied', isDeny(retrySameTurn));

// Same command arrives under a new prompt id -> that's the user running it.
const userRun = gate('git push', { prompt_id: 'turn-2' });
check('different-prompt run allowed once', userRun === '', `got: ${userRun.slice(0, 80)}`);

// And the one-shot is consumed, not permanent.
const afterConsumed = gate('git push', { prompt_id: 'turn-3' });
check('one-shot is consumed after use', isDeny(afterConsumed));

console.log('-- gate: a DIFFERENT command does not ride the pending pass --');
resetState();
gate('git push', { prompt_id: 't1' });
check('other command still denied', isDeny(gate('git commit -m x', { prompt_id: 't2' })));

console.log('-- gate: taught history accumulates --');
resetState();
gate('git push', { prompt_id: 'a' });
gate('git commit -m x', { prompt_id: 'b' });
const st = JSON.parse(fs.readFileSync(path.join(TMP, '.gh-tutor-state.json'), 'utf8'));
check('taught records push and commit', st.taught.includes('push') && st.taught.includes('commit'), JSON.stringify(st.taught));

console.log('-- gate: classroom mode changes the instructions --');
resetState({ classroom: true, taught: ['push'] });
const quiz = denyReason(gate('git push', { prompt_id: 'q1' }));
check('quizzes on a previously taught command', /ask ONE question|multiple choice/i.test(quiz));

resetState({ classroom: true, taught: [] });
const noQuiz = denyReason(gate('git merge main', { prompt_id: 'q2' }));
check('does NOT quiz on unseen command', /do NOT quiz/i.test(noQuiz));

console.log('-- gate: brief vs verbose shape the instructions --');
resetState({ verbosity: 'brief' });
const briefReason = denyReason(gate('git push', { prompt_id: 'b1' }));
check('brief mode asks for no filler', /No filler/i.test(briefReason));

resetState({ verbosity: 'brief' });
const briefDanger = denyReason(gate('git reset --hard', { prompt_id: 'b2' }));
check('brief still forces full danger note', /even in brief mode/i.test(briefDanger));

console.log('-- gate: fails open on malformed input --');
const bad = execFileSync(process.execPath, [GATE], {
  input: 'not json at all', encoding: 'utf8',
  env: { ...process.env, CLAUDE_CONFIG_DIR: TMP },
});
check('malformed stdin => silent allow', bad.trim() === '');

console.log('-- tracker: toggles are handled in the hook, not the model --');
resetState();
const off = JSON.parse(run(TRACKER, { prompt: '/gh-tutor off' }));
check('off blocks the prompt', off.decision === 'block');
check('off confirms', /OFF/.test(off.reason));
check('off actually disables gate', gate('git push') === '');

const on = JSON.parse(run(TRACKER, { prompt: '/gh-tutor on' }));
check('on re-enables', on.decision === 'block' && /ON/.test(on.reason));
check('on actually re-enables gate', isDeny(gate('git push', { prompt_id: 'z' })));

resetState();
const brief = JSON.parse(run(TRACKER, { prompt: '/gh-tutor brief' }));
check('brief toggles verbosity', /brief/.test(brief.reason));

resetState();
const classroom = JSON.parse(run(TRACKER, { prompt: '/gh-tutor classroom on' }));
check('classroom on', /Classroom mode ON/.test(classroom.reason));

resetState({ taught: ['push'] });
const status = JSON.parse(run(TRACKER, { prompt: '/gh-tutor' }));
check('bare command shows status card', /tutor\s+on/.test(status.reason) && /push/.test(status.reason));

resetState();
const nsOff = JSON.parse(run(TRACKER, { prompt: '/github-tutor:gh-tutor off' }));
check('namespaced slash command works', nsOff.decision === 'block');

resetState();
const nl = JSON.parse(run(TRACKER, { prompt: 'please turn off the github tutor, I am in a rush' }));
check('natural language off works', nl.decision === 'block' && /OFF/.test(nl.reason));

resetState();
const unrelated = run(TRACKER, { prompt: 'fix the login bug' });
check('unrelated prompt passes through', unrelated === '');

resetState();
const ambiguous = run(TRACKER, { prompt: 'just do it' });
check('ambiguous phrase does NOT disable the tutor', ambiguous === '');

console.log('-- per-command gating: the graduation path --');
resetState({ ungated: ['push'] });
check('ungated command runs silently', gate('git push -u origin main') === '');
check('but other commands stay gated', isDeny(gate('git commit -m x')));
check('ungated does not leak to gh', isDeny(gate('gh pr create --title x')));

resetState();
const ung = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate push' }));
check('ungate confirms', /Ungated `push`/.test(ung.reason));
check('ungate persists to state', stateNow().ungated.includes('push'));
check('ungate takes effect immediately', gate('git push') === '');

const already = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate push' }));
check('re-ungating is a no-op with a clear message', /already ungated/.test(already.reason));

const reg = JSON.parse(run(TRACKER, { prompt: '/gh-tutor gate push' }));
check('gate confirms', /Gated `push` again/.test(reg.reason));
check('gate removes from state', !stateNow().ungated.includes('push'));
check('gate takes effect immediately', isDeny(gate('git push', { prompt_id: 'rg' })));

const alreadyGated = JSON.parse(run(TRACKER, { prompt: '/gh-tutor gate push' }));
check('re-gating is a no-op with a clear message', /already gated/.test(alreadyGated.reason));

console.log('-- ungate: input forms a human would actually type --');
resetState();
run(TRACKER, { prompt: '/gh-tutor ungate git push' });
check('accepts "git push"', stateNow().ungated.includes('push'));

resetState();
run(TRACKER, { prompt: '/gh-tutor ungate gh pr create' });
check('accepts "gh pr create"', stateNow().ungated.includes('gh-pr-create'), JSON.stringify(stateNow().ungated));
check('ungated gh pr create runs', gate('gh pr create --title x') === '');

resetState();
run(TRACKER, { prompt: '/gh-tutor ungate CHERRY-PICK' });
check('case insensitive', stateNow().ungated.includes('cherry-pick'));

console.log('-- ungate: bad input is rejected loudly, not silently ignored --');
resetState();
const typo = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate psuh' }));
check('typo is rejected', /is not a command the tutor gates/.test(typo.reason));
check('typo lists valid keys', /commit/.test(typo.reason) && /rebase/.test(typo.reason));
check('typo changed nothing', stateNow().ungated.length === 0);

resetState();
const ro = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate status' }));
check('read-only command rejected with reason', /never gated/.test(ro.reason));

resetState();
const noArg = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate' }));
check('missing argument asks which command', /Which command/.test(noArg.reason));

console.log('-- ungate: danger commands warn about what was handed over --');
resetState();
const dangerous = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate reset' }));
check('ungating reset surfaces its danger', /uncommitted changes permanently/.test(dangerous.reason));

resetState();
const safe = JSON.parse(run(TRACKER, { prompt: '/gh-tutor ungate fetch' }));
check('ungating a safe command has no danger note', !/Worth knowing/.test(safe.reason));

console.log('-- reset re-gates everything --');
resetState({ ungated: ['push', 'commit'] });
run(TRACKER, { prompt: '/gh-tutor reset' });
check('reset clears ungated', stateNow().ungated.length === 0);
check('reset re-gates push', isDeny(gate('git push', { prompt_id: 'rr' })));

console.log('-- graduation hint only appears for already-taught commands --');
resetState({ taught: ['push'] });
check('hint shown once taught', /gh-tutor ungate push/.test(denyReason(gate('git push', { prompt_id: 'h1' }))));

resetState({ taught: [] });
check('no hint on first exposure', !/ungate/.test(denyReason(gate('git merge main', { prompt_id: 'h2' }))));

console.log('-- activate: announces only when enabled --');
resetState();
const act = run(ACTIVATE, {});
check('activate emits context when on', /GITHUB TUTOR ACTIVE/.test(act));
check('activate mentions read-only passthrough', /Read-only git/.test(act));

resetState({ enabled: false });
check('activate silent when off', run(ACTIVATE, {}) === '');

resetState({ pending: { command: 'git push', promptId: 'old' } });
run(ACTIVATE, {});
const cleared = JSON.parse(fs.readFileSync(path.join(TMP, '.gh-tutor-state.json'), 'utf8'));
check('stale pending cleared at session start', !cleared.pending);

fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
