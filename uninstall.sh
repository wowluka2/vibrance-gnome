#!/usr/bin/env bash
for UUID in "vibrance@wowluka2.github.io" "vibrance@local"; do
    gnome-extensions disable "$UUID" 2>/dev/null || true
    rm -rf "$HOME/.local/share/gnome-shell/extensions/$UUID"
done
dconf reset -f /org/gnome/shell/extensions/vibrance/ 2>/dev/null || true
echo "Removed. Log out and back in to fully unload it. / Usunięto, wyloguj się i zaloguj ponownie."
