#!/usr/bin/env node
// github-tutor — UserPromptSubmit hook. Handles toggles.
//
// Toggling is done in the hook rather than by the model so it is deterministic
// and instant: `/gh-tutor off` must turn the gate off even if the model is
// mid-thought, confused, or about to ignore the instruction. The prompt is
// blocked and the confirmation shown directly to the user.

const { readState, writeState, DEFAULTS } = require('./tutor-config');

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function passthrough() {
  process.exit(0);
}

function statusCard(s) {
  const onoff = v => (v ? 'on' : 'off');
  return [
    'github-tutor',
    '',
    `  tutor      ${onoff(s.enabled)}${s.enabled ? '' : '   (Claude runs git commands normally)'}`,
    `  verbosity  ${s.verbosity}`,
    `  classroom  ${onoff(s.classroom)}${s.classroom ? '   (quizzes on commands you have seen before)' : ''}`,
    `  learned    ${s.taught.length} command${s.taught.length === 1 ? '' : 's'}${s.taught.length ? ': ' + s.taught.join(', ') : ''}`,
    '',
    '  /gh-tutor on | off            gate git commands, or let Claude run them',
    '  /gh-tutor verbose | brief     how much explanation you get',
    '  /gh-tutor classroom on | off  quiz before revealing a known command',
    '  /gh-tutor reset               forget what you have been taught',
  ].join('\n');
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
      if (a === 'reset') {
        writeState({ ...DEFAULTS });
        block('github-tutor reset to defaults. Learned-command history cleared.');
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
