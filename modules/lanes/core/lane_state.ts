import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { parseLanes, sameLaneRef, type LaneRef } from '../model';

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
    /** the hard shoulder picked on the map, edited in the sidebar; picking lanes drops it */
    shoulder(): { wayID: WayId; side: 'left' | 'right' } | null;
    selectShoulder(wayID: WayId, side: 'left' | 'right'): void;
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
    let _shoulder: { wayID: WayId; side: 'left' | 'right' } | null = null;
    let _corridor = new Set<string>();

    const changed = () => dispatch.call('change', state);

    const state: LaneState = {
        selected: () => _selected,

        select(wayID, refs) {
            _selected = refs.length ? { wayID, refs } : null;
            if (_selected) _shoulder = null;
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
            if (!_selected && !_shoulder) return;
            _selected = null;
            _shoulder = null;
            changed();
        },

        shoulder: () => _shoulder,

        selectShoulder(wayID, side) {
            _selected = null;
            _shoulder = { wayID, side };
            changed();
        },

        corridor: () => _corridor,

        setCorridor(ids) {
            // only while one road is selected: a sidebar render during deselection must not bring it back
            const selectedIDs = context.selectedIDs();
            const active = context.mode()?.id === 'select' && selectedIDs.length === 1;
            const next = new Set(active ? ids : []);
            if (next.size === _corridor.size && [...next].every(id => _corridor.has(id))) return;
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
        const wayID = _selected?.wayID ?? _shoulder?.wayID;
        if (!wayID) return;
        if (context.mode()?.id !== 'select' || ids.length !== 1 || ids[0] !== wayID) state.clear();
    });

    // after an edit or undo, drop lanes that no longer exist (e.g. a lane was removed)
    context.history().on('change.lane-state', () => {
        if (!_selected) return;
        const way = context.hasEntity(_selected.wayID) as osmWay | undefined;
        if (!way) {
            state.clear();
            return;
        }
        const model = parseLanes(way.tags);
        const refs = _selected.refs.filter(ref => model.lanes[ref.direction][ref.index]);
        if (refs.length !== _selected.refs.length) state.select(way.id, refs);
    });

    states.set(context, state);
    return state;
}
