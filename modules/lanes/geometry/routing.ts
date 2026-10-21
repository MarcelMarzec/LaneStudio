import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, WayId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { parseTurn, type LaneDirection, type LaneRef } from '../model';
import { cumulativeLengths, metricFrame, pointAlong, polylineLength, scale, unit } from './frame';
import { parseWidth, type LaneLayout } from './layout';
import { cachedLayout, junctionRules, type Arm } from './road_geometry';

/*
 * Routes through the road network, lane by lane, for the Routing tool: where a vehicle in a lane can go
 * (by its turn arrows, lane connections and turn restrictions), where traffic in it comes from, and where
 * someone walking from a footway can get to.
 */

export type RoutingProfile = 'car' | 'bus' | 'bicycle' | 'hgv';

interface Profile {
    /** access keys, most specific first (wiki: Key:access) */
    access: string[];
    /** the `except=*` values that lift a turn restriction, and the `restriction:*` suffix that adds one */
    except: string[];
    /** lane types the vehicle may drive in */
    kinds: Set<string>;
    /** metres and tonnes, checked against maxheight and maxweight */
    height: number;
    weight: number;
    /** roads the vehicle may not use at all */
    banned: Set<string>;
}

export const routingProfiles: Record<RoutingProfile, Profile> = {
    car: {
        access: ['motorcar', 'motor_vehicle', 'vehicle', 'access'], except: ['motorcar', 'motor_vehicle'],
        kinds: new Set(['general', 'hov', 'variable']), height: 1.6, weight: 2, banned: new Set()
    },
    bus: {
        access: ['bus', 'psv', 'motor_vehicle', 'vehicle', 'access'], except: ['psv', 'bus'],
        kinds: new Set(['general', 'bus', 'psv', 'hov', 'variable']), height: 4.4, weight: 18, banned: new Set()
    },
    hgv: {
        access: ['hgv', 'goods', 'motor_vehicle', 'vehicle', 'access'], except: ['hgv', 'goods'],
        kinds: new Set(['general', 'variable']), height: 4.2, weight: 38, banned: new Set()
    },
    bicycle: {
        access: ['bicycle', 'vehicle', 'access'], except: ['bicycle'],
        // UK bus lanes are open to cycles unless signed otherwise
        kinds: new Set(['general', 'bicycle', 'bus', 'psv']), height: 0, weight: 0, banned: new Set(['motorway', 'motorway_link'])
    }
};

/** A stretch of one lane along a way, between two of its nodes (`from` to `to`, in the order driven) */
export interface LaneRun {
    wayID: WayId;
    from: number;
    to: number;
    /** the lane driven into at `from`, and the lane left at `to` (a lane change in between) */
    enter: LaneRef;
    leave: LaneRef;
}

export type TurnWord = 'ahead' | 'slight_left' | 'left' | 'sharp_left' | 'slight_right' | 'right' | 'sharp_right' | 'uturn';

/** What happens at the node a run ends at: a turn into the next run, or the roundabout entered or left */
export interface RouteMove {
    nodeID: string;
    turn: TurnWord;
    ring?: 'enter' | 'round' | 'exit';
    /** leaving a roundabout: which exit, counting from where the route joined it */
    exit?: number;
    /** the road the move leads onto */
    toWayID: WayId;
}

export interface Route {
    runs: LaneRun[];
    /** one move between each two runs */
    moves: RouteMove[];
    /** metres */
    length: number;
    /** why the route stops: it went far enough, the road ends, every way on is closed to the vehicle, or no more is loaded */
    end: 'limit' | 'dead_end' | 'blocked';
}

/** A way on a vehicle may not take, and why */
export interface BlockedMove {
    nodeID: string;
    fromWayID: WayId;
    toWayID: WayId;
    /** a restriction (`no_right_turn`), a closed road or lane, or a height or weight limit */
    reason: string;
    /** the node and a point a few metres along the road it would lead onto, to draw a stub */
    at: Vec2;
    toward: Vec2;
}

