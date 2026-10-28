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
    /** hide land use (`landuse=*`) alone, iD's and Lane Studio's, leaving car parks and other surfaces shown */
    hideLanduse(): boolean;
    setHideLanduse(value: boolean): void;
    /** show brands' logos from Wikidata in place of iD's markers (on unless turned off) */
    showLogos(): boolean;
    setShowLogos(value: boolean): void;
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
    let _hideLanduse = prefs('lanes-hide-landuse') === 'true';
    let _showLogos = prefs('lanes-brand-logos') !== 'false';

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
        // junction boxes, mini-roundabouts and turning circles are one shape with the colour a road
        // shows: a general lane over the carriageway (colours and default alphas as in 20_lanes_layer.css)
        const scaled = (a: number) => a * low + (1 - a) * high;
        const lane = { colour: [90, 96, 106], alpha: scaled(0.3) };
        const carriageway = { colour: [40, 44, 52], alpha: scaled(0.35) };
        const alpha = 1 - (1 - lane.alpha) * (1 - carriageway.alpha);
        const colour = lane.colour.map((c, i) => alpha > 0
            ? Math.round((lane.alpha * c + (1 - lane.alpha) * carriageway.alpha * carriageway.colour[i]) / alpha)
            : c);
        container.style('--lanes-road-fill', `rgb(${colour.join(', ')})`);
        container.style('--lanes-road-alpha', String(Math.round(alpha * 1000) / 1000));
        // junction boxes: a shade lighter than the road, so they can be told apart, but read as the same road (a
        // strong tint made junctions with many links and islands, as at Ratby Lane, Leicester, a patchwork)
        const junction = colour.map((c, i) => Math.min(255, c + [7, 8, 12][i]));
        container.style('--lanes-junction-fill', `rgb(${junction.join(', ')})`);
        container.classed('lanes-hide-originals', _hide);
        container.classed('lanes-hide-landuse', _hideLanduse);
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
        hideLanduse: () => _hideLanduse,
        setHideLanduse(value) {
            if (value === _hideLanduse) return;
            _hideLanduse = value;
            prefs('lanes-hide-landuse', value ? 'true' : null);
            apply();
            dispatch.call('change', settings);
        },
        showLogos: () => _showLogos,
        setShowLogos(value) {
            if (value === _showLogos) return;
            _showLogos = value;
            prefs('lanes-brand-logos', value ? null : 'false');
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
