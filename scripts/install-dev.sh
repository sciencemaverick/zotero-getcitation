#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ADDON_ID=$(node -p "require('$ROOT_DIR/manifest.json').applications.zotero.id")

eval "$("$ROOT_DIR/scripts/zotero-env.sh" --exports)"

EXTENSIONS_DIR="$ZOTERO_PROFILE_DIR/extensions"
PROXY_FILE="$EXTENSIONS_DIR/$ADDON_ID"
LEGACY_XPI="$EXTENSIONS_DIR/$ADDON_ID.xpi"
PREFS_JS="$ZOTERO_PREFS_JS"
EXTENSIONS_JSON="$ZOTERO_PROFILE_DIR/extensions.json"
ADDON_STARTUP_JSON="$ZOTERO_PROFILE_DIR/addonStartup.json.lz4"

mkdir -p "$EXTENSIONS_DIR"

for path in \
  "$LEGACY_XPI" \
  "$EXTENSIONS_DIR/getcitation@jake.xpi" \
  "$EXTENSIONS_DIR/getcitation@jake.local.xpi" \
  "$EXTENSIONS_DIR/getcitation@jake.local" \
  "$EXTENSIONS_DIR/getcitation@example.com.xpi"
do
  if [ -f "$path" ] && [ "$path" != "$PROXY_FILE" ]; then
    rm -f "$path"
  fi
done

printf '%s\n' "$ROOT_DIR" > "$PROXY_FILE"

TMP_PREFS="$PREFS_JS.tmp"
awk '
  $0 ~ /extensions\.lastAppBuildId/ { next }
  $0 ~ /extensions\.lastAppVersion/ { next }
  $0 ~ /extensions\.autoDisableScopes/ { next }
  { print }
' "$PREFS_JS" > "$TMP_PREFS"
printf '%s\n' 'user_pref("extensions.autoDisableScopes", 0);' >> "$TMP_PREFS"
mv "$TMP_PREFS" "$PREFS_JS"

if [ -f "$EXTENSIONS_JSON" ]; then
  rm -f "$EXTENSIONS_JSON"
fi

if [ -f "$ADDON_STARTUP_JSON" ]; then
  rm -f "$ADDON_STARTUP_JSON"
fi

echo "Installed test add-on:"
echo "  Mode: source proxy"
echo "  Proxy file: $PROXY_FILE"
echo "  Source dir: $ROOT_DIR"
echo "  Profile: $ZOTERO_PROFILE_DIR"
echo "  Data dir: ${ZOTERO_DATA_DIR:-<default-managed>}"
echo "  Reset prefs: removed extensions.lastAppBuildId and extensions.lastAppVersion"
echo "  Dev prefs: set extensions.autoDisableScopes=0"
echo "  Reset caches: removed extensions.json and addonStartup.json.lz4"