export interface VehicleRoutes {
    routes: Route[];
    /** single runs leading into the starting lane from the junction behind it */
    incoming: Route[];
    blocked: BlockedMove[];
}

export interface RoutingLimits {
    /** how far each route reaches, in metres */
    length: number;
    /** how many junctions each route passes */
    junctions: number;
    /** how many routes at most */
    routes: number;
}

const defaultLimits: RoutingLimits = { length: 450, junctions: 4, routes: 40 };

/** A node by its id (ids from ways are plain strings) */
const nodeOf = (graph: coreGraph, id: string) => graph.entity(id as NodeId) as osmNode;

const closedValues = new Set(['no', 'private', 'military', 'agricultural', 'forestry']);

/** Whether a road is open to the vehicle: its access tags, most specific first, and roads it may not use */
function roadOpen(tags: Tags, profile: Profile): boolean {
    if (profile.banned.has(tags.highway ?? '')) return false;
    for (const key of profile.access) {
        const value = tags[key];
        if (value) return !closedValues.has(value);
    }
    return true;
}

/** A height or weight value in metres or tonnes (`4.2`, `14'6"`, `7.5 t`) */
function limitOf(value: string | undefined, kind: 'height' | 'weight'): number | undefined {
    if (!value || value === 'none' || value === 'default' || value === 'unsigned') return undefined;
    if (kind === 'height') return parseWidth(value.replace(/\s*m$/, ''));
    const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(t|st)?$/);
    return m ? parseFloat(m[1]) : undefined;
}

/** Why a vehicle may not drive in a lane of a road (or on the road), or null when it may */
function laneClosed(layout: LaneLayout, ref: LaneRef, tags: Tags, profile: Profile): string | null {
    const lane = layout.lanes.find(l => l.ref.direction === ref.direction && l.ref.index === ref.index);
    if (lane && !profile.kinds.has(lane.kind)) return lane.kind === 'restricted' ? 'closed lane' : `${lane.kind} lane`;
    if (lane) {
        for (const key of profile.access) {
            const value = lane.values[`${key}:lanes`];
            if (value) {
                if (closedValues.has(value)) return 'closed lane';
                break;
            }
        }
    }
    const height = Math.min(limitOf(lane?.values['maxheight:lanes'], 'height') ?? Infinity, limitOf(tags.maxheight, 'height') ?? Infinity,
        limitOf(tags['maxheight:physical'], 'height') ?? Infinity);
    if (profile.height && height < profile.height) return `height limit ${height.toFixed(1)} m`;
    const weight = Math.min(limitOf(lane?.values['maxweight:lanes'], 'weight') ?? Infinity, limitOf(tags.maxweight, 'weight') ?? Infinity,
        profile === routingProfiles.hgv ? limitOf(tags['maxweight:hgv'], 'weight') ?? Infinity : Infinity);
    if (profile.weight && weight < profile.weight) return `weight limit ${weight} t`;
    return null;
}

/**
 * The turn restriction (type=restriction, from-via-to, wiki: Relation:restriction) that bans driving from
 * one way into another at a node, or null. `only_*` bans every other way; `except=*` lifts it for the vehicle.
 */
export function restrictionAt(graph: coreGraph, fromWay: osmWay, nodeID: string, toWay: osmWay, profile: RoutingProfile): string | null {
    const rules = routingProfiles[profile];
    for (const relation of graph.parentRelations(fromWay) as osmRelation[]) {
        if (relation.tags.type !== 'restriction') continue;
        const members = relation.members;
        if (!members.some(m => m.role === 'from' && m.id === fromWay.id) || !members.some(m => m.role === 'via' && m.id === nodeID)) continue;
        const value = rules.except.map(key => relation.tags[`restriction:${key}`]).find(Boolean) ?? relation.tags.restriction;
        if (!value) continue;
        const except = (relation.tags.except ?? '').split(';').map(v => v.trim());
        if (rules.except.some(key => except.includes(key))) continue;
        const to = members.find(m => m.role === 'to')?.id;
        if (value.startsWith('no_') && to === toWay.id) return value;
        if (value.startsWith('only_') && to !== toWay.id) return value;
    }
    return null;
}

