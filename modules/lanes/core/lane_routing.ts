import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { WayId } from '../../osm';
import { vehicleRoutes, walkingRoutes, type RoutingProfile, type VehicleRoutes, type WalkingRoutes } from '../geometry/routing';
import type { LaneRef } from '../model';

/** What the routes are drawn from: a lane on a stretch of road (node indexes, in the order driven), or a footway */
export type RoutingFocus =
    | { kind: 'lane'; wayID: WayId; ref: LaneRef; from: number; to: number }
    | { kind: 'walk'; wayID: WayId };

export interface LaneRouting {
    /** the Routing tool is in use */
    active(): boolean;
    setActive(active: boolean): void;
    profile(): RoutingProfile;
    setProfile(profile: RoutingProfile): void;
    /** what the pointer is over, and what a click pinned (shown until another click or Esc) */
    hovered(): RoutingFocus | null;
    setHovered(focus: RoutingFocus | null): void;
    pinned(): RoutingFocus | null;
    setPinned(focus: RoutingFocus | null): void;
    /** the pinned focus, else the hovered one */
    focus(): RoutingFocus | null;
    /** the lane drawn at a point on screen, found by the lanes layer (whatever else is drawn on top of it); given a way, its nearest lane */
    laneAt(point: [number, number], wayID?: string): RoutingFocus | null;
    setLaneLocator(locator: ((point: [number, number], wayID?: string) => RoutingFocus | null) | null): void;
    on(type: `change${string}`, listener: (() => void) | null): LaneRouting;
}

const sameFocus = (a: RoutingFocus | null, b: RoutingFocus | null) => JSON.stringify(a) === JSON.stringify(b);

const routingByContext = new WeakMap<iD.Context, LaneRouting>();

/** The Routing tool's state, one per iD context */
export function laneRouting(context: iD.Context): LaneRouting {
    const existing = routingByContext.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    let _active = false;
    let _profile: RoutingProfile = 'car';
    let _hovered: RoutingFocus | null = null;
    let _pinned: RoutingFocus | null = null;
    let _locator: ((point: [number, number], wayID?: string) => RoutingFocus | null) | null = null;
    const changed = () => dispatch.call('change', routing);

    const routing: LaneRouting = {
        active: () => _active,
        setActive(active) {
            if (_active === active) return;
            _active = active;
            _hovered = null;
            _pinned = null;
            context.container().classed('lanes-routing', active);
            changed();
        },
        profile: () => _profile,
        setProfile(profile) {
            _profile = profile;
            changed();
        },
        hovered: () => _hovered,
        setHovered(focus) {
            if (sameFocus(focus, _hovered)) return;
            _hovered = focus;
            changed();
        },
        pinned: () => _pinned,
        setPinned(focus) {
            if (sameFocus(focus, _pinned)) return;
            _pinned = focus;
            changed();
        },
        focus: () => _pinned ?? _hovered,
        laneAt: (point, wayID) => _locator?.(point, wayID) ?? null,
        setLaneLocator(locator) {
            _locator = locator;
        },
        on(type, listener) {
            dispatch.on(type as 'change', listener as () => void);
            return routing;
        }
    };

    routingByContext.set(context, routing);
    return routing;
}


export type FocusRoutes =
    | { kind: 'lane'; focus: Extract<RoutingFocus, { kind: 'lane' }>; result: VehicleRoutes }
    | { kind: 'walk'; focus: Extract<RoutingFocus, { kind: 'walk' }>; result: WalkingRoutes };

let _memo: { graph: unknown; key: string; value: FocusRoutes | null } | null = null;

/** The routes from a focus for a vehicle, worked out once per graph, focus and vehicle (the map and the panel both ask) */
export function routesFor(graph: iD.Graph, focus: RoutingFocus | null, profile: RoutingProfile): FocusRoutes | null {
    const key = JSON.stringify([focus, profile]);
    if (_memo && _memo.graph === graph && _memo.key === key) return _memo.value;
    let value: FocusRoutes | null = null;
    if (focus && graph.hasEntity(focus.wayID)) {
        value = focus.kind === 'lane'
            ? { kind: 'lane', focus, result: vehicleRoutes(graph, focus.wayID, focus.ref, focus.from, focus.to, profile) }
            : { kind: 'walk', focus, result: walkingRoutes(graph, focus.wayID) };
    }
    _memo = { graph, key, value };
    return value;
}

/** One colour per route, matched between the map and the routes list; they stand out on a dark road surface */
export const routeColours = ['#ffb000', '#4cc9f0', '#f72585', '#7bd389', '#b388ff', '#ff6b35', '#00d1b2', '#ffd6e0'];
