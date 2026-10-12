import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { sameLaneRef, type LaneRef } from '../model';

export interface LaneSelection {
    wayID: WayId;
    refs: LaneRef[];
}

export interface LaneState {
    selected(): LaneSelection | null;
    /** selects lanes on a way; the way itself is selected with iD's own select mode */
    select(wayID: WayId, refs: LaneRef[]): void;
    /** adds or removes one lane from the selection, keeping the way */
    toggle(wayID: WayId, ref: LaneRef): void;
    clear(): void;
    isSelected(wayID: string, ref: LaneRef): boolean;
    /** the roads of the look-ahead corridor, highlighted on the map */
    corridor(): Set<string>;
    setCorridor(ids: string[]): void;
    /** `change` (selected lanes) or `corridor`, optionally namespaced like `change.layer` */
    on(type: `change${string}` | `corridor${string}`, listener: (() => void) | null): LaneState;
}


const states = new WeakMap<iD.Context, LaneState>();

/**
 * Which lanes are selected. Lanes are a sub-selection of iD's selected way:
 * leaving the way (selecting something else, or nothing) clears them.
 */
export function laneState(context: iD.Context): LaneState {
    const existing = states.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change', 'corridor');
    let _selected: LaneSelection | null = null;
    let _corridor = new Set<string>();

    const changed = () => dispatch.call('change', state);

    const state: LaneState = {
        selected: () => _selected,

        select(wayID, refs) {
            _selected = refs.length ? { wayID, refs } : null;
            changed();
        },

        toggle(wayID, ref) {
            if (!_selected || _selected.wayID !== wayID) {
                state.select(wayID, [ref]);
                return;
            }
            const refs = _selected.refs.some(r => sameLaneRef(r, ref))
                ? _selected.refs.filter(r => !sameLaneRef(r, ref))
                : [..._selected.refs, ref];
            state.select(wayID, refs);
        },

        clear() {
            if (!_selected) return;
            _selected = null;
            changed();
        },

        corridor: () => _corridor,

        setCorridor(ids) {
            const next = new Set(ids);
            if (next.size === _corridor.size && ids.every(id => _corridor.has(id))) return;
            _corridor = next;
            dispatch.call('corridor', state);
        },

        isSelected: (wayID, ref) =>
            !!_selected && _selected.wayID === wayID && _selected.refs.some(r => sameLaneRef(r, ref)),

        on(type, listener) {
            // null removes the listener, as in d3
            dispatch.on(type as 'change', listener as () => void);
            return state;
        }
    };

    // leaving the way clears its lanes
    context.on('enter.lane-state', () => {
        const ids = context.selectedIDs();
        if (_corridor.size && (ids.length !== 1 || !_corridor.has(ids[0]))) state.setCorridor([]);
        if (!_selected) return;
        if (context.mode()?.id !== 'select' || ids.length !== 1 || ids[0] !== _selected.wayID) state.clear();
    });

    // after an edit, drop lanes that no longer exist (e.g. a lane was removed)
    context.history().on('change.lane-state', () => {
        if (!_selected) return;
        const way = context.hasEntity(_selected.wayID) as osmWay | undefined;
        if (!way) {
            state.clear();
        }
    });

    states.set(context, state);
    return state;
}