function turnWord(angle: number): TurnWord {
    const a = Math.abs(angle);
    if (a <= 25) return 'ahead';
    if (a > 165) return 'uturn';
    const side = angle > 0 ? 'left' : 'right';
    if (a <= 55) return `slight_${side}`;
    if (a <= 135) return side;
    return `sharp_${side}`;
}

/** The way an arm heads overall, from the node to a point 30 m out (its first metres may curve, round a roundabout) */
const heading = (arm: Arm): Vec2 => unit(pointAlong(arm.line, Math.min(30, polylineLength(arm.line))).point);

/** Lanes of a way travelling one way along it: `forward` along its drawing direction */
const lanesOf = (way: osmWay, graph: coreGraph, direction: LaneDirection) => cachedLayout(way, graph).model.lanes[direction];

interface Move {
    j: number;
    toLane: number;
    angle: number;
}

interface Junction {
    node: osmNode;
    arms: Arm[];
    through: [number, number] | null;
    /** the node is on a roundabout, its two halves running through */
    ring: boolean;
}

function junctionOf(graph: coreGraph, nodeID: string): Junction {
    const node = nodeOf(graph, nodeID);
    const arms = junctionRules.armsAt(node, graph);
    const through = arms.length >= 3 ? junctionRules.throughPair(arms) : null;
    const ring = !!through && through.every(k => junctionRules.isRing(arms[k].way));
    return { node, arms, through, ring };
}

/**
 * Where a lane arriving at a junction on arm `i` can go: into which roads and lanes. A lane connection
 * (type=connectivity) says exactly; otherwise the lane's turn arrows pick the roads, and unmarked lanes may
 * turn to the side they are on (left turns from the left half of the road, right from the right) or go ahead.
 * Lanes entering a roundabout all join it; the ring's lanes may go round or leave from its outer side.
 */
