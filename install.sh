#!/usr/bin/env bash
set -e
UUID="vibrance@wowluka2.github.io"
OLD_UUID="vibrance@local"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DST="$EXT_DIR/$UUID"

# migrate from the pre-release UUID, if present
if [ -d "$EXT_DIR/$OLD_UUID" ]; then
    gnome-extensions disable "$OLD_UUID" 2>/dev/null || true
    rm -rf "$EXT_DIR/$OLD_UUID"
    echo "Removed old version ($OLD_UUID)"
fi

mkdir -p "$DST"
cp -r "$SRC"/. "$DST"/
glib-compile-schemas "$DST/schemas"

echo "Installed to $DST / Zainstalowano w $DST"
echo "Log out and back in (Wayland), then run / Wyloguj się i zaloguj, potem:"
echo "  gnome-extensions enable $UUID"
