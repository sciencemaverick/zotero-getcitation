#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist"
TMP_DIR="$ROOT_DIR/tmp/build"
VERSION=$(node -p "require('$ROOT_DIR/manifest.json').version")
OUTPUT_FILE="$DIST_DIR/getcitation-$VERSION.xpi"

rm -rf "$TMP_DIR"
rm -f "$OUTPUT_FILE"
mkdir -p "$TMP_DIR" "$DIST_DIR"

cp "$ROOT_DIR/manifest.json" "$TMP_DIR/"
cp "$ROOT_DIR/bootstrap.js" "$TMP_DIR/"
cp "$ROOT_DIR/preferences.xhtml" "$TMP_DIR/"
cp "$ROOT_DIR/preferences.js" "$TMP_DIR/"
cp "$ROOT_DIR/prefs.js" "$TMP_DIR/"
mkdir -p "$TMP_DIR/assets"
cp "$ROOT_DIR/assets/icon-48.png" "$TMP_DIR/assets/"
cp "$ROOT_DIR/assets/icon-96.png" "$TMP_DIR/assets/"

cd "$TMP_DIR"
zip -qr "$OUTPUT_FILE" manifest.json bootstrap.js preferences.xhtml preferences.js prefs.js assets/icon-48.png assets/icon-96.png

echo "Built: $OUTPUT_FILE"