function lanesOn(junction: Junction, i: number, graph: coreGraph): Map<number, Move[]>[] {
    const { arms, through, ring, node } = junction;
    const up = arms[i];
    const upDirection = junctionRules.armLaneDirection(up, true);
    const upLanes = up.layout.model.lanes[upDirection];
    const exits = arms.map((down, j) => ({ down, j, angle: junctionRules.signedAngle(scale(up.direction, -1), down.direction) }))
        .filter(x => x.j !== i && x.down.layout.model.lanes[junctionRules.armLaneDirection(x.down, false)].length);
    const isThrough = (j: number) => !!through && through.includes(i) && through.includes(j);
    const onRing = (k: number) => ring && !!through && through.includes(k);
    const nearsideLeft = up.layout.model.driveSide === 'left';

    // which roads each lane may turn into
    const turns = upLanes.map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
    const anyTagged = turns.some(t => t.length);
    const n = upLanes.length;
    const targets = upLanes.map((_, lane) => {
        const result = new Set<number>();
        if (arms.length === 2) {
            exits.forEach(x => result.add(x.j));
        } else if (ring && !onRing(i)) {
            // into the roundabout, whatever the arrows say about where to leave it
            exits.filter(x => onRing(x.j)).forEach(x => result.add(x.j));
        } else if (turns[lane].length) {
            for (const value of turns[lane]) {
                const ideal = junctionRules.idealAngle[value];
                if (ideal === undefined) continue;
                let best: { j: number; d: number } | null = null;
                for (const x of exits) {
                    const d = Math.abs(((x.angle - ideal + 540) % 360) - 180);
                    if (!best || d < best.d) best = { j: x.j, d };
                }
                if (best && best.d < 70) result.add(best.j);
            }
        } else if (anyTagged) {
            // an unmarked lane on a road with arrows carries on
            const ahead = exits.find(x => isThrough(x.j)) ?? exits.reduce<typeof exits[number] | undefined>((a, x) => (!a || Math.abs(x.angle) < Math.abs(a.angle) ? x : a), undefined);
            if (ahead) result.add(ahead.j);
        } else {
            for (const x of exits) {
                // turning back, onto the other half of a dual carriageway, needs an arrow that says so
                if (Math.abs(x.angle) > 140) continue;
                // round a roundabout every exit is to the nearside: left in left-hand traffic
                const left = onRing(i) && !onRing(x.j) ? nearsideLeft : x.angle > 35;
                const right = onRing(i) && !onRing(x.j) ? !nearsideLeft : x.angle < -35;
                if (left && lane >= Math.ceil(n / 2) && n > 1) continue;
                if (right && lane < Math.floor(n / 2)) continue;
                result.add(x.j);
            }
        }
        return result;
    });

    // which lane of each road: a lane connection, else lined up as the junction's guide lines are
    const result: Map<number, Move[]>[] = upLanes.map(() => new Map());
    for (const x of exits) {
        const downCount = x.down.layout.model.lanes[junctionRules.armLaneDirection(x.down, false)].length;
        const relation = up.isEnd && x.down.isEnd ? junctionRules.connectivityRelation(graph, up.way.id, node.id, x.down.way.id) : undefined;
        let pairs: { from: number; to: number }[];
        if (relation) {
            pairs = junctionRules.relationPairs(relation);
        } else {
            const fromLanes = upLanes.map((_, lane) => lane).filter(lane => targets[lane].has(x.j));
            if (!fromLanes.length) continue;
            const alignLeft = ring && onRing(i) !== onRing(x.j) ? nearsideLeft : x.angle > 0;
            pairs = arms.length === 2 ? junctionRules.continuationPairs(graph, up, x.down, node.id, true)
                : isThrough(x.j) && !ring ? junctionRules.continuationPairs(graph, up, x.down, node.id, false)
                    : junctionRules.zipLanes(fromLanes, downCount, alignLeft);
            // a lane allowed in but missing from the pairs (a lane dropped, or a turn the arrows do not line up) takes the nearest lane
            for (const lane of fromLanes) {
                if (pairs.some(p => p.from === lane)) continue;
                const to = x.angle > 35 ? 0 : x.angle < -35 ? downCount - 1 : Math.min(lane, downCount - 1);
                pairs.push({ from: lane, to });
            }
        }
        for (const p of pairs) {
            if (p.from < 0 || p.from >= upLanes.length || p.to < 0 || p.to >= downCount) continue;
            const moves = result[p.from].get(x.j) ?? [];
            moves.push({ j: x.j, toLane: p.to, angle: x.angle });
            result[p.from].set(x.j, moves);
        }
    }
    return result;
}

/** The arm a run along `way` ends on at node index `to`, travelling `step` (+1 along the way, -1 against) */
function arrivalArm(arms: Arm[], wayID: string, to: number, step: number): number {
    return arms.findIndex(a => a.way.id === wayID && a.nodeIndex === to && a.alongWay === step < 0);
}

/** Whether a node is somewhere a route has a choice to make, or a road changes: more than one road meets there */
function isJunctionNode(graph: coreGraph, nodeID: string): boolean {
    return graph.parentWays(nodeOf(graph, nodeID)).filter(isLaneRoad).length > 1;
}

/** From node index `from`, along the way in `step`, to the next node where roads meet or the way ends */
function nextStop(graph: coreGraph, way: osmWay, from: number, step: number): number {
    let k = from + step;
    while (k > 0 && k < way.nodes.length - 1 && !isJunctionNode(graph, way.nodes[k])) k += step;
    return Math.max(0, Math.min(way.nodes.length - 1, k));
}

function runLength(graph: coreGraph, way: osmWay, from: number, to: number): number {
    const frame = metricFrame(nodeOf(graph, way.nodes[from]).loc);
    const [a, b] = from < to ? [from, to] : [to, from];
    const points = way.nodes.slice(a, b + 1).map(id => frame.toMetres(nodeOf(graph, id).loc));
    const lengths = cumulativeLengths(points);
    return lengths[lengths.length - 1];
}

