import { t } from '../../core/localizer';
import type { osmWay } from '../../osm/way';
import { uiCmd } from '../../ui/cmd';
import { utilKeybinding } from '../../util/keybinding';
import { select as d3_select } from 'd3-selection';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from './drive_side';
import { laneState } from './lane_state';
import { laneTools } from './lane_tools';
import { parseLanes, laneRefsInWayOrder, laneCount, removeLane, sameLaneRef } from '../model';

/**
 * Keyboard and edit-menu behaviour while lanes are selected:
 * Delete removes the selected lanes (not the road), `[` and `]` step to the lane left or right,
 * and the edit menu hides "Delete" so the road cannot be deleted by accident.
 */
export function laneKeys(context: iD.Context) {
    const state = laneState(context);
    const keybinding = utilKeybinding('lanes');

    const active = () => {
        const selected = state.selected();
        return selected && context.mode()?.id === 'select' ? selected : null;
    };

    context.operationFilter(operation => !(active() && operation.id === 'delete'));

    // capture phase, so this runs before iD's own delete shortcut and can stop it;
    // capture also sees typing in text fields, which must be left alone
    const handle = (fn: () => void) => (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable)) return;
        if (!active()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        fn();
    };

    const removeSelected = () => {
        const selected = active()!;
        const way = context.entity(selected.wayID) as osmWay;
        const model = parseLanes(way.tags, { driveSide: laneDriveSide(way, context.graph()) });
        if (selected.refs.length >= laneCount(model)) return;   // a road keeps at least one lane
        // remove from the end of each direction first, so earlier indexes stay valid
        const refs = [...selected.refs].sort((a, b) => b.index - a.index);
        context.perform(actionChangeLanes(way.id, m => refs.reduce((acc, ref) => removeLane(acc, ref), m)),
            t('_lanes.annotation.remove_lane'));
        state.clear();
    };

    const step = (by: number) => () => {
        const selected = active()!;
        const way = context.entity(selected.wayID) as osmWay;
        const order = laneRefsInWayOrder(parseLanes(way.tags, { driveSide: laneDriveSide(way, context.graph()) }));
        const i = order.findIndex(ref => sameLaneRef(ref, selected.refs[selected.refs.length - 1]));
        const next = order[Math.max(0, Math.min(order.length - 1, i + by))];
        if (next) state.select(way.id, [next]);
    };

    // Esc leaves a tool first (keeping the selection); a second Esc is iD's own
    const tools = laneTools(context);
    keybinding.on('⎋', (event: KeyboardEvent) => {
        if (tools.tool() === 'select') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        tools.setTool('select');
    }, true);

    keybinding
        .on(['⌫', '⌦', uiCmd('⌘⌫'), uiCmd('⌘⌦')], handle(removeSelected), true)
        .on('[', handle(step(-1)), true)
        .on(']', handle(step(1)), true);

    d3_select(document).call(keybinding);
}
