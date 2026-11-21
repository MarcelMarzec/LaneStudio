import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { LaneSpot } from '../geometry/connectivity';
import { sameLaneRef } from '../model';

export interface LaneConnectivity {
    /** the Connectivity tool is in use */
    active(): boolean;
    setActive(active: boolean): void;
    /** the lane picked to connect from: its connections and the lanes it can lead into are shown */
    picked(): LaneSpot | null;
    setPicked(spot: LaneSpot | null): void;
    /** the lane under the pointer, whose connections are shown while nothing is picked */
    hovered(): LaneSpot | null;
    setHovered(spot: LaneSpot | null): void;
    /** which connections are drawn: those Lane Studio works out, and those relations declare */
    showDefault(): boolean;
    setShowDefault(show: boolean): void;
    showDeclared(): boolean;
    setShowDeclared(show: boolean): void;
    on(type: `change${string}`, listener: (() => void) | null): LaneConnectivity;
}

export const sameSpot = (a: LaneSpot | null, b: LaneSpot | null) =>
    a === b || (!!a && !!b && a.wayID === b.wayID && a.from === b.from && a.to === b.to && sameLaneRef(a.ref, b.ref));

const connectivityByContext = new WeakMap<iD.Context, LaneConnectivity>();

/** The Connectivity tool's state, one per iD context */
export function laneConnectivity(context: iD.Context): LaneConnectivity {
    const existing = connectivityByContext.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    let _active = false;
    let _picked: LaneSpot | null = null;
    let _hovered: LaneSpot | null = null;
    let _showDefault = true;
    let _showDeclared = true;
    const changed = () => dispatch.call('change', state);

    const state: LaneConnectivity = {
        active: () => _active,
        setActive(active) {
            if (_active === active) return;
            _active = active;
            _picked = null;
            _hovered = null;
            context.container().classed('lanes-connectivity', active);
            changed();
        },
        picked: () => _picked,
        setPicked(spot) {
            if (sameSpot(spot, _picked)) return;
            _picked = spot;
            changed();
        },
        hovered: () => _hovered,
        setHovered(spot) {
            if (sameSpot(spot, _hovered)) return;
            _hovered = spot;
            changed();
        },
        showDefault: () => _showDefault,
        setShowDefault(show) {
            _showDefault = show;
            changed();
        },
        showDeclared: () => _showDeclared,
        setShowDeclared(show) {
            _showDeclared = show;
            changed();
        },
        on(type, listener) {
            dispatch.on(type as 'change', listener as () => void);
            return state;
        }
    };
    connectivityByContext.set(context, state);
    return state;
}