const directionOf = (step: number): LaneDirection => (step > 0 ? 'forward' : 'backward');

/**
 * Every route a vehicle in a lane can take: from the lane's stretch of road (between node indexes `from` and
 * `to`, in the order driven), through the junctions ahead, up to the limits. The vehicle keeps to its lane
 * at the first junction; after that it may change lanes, so the routes branch wherever any lane of the road
 * it is on could go. Also the lanes that lead into it from the junction behind, and the ways on it may not take.
 */
export function vehicleRoutes(graph: coreGraph, wayID: WayId, ref: LaneRef, from: number, to: number,
    profileID: RoutingProfile = 'car', limits: Partial<RoutingLimits> = {}): VehicleRoutes {
    const limit = { ...defaultLimits, ...limits };
    const profile = routingProfiles[profileID];
    const routes: Route[] = [];
    const blocked: BlockedMove[] = [];
    const blockedKeys = new Set<string>();
    const way = graph.entity(wayID) as osmWay;
    const step = from <= to ? 1 : -1;
    const startRef: LaneRef = ref.direction === 'both_ways' ? { direction: directionOf(step), index: 0 } : ref;
    const junctions = new Map<string, Junction>();
    const junction = (nodeID: string) => {
        let j = junctions.get(nodeID);
        if (!j) junctions.set(nodeID, j = junctionOf(graph, nodeID));
        return j;
    };
    const blockMove = (j: Junction, upWay: osmWay, down: Arm, reason: string) => {
        const key = `${j.node.id}:${upWay.id}:${down.way.id}:${down.nodeIndex}:${down.alongWay}`;
        if (blockedKeys.has(key)) return;
        blockedKeys.add(key);
        const frame = metricFrame(j.node.loc);
        blocked.push({
            nodeID: j.node.id, fromWayID: upWay.id, toWayID: down.way.id, reason,
            at: j.node.loc, toward: frame.toLoc(scale(down.direction, 10))
        });
    };

    interface State {
        way: osmWay;
        from: number;
        step: number;
        enter: LaneRef;
        strict: boolean;
        runs: LaneRun[];
        moves: RouteMove[];
        length: number;
        visited: Set<string>;
        ringExits: number;
        /** entering a roundabout from a lane with arrows: the arrows, and the way the vehicle was heading, which pick its exits */
        ringArrows?: { values: string[]; heading: Vec2 };
    }

    const finish = (s: State, run: LaneRun, end: Route['end']) => {
        // a route that only goes on round a roundabout, back to where it joined, is no route
        const last = s.moves[s.moves.length - 1];
        if (end !== 'limit' && (last?.ring === 'enter' || last?.ring === 'round')) return;
        // nor is a lane that goes nowhere: the panel says so, and the ways it may not take are drawn
        if (!s.moves.length) return;
        if (routes.length < limit.routes) routes.push({ runs: [...s.runs, run], moves: s.moves, length: s.length, end });
    };

    const explore = (s: State) => {
        if (routes.length >= limit.routes) return;
        const stop = s.runs.length === 0 ? to : nextStop(graph, s.way, s.from, s.step);
        const length = s.length + runLength(graph, s.way, s.from, stop);
        const here: State = { ...s, length };
        const run: LaneRun = { wayID: s.way.id, from: s.from, to: stop, enter: s.enter, leave: s.enter };
        if (stop === s.from) return finish(here, run, 'dead_end');
        // (going round a roundabout is not a junction of its own)
        const decisions = s.moves.filter(m => m.ring !== 'round' && m.ring !== 'exit').length;
        if (length >= limit.length || decisions >= limit.junctions) return finish(here, run, 'limit');

        const j = junction(s.way.nodes[stop]);
        const i = arrivalArm(j.arms, s.way.id, stop, s.step);
        if (i < 0) return finish(here, run, 'dead_end');
        const options = lanesOn(j, i, graph);
        const upWay = j.arms[i].way;
        // keeping to its lane at the first junction; after that, any lane of the road it is on
        const lanes = s.strict ? [s.enter.index] : options.map((_, lane) => lane)
            .filter(lane => !laneClosed(j.arms[i].layout, { direction: s.enter.direction, index: lane }, upWay.tags, profile));
        // one way on per road reached, from the lane nearest the one driven in
        const byExit = new Map<number, { lane: number; move: Move }>();
        for (const lane of lanes.sort((a, b) => Math.abs(a - s.enter.index) - Math.abs(b - s.enter.index))) {
            for (const [k, moves] of options[lane] ?? []) {
                if (!byExit.has(k)) byExit.set(k, { lane, move: moves[0] });
            }
        }
        let went = 0;
        for (const [k, { lane, move }] of byExit) {
            const down = j.arms[k];
            const downDirection = junctionRules.armLaneDirection(down, false);
            // on the roundabout or not, by the roads' own tags (where a ring drawn as one closed way closes, only it meets)
            const upOnRing = junctionRules.isRing(upWay);
            const downOnRing = junctionRules.isRing(down.way);
            // leaving a roundabout: only by the exits the arrows of the lane it was entered from point to
            if (s.ringArrows && upOnRing && !downOnRing) {
                const bearing = junctionRules.signedAngle(s.ringArrows.heading, heading(down));
                const fits = s.ringArrows.values.some(value => {
                    const ideal = junctionRules.idealAngle[value];
                    // going back the way it came takes a U-turn arrow
                    if (Math.abs(bearing) > 150) return value === 'reverse';
                    return ideal !== undefined && Math.abs(((bearing - ideal + 540) % 360) - 180) < 75;
                });
                if (!fits) continue;
            }
            const restriction = restrictionAt(graph, upWay, j.node.id, down.way, profileID);
            if (restriction) {
                blockMove(j, upWay, down, restriction);
                continue;
            }
            if (!roadOpen(down.way.tags, profile)) {
                blockMove(j, upWay, down, 'road closed to this vehicle');
                continue;
            }
            // into the lane lined up, or the nearest lane open to the vehicle
            const count = lanesOf(down.way, graph, downDirection).length;
            const open = Array.from({ length: count }, (_, m) => m)
                .filter(m => !laneClosed(down.layout, { direction: downDirection, index: m }, down.way.tags, profile))
                .sort((a, b) => Math.abs(a - move.toLane) - Math.abs(b - move.toLane));
            if (!open.length) {
                blockMove(j, upWay, down, laneClosed(down.layout, { direction: downDirection, index: move.toLane }, down.way.tags, profile) ?? 'closed');
                continue;
            }
            const nextStep = down.alongWay ? 1 : -1;
            const key = `${down.way.id}:${down.nodeIndex}:${nextStep}`;
            if (s.visited.has(key)) continue;
            const [upRing, downRing] = [upOnRing, downOnRing];
            const ring: RouteMove['ring'] = !upRing && downRing ? 'enter' : upRing && !downRing ? 'exit' : upRing ? 'round' : undefined;
            const arrows = parseTurn(j.arms[i].layout.model.lanes[s.enter.direction][lane]?.values['turn:lanes'] ?? '');
            const ringArrows = ring === 'enter' ? (arrows.length ? { values: arrows, heading: scale(heading(j.arms[i]), -1) } : undefined)
                : downRing ? s.ringArrows : undefined;
            // round a roundabout, count the roads leaving it that the route passes
            const passes = upRing && downRing ? j.arms.filter(a => !junctionRules.isRing(a.way) &&
                a.layout.model.lanes[junctionRules.armLaneDirection(a, false)].length).length : 0;
            const ringExits = ring === 'enter' ? 0 : s.ringExits + passes;
            const moveInfo: RouteMove = {
                nodeID: j.node.id, turn: turnWord(move.angle), ring, toWayID: down.way.id,
                ...(ring === 'exit' ? { exit: ringExits + 1 } : {})
            };
            went++;
            explore({
                way: down.way, from: down.nodeIndex, step: nextStep,
                enter: { direction: downDirection, index: open[0] }, strict: false,
                runs: [...s.runs, { ...run, leave: { direction: s.enter.direction, index: lane } }],
                moves: [...s.moves, moveInfo], length: length + 3, visited: new Set([...s.visited, key]), ringExits, ringArrows
            });
        }
        if (!went) finish(here, run, byExit.size ? 'blocked' : 'dead_end');
    };

    explore({
        way, from, step, enter: startRef, strict: true, runs: [], moves: [], length: 0,
        visited: new Set([`${way.id}:${from}:${step}`]), ringExits: 0
    });

    return { routes, incoming: incomingRuns(graph, way, startRef, from, step, profileID), blocked };
}

