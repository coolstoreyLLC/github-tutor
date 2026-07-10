#!/usr/bin/env node
// github-tutor — PreToolUse(Bash) hook. The enforcer.
//
// This is what makes the tutor real. A skill file alone is advisory: the model
// drifts back to silently running `git push` three turns later. This hook denies
// the tool call outright, so teaching is the only path forward.
//
// IMPORTANT — on allowing:
//   To allow, we exit 0 with NO output. We deliberately do NOT emit
//   permissionDecision:"allow", because that SHORT-CIRCUITS the user's normal
//   permission prompts. Staying silent means "no opinion", and the usual
//   permission flow runs untouched.
//
// The bang-command problem:
//   It is undocumented whether a user's own `! git push` passes through
//   PreToolUse. If it does, a naive gate would block the user's own typed
//   command — the exact thing we are telling them to do. So on deny we record
//   the command plus the prompt_id that triggered it. If that same command
//   returns under a DIFFERENT prompt_id, it is not the model retrying inside one
//   turn; it is the user (or the user's next instruction). We let it through
//   once. This is correct whether or not bang commands hit the hook.

const { classify } = require('./classify');
const { lessonFor } = require('./lessons');
const { readState, writeState } = require('./tutor-config');

// Escape hatch for a single command: `git push  #tutor-ok`
// Anchored to a trailing comment so a commit message that merely *contains* the
// text — `git commit -m "note: #tutor-ok"` — cannot disable the gate.
const BYPASS_SENTINEL = /\s#tutor-ok\s*$/;

function allow() {
  process.exit(0); // silence = no opinion; normal permission flow proceeds
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function bullet(label, text) {
  return text ? `${label} ${text}` : '';
}

function buildReason(command, key, state) {
  const L = lessonFor(key);
  const brief = state.verbosity === 'brief';

  const lines = [];
  lines.push(`GITHUB TUTOR: this command is blocked because the user is learning git, not delegating it.`);
  lines.push('');
  lines.push(`Blocked command:  ${command}`);
  lines.push('');
  lines.push(`--- reference material for your explanation (do not paste verbatim; teach from it) ---`);
  if (L.is) lines.push(bullet('WHAT IT DOES:', L.is));
  if (L.expand && Object.keys(L.expand).length) {
    lines.push('LITERAL MEANINGS:');
    for (const [k, v] of Object.entries(L.expand)) lines.push(`  ${k} = ${v}`);
  }
  if (L.why) lines.push(bullet('WHY REACH FOR IT:', L.why));
  if (L.gotcha) lines.push(bullet('COMMON TRAP:', L.gotcha));
  if (L.danger) lines.push(bullet('DANGER:', L.danger));
  lines.push('--- end reference ---');
  lines.push('');

  lines.push('YOUR RESPONSE MUST:');
  lines.push('1. State plainly what you were about to do and why it is needed RIGHT NOW, in the concrete context of this repo and this task. Reference the actual branch, file, or commit count at play — never a generic example.');
  if (brief) {
    lines.push('2. Show the command. Expand every flag and every piece of jargon in it, one short line each. No filler.');
    lines.push('3. One line on why this command and not an alternative.');
  } else {
    lines.push('2. Show the exact command in a code block. Then expand EVERY flag, abbreviation, and piece of jargon in it — what the letters literally stand for.');
    lines.push('3. Explain why this command rather than the alternatives, and what would go wrong if it were skipped or done differently.');
  }
  if (L.danger) {
    lines.push(`4. State the danger explicitly and in full, even in brief mode. Say what is unrecoverable and name the safer alternative.`);
  }

  if (state.classroom) {
    const seen = state.taught.includes(key);
    if (seen) {
      lines.push('');
      lines.push('CLASSROOM MODE (on) — the user has been taught this command before. Before revealing it, ask ONE question testing recall: either "what command should we run here, and why?" or a 3-4 option multiple choice with plausible wrong answers drawn from real confusions (e.g. merge vs rebase, fetch vs pull). Wait for their answer. Tell them if they are right, and why the wrong options are wrong. Accept "skip" or "tell me" instantly and without any friction. Only then show the command.');
    } else {
      lines.push('');
      lines.push('CLASSROOM MODE (on) — this command is new to the user, so do NOT quiz them on it. Teach it directly. Quizzing on unseen material just frustrates.');
    }
  }

  lines.push('');
  lines.push('THEN STOP. Hand the command to the user to type themselves:');
  lines.push('');
  lines.push(`    ! ${command}`);
  lines.push('');
  lines.push('The leading `!` runs it in their shell and puts the output in this conversation.');
  lines.push('');
  lines.push('HARD RULES:');
  lines.push('- Do NOT run this command yourself. Do NOT retry it. Do NOT route around the block with a script, an alias, `eval`, a different tool, or by asking a subagent.');
  lines.push('- Do NOT continue to the next step of the task until the user reports the command ran. Wait for them.');
  lines.push('- If the user says they are in a hurry, tell them: `/gh-tutor off` disables the tutor and you will run git commands normally again.');
  lines.push('- Read-only git (status, log, diff) is never blocked — use it freely to ground your explanation in what is actually true right now.');

  // Only offer the graduation path once they have actually met this command.
  // Dangling an escape hatch on first exposure teaches them to skip the lesson.
  if (state.taught.includes(key)) {
    lines.push('');
    lines.push(`If the user says they already know this one, or sounds impatient with it specifically, mention: \`/gh-tutor ungate ${key}\` retires the lesson and lets you run \`${key}\` normally from now on. Everything else stays gated. Mention it once, not every time.`);
  }

  return lines.filter(l => l !== undefined).join('\n');
}

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    allow(); // never break the user's session over a parse failure
  }

  try {
    if (data.tool_name !== 'Bash') allow();

    const command = data.tool_input && data.tool_input.command;
    if (typeof command !== 'string' || !command.trim()) allow();

    const envOff = (process.env.GH_TUTOR || '').trim().toLowerCase();
    if (['off', '0', 'false'].includes(envOff)) allow();

    if (BYPASS_SENTINEL.test(command)) allow();

    const state = readState();
    if (!state.enabled) allow();

    const key = classify(command);
    if (!key) allow();

    // Graduated: the user told us they know this one. Run it like any other command.
    if (state.ungated.includes(key)) allow();

    // One-shot pass: same command, different prompt → the user is running it.
    const promptId = data.prompt_id || data.session_id || null;
    const pending = state.pending;
    if (pending && pending.command === command && pending.promptId !== promptId) {
      const next = { ...state, pending: null };
      if (!next.taught.includes(key)) next.taught.push(key);
      writeState(next);
      allow();
    }

    // Deny, and remember what we denied so the user's own run can pass.
    writeState({
      ...state,
      pending: { command, promptId },
      taught: state.taught.includes(key) ? state.taught : [...state.taught, key],
    });

    deny(buildReason(command, key, state));
  } catch (e) {
    allow(); // fail open. A broken tutor must never wedge a real session.
  }
});
