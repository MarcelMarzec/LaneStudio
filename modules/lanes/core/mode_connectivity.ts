import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { NodeId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { utilKeybinding } from '../../util';
import { actionConnectLanes, connectionChange, connectionNode, type ConnectChange } from '../actions/connect_lanes';
import { respot, type LaneSpot } from '../geometry/connectivity';
import { connectivityPanel } from '../ui/connectivity_panel';
import { laneConnectivity, sameSpot } from './lane_connectivity';
import { laneRouting, type RoutingFocus } from './lane_routing';
import { isDrag, roadOf } from './mode_routing';

/** The lane stretch a lane found under the pointer is on, as the nodes it runs between in the order driven */
export function spotFromFocus(graph: iD.Graph, focus: RoutingFocus | null): LaneSpot | null {
    if (focus?.kind !== 'lane') return null;
    const way = graph.hasEntity(focus.wayID) as osmWay | undefined;
    if (!way) return null;
    return { wayID: focus.wayID, ref: focus.ref, from: way.nodes[focus.from] as NodeId, to: way.nodes[focus.to] as NodeId };
}

/**
 * The Connectivity tool: every lane connection through junctions is drawn (Lane Studio's own in one colour, those
 * relations declare in another). Pointing at a lane shows its connections; clicking picks it, and clicking a lane it
 * can lead into connects the two, or disconnects them (shift-click: a connection needing a lane change). Esc lets go
 * of the lane, then leaves.
 */
export function modeLaneConnectivity(context: iD.Context) {
    const state = laneConnectivity(context);
    // the lanes layer finds the lane under the pointer for the Routing tool; this tool asks it too
    const lanes = laneRouting(context);
    const panel = connectivityPanel(context);
    const keybinding = utilKeybinding('lanes-connectivity');

    const laneAt = (event: MouseEvent): LaneSpot | null => {
        const point = context.map().mouse(event) as [number, number] | null;
        if (!point) return null;
        const road = roadOf(event.target);
        return spotFromFocus(context.graph(), lanes.laneAt(point) ?? (road ? lanes.laneAt(point, road) : null));
    };

    const flash = (key: string) => {
        // uiFlash is plain JavaScript with getter/setter overloads
        const ui = context.ui().flash as any;
        ui.iconName('#iD-icon-no').label(t(`_lanes.connectivity.${key}`))();
    };

    /** Connects the lane picked into `to`, or changes how it does, as one undo step */
    function connect(to: LaneSpot, change: ConnectChange) {
        const from = state.picked();
        if (!from) return;
        const graph = context.graph();
        const at = connectionNode(graph, from, to);
        if ('problem' in at) {
            if (at.problem === 'cannot_split') flash('cannot_split');
            else state.setPicked(sameSpot(from, to) ? null : to);
            return;
        }
        const result = connectionChange(graph, from, at.nodeID, to, change);
        if (!result.changes) {
            // taking away the last lane from one road into another is a turn restriction, not an empty relation
            if (!result.value) flash('use_restriction');
            return;
        }
        context.perform(actionConnectLanes(from, at.nodeID, to, change), t('_lanes.annotation.connect'));
        state.setPicked(respot(context.graph(), from));
    }

    function click(event: MouseEvent) {
        const spot = laneAt(event);
        const picked = state.picked();
        if (!spot) {
            state.setPicked(null);
            return;
        }
        if (!picked || sameSpot(picked, spot)) {
            state.setPicked(picked ? null : spot);
            return;
        }
        connect(spot, event.shiftKey ? 'toggle_optional' : 'toggle');
    }

    const mode = {
        id: 'lanes-connectivity',
        button: 'lanes-connectivity',
        title: t.append('_lanes.connectivity.title'),
        description: t.append('_lanes.toolbar.connectivity.tooltip'),
        enter() {
            state.setActive(true);
            keybinding.on('⎋', () => {
                if (state.picked()) state.setPicked(null);
                else context.enter(modeBrowse(context) as any);
            }, true);
            d3_select(document).call(keybinding);
            let down: [number, number] | null = null;
            context.surface()
                .on('pointerdown.lanes-connectivity', (event: PointerEvent) => {
                    down = [event.clientX, event.clientY];
                })
                .on('pointermove.lanes-connectivity', (event: PointerEvent) => {
                    state.setHovered(laneAt(event));
                })
                .on('pointerleave.lanes-connectivity', () => state.setHovered(null))
                .on('click.lanes-connectivity', (event: MouseEvent) => {
                    // a click ending a drag (panning the map) picks nothing
                    if (!isDrag(down, [event.clientX, event.clientY])) click(event);
                });
            // undo and redo can take a split road away from under the lane picked: find it again, or let go
            context.history().on('change.lanes-connectivity', () => {
                const picked = state.picked();
                if (picked) state.setPicked(respot(context.graph(), picked));
            });
            panel.show();
        },
        exit() {
            d3_select(document).call(keybinding.unbind);
            context.surface()
                .on('pointerdown.lanes-connectivity', null)
                .on('pointermove.lanes-connectivity', null)
                .on('pointerleave.lanes-connectivity', null)
                .on('click.lanes-connectivity', null);
            context.history().on('change.lanes-connectivity', null);
            panel.hide();
            state.setActive(false);
        },
        selectedIDs: () => [] as string[]
    };
    return mode;
}
