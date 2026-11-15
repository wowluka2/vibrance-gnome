#!/usr/bin/env bash
# Builds a zip for extensions.gnome.org (extension.js + metadata.json at the archive root)
set -e
cd "$(dirname "$0")"
gnome-extensions pack "vibrance@wowluka2.github.io" --force --out-dir=dist
echo "Created dist/"
