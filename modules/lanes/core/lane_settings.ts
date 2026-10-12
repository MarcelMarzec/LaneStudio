import { dispatch as d3_dispatch } from 'd3-dispatch';

import { prefs } from '../../core/preferences';

/**
 * Lane surface opacity when nothing is saved, from 0 to 1: the see-through look surfaces have by
 * default, so painted lines on the imagery can be traced. 1 is fully opaque, 0 invisible.
 */
export const defaultSurfaceOpacity = 0.35;

export interface LaneSettings {
    /** how opaque lane, carriageway and junction surfaces are, from 0 to 1 */
    surfaceOpacity(): number;
    setSurfaceOpacity(value: number): void;
    /** hide iD's own lines, vertices, points and direction cones for everything Lane Studio draws */
    hideOriginals(): boolean;
    setHideOriginals(value: boolean): void;
    on(type: `change${string}`, listener: (() => void) | null): LaneSettings;
}

const all = new WeakMap<iD.Context, LaneSettings>();

/** Lane Studio's display settings, saved in its preferences and applied to the map container */
export function laneSettings(context: iD.Context): LaneSettings {
    const existing = all.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    const stored = parseFloat(prefs('lanes-surface-alpha') ?? '');
    let _opacity = Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : defaultSurfaceOpacity;
    let _hide = prefs('lanes-hide-originals') === 'true';

    function apply() {
        const container = context.container();
        if (!container || container.empty()) return;
        // each surface keeps its own default transparency (in CSS as --lanes-a) at the default setting,
        // and every surface reaches fully opaque at 100% and invisible at 0%:
        // fill-opacity = a × low + (1 − a) × high
        const low = Math.min(1, _opacity / defaultSurfaceOpacity);
        const high = Math.max(0, (_opacity - defaultSurfaceOpacity) / (1 - defaultSurfaceOpacity));
        container.style('--lanes-low', String(low));
        container.style('--lanes-high', String(high));
        container.classed('lanes-hide-originals', _hide);
    }

    const settings: LaneSettings = {
        surfaceOpacity: () => _opacity,
        setSurfaceOpacity(value) {
            const next = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
            if (next === _opacity) return;
            _opacity = next;
            prefs('lanes-surface-alpha', next === defaultSurfaceOpacity ? null : String(next));
            apply();
            dispatch.call('change', settings);
        },
        hideOriginals: () => _hide,
        setHideOriginals(value) {
            if (value === _hide) return;
            _hide = value;
            prefs('lanes-hide-originals', value ? 'true' : null);
            apply();
            dispatch.call('change', settings);
        },
        on(type, listener) {
            dispatch.on(type as 'change', listener as () => void);
            return settings;
        }
    };

    apply();
    all.set(context, settings);
    return settings;
}
