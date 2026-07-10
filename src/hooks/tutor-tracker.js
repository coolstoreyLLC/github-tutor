#!/usr/bin/env node
// github-tutor — UserPromptSubmit hook. Handles toggles.
//
// Toggling is done in the hook rather than by the model so it is deterministic
// and instant: `/gh-tutor off` must turn the gate off even if the model is
// mid-thought, confused, or about to ignore the instruction. The prompt is
// blocked and the confirmation shown directly to the user.

const { readState, writeState, DEFAULTS } = require('./tutor-config');
const { canonicalKey, gateableKeys } = require('./classify');
const { LESSONS } = require('./lessons');

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function passthrough() {
  process.exit(0);
}

function statusCard(s) {
  const onoff = v => (v ? 'on' : 'off');
  const list = a => (a.length ? a.join(', ') : '—');
  return [
    'github-tutor',
    '',
    `  tutor      ${onoff(s.enabled)}${s.enabled ? '' : '   (Claude runs git commands normally)'}`,
    `  verbosity  ${s.verbosity}`,
    `  classroom  ${onoff(s.classroom)}${s.classroom ? '   (quizzes on commands you have seen before)' : ''}`,
    `  taught     ${list(s.taught)}`,
    `  ungated    ${list(s.ungated)}${s.ungated.length ? '   (Claude runs these for you)' : ''}`,
    '',
    '  /gh-tutor on | off              gate git commands, or let Claude run them',
    '  /gh-tutor verbose | brief       how much explanation you get',
    '  /gh-tutor classroom on | off    quiz before revealing a known command',
    '  /gh-tutor ungate <command>      you know this one — let Claude run it',
    '  /gh-tutor gate <command>        teach me this one again',
    '  /gh-tutor reset                 back to defaults, re-gate everything',
  ].join('\n');
}

// Ungating is the graduation path: the tutor should shrink as the user learns.
function ungate(s, raw) {
  const key = canonicalKey(raw);
  if (!key) {
    block(`"${raw}" is not a command the tutor gates.\n\nGateable git commands:\n  ${gateableKeys().join(' ')}\n\ngh commands look like: gh-pr-create, gh-repo-fork\n\nRead-only commands (status, log, diff) are never gated, so there is nothing to ungate.`);
  }
  if (s.ungated.includes(key)) block(`\`${key}\` is already ungated. Claude runs it for you.`);

  writeState({ ...s, ungated: [...s.ungated, key] });

  const L = LESSONS[key];
  const lines = [`Ungated \`${key}\`. Claude will now run it for you without explaining. Everything else stays gated.`];
  if (L && L.danger) {
    lines.push('');
    lines.push(`Worth knowing what you just handed over: ${L.danger}`);
  }
  lines.push('');
  lines.push(`Changed your mind? \`/gh-tutor gate ${key}\``);
  block(lines.join('\n'));
}

function regate(s, raw) {
  const key = canonicalKey(raw);
  if (!key) block(`"${raw}" is not a command the tutor gates.\n\nGateable git commands:\n  ${gateableKeys().join(' ')}`);
  if (!s.ungated.includes(key)) block(`\`${key}\` is already gated — Claude explains it and hands it to you.`);

  writeState({ ...s, ungated: s.ungated.filter(k => k !== key) });
  block(`Gated \`${key}\` again. Claude will explain it and hand it to you to type.`);
}

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let prompt;
  try {
    prompt = String(JSON.parse(input).prompt || '').trim();
  } catch (e) {
    passthrough();
  }

  try {
    const lower = prompt.toLowerCase();

    // Slash command, with or without the plugin namespace prefix.
    const m = /^\/(?:github-tutor:)?gh-tutor\b\s*(.*)$/.exec(lower);

    if (m) {
      const args = m[1].trim().split(/\s+/).filter(Boolean);
      const s = readState();

      if (!args.length) block(statusCard(s));

      const [a, b] = args;

      if (a === 'on' || a === 'enable') {
        writeState({ ...s, enabled: true });
        block('github-tutor ON. Git commands will now be explained and handed to you to type.');
      }
      if (a === 'off' || a === 'disable') {
        writeState({ ...s, enabled: false, pending: null });
        block('github-tutor OFF. Claude will run git commands directly again. Re-enable with /gh-tutor on');
      }
      if (a === 'verbose' || a === 'brief') {
        writeState({ ...s, verbosity: a });
        block(`github-tutor verbosity: ${a}.`);
      }
      if (a === 'classroom') {
        const next = b === 'off' ? false : b === 'on' ? true : !s.classroom;
        writeState({ ...s, classroom: next });
        block(next
          ? 'Classroom mode ON. You will be quizzed before commands you have already been taught. Answer, or say "skip" / "tell me".'
          : 'Classroom mode OFF. No quizzes.');
      }
      // `/gh-tutor ungate git push` — everything after the verb is the command,
      // so both "push" and "git push" work.
      if (a === 'ungate' || a === 'learned' || a === 'skip') {
        const rest = args.slice(1).join(' ');
        if (!rest) block(`Which command? e.g. \`/gh-tutor ungate push\`\n\n${statusCard(s)}`);
        ungate(s, rest);
      }
      if (a === 'gate' || a === 'relearn' || a === 'teach') {
        const rest = args.slice(1).join(' ');
        if (!rest) block(`Which command? e.g. \`/gh-tutor gate push\`\n\n${statusCard(s)}`);
        regate(s, rest);
      }
      if (a === 'reset') {
        writeState({ ...DEFAULTS });
        block('github-tutor reset to defaults. Learned-command history cleared, everything re-gated.');
      }
      if (a === 'status') block(statusCard(s));

      block(`Unknown option "${a}".\n\n${statusCard(s)}`);
    }

    // Natural language toggles. Deliberately narrow — an ambiguous phrase like
    // "just do it" must never silently disable a safety-relevant teaching gate.
    const mentionsTutor = /\b(gh[- ]?tutor|github tutor|git tutor|the tutor|tutor mode)\b/.test(lower);
    if (mentionsTutor) {
      const s = readState();
      if (/\b(turn off|switch off|disable|stop|deactivate|kill|pause)\b/.test(lower)) {
        writeState({ ...s, enabled: false, pending: null });
        block('github-tutor OFF. Claude will run git commands directly again. Re-enable with /gh-tutor on');
      }
      if (/\b(turn on|switch on|enable|start|activate|resume)\b/.test(lower)) {
        writeState({ ...s, enabled: true });
        block('github-tutor ON. Git commands will be explained and handed to you to type.');
      }
    }

    passthrough();
  } catch (e) {
    passthrough(); // never wedge a prompt
  }
});