/** The runs leading into a lane from the junction behind it: every lane there whose moves lead into it */
function incomingRuns(graph: coreGraph, way: osmWay, ref: LaneRef, from: number, step: number, profileID: RoutingProfile): Route[] {
    const nodeID = way.nodes[from];
    if (!isJunctionNode(graph, nodeID) && from !== 0 && from !== way.nodes.length - 1) return [];
    const j = junctionOf(graph, nodeID);
    const departing = j.arms.findIndex(a => a.way.id === way.id && a.nodeIndex === from && a.alongWay === step > 0);
    if (departing < 0) return [];
    const result: Route[] = [];
    const profile = routingProfiles[profileID];
    j.arms.forEach((up, i) => {
        if (i === departing) return;
        const upDirection = junctionRules.armLaneDirection(up, true);
        const lanes = lanesOn(j, i, graph);
        const into = lanes.map((byExit, lane) => ({ lane, moves: byExit.get(departing) ?? [] })).filter(x => x.moves.length);
        // lanes lined up with this one, else any lane leading onto the road (it can change lanes after)
        const exact = into.filter(x => x.moves.some(m => m.toLane === ref.index));
        const chosen = (exact.length ? exact : into)
            .filter(x => !laneClosed(up.layout, { direction: upDirection, index: x.lane }, up.way.tags, profile));
        if (!chosen.length || restrictionAt(graph, up.way, nodeID, way, profileID)) return;
        const back = up.alongWay ? 1 : -1;
        const start = nextStop(graph, up.way, up.nodeIndex, back);
        for (const x of chosen) {
            const laneRef: LaneRef = { direction: upDirection, index: x.lane };
            result.push({
                runs: [{ wayID: up.way.id, from: start, to: up.nodeIndex, enter: laneRef, leave: laneRef }],
                moves: [{ nodeID, turn: turnWord(x.moves[0].angle), toWayID: way.id }],
                length: runLength(graph, up.way, start, up.nodeIndex), end: 'limit'
            });
        }
    });
    return result;
}


