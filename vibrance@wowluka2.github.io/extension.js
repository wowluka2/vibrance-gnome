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

// GNOME Shell 51: shader = Cogl.Snippet from vfunc_get_static_snippet().
// Saturation on the gamma-encoded signal (same as GPU drivers on Windows):
// out = Y' + s * (c - Y'), BT.709 luma, clipped to [0, 1].
// The snippet runs in the "post" hook, so cogl_color_out already holds the
// sampled (premultiplied) pixel.
const DECLARATIONS = `
uniform float sat;
`;

const POST = `
vec3 rgb = cogl_color_out.a > 0.0 ? cogl_color_out.rgb / cogl_color_out.a : cogl_color_out.rgb;
float y = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
rgb = clamp(vec3(y) + sat * (rgb - vec3(y)), 0.0, 1.0);
cogl_color_out = vec4(rgb * cogl_color_out.a, cogl_color_out.a);
`;

const VibranceEffect = GObject.registerClass(
class VibranceEffect extends Clutter.ShaderEffect {
    _init(sat) {
        super._init();
        this._sat = sat;
        this.set_uniform_float('sat', 1, [sat]);
    }

    vfunc_get_static_snippet() {
        return Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, DECLARATIONS, POST);
    }

    setSaturation(sat) {
        this._sat = sat;
        this.set_uniform_float('sat', 1, [sat]);
        this.queue_repaint();
    }

    vfunc_paint_target(node, paintContext) {
        this.set_uniform_float('sat', 1, [this._sat]);
        super.vfunc_paint_target(node, paintContext);
    }
});

const VibranceIndicator = GObject.registerClass(
class VibranceIndicator extends PanelMenu.Button {
    _init(percent, onChange) {
        super._init(0.0, 'Vibrance');
        this._onChange = onChange;

        this.add_child(new St.Icon({
            icon_name: 'applications-graphics-symbolic',
            style_class: 'system-status-icon',
        }));

        const item = new PopupMenu.PopupBaseMenuItem({activate: false});
        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-width: 4em;',
        });
        this._slider = new Slider(percent / 100);
        this._slider.x_expand = true;
        this._slider.accessible_name = 'Saturation';
        item.add_child(this._label);
        item.add_child(this._slider);
        item.connect('key-press-event', (_a, event) =>
            this._slider.emit('key-press-event', event));
        this.menu.addMenuItem(item);

        const reset = new PopupMenu.PopupMenuItem('Reset');
        reset.connect('activate', () => { this._slider.value = 0; });
        this.menu.addMenuItem(reset);

        this._sliderId = this._slider.connect('notify::value', () => this._changed());
        this._updateLabel(percent);
    }

    _changed() {
        const pct = Math.round(this._slider.value * 100);
        this._updateLabel(pct);
        this._onChange(pct);
    }

    _updateLabel(pct) {
        this._label.text = `+${pct}%`;
    }
});

export default class VibranceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._effect = null;
        this._saveId = 0;
        this._pending = null;

        const pct = this._settings.get_int('percent');
        this._indicator = new VibranceIndicator(pct, p => {
            this._apply(p);
            this._scheduleSave(p);
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._apply(pct);
    }

    _apply(pct) {
        if (pct === 0) {
            this._removeEffect();
            return;
        }
        const sat = 1 + pct / 100;
        if (!this._effect) {
            this._effect = new VibranceEffect(sat);
            Main.uiGroup.add_effect_with_name('vibrance', this._effect);
        }
        this._effect.setSaturation(sat);
    }

    _removeEffect() {
        if (this._effect) {
            Main.uiGroup.remove_effect(this._effect);
            this._effect = null;
        }
    }

    _scheduleSave(pct) {
        this._pending = pct;
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
            this._saveId = 0;
            this._flush();
            return GLib.SOURCE_REMOVE;
        });
    }

    _flush() {
        if (this._pending !== null && this._settings)
            this._settings.set_int('percent', this._pending);
        this._pending = null;
    }

    disable() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        this._flush();
        this._removeEffect();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
