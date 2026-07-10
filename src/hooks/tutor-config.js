#!/usr/bin/env node
// github-tutor — shared state + safe file IO
//
// State lives at $CLAUDE_CONFIG_DIR/.gh-tutor-state.json and persists across
// sessions, so `/gh-tutor off` before a rushed session stays off tomorrow.
//
// Resolution order for the *initial* state of a fresh install:
//   1. GH_TUTOR env var ("off" / "on")
//   2. Repo-local .gh-tutor.json (lets a teaching repo ship a default)
//   3. Built-in defaults below
//
// Once a state file exists it wins — an explicit toggle beats a config file.

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULTS = {
  enabled: true,
  verbosity: 'verbose', // 'verbose' | 'brief'
  classroom: false,
  taught: [], // verbs the user has already been walked through
};

const VALID_VERBOSITY = ['verbose', 'brief'];

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function statePath() {
  return path.join(claudeDir(), '.gh-tutor-state.json');
}

// Refuse symlinks at the target; a predictable path in ~/.claude is a clobber
// vector if an attacker can point it at something we then overwrite.
function safeWriteJSON(filePath, obj) {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    let realDir = dir;
    const dstat = fs.lstatSync(dir);
    if (dstat.isSymbolicLink()) {
      realDir = fs.realpathSync(dir);
      const rstat = fs.statSync(realDir);
      if (!rstat.isDirectory()) return false;
      if (typeof process.getuid === 'function' && rstat.uid !== process.getuid()) return false;
    }

    const realPath = path.join(realDir, path.basename(filePath));
    try {
      if (fs.lstatSync(realPath).isSymbolicLink()) return false;
    } catch (e) {
      if (e.code !== 'ENOENT') return false;
    }

    const tmp = path.join(realDir, `.gh-tutor.${process.pid}.tmp`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tmp, flags, 0o600);
      fs.writeSync(fd, JSON.stringify(obj, null, 2));
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tmp, realPath);
    return true;
  } catch (e) {
    return false;
  }
}

const MAX_STATE_BYTES = 64 * 1024;

function safeReadJSON(filePath) {
  try {
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_STATE_BYTES) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// Walk up from cwd for a repo-local default. Bounded against symlink cycles.
function findRepoConfig(start) {
  try {
    let dir = path.resolve(start || process.cwd());
    for (let i = 0; i < 64; i++) {
      const p = path.join(dir, '.gh-tutor.json');
      try {
        const st = fs.lstatSync(p);
        if (st.isFile() && !st.isSymbolicLink()) return p;
      } catch (e) { /* keep walking */ }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch (e) { /* fall through */ }
  return null;
}

function normalize(raw) {
  const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  s.enabled = Boolean(s.enabled);
  s.classroom = Boolean(s.classroom);
  if (!VALID_VERBOSITY.includes(s.verbosity)) s.verbosity = 'verbose';
  s.taught = Array.isArray(s.taught)
    ? s.taught.filter(v => typeof v === 'string').slice(0, 200)
    : [];
  return s;
}

function readState() {
  const existing = safeReadJSON(statePath());
  if (existing) return normalize(existing);

  // No state file yet — derive the initial state.
  let seed = { ...DEFAULTS };

  const repoCfg = findRepoConfig(process.cwd());
  if (repoCfg) {
    const cfg = safeReadJSON(repoCfg);
    if (cfg) seed = { ...seed, ...cfg };
  }

  const env = (process.env.GH_TUTOR || '').trim().toLowerCase();
  if (env === 'off' || env === '0' || env === 'false') seed.enabled = false;
  if (env === 'on' || env === '1' || env === 'true') seed.enabled = true;

  return normalize(seed);
}

function writeState(next) {
  return safeWriteJSON(statePath(), normalize(next));
}

function markTaught(verb) {
  const s = readState();
  if (!s.taught.includes(verb)) {
    s.taught.push(verb);
    writeState(s);
  }
}

// Caveman plugin interop: if caveman is running and the user has not explicitly
// chosen a tutor verbosity, inherit its compression preference. Teaching content
// still keeps its structure — only the prose around it tightens.
function cavemanActive() {
  try {
    const p = path.join(claudeDir(), '.caveman-active');
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || !st.isFile() || st.size > 64) return false;
    const mode = fs.readFileSync(p, 'utf8').trim().toLowerCase();
    return mode && mode !== 'off';
  } catch (e) {
    return false;
  }
}

module.exports = {
  DEFAULTS,
  VALID_VERBOSITY,
  claudeDir,
  statePath,
  readState,
  writeState,
  markTaught,
  cavemanActive,
  safeReadJSON,
  safeWriteJSON,
};
