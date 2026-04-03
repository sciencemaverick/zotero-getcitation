#!/bin/sh
set -eu

EXPORT_MODE="${1:-}"
export EXPORT_MODE

node <<'NODE'
const fs = require('fs');
const path = require('path');
const os = require('os');

const profileRoot = process.env.ZOTERO_PROFILE_ROOT || path.join(os.homedir(), 'Library', 'Application Support', 'Zotero');
const profilesIni = path.join(profileRoot, 'profiles.ini');

if (!fs.existsSync(profilesIni)) {
  console.error(`profiles.ini not found: ${profilesIni}`);
  process.exit(1);
}

const ini = fs.readFileSync(profilesIni, 'utf8');
const lines = ini.split(/\r?\n/);

let current = null;
const profiles = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed) continue;

  const section = trimmed.match(/^\[(.+)\]$/);
  if (section) {
    current = { section: section[1] };
    profiles.push(current);
    continue;
  }

  if (!current) continue;

  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx);
  const value = trimmed.slice(idx + 1);
  current[key] = value;
}

const profile = profiles.find((entry) => /^Profile\d+$/.test(entry.section) && entry.Default === '1');
if (!profile || !profile.Path) {
  console.error(`Default Zotero profile not found in ${profilesIni}`);
  process.exit(1);
}

const profileDir = profile.IsRelative === '1'
  ? path.join(profileRoot, profile.Path)
  : profile.Path;
const prefsJs = path.join(profileDir, 'prefs.js');

if (!fs.existsSync(prefsJs)) {
  console.error(`prefs.js not found: ${prefsJs}`);
  process.exit(1);
}

const prefsText = fs.readFileSync(prefsJs, 'utf8');
const useDataDirMatch = prefsText.match(/user_pref\("extensions\.zotero\.useDataDir", (true|false)\);/);
const dataDirMatch = prefsText.match(/user_pref\("extensions\.zotero\.dataDir", "([^"]*)"\);/);

const useDataDir = useDataDirMatch ? useDataDirMatch[1] === 'true' : false;
const dataDir = useDataDir && dataDirMatch ? dataDirMatch[1] : '';

const values = {
  ZOTERO_PROFILE_ROOT: profileRoot,
  ZOTERO_PROFILE_DIR: profileDir,
  ZOTERO_PREFS_JS: prefsJs,
  ZOTERO_DATA_DIR: dataDir,
};

const exportMode = process.env.EXPORT_MODE === '--exports';
for (const [key, value] of Object.entries(values)) {
  if (exportMode) {
    const escaped = String(value).replace(/'/g, `'\\''`);
    console.log(`${key}='${escaped}'`);
  } else {
    console.log(`${key}=${value}`);
  }
}
NODE
