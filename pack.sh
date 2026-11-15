#!/usr/bin/env bash
# Builds a zip with extension.js + metadata.json at the archive root
# (suitable for GitHub releases and extensions.gnome.org).
set -e
cd "$(dirname "$0")"
UUID="vibrance@wowluka2.github.io"
OUT="dist/$UUID.shell-extension.zip"
mkdir -p dist
rm -f "$OUT"

if gnome-extensions pack "$UUID" --force --out-dir=dist 2>/dev/null && [ -f "$OUT" ]; then
    echo "Created $OUT (gnome-extensions pack)"
else
    echo "gnome-extensions pack failed, falling back to zip"
    rm -f "$OUT"
    (cd "$UUID" && zip -r "../$OUT" extension.js metadata.json stylesheet.css schemas/*.xml)
    echo "Created $OUT (zip)"
fi
