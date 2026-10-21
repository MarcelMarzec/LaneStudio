import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { utilKeybinding } from '../../util';
import { walkable } from '../geometry/routing';
import type { LaneRef } from '../model';
import { routingPanel } from '../ui/routing_panel';
import { isLaneRoad } from './roads';
import { laneRouting, type RoutingFocus } from './lane_routing';

/** The datum of a lane drawn by the lanes layer (see drawTargets in svg/lanes.ts) */
interface LaneDatum {
    wayID: WayId;
    ref: LaneRef;
    routeFrom: number;
    routeTo: number;
}

/** What a map element under the pointer gives routes from: a lane, or a footway, path or pavement */
function focusOf(target: EventTarget | null): RoutingFocus | null {
    if (!(target instanceof Element)) return null;
    const datum = d3_select(target).datum() as unknown;
    if (!datum || typeof datum !== 'object') return null;
    const lane = datum as Partial<LaneDatum>;
    if (lane.wayID && lane.ref && lane.routeFrom !== undefined && lane.routeTo !== undefined) {
        return { kind: 'lane', wayID: lane.wayID, ref: lane.ref, from: lane.routeFrom, to: lane.routeTo };
    }
    // iD's own lines carry their way; the lanes layer's paths carry it in `properties.entity`
    const entity = ((datum as { properties?: { entity?: unknown } }).properties?.entity ?? datum) as Partial<osmWay>;
    if (entity.type === 'way' && entity.id && !isLaneRoad(entity as osmWay) && walkable(entity as osmWay)) {
        return { kind: 'walk', wayID: entity.id as WayId };
    }
    return null;
}

/**
 * The Routing tool: editing is off, and hovering over a lane or a footway shows the routes through it (drawn by
 * the lanes layer, listed in a panel). Clicking keeps them on screen; Esc goes back to selecting.
 */
export function modeLaneRouting(context: iD.Context) {
    const routing = laneRouting(context);
    const panel = routingPanel(context);
    const keybinding = utilKeybinding('lanes-routing');

    const mode = {
        id: 'lanes-routing',
        button: 'lanes-routing',
        title: t.append('_lanes.routing.title'),
        description: t.append('_lanes.toolbar.routing.tooltip'),
        enter() {
            routing.setActive(true);
            keybinding.on('⎋', () => {
                if (routing.pinned()) routing.setPinned(null);
                else context.enter(modeBrowse(context) as any);
            }, true);
            d3_select(document).call(keybinding);
            context.surface()
                .on('pointerover.lanes-routing', (event: PointerEvent) => routing.setHovered(focusOf(event.target)))
                .on('pointerleave.lanes-routing', () => routing.setHovered(null))
                .on('click.lanes-routing', (event: MouseEvent) => {
                    const focus = focusOf(event.target);
                    // clicking what is pinned, or empty map, lets go
                    routing.setPinned(focus && JSON.stringify(focus) !== JSON.stringify(routing.pinned()) ? focus : null);
                });
            panel.show();
        },
        exit() {
            d3_select(document).call(keybinding.unbind);
            context.surface()
                .on('pointerover.lanes-routing', null)
                .on('pointerleave.lanes-routing', null)
                .on('click.lanes-routing', null);
            panel.hide();
            routing.setActive(false);
        },
        selectedIDs: () => [] as string[]
    };
    return mode;
}
