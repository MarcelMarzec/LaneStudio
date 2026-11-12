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
    // a motorroad (wiki: Key:motorroad) is for motor vehicles only
    if (tags.motorroad === 'yes' && profile === routingProfiles.bicycle) return false;
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

/**
 * A restriction via one or more ways (wiki: Relation:restriction): a route that has come from its from-road along
 * its via-ways may not turn into its to-road (`no_*`), or into any road but its to-road (`only_*`), like a U-turn
 * through the gap between the two carriageways of a dual carriageway. `path` is the ways driven, oldest first,
 * ending with the way the route is on.
 */
export function viaWayRestriction(graph: coreGraph, path: string[], toWay: osmWay, profile: RoutingProfile): string | null {
    const rules = routingProfiles[profile];
    const relations = new Set<osmRelation>();
    for (const id of path.slice(-4)) {
        const way = graph.hasEntity(id as WayId);
        if (way) for (const relation of graph.parentRelations(way) as osmRelation[]) relations.add(relation);
    }
    for (const relation of relations) {
        if (relation.tags.type !== 'restriction') continue;
        const via = relation.members.filter(m => m.role === 'via');
        if (!via.length || via.some(m => m.type !== 'way')) continue;
        // the ways driven just now are the via-ways, any order, and the one before them the from-road
        const k = via.length;
        if (path.length < k + 1) continue;
        const viaIDs = new Set<string>(via.map(m => m.id));
        const along = path.slice(-k);
        if (new Set(along).size !== k || along.some(id => !viaIDs.has(id))) continue;
        if (relation.members.find(m => m.role === 'from')?.id !== path[path.length - k - 1]) continue;
        const value = rules.except.map(key => relation.tags[`restriction:${key}`]).find(Boolean) ?? relation.tags.restriction;
        if (!value) continue;
        const except = (relation.tags.except ?? '').split(';').map(v => v.trim());
        if (rules.except.some(key => except.includes(key))) continue;
        const to = relation.members.find(m => m.role === 'to')?.id;
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


/**
 * Whether the vehicle may ride a one-way road against its direction (wiki: Key:oneway:bicycle, Key:oneway:bus): a
 * cycle with `oneway:bicycle=no`, an opposite cycle lane or track (`cycleway=opposite*`, a side's `oneway=-1|no`); a bus
 * with `oneway:bus=no` or `oneway:psv=no`
 */
export function onewayExcepted(tags: Tags, profileID: RoutingProfile): boolean {
    if (profileID === 'bicycle') {
        if (tags['oneway:bicycle'] === 'no' || /^opposite/.test(tags.cycleway ?? '')) return true;
        return ['left', 'right', 'both'].some(side => ['-1', 'no'].includes(tags[`cycleway:${side}:oneway`] ?? '') &&
            !!tags[`cycleway:${side}`] && tags[`cycleway:${side}`] !== 'no');
    }
    if (profileID === 'bus') return tags['oneway:bus'] === 'no' || tags['oneway:psv'] === 'no';
    return false;
}

/** Lanes of a way travelling one way along it: `forward` along its drawing direction */
const lanesOf = (way: osmWay, graph: coreGraph, direction: LaneDirection) => cachedLayout(way, graph).model.lanes[direction];

interface Move {
    j: number;
    toLane: number;
    angle: number;
}

/** The least distance, in metres, in which a vehicle changes lanes */
const laneChangeRoom = 30;

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
function lanesOn(junction: Junction, i: number, graph: coreGraph, profileID: RoutingProfile): Map<number, Move[]>[] {
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
    const turns = up.arrows;
    const anyTagged = turns.some(t => t.length);
    const n = upLanes.length;
    const ringTurns = onRing(i) && anyTagged ? ringArrowExits(turns, exits) : null;
    const targets = upLanes.map((_, lane) => {
        const result = new Set<number>();
        if (arms.length === 2) {
            exits.forEach(x => result.add(x.j));
        } else if (ring && !onRing(i)) {
            // into the roundabout, whatever the arrows say about where to leave it
            exits.filter(x => onRing(x.j)).forEach(x => result.add(x.j));
        } else if (ringTurns && turns[lane].length) {
            for (const value of turns[lane]) {
                const j = ringTurns.get(value);
                if (j !== undefined) result.add(j);
            }
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
            // arrows only for turns banned here (for this vehicle) are for a junction further on: the lane
            // carries on ahead too, and the banned turns stay to be shown as not allowed
            const banned = (value: string) => {
                const j = junctionRules.arrowExit(arms, up, value);
                return j >= 0 && !!restrictionAt(graph, up.way, node.id, arms[j].way, profileID);
            };
            if (turns[lane].every(banned)) {
                const straight = junctionRules.arrowExit(arms, up, 'through');
                const ahead = exits.find(x => isThrough(x.j)) ?? exits.find(x => x.j === straight);
                if (ahead) result.add(ahead.j);
            }
        } else if (anyTagged) {
            // an unmarked lane on a road with arrows carries on
            const ahead = exits.find(x => isThrough(x.j)) ?? exits.reduce<typeof exits[number] | undefined>((a, x) => (!a || Math.abs(x.angle) < Math.abs(a.angle) ? x : a), undefined);
            if (ahead) result.add(ahead.j);
        } else {
            for (const x of exits) {
                // every lane of a roundabout carries on round it, however tightly it bends
                if (onRing(i) && onRing(x.j)) {
                    result.add(x.j);
                    continue;
                }
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

/**
 * Round a roundabout, where its ways' own arrows (`turn:lanes` on the ring) say which lanes leave and which go on
 * round: each arrow to a way on, matched by order (the leftmost arrow to the leftmost way, the rightmost to the
 * rightmost), as the ring bends only slightly and its exits leave almost straight ahead, so a `right` or `through`
 * may be far from either by angle. Mappers use both `through|right` and `left|through` for "leave|go on round".
 * One way on (a road joining the ring, none leaving) takes every arrow.
 */
function ringArrowExits(turns: string[][], exits: { j: number; angle: number }[]): Map<string, number> {
    const result = new Map<string, number>();
    const ways = [...exits].sort((a, b) => b.angle - a.angle);
    if (!ways.length) return result;
    const values = [...new Set(turns.flat())].filter(v => junctionRules.idealAngle[v] !== undefined)
        .sort((a, b) => junctionRules.idealAngle[b] - junctionRules.idealAngle[a]);
    if (ways.length === 1 || values.length === 1) {
        // (a single kind of arrow: the way nearest it by angle)
        for (const value of values) {
            const ideal = junctionRules.idealAngle[value];
            const nearest = ways.reduce((best, x) => (Math.abs(x.angle - ideal) < Math.abs(best.angle - ideal) ? x : best));
            result.set(value, (ways.length === 1 ? ways[0] : nearest).j);
        }
        return result;
    }
    values.forEach((value, k) => result.set(value, ways[Math.round(k / (values.length - 1) * (ways.length - 1))].j));
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

/**
 * The lanes to enter a road by: `entries`, less those that lead on to nothing allowed at the next junction when the
 * road there is too short to change lanes on (every move from the lane is banned by a restriction for a route that
 * came along `path`), and in their place the nearest open lane that does lead on. Lanes are kept as they are where
 * the road is long enough to change lanes, or no lane leads on.
 */
function lanesThatLeadOn(graph: coreGraph, way: osmWay, from: number, step: number, direction: LaneDirection, entries: number[],
    openLanes: number[], path: string[], profileID: RoutingProfile): number[] {
    const far = nextStop(graph, way, from, step);
    if (far === from || runLength(graph, way, from, far) >= laneChangeRoom) return entries;
    const farID = way.nodes[far];
    if (!isJunctionNode(graph, farID)) return entries;
    const j = junctionOf(graph, farID);
    const arriving = j.arms.findIndex(a => a.way.id === way.id && a.nodeIndex === far && a.alongWay === step < 0);
    if (arriving < 0 || junctionRules.armLaneDirection(j.arms[arriving], true) !== direction) return entries;
    const byLane = lanesOn(j, arriving, graph, profileID);
    const leadsOn = (lane: number) => [...(byLane[lane]?.keys() ?? [])].some(k => {
        const to = j.arms[k].way;
        return !restrictionAt(graph, way, farID, to, profileID) && !viaWayRestriction(graph, path, to, profileID);
    });
    const good = entries.filter(leadsOn);
    if (good.length) return good;
    const distance = (lane: number) => Math.min(...entries.map(e => Math.abs(lane - e)));
    const others = openLanes.filter(leadsOn).sort((a, b) => distance(a) - distance(b));
    return others.length ? [others[0]] : entries;
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
    const routeKeys = new Set<string>();
    /** the lanes already explored onward from each road reached, by the roads taken to it */
    const explored = new Set<string>();
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
        /**
         * entering a roundabout from a lane with arrows: the entry's arrows lane by lane, the lane entered from, and
         * the way the vehicle was heading, which pick its exits (see ringExitFits)
         */
        ringArrows?: { lane: number; exits: Map<string, Set<number>> };
        /**
         * the roads traffic in the starting lane may have come from, that the route so far has not ruled out: a
         * route starting part way along a restriction's via-ways (on the link between the halves of a dual
         * carriageway) is held to it when every road it may have come from is
         */
        feeders: string[][];
    }

    const finish = (s: State, run: LaneRun, end: Route['end']) => {
        // a route that only goes on round a roundabout, back to where it joined, is no route
        const last = s.moves[s.moves.length - 1];
        if (end !== 'limit' && (last?.ring === 'enter' || last?.ring === 'round')) return;
        // nor is a lane that goes nowhere: the panel says so, and the ways it may not take are drawn
        if (!s.moves.length) return;
        // one route per sequence of roads: the same roads through another lane (a connection into several lanes) are the same route
        const key = `${s.moves.map(m => `${m.nodeID}>${m.toWayID}`).join(',')}:${end}`;
        if (routeKeys.has(key)) return;
        routeKeys.add(key);
        if (routes.length < limit.routes) routes.push({ runs: [...s.runs, run], moves: s.moves, length: s.length, end });
    };

    // against a one-way road the vehicle may use both ways (`oneway:bicycle=no`, a contraflow cycle lane, `oneway:bus=no`):
    // no lanes to keep to there, so it may go into any road on, or come out of it into any. Returns the ways on taken.
    const againstOneways = (s: State, run: LaneRun, j: Junction, i: number, byExit: Map<number, unknown>, length: number): number => {
        const upWay = j.arms[i].way;
        let went = 0;
        const contraflowing = !lanesOf(upWay, graph, s.enter.direction).length;
        for (const [k, down] of j.arms.entries()) {
            if (k === i || byExit.has(k)) continue;
            const downDirection = junctionRules.armLaneDirection(down, false);
            const downLanes = lanesOf(down.way, graph, downDirection).length;
            const against = !downLanes && onewayExcepted(down.way.tags, profileID);
            if (!against && !(contraflowing && downLanes)) continue;
            const path = [...s.runs.map(r => r.wayID as string), s.way.id].filter((id, n, all) => id !== all[n - 1]);
            const restriction = restrictionAt(graph, upWay, j.node.id, down.way, profileID) ?? viaWayRestriction(graph, path, down.way, profileID);
            if (restriction || !roadOpen(down.way.tags, profile)) {
                blockMove(j, upWay, down, restriction ?? 'road closed to this vehicle');
                continue;
            }
            const entry = against ? 0 : Array.from({ length: downLanes }, (_, m) => m)
                .find(m => !laneClosed(down.layout, { direction: downDirection, index: m }, down.way.tags, profile));
            if (entry === undefined) continue;
            const nextStep = down.alongWay ? 1 : -1;
            const key = `${down.way.id}:${down.nodeIndex}:${nextStep}`;
            if (s.visited.has(key)) continue;
            const moveInfo: RouteMove = {
                nodeID: j.node.id, turn: turnWord(junctionRules.signedAngle(scale(j.arms[i].direction, -1), down.direction)), toWayID: down.way.id
            };
            const moves = [...s.moves, moveInfo];
            const roads = moves.map(m => `${m.nodeID}>${m.toWayID}`).join(',');
            if (explored.has(`${roads}:${entry}`)) continue;
            explored.add(`${roads}:${entry}`);
            went++;
            explore({
                way: down.way, from: down.nodeIndex, step: nextStep,
                enter: { direction: downDirection, index: entry }, strict: false,
                runs: [...s.runs, run], moves, length: length + 3, visited: new Set([...s.visited, key]),
                ringExits: 0, ringArrows: undefined, feeders: s.feeders
            });
        }
        return went;
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
        const options = lanesOn(j, i, graph, profileID);
        const upWay = j.arms[i].way;
        // keeping to its lane at the first junction, and along a link too short to change lanes on (the stretch
        // between the two halves of a dual carriageway crossroads); after that, any lane of the road it is on
        // (round a roundabout, mapped as short ways, the lane to leave from is chosen by the exit: see ringArrows)
        const short = length - s.length < laneChangeRoom && !junctionRules.isRing(s.way);
        const lanes = s.strict || short ? [s.enter.index] : options.map((_, lane) => lane)
            .filter(lane => !laneClosed(j.arms[i].layout, { direction: s.enter.direction, index: lane }, upWay.tags, profile));
        // one way on per road reached, from the lane nearest the one driven in
        // (a lane connection may lead one lane into several: each is a way on)
        const byExit = new Map<number, { lane: number; moves: Move[] }>();
        for (const lane of lanes.sort((a, b) => Math.abs(a - s.enter.index) - Math.abs(b - s.enter.index))) {
            for (const [k, moves] of options[lane] ?? []) {
                if (!byExit.has(k)) byExit.set(k, { lane, moves });
            }
        }
        let went = 0;
        for (const [k, { lane, moves: laneMoves }] of byExit) {
            const move = laneMoves[0];
            const down = j.arms[k];
            const downDirection = junctionRules.armLaneDirection(down, false);
            // on the roundabout or not, by the roads' own tags (where a ring drawn as one closed way closes, only it meets)
            const upOnRing = junctionRules.isRing(upWay);
            const downOnRing = junctionRules.isRing(down.way);
            // leaving a roundabout: only by the exits the arrows of the lane it was entered from point to
            if (s.ringArrows && upOnRing && !downOnRing && !(s.ringArrows.exits.get(armID(down))?.has(s.ringArrows.lane) ?? true)) continue;
            // the ways driven so far, each once in a row, for restrictions via ways
            const path = [...s.runs.map(r => r.wayID as string), s.way.id].filter((id, n, all) => id !== all[n - 1]);
            let restriction = restrictionAt(graph, upWay, j.node.id, down.way, profileID) ??
                viaWayRestriction(graph, path, down.way, profileID);
            let feeders = s.feeders;
            if (!restriction && feeders.length) {
                const bans = feeders.map(chain => viaWayRestriction(graph, [...chain, ...path], down.way, profileID));
                feeders = feeders.filter((_, k) => !bans[k]);
                if (!feeders.length) restriction = bans[0];
            }
            if (restriction) {
                blockMove(j, upWay, down, restriction);
                continue;
            }
            if (!roadOpen(down.way.tags, profile)) {
                blockMove(j, upWay, down, 'road closed to this vehicle');
                continue;
            }
            // into each lane lined up, or the nearest lane open to the vehicle
            const count = lanesOf(down.way, graph, downDirection).length;
            const openLanes = Array.from({ length: count }, (_, m) => m)
                .filter(m => !laneClosed(down.layout, { direction: downDirection, index: m }, down.way.tags, profile));
            const nearest = (toLane: number) => openLanes.reduce<number | undefined>((a, m) => (a === undefined || Math.abs(m - toLane) < Math.abs(a - toLane) ? m : a), undefined);
            let entries = [...new Set(laneMoves.map(m => nearest(m.toLane)))].filter((m): m is number => m !== undefined);
            // on a stretch too short to change lanes on, a lane whose every way on is banned (a right turn lane whose
            // turn is a banned U-turn back where the route came from) is no way in: the nearest lane that leads on is
            entries = lanesThatLeadOn(graph, down.way, down.nodeIndex, down.alongWay ? 1 : -1, downDirection, entries, openLanes,
                [...path, down.way.id], profileID);
            if (!entries.length) {
                blockMove(j, upWay, down, laneClosed(down.layout, { direction: downDirection, index: move.toLane }, down.way.tags, profile) ?? 'closed');
                continue;
            }
            const nextStep = down.alongWay ? 1 : -1;
            const key = `${down.way.id}:${down.nodeIndex}:${nextStep}`;
            if (s.visited.has(key)) continue;
            const [upRing, downRing] = [upOnRing, downOnRing];
            const ring: RouteMove['ring'] = !upRing && downRing ? 'enter' : upRing && !downRing ? 'exit' : upRing ? 'round' : undefined;
            const entryLanes = j.arms[i].layout.model.lanes[s.enter.direction].map(l => parseTurn(l.values['turn:lanes'] ?? ''));
            const ringArrows = ring === 'enter' ? (entryLanes[lane]?.length ? {
                lane, exits: ringExitLanes(graph, j.node, j.arms[i], down.way, entryLanes, j.arms[i].layout.model.driveSide === 'left')
            } : undefined) : downRing ? s.ringArrows : undefined;
            // round a roundabout, count the roads leaving it that the route passes
            const passes = upRing && downRing ? j.arms.filter(a => !junctionRules.isRing(a.way) &&
                a.layout.model.lanes[junctionRules.armLaneDirection(a, false)].length).length : 0;
            const ringExits = ring === 'enter' ? 0 : s.ringExits + passes;
            const moveInfo: RouteMove = {
                nodeID: j.node.id, turn: turnWord(move.angle), ring, toWayID: down.way.id,
                ...(ring === 'exit' ? { exit: ringExits + 1 } : {})
            };
            went++;
            const moves = [...s.moves, moveInfo];
            const roads = moves.map(m => `${m.nodeID}>${m.toWayID}`).join(',');
            for (const entry of entries) {
                // (the same roads into the same lane lead on the same ways)
                if (explored.has(`${roads}:${entry}`)) continue;
                explored.add(`${roads}:${entry}`);
                explore({
                    way: down.way, from: down.nodeIndex, step: nextStep,
                    enter: { direction: downDirection, index: entry }, strict: false,
                    runs: [...s.runs, { ...run, leave: { direction: s.enter.direction, index: lane } }],
                    moves, length: length + 3, visited: new Set([...s.visited, key]), ringExits, ringArrows, feeders
                });
            }
        }
        went += againstOneways(s, run, j, i, byExit, length);
        if (!went) finish(here, run, byExit.size ? 'blocked' : 'dead_end');
    };

    const incoming = incomingRuns(graph, way, startRef, from, step, profileID);
    explore({
        way, from, step, enter: startRef, strict: true, runs: [], moves: [], length: 0,
        visited: new Set([`${way.id}:${from}:${step}`]), ringExits: 0,
        feeders: feederChains(graph, way, startRef, from, step, profileID)
    });

    return { routes: withoutRingLoops(routes), incoming, blocked };
}

/**
 * Routes cut short by the limit while going round a roundabout, where another route takes the same roads onto it and
 * leaves it: going on round is no way on of its own (every exit it would reach is a route already)
 */
function withoutRingLoops(routes: Route[]): Route[] {
    const onRing = (route: Route) => {
        const last = route.moves[route.moves.length - 1];
        return route.end === 'limit' && (last?.ring === 'enter' || last?.ring === 'round');
    };
    const roadsTo = (route: Route, k: number) => route.moves.slice(0, k + 1).map(m => `${m.nodeID}>${m.toWayID}`).join(',');
    return routes.filter(route => {
        if (!onRing(route)) return true;
        const entered = route.moves.map(m => m.ring).lastIndexOf('enter');
        if (entered < 0) return true;
        const key = roadsTo(route, entered);
        return !routes.some(other => other !== route && !onRing(other) && other.moves.length > entered + 1 &&
            roadsTo(other, entered) === key && other.moves.slice(entered + 1).some(m => m.ring === 'exit'));
    });
}

/** A point 30 m out along a road from the junction it meets at `node` (or its far end, if nearer), in lon/lat */
function farLoc(node: osmNode, arm: Arm): Vec2 {
    return metricFrame(node.loc).toLoc(pointAlong(arm.line, Math.min(30, polylineLength(arm.line))).point);
}


/** An arm's key: its way, node and direction */
const armID = (arm: Arm) => `${arm.way.id}:${arm.nodeIndex}:${arm.alongWay}`;

/**
 * Which lanes of a road entering a roundabout may leave it by each of its exits (by `armID`), from the entry's arrows.
 * On a roundabout arrows name the order of the exits rather than their angles (on five arms, the second exit is well
 * to the left yet straight on), so the exits are taken in order round the ring: a nearside arrow (`left` where
 * traffic keeps left) takes the first exit, and any sharply that way; an offside arrow the last before going back,
 * and any sharply that way; the rest are shared in order across the lanes marked straight on, the nearside lane
 * taking the first of them. A turn no lane is marked for is for the lane furthest that way (a right turn for the
 * offside lane, where traffic keeps left), as lanes are taken on the ground; going back round takes a U-turn arrow.
 */
function ringExitLanes(graph: coreGraph, node: osmNode, entry: Arm, ringWay: osmWay, lanes: string[][], nearsideLeft: boolean): Map<string, Set<number>> {
    // the ring's ways, and the roads leaving it
    const ringWays = new Set<osmWay>([ringWay]);
    const queue = [ringWay];
    while (queue.length && ringWays.size < 64) {
        const current = queue.shift()!;
        for (const id of [current.first(), current.last()]) {
            for (const next of graph.parentWays(nodeOf(graph, id)) as osmWay[]) {
                if (ringWays.has(next) || !junctionRules.isRing(next)) continue;
                ringWays.add(next);
                queue.push(next);
            }
        }
    }
    const centre = junctionRules.ringMiddle(ringWay, graph);
    const frame = metricFrame(centre);
    const inward = scale(unit(frame.toMetres(farLoc(node, entry))), -1);
    const exits: { key: string; turn: number }[] = [];
    for (const id of new Set([...ringWays].flatMap(w => w.nodes))) {
        const ringNode = nodeOf(graph, id);
        for (const arm of junctionRules.armsAt(ringNode, graph)) {
            if (junctionRules.isRing(arm.way) || !arm.layout.model.lanes[junctionRules.armLaneDirection(arm, false)].length) continue;
            const turn = junctionRules.signedAngle(inward, unit(frame.toMetres(farLoc(ringNode, arm))));
            // (nearside positive, so exits come in order round the ring from the most nearside; straight back is
            // all the way round, the last)
            const toNearside = nearsideLeft ? turn : -turn;
            exits.push({ key: armID(arm), turn: toNearside > 165 ? toNearside - 360 : toNearside });
        }
    }
    exits.sort((a, b) => b.turn - a.turn);

    // each lane's arrows as nearside, straight on, offside or back (an unmarked lane goes straight on)
    const kind = (value: string) => {
        if (value === 'reverse') return 'back';
        const ideal = junctionRules.idealAngle[value];
        if (ideal === undefined) return 'ahead';
        const toNearside = nearsideLeft ? ideal : -ideal;
        return toNearside > 20 ? 'near' : toNearside < -20 ? 'far' : 'ahead';
    };
    const kinds = lanes.map(values => new Set<string>((values.length ? values : ['through']).map(kind)));
    // lanes from the nearside one
    const order = lanes.map((_, k) => k);
    if (!nearsideLeft) order.reverse();
    const marked = (k: string) => order.filter(lane => kinds[lane].has(k));
    const nearside = order[0];
    const offside = order[order.length - 1];

    const result = new Map<string, Set<number>>();
    const middle: typeof exits = [];
    // going back: the last exit round, turning well past the offside (onto the other half of the road come along)
    const back = exits.length > 1 && exits[exits.length - 1].turn < -130 ? exits[exits.length - 1] : undefined;
    const real = exits.filter(e => e !== back);
    exits.forEach(exit => {
        let to: number[];
        if (exit === back) {
            // (only with a U-turn arrow: arrows that say where a lane goes and have none do not go back)
            to = marked('back');
        } else if (marked('near').length && (exit === real[0] && exit.turn > 20 || exit.turn > 100)) {
            to = marked('near');
        } else if (exit === real[real.length - 1] && exit.turn < -20 || exit.turn < -100) {
            to = marked('far').length ? marked('far') : [offside];
        } else if (!marked('ahead').length) {
            to = exit.turn >= 0 ? (marked('near').length ? marked('near') : [nearside]) : (marked('far').length ? marked('far') : [offside]);
        } else {
            middle.push(exit);
            return;
        }
        result.set(exit.key, new Set(to));
    });
    // the exits in between, shared in order across the lanes marked straight on
    const ahead = marked('ahead');
    middle.forEach((exit, k) => {
        const first = Math.floor(k * ahead.length / middle.length);
        const last = Math.max(first, Math.ceil((k + 1) * ahead.length / middle.length) - 1);
        result.set(exit.key, new Set(ahead.slice(first, last + 1)));
    });
    // a lane left with no exit (straight on, where the exit ahead is also the last before going back) shares those of
    // the nearest lane with an arrow of the same kind, else the nearest lane
    const exitsOf = (lane: number) => [...result.values()].filter(set => set.has(lane));
    for (const lane of order) {
        if (exitsOf(lane).length) continue;
        const others = order.filter(o => o !== lane && exitsOf(o).length)
            .sort((a, b) => Number([...kinds[b]].some(k => kinds[lane].has(k))) - Number([...kinds[a]].some(k => kinds[lane].has(k))) ||
                Math.abs(a - lane) - Math.abs(b - lane));
        if (others.length) for (const set of exitsOf(others[0])) set.add(lane);
    }
    return result;
}

/** The runs leading into a lane from the junction behind it: every lane there whose moves lead into it */
/**
 * The ways traffic in a lane may have come along, oldest first, up to `depth` ways back: each way in that
 * no restriction bans driving from, leaving out loops back through the lane's own way. Empty where nothing
 * leads in.
 */
function feederChains(graph: coreGraph, way: osmWay, ref: LaneRef, from: number, step: number, profileID: RoutingProfile,
    depth = 5): string[][] {
    const chains: string[][] = [];
    const seen = new Set<string>();
    const grow = (chain: string[], on: osmWay, onRef: LaneRef, onFrom: number, onStep: number) => {
        if (chains.length >= 64) return;
        const incoming = chain.length < depth ? incomingRuns(graph, on, onRef, onFrom, onStep, profileID) : [];
        if (!incoming.length) {
            if (chain.length) chains.push(chain);
            return;
        }
        for (const route of incoming) {
            const run = route.runs[0];
            const id = run.wayID as string;
            const key = `${[id, ...chain].join(',')}:${run.enter.index}`;
            if (id === way.id || chain.includes(id) || seen.has(key)) continue;
            seen.add(key);
            // a way in from which a restriction bans driving on along the rest
            const sequence = [id, ...chain, way.id];
            const banned = sequence.some((_, t) => t > 1 &&
                viaWayRestriction(graph, sequence.slice(0, t), graph.entity(sequence[t] as WayId) as osmWay, profileID));
            if (banned) continue;
            grow([id, ...chain], graph.entity(id as WayId) as osmWay, run.enter, run.from, run.to > run.from ? 1 : -1);
        }
    };
    grow([], way, ref, from, step);
    return chains;
}

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
        const lanes = lanesOn(j, i, graph, profileID);
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
