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

/** Whether a click ended a drag: the pointer moved more than a few pixels while pressed */
export function isDrag(down: [number, number] | null, up: [number, number]): boolean {
    return !!down && Math.hypot(up[0] - down[0], up[1] - down[1]) > 5;
}

/** The road a map element under the pointer belongs to: iD's line for it, or a shape the lanes layer drew for it */
function roadOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const datum = d3_select(target).datum() as { properties?: { entity?: unknown } } | undefined;
    const entity = (datum?.properties?.entity ?? datum) as Partial<osmWay> | undefined;
    return entity?.type === 'way' && isLaneRoad(entity as osmWay) ? entity.id as string : null;
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
            // what is under the pointer: the lane drawn there (whatever is on top of it), else a footway's or path's line
            const focusAt = (event: PointerEvent | MouseEvent): RoutingFocus | null => {
                const point = context.map().mouse(event) as [number, number] | null;
                if (!point) return focusOf(event.target);
                // over a road's own line where none of its lanes are drawn (a junction's mouth): its nearest lane
                const road = roadOf(event.target);
                return routing.laneAt(point) ?? (road ? routing.laneAt(point, road) : null) ?? focusOf(event.target);
            };
            let frame = 0;
            let down: [number, number] | null = null;
            context.surface()
                .on('pointermove.lanes-routing', (event: PointerEvent) => {
                    cancelAnimationFrame(frame);
                    frame = requestAnimationFrame(() => routing.setHovered(focusAt(event)));
                })
                .on('pointerleave.lanes-routing', () => {
                    cancelAnimationFrame(frame);
                    routing.setHovered(null);
                })
                .on('pointerdown.lanes-routing', (event: PointerEvent) => {
                    down = [event.clientX, event.clientY];
                })
                .on('click.lanes-routing', (event: MouseEvent) => {
                    // a click ending a drag (panning the map) leaves the pinned routes alone
                    if (isDrag(down, [event.clientX, event.clientY])) return;
                    // what the routes shown are from, so the click keeps what is on screen
                    cancelAnimationFrame(frame);
                    const focus = routing.hovered() ?? focusAt(event);
                    // clicking what is pinned, or empty map, lets go
                    routing.setPinned(focus && JSON.stringify(focus) !== JSON.stringify(routing.pinned()) ? focus : null);
                });
            panel.show();
        },
        exit() {
            d3_select(document).call(keybinding.unbind);
            context.surface()
                .on('pointermove.lanes-routing', null)
                .on('pointerleave.lanes-routing', null)
                .on('pointerdown.lanes-routing', null)
                .on('click.lanes-routing', null);
            panel.hide();
            routing.setActive(false);
        },
        selectedIDs: () => [] as string[]
    };
    return mode;
}
