import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';

// ---------------------------------------------------------------------------
// Shader (GNOME Shell 51: Cogl.Snippet from vfunc_get_static_snippet()).
// One effect instance per display: it only touches pixels inside `area`
// (x, y, w, h in stage coordinates). Saturation is applied on the
// gamma-encoded signal (like GPU drivers on Windows):
//   out = Y' + s * (c - Y')   with BT.709 luma, clipped to [0, 1].
// ---------------------------------------------------------------------------
const DECLARATIONS = `
uniform float sat;
uniform vec4 area;
uniform vec2 stage;
`;

const POST = `
vec2 p = cogl_tex_coord_in[0].xy * stage;
if (p.x >= area.x && p.y >= area.y &&
    p.x < area.x + area.z && p.y < area.y + area.w) {
    vec3 rgb = cogl_color_out.a > 0.0 ? cogl_color_out.rgb / cogl_color_out.a : cogl_color_out.rgb;
    float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    rgb = clamp(vec3(y) + sat * (rgb - vec3(y)), 0.0, 1.0);
    cogl_color_out = vec4(rgb * cogl_color_out.a, cogl_color_out.a);
}
`;

const VibranceEffect = GObject.registerClass(
class VibranceEffect extends Clutter.ShaderEffect {
    _init() {
        super._init();
        this._sat = 1;
        this._area = [0, 0, 1, 1];
        this._stage = [1, 1];
    }

    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, POST);
    }

    configure(sat, monitor, stageWidth, stageHeight) {
        this._sat = sat;
        this._area = [monitor.x, monitor.y, monitor.width, monitor.height];
        this._stage = [stageWidth, stageHeight];
        this._push();
        this.queue_repaint();
    }

    _push() {
        this.set_uniform_float('sat', 1, [this._sat]);
        this.set_uniform_float('area', 4, this._area);
        this.set_uniform_float('stage', 2, this._stage);
    }

    vfunc_paint_target(node, paintContext) {
        this._push();
        super.vfunc_paint_target(node, paintContext);
    }
});

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const MonitorRow = GObject.registerClass(
class MonitorRow extends PopupMenu.PopupBaseMenuItem {
    _init(title, subtitle, percent, onChange) {
        super._init({activate: false});
        this.add_style_class_name('vibrance-row');
        this._onChange = onChange;
        this._blocked = false;

        const card = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            style_class: 'vibrance-card',
        });

        const header = new St.BoxLayout({
            x_expand: true,
            style_class: 'vibrance-header',
        });
        header.add_child(new St.Icon({
            icon_name: 'video-display-symbolic',
            style_class: 'vibrance-icon',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        const names = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        names.add_child(new St.Label({text: title, style_class: 'vibrance-title'}));
        names.add_child(new St.Label({text: subtitle, style_class: 'vibrance-subtitle'}));
        header.add_child(names);

        this._value = new St.Label({
            style_class: 'vibrance-value',
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(this._value);

        this._slider = new Slider(percent / 100);
        this._slider.accessible_name = title;

        card.add_child(header);
        card.add_child(this._slider);
        this.add_child(card);

        this.connect('key-press-event', (_a, event) =>
            this._slider.emit('key-press-event', event));

        this._slider.connect('notify::value', () => {
            const pct = Math.round(this._slider.value * 100);
            this._value.text = `+${pct}%`;
            if (!this._blocked)
                this._onChange(pct);
        });
        this._value.text = `+${percent}%`;
    }

    setPercent(pct) {
        this._blocked = true;
        this._slider.value = pct / 100;
        this._value.text = `+${pct}%`;
        this._blocked = false;
    }
});

const VibranceIndicator = GObject.registerClass(
class VibranceIndicator extends PanelMenu.Button {
    _init(handlers) {
        super._init(0.0, 'Vibrance');
        this._handlers = handlers;
        this._rows = [];

        this.add_child(new St.Icon({
            icon_name: 'applications-graphics-symbolic',
            style_class: 'system-status-icon',
        }));
    }

    build(monitors, primaryIndex, percents, linked, fullscreen) {
        this.menu.removeAll();
        this._rows = [];
        const multi = monitors.length > 1;

        monitors.forEach((m, i) => {
            const title = multi ? `Display ${i + 1}` : 'Display';
            const subtitle = `${m.width}×${m.height}` +
                (multi && i === primaryIndex ? ' · primary' : '');
            const row = new MonitorRow(title, subtitle, percents[i] ?? 0,
                pct => this._handlers.onChange(i, pct));
            this.menu.addMenuItem(row);
            this._rows.push(row);
        });

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (multi) {
            const link = new PopupMenu.PopupSwitchMenuItem('Link displays', linked);
            link.connect('toggled', (_item, state) => this._handlers.onLink(state));
            this.menu.addMenuItem(link);
        }

        const fs = new PopupMenu.PopupSwitchMenuItem('Apply in fullscreen', fullscreen);
        fs.connect('toggled', (_item, state) => this._handlers.onFullscreen(state));
        this.menu.addMenuItem(fs);

        const reset = new PopupMenu.PopupMenuItem('Reset all');
        reset.connect('activate', () => this._handlers.onReset());
        this.menu.addMenuItem(reset);
    }

    update(percents) {
        this._rows.forEach((row, i) => row.setPercent(percents[i] ?? 0));
    }
});

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------
export default class VibranceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._effects = new Map();
        this._saveId = 0;
        this._dirty = false;
        this._percents = this._loadPercents();
        this._linked = this._settings.get_boolean('linked');
        this._fullscreen = this._settings.get_boolean('fullscreen');
        this._inhibited = false;

        this._indicator = new VibranceIndicator({
            onChange: (i, pct) => this._onChange(i, pct),
            onLink: on => this._onLink(on),
            onReset: () => this._onReset(),
            onFullscreen: on => this._onFullscreen(on),
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._monitorsId = Main.layoutManager.connect('monitors-changed',
            () => this._refresh());
        this._refresh();
    }

    // -- state ----------------------------------------------------------------
    _loadPercents() {
        const out = {};
        try {
            const raw = this._settings.get_value('percents').recursiveUnpack();
            for (const [k, v] of Object.entries(raw))
                out[Number(k)] = v;
        } catch (e) {
            console.error(`vibrance: could not read settings: ${e}`);
        }
        return out;
    }

    _savePercents() {
        const obj = {};
        for (const [k, v] of Object.entries(this._percents)) {
            if (v > 0)
                obj[String(k)] = v;
        }
        this._settings.set_value('percents', new GLib.Variant('a{si}', obj));
    }

    _scheduleSave() {
        this._dirty = true;
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._saveId = 0;
            this._flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    _flush() {
        if (this._dirty && this._settings)
            this._savePercents();
        this._dirty = false;
    }

    // -- handlers -------------------------------------------------------------
    _monitors() {
        return Main.layoutManager.monitors;
    }

    _setAll(pct) {
        this._monitors().forEach((_m, i) => { this._percents[i] = pct; });
    }

    _onChange(index, pct) {
        if (this._linked) {
            this._setAll(pct);
            this._indicator.update(this._percents);
        } else {
            this._percents[index] = pct;
        }
        this._applyAll();
        this._scheduleSave();
    }

    _onLink(on) {
        this._linked = on;
        this._settings.set_boolean('linked', on);
        if (on) {
            this._setAll(this._percents[Main.layoutManager.primaryIndex] ?? 0);
            this._indicator.update(this._percents);
            this._applyAll();
            this._scheduleSave();
        }
    }

    _onReset() {
        this._setAll(0);
        this._indicator.update(this._percents);
        this._applyAll();
        this._scheduleSave();
    }

    _onFullscreen(on) {
        this._fullscreen = on;
        this._settings.set_boolean('fullscreen', on);
        this._updateInhibit();
    }

    _refresh() {
        this._indicator.build(this._monitors(), Main.layoutManager.primaryIndex,
            this._percents, this._linked, this._fullscreen);
        this._applyAll();
    }

    // -- effects --------------------------------------------------------------
    _applyAll() {
        const monitors = this._monitors();

        for (const [i, effect] of this._effects) {
            if (i >= monitors.length || !(this._percents[i] > 0)) {
                Main.uiGroup.remove_effect(effect);
                this._effects.delete(i);
            }
        }

        monitors.forEach((monitor, i) => {
            const pct = this._percents[i] ?? 0;
            if (pct <= 0)
                return;
            let effect = this._effects.get(i);
            if (!effect) {
                effect = new VibranceEffect();
                Main.uiGroup.add_effect_with_name(`vibrance-${i}`, effect);
                this._effects.set(i, effect);
            }
            effect.configure(1 + pct / 100, monitor,
                global.stage.width, global.stage.height);
        });

        this._updateInhibit();
    }

    // A fullscreen window is normally scanned out directly (the compositor is
    // bypassed), so the shader would never run on it. While at least one
    // effect is active we inhibit that. The inhibition is a reference counter
    // inside Mutter, so every disable_unredirect() must be paired with exactly
    // one enable_unredirect(); the _inhibited flag guarantees that.
    _updateInhibit() {
        const want = this._fullscreen && this._effects.size > 0;
        if (want === this._inhibited)
            return;

        const compositor = global.compositor;
        if (want) {
            if (typeof compositor?.disable_unredirect !== 'function') {
                console.warn('vibrance: disable_unredirect() unavailable, fullscreen will not be affected');
                return;
            }
            compositor.disable_unredirect();
            this._inhibited = true;
        } else {
            compositor.enable_unredirect();
            this._inhibited = false;
        }
    }

    disable() {
        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        this._flush();
        for (const effect of this._effects.values())
            Main.uiGroup.remove_effect(effect);
        this._effects.clear();
        this._updateInhibit();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
