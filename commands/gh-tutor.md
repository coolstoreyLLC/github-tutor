---
description: Toggle the git/GitHub tutor, its verbosity, classroom quiz mode, and per-command gating
argument-hint: "[on|off|verbose|brief|classroom on|classroom off|ungate <cmd>|gate <cmd>|reset]"
---

Show the user the current github-tutor state and the available toggles.

Note: `/gh-tutor` and its arguments are normally intercepted and handled directly
by the plugin's `UserPromptSubmit` hook, which writes the state file and prints a
confirmation without involving you. If you are reading this, the hook did not fire
— tell the user the hook may not be installed, and point them at the plugin's
README for installation steps.
