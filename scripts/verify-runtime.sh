#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ADDON_ID=$(node -p "require('$ROOT_DIR/manifest.json').applications.zotero.id")
WAIT_SECONDS="${1:-20}"

eval "$("$ROOT_DIR/scripts/zotero-env.sh" --exports)"

PREFS_JS="$ZOTERO_PREFS_JS"
EXTENSIONS_JSON="$ZOTERO_PROFILE_DIR/extensions.json"
ZOTERO_APP="/Applications/Zotero.app"
DEV_PREF_PREFIX="extensions.getcitation.devSelfTest"

is_zotero_running() {
  osascript -e 'tell application "System Events" to return exists process "Zotero"' 2>/dev/null | tr '[:upper:]' '[:lower:]'
}

wait_for_zotero_stop() {
  attempt=0
  while [ "$attempt" -lt 20 ]; do
    if [ "$(is_zotero_running)" != "true" ]; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  return 1
}

launch_zotero_background() {
  attempt=0
  while [ "$attempt" -lt 3 ]; do
    if open -gj -a "$ZOTERO_APP" --args -purgecaches -ZoteroDebugText -jsconsole; then
      return 0
    fi
    sleep 2
    attempt=$((attempt + 1))
  done
  return 1
}

read_marker() {
  pref_name="$1"
  python3 - "$PREFS_JS" "$pref_name" <<'PY'
import pathlib
import re
import sys

prefs_path = pathlib.Path(sys.argv[1])
pref_name = sys.argv[2]
pattern = re.compile(r'user_pref\("' + re.escape(pref_name) + r'",\s*"([^"]*)"\);')
text = prefs_path.read_text()
match = pattern.search(text)
print(match.group(1) if match else "")
PY
}

read_addon_state() {
  python3 - "$EXTENSIONS_JSON" "$ADDON_ID" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
addon_id = sys.argv[2]
if not path.exists():
    print("extensions.json not found")
    sys.exit(2)

data = json.loads(path.read_text())
for addon in data.get("addons", []):
    if addon.get("id") == addon_id:
        print(f'id={addon.get("id")}')
        print(f'active={addon.get("active")}')
        print(f'userDisabled={addon.get("userDisabled")}')
        print(f'appDisabled={addon.get("appDisabled")}')
        print(f'foreignInstall={addon.get("foreignInstall")}')
        print(f'seen={addon.get("seen")}')
        sys.exit(0)

print("addon not found")
sys.exit(3)
PY
}

reset_dev_self_test_prefs() {
  python3 - "$PREFS_JS" <<'PY'
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text()
lines = text.splitlines()
patterns = [
    re.compile(r'user_pref\("extensions\.getcitation\.devSelfTest\..*"\);$'),
]
kept = [line for line in lines if not any(pattern.search(line) for pattern in patterns)]
kept.append('user_pref("extensions.getcitation.devSelfTest.enabled", true);')
path.write_text("\n".join(kept) + "\n")
PY
}

read_self_test_state() {
  python3 - "$PREFS_JS" <<'PY'
import pathlib
import re
import sys

prefs_path = pathlib.Path(sys.argv[1])
text = prefs_path.read_text()

keys = [
    "extensions.getcitation.devSelfTest.enabled",
    "extensions.getcitation.devSelfTest.status",
    "extensions.getcitation.devSelfTest.message",
    "extensions.getcitation.devSelfTest.itemKey",
    "extensions.getcitation.devSelfTest.source",
    "extensions.getcitation.devSelfTest.count",
    "extensions.getcitation.devSelfTest.citationLine",
    "extensions.getcitation.devSelfTest.startedAt",
    "extensions.getcitation.devSelfTest.finishedAt",
]

for key in keys:
    pattern = re.compile(r'user_pref\("' + re.escape(key) + r'",\s*(true|false|"([^"]*)")\);')
    match = pattern.search(text)
    if not match:
        print(f"{key}=<empty>")
        continue
    if match.group(1) in ("true", "false"):
        value = match.group(1)
    else:
        value = match.group(2) or ""
    print(f"{key}={value}")
PY
}

before_startup=$(read_marker "extensions.getcitation.lastStartupAt")
before_window=$(read_marker "extensions.getcitation.lastMainWindowLoadAt")
before_shutdown=$(read_marker "extensions.getcitation.lastShutdownAt")

echo "Runtime verification"
echo "  Add-on: $ADDON_ID"
echo "  Profile: $ZOTERO_PROFILE_DIR"
echo "  Data dir: ${ZOTERO_DATA_DIR:-<default-managed>}"
echo "  Wait: ${WAIT_SECONDS}s"
echo "  Startup marker before: ${before_startup:-<empty>}"
echo "  Main window marker before: ${before_window:-<empty>}"
echo "  Shutdown marker before: ${before_shutdown:-<empty>}"

osascript -e 'tell application "Zotero" to quit' >/dev/null 2>&1 || true
wait_for_zotero_stop || true
reset_dev_self_test_prefs

launch_zotero_background
sleep "$WAIT_SECONDS"

echo "Addon state after launch:"
addon_state=$(read_addon_state)
echo "$addon_state"

after_startup=$(read_marker "extensions.getcitation.lastStartupAt")
after_window=$(read_marker "extensions.getcitation.lastMainWindowLoadAt")
self_test_state=$(read_self_test_state)
self_test_citation_line=$(printf '%s\n' "$self_test_state" | sed -n 's/^extensions\.getcitation\.devSelfTest\.citationLine=//p')

echo "  Startup marker after launch: ${after_startup:-<empty>}"
echo "  Main window marker after launch: ${after_window:-<empty>}"
echo "Self-test state after launch:"
echo "$self_test_state"

osascript -e 'tell application "Zotero" to quit' >/dev/null 2>&1 || true
wait_for_zotero_stop || true

after_shutdown=$(read_marker "extensions.getcitation.lastShutdownAt")
echo "  Shutdown marker after quit: ${after_shutdown:-<empty>}"

case "$addon_state" in
  *"active=True"* ) : ;;
  * )
    echo "Verification failed: add-on is not active."
    exit 1
    ;;
esac

if [ -z "$after_startup" ] || [ "$after_startup" = "$before_startup" ]; then
  echo "Verification failed: startup marker did not advance."
  exit 1
fi

case "$self_test_state" in
  *"extensions.getcitation.devSelfTest.status=passed"* ) : ;;
  * )
    echo "Verification failed: dev self-test did not pass."
    exit 1
    ;;
esac

if [ -z "$self_test_citation_line" ]; then
  echo "Verification failed: dev self-test did not record a citation line."
  exit 1
fi

case "$self_test_citation_line" in
  *[!0-9]* )
    echo "Verification failed: dev self-test citation line is not numeric-only."
    exit 1
    ;;
  * ) : ;;
esac

if [ -z "$after_window" ] || [ "$after_window" = "$before_window" ]; then
  echo "Note: main window load marker did not advance in background mode."
fi

if [ -z "$after_shutdown" ] || [ "$after_shutdown" = "$before_shutdown" ]; then
  echo "Verification failed: shutdown marker did not advance."
  exit 1
fi

echo "Verification passed."
