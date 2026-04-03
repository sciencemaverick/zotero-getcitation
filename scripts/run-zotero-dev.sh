#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
eval "$("$ROOT_DIR/scripts/zotero-env.sh" --exports)"

ZOTERO_BIN="/Applications/Zotero.app/Contents/MacOS/zotero"

echo "Launching Zotero in development mode:"
echo "  Binary: $ZOTERO_BIN"
echo "  Profile: $ZOTERO_PROFILE_DIR"
echo "  Data dir: ${ZOTERO_DATA_DIR:-<default-managed>}"

exec "$ZOTERO_BIN" -purgecaches -ZoteroDebugText -jsconsole
