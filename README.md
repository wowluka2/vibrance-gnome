**English** | [Polski](README_PL.md)

# Vibrance (GNOME Shell)

A screen saturation ("digital vibrance") slider for GNOME Shell on Wayland.
It works on any GPU (AMD / Intel / NVIDIA), because it is a shader applied by the
compositor rather than a driver setting. Saturation is computed in gamma space
(BT.709 luma), the same way GPU drivers do it on Windows.

Inspired by [plasma-vibrance](https://github.com/Celiz/plasma-vibrance) (KDE Plasma).

## Requirements

- GNOME Shell **51** (the shader API is based on `Cogl.Snippet`; it does not work on 50 or older)
- `glib-compile-schemas` (part of `glib2` / `libglib2.0-bin`, normally already installed)

## Installation

```sh
git clone https://github.com/wowluka2/vibrance-gnome.git
cd vibrance-gnome
./install.sh
```

Log out and back in (required on Wayland), then enable it:

```sh
gnome-extensions enable vibrance@wowluka2.github.io
```

## Usage

Click the icon in the top panel and drag the slider (0–100%, where 100% = 2× saturation).
The value is remembered between sessions. **Reset** returns to the original colors.
A range of 20–40% usually looks best; higher values clip already saturated colors.
[Image Alt]([image_url](https://github.com/wowluka2/vibrance-gnome/blob/7c290cc82ce01c8dca303f12965992f1190d37d0/screenshot.png))
## Updating

```sh
git pull && ./install.sh
```

then log out and back in.

## Uninstallation

```sh
./uninstall.sh
```

## Limitations

- The effect applies to the whole screen (no per-monitor setting).
- Fullscreen games may bypass the compositor, and with it the effect.
- Screenshots may contain the altered colors.

## Troubleshooting

```sh
gnome-extensions info vibrance@wowluka2.github.io
journalctl -b -o cat | grep -iE "vibrance|JS ERROR"
```

If the state is `OUT OF DATE`, your GNOME Shell version is not listed in `metadata.json`.
Please open an issue and include the output of `gnome-shell --version`.

## License

[MIT](LICENSE)