/* ---------- walking ---------- */

const footHighways = new Set(['footway', 'path', 'pedestrian', 'steps', 'bridleway', 'track', 'living_street', 'cycleway', 'corridor']);
const quietRoads = new Set(['residential', 'service', 'unclassified', 'living_street', 'road']);

/** Whether people can walk along a way: paths, quiet streets, and roads with a pavement mapped on them */
export function walkable(way: osmWay): boolean {
    const tags = way.tags;
    const highway = tags.highway ?? '';
    if (!highway || highway === 'motorway' || highway === 'motorway_link') return false;
    if (tags.foot === 'no' || tags.foot === 'private') return false;
    if (tags.foot === 'yes' || tags.foot === 'designated' || tags.foot === 'permissive') return true;
    if (closedValues.has(tags.access ?? '')) return false;
    if (highway === 'cycleway') return tags.foot !== undefined || tags.segregated !== undefined;
    if (footHighways.has(highway) || quietRoads.has(highway)) return true;
    const pavement = ['sidewalk', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right']
        .map(key => tags[key]).some(v => v && !['no', 'none', 'separate'].includes(v));
    return pavement;
}

export interface WalkSegment {
    wayID: WayId;
    /** the stretch walked, as map points, from nearer the start to further away */
    points: Vec2[];
}

export interface WalkingRoutes {
    segments: WalkSegment[];
    /** crossings reached: nodes tagged as crossings, and crossing paths */
    crossings: Vec2[];
    /** names of the streets and paths reached */
    reached: string[];
    /** metres */
    reach: number;
}

/**
 * Where someone walking from a way can get to within `reach` metres, along footways, paths, quiet streets and
 * pavements, across crossings: the shortest walk to each point, as the stretches of way walked.
 */
export function walkingRoutes(graph: coreGraph, wayID: WayId, reach = 250): WalkingRoutes {
    const start = graph.entity(wayID) as osmWay;
    const dist = new Map<string, number>();
    const queue: { nodeID: string; d: number }[] = [];
    for (const id of start.nodes) {
        dist.set(id, 0);
        queue.push({ nodeID: id, d: 0 });
    }
    const segments: WalkSegment[] = [];
    const seenSegments = new Set<string>();
    const crossings: Vec2[] = [];
    const crossingSeen = new Set<string>();
    const reached = new Set<string>();
    const loc = (id: string) => nodeOf(graph, id).loc;

    // the start way itself, walked whole
    segments.push({ wayID, points: start.nodes.map(loc) });
    if (start.tags.name) reached.add(start.tags.name);

    while (queue.length) {
        queue.sort((a, b) => a.d - b.d);
        const { nodeID, d } = queue.shift()!;
        if (d > (dist.get(nodeID) ?? Infinity)) continue;
        const node = nodeOf(graph, nodeID);
        if ((node.tags.highway === 'crossing' || node.tags.crossing) && !crossingSeen.has(nodeID)) {
            crossingSeen.add(nodeID);
            crossings.push(node.loc);
        }
        for (const way of graph.parentWays(node) as osmWay[]) {
            if (!walkable(way)) continue;
            way.nodes.forEach((id, i) => {
                if (id !== nodeID) return;
                for (const step of [1, -1]) {
                    const k = i + step;
                    if (k < 0 || k >= way.nodes.length) continue;
                    const nextID = way.nodes[k];
                    const frame = metricFrame(node.loc);
                    const p = frame.toMetres(loc(nextID));
                    const length = Math.hypot(p[0], p[1]);
                    const key = `${way.id}:${Math.min(i, k)}`;
                    const remaining = reach - d;
                    if (remaining <= 0) continue;
                    if (!seenSegments.has(key)) {
                        seenSegments.add(key);
                        const t = Math.min(1, remaining / Math.max(length, 1e-6));
                        segments.push({ wayID: way.id, points: [node.loc, frame.toLoc(scale(p, t))] });
                        if (way.tags.name) reached.add(way.tags.name);
                        if (way.tags.footway === 'crossing' && !crossingSeen.has(way.id)) {
                            crossingSeen.add(way.id);
                            crossings.push(frame.toLoc(scale(p, 0.5 * t)));
                        }
                    }
                    const nd = d + length;
                    if (nd < (dist.get(nextID) ?? Infinity) && nd <= reach) {
                        dist.set(nextID, nd);
                        queue.push({ nodeID: nextID, d: nd });
                    }
                }
            });
        }
    }
    return { segments, crossings, reached: [...reached], reach };
}

/** Words for a move, for the routes list: "left onto Spalding Road", "2nd exit onto John Adams Way" */
export function describeMove(move: RouteMove, graph: coreGraph): { turn: string; road: string } {
    const way = graph.hasEntity(move.toWayID) as osmWay | undefined;
    const road = way?.tags.name ?? way?.tags.ref ?? way?.tags.highway?.replace(/_/g, ' ') ?? 'road';
    if (move.ring === 'enter') return { turn: 'enter the roundabout', road };
    if (move.ring === 'round') return { turn: 'round the roundabout', road };
    if (move.ring === 'exit') {
        const n = move.exit ?? 1;
        const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
        return { turn: `${n}${suffix} exit`, road };
    }
    return { turn: move.turn.replace('_', ' '), road };
}
