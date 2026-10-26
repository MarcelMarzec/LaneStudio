import { difference, union } from 'polyclip-ts';

import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, WayId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import {
    metricFrame, sub, add, scale, rightNormal, len, unit,
    dot, pointAlong, slicePolyline, offsetPolyline, cumulativeLengths, polylineLength, pointInPolygon, type MetricFrame
} from './frame';
import { laneLayout, parseWidth, type LaneLayout, type ParkingLayout, type RoadsideKind } from './layout';
import { hull, turningHead } from './turning_head';
import { parseTurn, parseConnectivity, type LaneDirection } from '../model';

// Longest distance a road is pulled back from a junction, in metres
const maxClearance = 30;
// How long a lane takes to appear or disappear where roads join, in metres
const taperLength = 25;
// Ways shorter than this are hard to see and get highlighted, in metres
export const shortWayLength = 8;
// one-way direction arrows: spacing along a lane, and how far they keep from junctions, in metres
const travelSpacing = 45;
const travelClearance = 15;
// turn arrows line up behind a stop line, give-way line or signals this close to the junction, in metres
const stopReach = 60;


/** One drawable stretch of a road between junctions, everything in lon/lat */
export interface RoadPiece {
    wayID: WayId;
    /** index of this piece along the way */
    index: number;
    layout: LaneLayout;
    carriageway: Vec2[];
    /** one polygon per lane, left to right looking along the way */
    lanes: Vec2[][];
    /** lane boundaries left to right: 0 is the left kerb, the last is the right kerb */
    boundaries: Vec2[][];
    /** lane centre lines, in the way's direction */
    centres: Vec2[][];
    /** for each lane boundary, two lines 0.12 m either side of it, for double markings (empty at the kerbs) */
    dividerSides: [Vec2[], Vec2[]][];
    /** `boundaries` as painted: kerbs and lane lines stop where side roads join a road that runs on */
    lines: Vec2[][];
    /** `dividerSides` as painted */
    lineSides: [Vec2[], Vec2[]][];
    /** where turn arrows go: a point on a lane and a point 1 m further in its direction of travel */
    arrows: LaneMark[];
    /** small arrows showing the direction of travel on one-way roads, clear of turn arrows and junctions */
    travel: LaneMark[];
    /** where lane labels go, one per lane in the middle of the piece */
    labels: LaneMark[];
    roadside: { side: 'left' | 'right'; kind: RoadsideKind; assumed: boolean; polygon: Vec2[]; parking?: ParkingLayout }[];
    /** metres */
    length: number;
    /** whether this piece starts at the way's first node / ends at its last node */
    atWayStart: boolean;
    atWayEnd: boolean;
    /** the nodes the piece runs between */
    fromNode: string;
    toNode: string;
    /** the whole way is shorter than `shortWayLength`: easy to miss, so it is highlighted */
    short: boolean;
    /** the middle of the piece, for the short-way marker */
    middle: Vec2;
}

export interface LaneMark {
    /** lane index, left to right looking along the way */
    lane: number;
    loc: Vec2;
    ahead: Vec2;
}

export interface JunctionArea {
    nodeID: string;
    /** `flare`: where no traffic crosses the main road, only the widening mouth of a road, drawn as road */
    kind: 'junction' | 'flare';
    /** the box's edges between neighbouring roads, which are kerbs (`assumed` when a road's width is not tagged) */
    kerbs: { line: Vec2[]; assumed: boolean }[];
    /**
     * The box as one or more polygons, all wound the same way, to be filled as one shape: a merged
     * junction is its nodes' boxes and the short roads between them, so it follows curving roads
     */
    polygons: Vec2[][];
}

/** A line through a junction from the end of one lane to the start of another */
export interface JunctionConnection {
    key: string;
    nodeID: string;
    /** `relation`: from a type=connectivity relation; `guide`: worked out from turn lanes */
    kind: 'relation' | 'guide';
    optional: boolean;
    /** a guide worked out with no turn arrows to go by: where lanes probably lead */
    inferred?: boolean;
    line: Vec2[];
    /** for a relation: the roads it connects, from and to */
    ways?: [string, string];
}


/* ---------- drawing-only adjustments at way ends ---------- */

/** A lane that narrows to nothing at one end of a way (a lane added or dropped where roads join) */
interface Taper {
    /** lane index, left to right along the way */
    lane: number;
    /** metres */
    length: number;
    /**
     * which side of the lane moves in as it narrows (lanes are left to right along the way): an outer lane's
     * kerb; an inner lane's side away from the lanes of the other direction, so the centre line stays where it is
     */
    shift: 'left' | 'right';
}

/**
 * How a way is drawn shifted sideways at each end so its lanes line up with the road it continues,
 * and which lanes taper. Drawing only: tags are never changed.
 */
export interface WayVisual {
    start: number;
    end: number;
    /** lanes narrowing to nothing at the way's start and end (lanes added or dropped where roads join) */
    taperStart: Taper[];
    taperEnd: Taper[];
    /**
     * Shifts that fit the road into a mapped carriageway area, as (distance along the way, shift)
     * points in order; between points the shift is interpolated, beyond them it fades out.
     */
    fit?: [number, number][];
}

const noVisual: WayVisual = { start: 0, end: 0, taperStart: [], taperEnd: [] };

// the most a road is shifted to line its lanes up with the road it joins, in metres (one lane)
const maxJoinShift = 3.5;

// a shift needed at a join holds this far along the way, then fades out over `offsetFade`, in metres
const offsetHold = 30;
const offsetFade = 50;

const smooth = (x: number) => {
    const r = Math.max(0, Math.min(1, x));
    return r * r * (3 - 2 * r);
};

/** The drawing-only sideways shift of a way at distance `s` along it */
export function visualShift(visual: WayVisual, s: number, total: number): number {
    let shift: number;
    if (total >= 2 * (offsetHold + offsetFade)) {
        // long ways: each end's shift holds near its join, then fades, so the middle is not moved
        const weight = (d: number) => 1 - smooth((d - offsetHold) / offsetFade);
        shift = visual.start * weight(s) + visual.end * weight(total - s);
    } else {
        // short ways: change from one end's shift to the other's over the middle
        const ramp = Math.min(total, taperLength * 2);
        shift = visual.start + (visual.end - visual.start) * (ramp > 0 ? smooth((s - (total - ramp) / 2) / ramp) : 0);
    }

    const fit = visual.fit;
    if (fit?.length) {
        const first = fit[0];
        const last = fit[fit.length - 1];
        if (s <= first[0]) shift += first[1] * (1 - smooth((first[0] - s) / taperLength));
        else if (s >= last[0]) shift += last[1] * (1 - smooth((s - last[0]) / taperLength));
        else {
            const i = fit.findIndex(p => p[0] >= s);
            const [s0, v0] = fit[i - 1];
            const [s1, v1] = fit[i];
            shift += v0 + (v1 - v0) * (s1 > s0 ? (s - s0) / (s1 - s0) : 0);
        }
    }
    return shift;
}


/* Per-entity caches. iD entities are immutable, so an unchanged entity means unchanged input. */

const layoutCache = new WeakMap<osmWay, LaneLayout>();

export function cachedLayout(way: osmWay, graph: coreGraph): LaneLayout {
    let layout = layoutCache.get(way);
    // transitions depend on their neighbours, so they are not cached
    if (!layout || way.tags.placement === 'transition') {
        layout = laneLayout(way, graph);
        layoutCache.set(way, layout);
    }
    return layout;
}


function lineLocs(way: osmWay, graph: coreGraph): Vec2[] {
    return way.nodes.map(id => (graph.entity(id) as osmNode).loc);
}


/**
 * The middle of the roundabout a ring way is part of: the average of the nodes of all the ring's ways (a ring
 * is often split into many short ways where roads join it, so one way's own nodes may all lie to one side)
 */
function ringMiddle(way: osmWay, graph: coreGraph): Vec2 {
    const ways = new Set<osmWay>([way]);
    const queue = [way];
    while (queue.length && ways.size < 64) {
        const current = queue.shift()!;
        for (const id of [current.first(), current.last()]) {
            for (const next of graph.parentWays(graph.entity(id)) as osmWay[]) {
                if (ways.has(next) || !isRing(next)) continue;
                ways.add(next);
                queue.push(next);
            }
        }
    }
    const nodes = new Set([...ways].flatMap(w => w.nodes));
    const locs = [...nodes].map(id => (graph.entity(id) as osmNode).loc);
    return scale(locs.reduce((sum, p) => add(sum, p), [0, 0] as Vec2), 1 / locs.length);
}

/**
 * Lane boundary offsets from the way line at distance `s` along it (right positive): the layout's
 * edges, its placement shift, the drawing-only shift and any tapering outer lane.
 */
export function edgesAt(layout: LaneLayout, visual: WayVisual, s: number, total: number): number[] {
    const t = total > 0 ? s / total : 0;
    const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t + visualShift(visual, s, total);
    const edges = layout.edges.slice();
    const n = layout.lanes.length;

    // each tapering lane loses (1 - f) of its width, its moving side and every edge beyond it coming in
    const factors = new Map<number, { f: number; side: 'left' | 'right' }>();
    const taper = (spec: Taper, f: number) => {
        const k = Math.max(0, Math.min(1, f));
        if (k < (factors.get(spec.lane)?.f ?? 1)) factors.set(spec.lane, { f: k, side: spec.shift });
    };
    for (const spec of visual.taperStart) taper(spec, s / spec.length);
    for (const spec of visual.taperEnd) taper(spec, (total - s) / spec.length);
    for (const [k, { f, side }] of factors) {
        if (k >= n) continue;
        const lost = layout.lanes[k].width * (1 - f);
        if (side === 'left') for (let e = 0; e <= k; e++) edges[e] += lost;
        else for (let e = k + 1; e <= n; e++) edges[e] -= lost;
    }
    return edges.map(e => e + shift);
}


/* ---------- mini-roundabouts ---------- */

/**
 * The radius of the circular carriageway drawn round a mini-roundabout node, in metres:
 * from `diameter=*`, else from the widest road meeting there. Null for any other node.
 */
export function miniRoundaboutRadius(node: osmNode, graph: coreGraph): number | null {
    if (node.tags.highway !== 'mini_roundabout') return null;
    const tagged = parseWidth(node.tags.diameter);
    if (tagged) return tagged / 2;
    const widest = Math.max(0, ...graph.parentWays(node).filter(isLaneRoad).map(w => cachedLayout(w as osmWay, graph).total));
    return Math.max(5, Math.min(10, widest * 0.8));
}


/* ---------- junction arms ---------- */

export interface Arm {
    way: osmWay;
    layout: LaneLayout;
    /** the node's position in `way.nodes` */
    nodeIndex: number;
    /** true when the arm leaves the node in the way's drawing direction */
    alongWay: boolean;
    /** the arm is a way end (not a way passing through) */
    isEnd: boolean;
    /** the road's centre line leaving the node, in metres in the node's frame */
    line: Vec2[];
    direction: Vec2;
    angle: number;
    /** lane boundary offsets at the node in the way's frame (right of its drawing direction positive) */
    edges: number[];
    /** carriageway edges relative to the arm's direction (right positive) */
    left: number;
    right: number;
    /** the carriageway edges `t` metres out along the arm, as `left` and `right` (a shifted or tapering road changes along its length) */
    sidesAt: (t: number) => [number, number];
    /** the direction of the way's segment touching the node, which is what the road's own end uses */
    firstSegment: Vec2;
    /**
     * the turns of the lanes approaching the node, as followed through it (see laneTurnsAt): arrows that point
     * to no road here, or only to turns banned for general traffic, carry on ahead, and a short link with no
     * arrows of its own takes them from the road before
     */
    turns: string[][];
    /** `turns` without the bans, for routing to apply each vehicle's own */
    arrows: string[][];
}

const armKey = (wayID: string, nodeIndex: number, alongWay: boolean) => `${wayID}:${nodeIndex}:${alongWay}`;

/** The road arms meeting at a node: each way end there gives one arm, a way passing through gives two */
function armsAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>, inherit = true): Arm[] {
    const frame = metricFrame(node.loc);
    const arms: Arm[] = [];
    const ways = graph.parentWays(node).filter(isLaneRoad) as osmWay[];

    for (const way of ways) {
        const layout = cachedLayout(way, graph);
        const points = lineLocs(way, graph).map(frame.toMetres);
        const cumulative = cumulativeLengths(points);
        const total = cumulative[cumulative.length - 1];
        const visual = visuals.get(way.id) ?? noVisual;

        way.nodes.forEach((id, i) => {
            if (id !== node.id) return;
            const edges = edgesAt(layout, visual, cumulative[i], total);
            const wayLeft = edges[0];
            const wayRight = edges[edges.length - 1];
            const isEnd = i === 0 || i === way.nodes.length - 1;

            const push = (alongWay: boolean) => {
                const line = alongWay ? points.slice(i) : points.slice(0, i + 1).reverse();
                if (line.length < 2 || polylineLength(line) === 0) return;
                const direction = pointAlong(line, Math.min(5, polylineLength(line))).direction;
                const segment = sub(line[1], line[0]);
                const sidesAt = (t: number): [number, number] => {
                    const s = Math.max(0, Math.min(total, cumulative[i] + (alongWay ? t : -t)));
                    const e = edgesAt(layout, visual, s, total);
                    return alongWay ? [e[0], e[e.length - 1]] : [-e[e.length - 1], -e[0]];
                };
                arms.push({
                    way, layout, nodeIndex: i, alongWay, isEnd, line, direction, edges,
                    angle: Math.atan2(direction[1], direction[0]),
                    left: alongWay ? wayLeft : -wayRight,
                    right: alongWay ? wayRight : -wayLeft,
                    sidesAt,
                    firstSegment: len(segment) > 0.01 ? unit(segment) : direction,
                    turns: [],
                    arrows: []
                });
            };
            if (i < way.nodes.length - 1) push(true);
            if (i > 0) push(false);
        });
    }
    arms.sort((a, b) => a.angle - b.angle);
    for (const arm of arms) {
        arm.arrows = laneTurnsAt(arms, arm, node.id, graph, inherit, false);
        arm.turns = laneTurnsAt(arms, arm, node.id, graph, inherit, true);
    }
    return arms;
}

/**
 * Whether a turn restriction (type=restriction, wiki: Relation:restriction) bans general traffic from one way into
 * another at a node: `no_*` into its to-way, `only_*` into any other (routing.ts checks each vehicle's own rules)
 */
function turnBanned(graph: coreGraph, fromWay: osmWay, nodeID: string, toWay: osmWay, angle?: number): boolean {
    for (const relation of graph.parentRelations(fromWay) as osmRelation[]) {
        if (relation.tags.type !== 'restriction') continue;
        const members = relation.members;
        if (!members.some(m => m.role === 'from' && m.id === fromWay.id) || !members.some(m => m.role === 'via' && m.id === nodeID)) continue;
        const value = relation.tags['restriction:motorcar'] ?? relation.tags.restriction;
        if (!value || (relation.tags.except ?? '').split(';').map(v => v.trim()).includes('motorcar')) continue;
        const to = members.find(m => m.role === 'to')?.id;
        // given the turn's angle (left positive), a to-way passing through the node is only the side the turn names
        const named = angle === undefined || turnMatches(value, angle);
        if ((value.startsWith('no_') && to === toWay.id && named) || (value.startsWith('only_') && (to !== toWay.id || !named))) return true;
    }
    return false;
}

/** Whether a turn of `angle` degrees (left positive) is the turn a restriction's value names */
function turnMatches(value: string, angle: number): boolean {
    if (/left_turn$/.test(value)) return angle > 20 && angle < 160;
    if (/right_turn$/.test(value)) return angle < -20 && angle > -160;
    if (/straight_on$/.test(value)) return Math.abs(angle) <= 45;
    if (/u_turn$/.test(value)) return Math.abs(angle) >= 150;
    return true;
}

/** The road an arrow `value` on arm `up` points to (by the turn angle), or -1 if it points to none of them */
function arrowExit(arms: Arm[], up: Arm, value: string): number {
    const ideal = idealAngle[value];
    if (ideal === undefined) return -1;
    let best = { j: -1, d: Infinity };
    arms.forEach((down, j) => {
        if (down === up || !down.layout.model.lanes[armLaneDirection(down, false)].length) return;
        const angle = signedAngle(scale(up.direction, -1), down.direction);
        const d = Math.abs(((angle - ideal + 540) % 360) - 180);
        if (d < best.d) best = { j, d };
    });
    return best.d < 70 ? best.j : -1;
}

// a link no longer than this, between two junctions, has no room for arrows or lane changes of its own
const shortLink = 40;
const inheritedTurns = new WeakMap<coreGraph, Map<string, string[][]>>();

/**
 * The turns of the lanes of `way` travelling `direction`: its own arrows, or, for a short link with none (the
 * stretch of a dual carriageway between the two halves of a crossroads), the arrows of the road leading into it
 * with as many lanes, less the turns taken where the link begins.
 */
function wayTurns(way: osmWay, direction: LaneDirection, graph: coreGraph): string[][] {
    const lanes = cachedLayout(way, graph).model.lanes[direction];
    const own = lanes.map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
    // a roundabout's lanes go round it, whatever the arrows of the roads joining it say
    if (!lanes.length || own.some(t => t.length) || direction === 'both_ways' || isRing(way)) return own;

    let cache = inheritedTurns.get(graph);
    if (!cache) inheritedTurns.set(graph, cache = new Map());
    const key = `${way.id}:${direction}`;
    const cached = cache.get(key);
    if (cached) return cached;
    cache.set(key, own);

    const start = direction === 'forward' ? 0 : way.nodes.length - 1;
    const entry = graph.entity(way.nodes[start]) as osmNode;
    const frame = metricFrame(entry.loc);
    if (polylineLength(lineLocs(way, graph).map(frame.toMetres)) > shortLink) return own;
    const arms = armsAt(entry, graph, new Map(), false);
    const link = arms.find(a => a.way.id === way.id && a.nodeIndex === start && a.alongWay === (direction === 'forward'));
    if (!link) return own;
    const linkIndex = arms.indexOf(link);
    // the road leading in: as many lanes, with arrows, and the straightest on into the link
    const feeders = arms.filter(a => a !== link && a.isEnd && a.way.id !== way.id && !isRing(a.way)).flatMap(a => {
        const upLanes = a.layout.model.lanes[armLaneDirection(a, true)];
        const turns = upLanes.map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
        if (upLanes.length !== lanes.length || !turns.some(t => t.length)) return [];
        return [{ arm: a, turns, bend: Math.abs(signedAngle(scale(a.direction, -1), link.direction)) }];
    }).filter(f => f.bend < 45).sort((x, y) => x.bend - y.bend);
    if (!feeders.length) return own;
    const { arm, turns } = feeders[0];
    // turns taken where the link begins are left behind; the rest (those for the junction ahead) carry on
    const inherited = turns.map(values => {
        const kept = values.filter(value => {
            const j = arrowExit(arms, arm, value);
            return j === -1 || j === linkIndex || turnBanned(graph, arm.way, entry.id, arms[j].way);
        });
        return kept.length ? kept : ['through'];
    });
    cache.set(key, inherited);
    return inherited;
}

/**
 * The turns of the lanes approaching a node on `arm`, as followed through it: the way's turns (see wayTurns), with
 * a lane whose arrows point to no road leaving here (a right-turn lane reaching the near half of a dual
 * carriageway crossroads), or only to roads a turn restriction bans from here, carrying on ahead, to the
 * junction its arrows are for.
 */
function laneTurnsAt(arms: Arm[], arm: Arm, nodeID: string, graph: coreGraph, inherit: boolean, banned: boolean): string[][] {
    const direction = armLaneDirection(arm, true);
    const turns = inherit ? wayTurns(arm.way, direction, graph)
        : arm.layout.model.lanes[direction].map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
    if (arms.length < 3 || arms.some(a => isRing(a.way)) || !turns.some(t => t.length)) return turns;
    if (arrowExit(arms, arm, 'through') === -1) return turns;
    const nowhere = (value: string) => {
        const j = arrowExit(arms, arm, value);
        return j === -1 || (banned && turnBanned(graph, arm.way, nodeID, arms[j].way));
    };
    return turns.map(values => (values.length && values.every(nowhere) ? ['through'] : values));
}

/** Lanes on an arm travelling towards the node (`approach`) or away from it */
function armLaneDirection(arm: Arm, approach: boolean): LaneDirection {
    // leaving the node along the way is travelling forward
    return (arm.alongWay !== approach) ? 'forward' : 'backward';
}

/** Lane centre offset of a lane on an arm, relative to its direction of travel (right positive) */
function travelOffset(arm: Arm, direction: LaneDirection, index: number): number | null {
    const k = arm.layout.lanes.findIndex(l => l.ref.direction === direction && l.ref.index === index);
    if (k === -1) return null;
    const offset = (arm.edges[k] + arm.edges[k + 1]) / 2;
    return direction === 'backward' ? -offset : offset;
}

// explicit placement tags say where a way is drawn: they are not second-guessed
const hasPlacement = (way: osmWay) => !!(way.tags.placement || way.tags['placement:forward'] || way.tags['placement:backward']);

const isRing = (way: osmWay) => way.tags.junction === 'roundabout' || way.tags.junction === 'circular';

const highwayRank: Record<string, number> = {
    motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, unclassified: 4, residential: 3,
    motorway_link: 6, trunk_link: 5, primary_link: 5, secondary_link: 4, tertiary_link: 3,
    living_street: 2, service: 1, road: 1, busway: 2, track: 0
};

/** The angle between two directions, in degrees */
function angleBetween(a: Vec2, b: Vec2): number {
    return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
}

/**
 * The two arms that carry the main road straight through a junction: both on a roundabout ring,
 * or nearly straight on and sharing a ref, name or class. The main road is not pulled back there;
 * only the side roads stop at its kerb.
 */
function throughPair(arms: Arm[]): [number, number] | null {
    let best: { pair: [number, number]; score: number } | null = null;
    for (let i = 0; i < arms.length; i++) {
        for (let j = i + 1; j < arms.length; j++) {
            const a = arms[i];
            const b = arms[j];
            const cos = a.direction[0] * b.direction[0] + a.direction[1] * b.direction[1];
            const deviation = Math.PI - Math.acos(Math.max(-1, Math.min(1, cos)));   // 0 = straight on
            const ring = isRing(a.way) && isRing(b.way);
            const ta = a.way.tags;
            const tb = b.way.tags;
            if (!ring && deviation > 35 * Math.PI / 180) continue;
            if (ring && deviation > 80 * Math.PI / 180) continue;
            // a fork (a dual carriageway splitting, a slip road peeling off at a shallow angle): nothing
            // runs straight through, so every arm stops where it meets its neighbours
            // (a minor road joining at a shallow angle does not make a fork: it stops at the main road's kerb)
            const rank = (w: osmWay) => highwayRank[w.tags.highway ?? ''] ?? 0;
            const peer = (c: Arm) => (c.way.tags.name && (c.way.tags.name === ta.name || c.way.tags.name === tb.name)) ||
                (c.way.tags.ref && (c.way.tags.ref === ta.ref || c.way.tags.ref === tb.ref)) ||
                rank(c.way) >= Math.min(rank(a.way), rank(b.way));
            if (!ring && arms.some((c, k) => k !== i && k !== j && !isRing(c.way) && peer(c) &&
                (angleBetween(c.direction, a.direction) < 40 || angleBetween(c.direction, b.direction) < 40))) continue;
            const score = (ring ? 100 : 0) +
                (a.way.id === b.way.id ? 30 : 0) +
                (ta.ref && ta.ref === tb.ref ? 20 : 0) +
                (ta.name && ta.name === tb.name ? 10 : 0) +
                (ta.highway === tb.highway ? 5 : 0) +
                (highwayRank[ta.highway ?? ''] ?? 0) + (highwayRank[tb.highway ?? ''] ?? 0) -
                deviation * 10;
            if (!best || score > best.score) best = { pair: [i, j], score };
        }
    }
    return best?.pair ?? null;
}


/** How far along arm `a` its edge at offset `offA` meets the edge of arm `b` at offset `offB` */
function edgeMeeting(a: Arm, offA: number, b: Arm, offB: number): number | undefined {
    const pa = scale(rightNormal(a.direction), offA);
    const pb = scale(rightNormal(b.direction), offB);
    const cross = a.direction[0] * b.direction[1] - a.direction[1] * b.direction[0];
    if (Math.abs(cross) < 0.05) return undefined;   // close to parallel: a straight continuation
    const d = sub(pb, pa);
    const t = (d[0] * b.direction[1] - d[1] * b.direction[0]) / cross;
    const u = (d[0] * a.direction[1] - d[1] * a.direction[0]) / cross;
    return t > 0 && u > -1 ? t : undefined;
}


/* ---------- which lanes lead to which ---------- */

interface LanePair {
    from: number;
    to: number;
    optional: boolean;
    /** an extra approaching lane that merges into a lane another one already leads to */
    merges?: boolean;
}

/** The type=connectivity relation from one way to another via a node, if any */
function connectivityRelation(graph: coreGraph, fromID: string, nodeID: string, toID: string): osmRelation | undefined {
    const from = graph.hasEntity(fromID as WayId);
    if (!from) return undefined;
    return graph.parentRelations(from).find(r => {
        if (r.tags.type !== 'connectivity') return false;
        const members = (r as osmRelation).members;
        return members.some(m => m.role === 'from' && m.id === fromID) &&
            members.some(m => m.role === 'via' && m.id === nodeID) &&
            members.some(m => m.role === 'to' && m.id === toID);
    }) as osmRelation | undefined;
}

function relationPairs(relation: osmRelation): LanePair[] {
    return parseConnectivity(relation.tags.connectivity ?? '').flatMap(group => {
        const from = parseInt(group.from, 10) - 1;
        if (Number.isNaN(from)) return [];
        return group.to.flatMap(c => {
            const to = parseInt(c.to, 10) - 1;
            return Number.isNaN(to) ? [] : [{ from, to, optional: c.optional }];
        });
    });
}

/**
 * Pairs a group of approaching lanes with the lanes of the road they lead to, one to one in order,
 * lined up on the left or the right. Extra approaching lanes share the outermost lane.
 */
function zipLanes(fromLanes: number[], toCount: number, alignLeft: boolean): LanePair[] {
    const pairs: LanePair[] = [];
    const n = fromLanes.length;
    for (let k = 0; k < n; k++) {
        const from = alignLeft ? fromLanes[k] : fromLanes[n - 1 - k];
        const ideal = alignLeft ? k : toCount - 1 - k;
        const to = Math.max(0, Math.min(toCount - 1, ideal));
        pairs.push({ from, to, optional: false, merges: to !== ideal });
    }
    return pairs;
}

/** Turn values whose lanes carry on along the road (an unmarked lane on a marked road carries on too) */
const continues = (values: string[]) => !values.length || values.includes('through') ||
    values.includes('merge_to_left') || values.includes('merge_to_right');

/**
 * Which approaching lanes carry on into the continuing road, and how they line up:
 * from a connectivity relation if there is one, else from turn lanes. Where nothing turns off
 * (a lane added or dropped), lanes line up on the side away from the kerb.
 */
function continuationPairs(graph: coreGraph, up: Arm, down: Arm, nodeID: string, twoArms: boolean): LanePair[] {
    const upDirection = armLaneDirection(up, true);
    const downDirection = armLaneDirection(down, false);
    const upLanes = up.layout.model.lanes[upDirection];
    const downCount = down.layout.model.lanes[downDirection].length;
    if (!upLanes.length || !downCount) return [];

    if (up.isEnd && down.isEnd) {
        const relation = connectivityRelation(graph, up.way.id, nodeID, down.way.id);
        if (relation) return relationPairs(relation).filter(p => !p.optional);
    }

    const turns = up.turns;
    const anyTagged = turns.some(t => t.length);
    const going = upLanes.map((_, i) => i).filter(i => twoArms || !anyTagged || continues(turns[i]));
    if (!going.length) return [];
    if (going.length === downCount) return going.map((from, to) => ({ from, to, optional: false }));

    // fewer lanes ahead and some lanes marked to merge: the merging lanes are the ones that end,
    // and the through or unmarked lanes carry straight on
    if (downCount < going.length) {
        const isMerge = (i: number) => turns[i].includes('merge_to_left') || turns[i].includes('merge_to_right');
        const merging = going.filter(isMerge);
        const staying = going.filter(i => !isMerge(i));
        if (merging.length && staying.length) {
            // the staying lanes line up on the side away from the merging lanes
            const pairs = zipLanes(staying, downCount, merging.some(i => i > Math.max(...staying)));
            const targetOf = new Map(pairs.map(p => [p.from, p.to]));
            for (const i of merging) {
                // a lane merges into the nearest staying lane on the side its arrow points to
                const toLeft = turns[i].includes('merge_to_left');
                const candidates = staying.filter(j => (toLeft ? j < i : j > i));
                const into = toLeft ? Math.max(...candidates, -1) : Math.min(...candidates, Infinity);
                const fallback = toLeft ? Math.min(...staying) : Math.max(...staying);
                const target = targetOf.get(Number.isFinite(into) && into >= 0 ? into : fallback);
                if (target !== undefined) pairs.push({ from: i, to: target, optional: false, merges: true });
            }
            return pairs;
        }
    }

    let alignLeft: boolean;
    const turning = upLanes.map((_, i) => i).filter(i => !going.includes(i));
    if (turning.length) {
        // the turning lanes peel off on one side; the rest stay lined up on the other
        alignLeft = turning.some(i => i > Math.max(...going));
    } else {
        // a lane added or dropped happens at the kerb, so line up on the other side,
        // unless the road it leads to says the new lane is a turn lane on the other side
        alignLeft = up.layout.model.driveSide === 'right';
        if (downCount > going.length) {
            const downTurns = down.layout.model.lanes[downDirection].map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
            const leftish = (values: string[]) => values.some(v => /left/.test(v));
            const rightish = (values: string[]) => values.some(v => /right/.test(v));
            const first = downTurns[0];
            const last = downTurns[downTurns.length - 1];
            if (rightish(last) && !leftish(first)) alignLeft = true;
            else if (leftish(first) && !rightish(last)) alignLeft = false;
        }
    }
    return zipLanes(going, downCount, alignLeft);
}


/**
 * Works out, for a node where one road continues another, how the second is shifted (drawing only)
 * so the lanes that carry on line up, and which lane tapers where lanes are added or dropped.
 */
function alignAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>) {
    const arms = armsAt(node, graph, visuals);
    const pair = arms.length === 2 ? [0, 1] : throughPair(arms);
    if (!pair) return;
    const a = arms[pair[0]];
    const b = arms[pair[1]];
    if (a.way.id === b.way.id || !a.isEnd || !b.isEnd) return;
    const twoArms = arms.length === 2;

    // the road with more lanes is the reference; the other is shifted to meet it
    const count = (arm: Arm) => arm.layout.lanes.length;
    if (count(a) === count(b) && a.layout.total === b.layout.total) return;
    const reference = count(a) >= count(b) ? a : b;
    const moved = reference === a ? b : a;
    // a way fitted into its mapped area is where the area says
    if (hasPlacement(moved.way) || visuals.get(moved.way.id)?.fit) return;

    // where roads simply join, the lanes of the wider road that end taper away (first, so the lining up below
    // sees where the lanes left are at the join). At a junction, an outer lane gained or lost on a side no
    // other road joins (a turn lane starting just past a junction on the far side from the side road) tapers
    // from its kerb too; on a side a road joins, that road feeds or takes the lane, and on a roundabout the
    // ring's lanes come and go with its entries and exits.
    const sideRoads = arms.filter((_, i) => !pair.includes(i));
    const sideFree = (wide: Arm, k: number) => {
        const along = wide.alongWay ? wide.direction : scale(wide.direction, -1);
        // the side of the way the lane's kerb is on: the way's left for its first lane, its right for its last
        const kerb: Vec2 = k === 0 ? [-along[1], along[0]] : [along[1], -along[0]];
        return !sideRoads.some(side => dot(side.direction, kerb) > 0.02);
    };
    for (const [up, down] of [[a, b], [b, a]] as const) {
        const upDirection = armLaneDirection(up, true);
        const downDirection = armLaneDirection(down, false);
        const pairs = continuationPairs(graph, up, down, node.id, twoArms);
        if (!pairs.length) continue;
        if (twoArms || !(isRing(up.way) || isRing(down.way))) {
            const wide = count(up) > count(down) ? up : count(down) > count(up) ? down : null;
            if (wide) {
                const direction = wide === up ? upDirection : downDirection;
                const used = new Set(pairs.filter(p => !p.merges).map(p => (wide === up ? p.from : p.to)));
                const n = wide.layout.lanes.length;
                wide.layout.model.lanes[direction].forEach((_, index) => {
                    if (used.has(index)) return;
                    const k = wide.layout.lanes.findIndex(l => l.ref.direction === direction && l.ref.index === index);
                    if (k < 0) return;
                    // an outer lane narrows from its kerb; an inner lane only when it merges into its neighbour, from the
                    // side away from the other direction's lanes (so the centre line runs straight on)
                    if (!twoArms && ((k !== 0 && k !== n - 1) || !sideFree(wide, k))) return;
                    let shift: 'left' | 'right';
                    if (k === 0) shift = 'left';
                    else if (k === n - 1) shift = 'right';
                    else if (pairs.some(p => p.merges && (wide === up ? p.from : p.to) === index)) {
                        const other = wide.layout.lanes.findIndex(l => l.ref.direction !== direction);
                        if (other >= 0) {
                            shift = other < k ? 'right' : 'left';
                        } else {
                            // a one-way road: the side away from the lane it merges into (the driver's left is the
                            // way's left going forward, its right going backward)
                            const turns = parseTurn(wide.layout.lanes[k].turn);
                            const toDriverLeft = turns.includes('merge_to_left');
                            shift = toDriverLeft === (direction !== 'backward') ? 'right' : 'left';
                        }
                    } else return;
                    const total = polylineLength(lineLocs(wide.way, graph).map(metricFrame(node.loc).toMetres));
                    const visual = { ...(visuals.get(wide.way.id) ?? noVisual) };
                    const taper = { lane: k, length: Math.min(taperLength, total * 0.45), shift };
                    if (wide.nodeIndex === 0) visual.taperStart = [...visual.taperStart.filter(t => t.lane !== k), taper];
                    else visual.taperEnd = [...visual.taperEnd.filter(t => t.lane !== k), taper];
                    visuals.set(wide.way.id, visual);
                });
            }
        }
    }

    // a lane's travel offset at the join, with the tapers
    const offsetNow = (arm: Arm, direction: LaneDirection, index: number) => {
        const visual = visuals.get(arm.way.id) ?? noVisual;
        if (!visual.taperStart.length && !visual.taperEnd.length) return travelOffset(arm, direction, index);
        const total = polylineLength(lineLocs(arm.way, graph).map(metricFrame(node.loc).toMetres));
        const edges = edgesAt(arm.layout, visual, arm.nodeIndex === 0 ? 0 : total, total);
        return travelOffset({ ...arm, edges }, direction, index);
    };
    let delta: number | null = null;
    for (const [up, down] of [[a, b], [b, a]] as const) {
        const upDirection = armLaneDirection(up, true);
        const downDirection = armLaneDirection(down, false);
        const pairs = continuationPairs(graph, up, down, node.id, twoArms);
        if (!pairs.length) continue;

        if (delta === null) {
            const differences = pairs.filter(p => !p.merges).flatMap(p => {
                const u = offsetNow(up, upDirection, p.from);
                const d = offsetNow(down, downDirection, p.to);
                return u === null || d === null ? [] : [u - d];
            });
            if (differences.length) {
                const mean = differences.reduce((x, y) => x + y, 0) / differences.length;
                // shift the moved way so the travel offsets match, in the moved way's own frame
                if (moved === down) delta = downDirection === 'backward' ? -mean : mean;
                else delta = upDirection === 'backward' ? mean : -mean;
            }
        }
    }

    // lining up never moves a road by more than a lane: a bigger gap means the lanes do not match up,
    // and shifting the road that far would push it into the lanes and paths beside it
    if (delta !== null && Math.abs(delta) > 0.05 && Math.abs(delta) <= maxJoinShift) {
        const visual = { ...(visuals.get(moved.way.id) ?? noVisual) };
        if (moved.nodeIndex === 0) visual.start = delta;
        else visual.end = delta;
        visuals.set(moved.way.id, visual);
    }
}


/** How far along a line its nearest point to `p` is */
function projectOnto(line: Vec2[], p: Vec2): number {
    let best = 0;
    let nearest = Infinity;
    let walked = 0;
    for (let i = 1; i < line.length; i++) {
        const a = line[i - 1];
        const segment = sub(line[i], a);
        const length = len(segment);
        if (length > 0) {
            const t = Math.max(0, Math.min(length, dot(sub(p, a), segment) / length));
            const d = len(sub(p, add(a, scale(segment, t / length))));
            if (d < nearest) {
                nearest = d;
                best = walked + t;
            }
        }
        walked += length;
    }
    return best;
}


/* ---------- junctions ---------- */

/** How far from a node lane lines and each kerb stop, where they are drawn shorter than the road */
interface MarkTrim {
    /** the way's left and right kerbs (as seen along the way) */
    left: number;
    right: number;
    /** lines between lanes */
    lanes: number;
    /** the roadside strips (pavements, verges) stop with the kerbs, as at a turning head they carry on round it */
    roadside?: boolean;
}

interface Junction {
    /** pull-back distance per arm, keyed `${wayID}:${nodeIndex}:${alongWay}` */
    trims: Map<string, number>;
    /** where kerbs and lane lines stop on arms that run on through the junction, keyed like `trims` */
    marks: Map<string, MarkTrim>;
    /** for an arm that carries straight on into another (a join, or a road running through), the
     *  direction that other arm leaves the node in, keyed like `trims` */
    partners: Map<string, Vec2>;
    area?: JunctionArea;
    connections: JunctionConnection[];
}

const idealAngle: Record<string, number> = {
    through: 0, slight_left: 40, left: 90, sharp_left: 135, slight_right: -40, right: -90, sharp_right: -135,
    merge_to_left: 0, merge_to_right: 0, reverse: 180
};

function signedAngle(from: Vec2, to: Vec2): number {
    const cross = from[0] * to[1] - from[1] * to[0];
    const dot = from[0] * to[0] + from[1] * to[1];
    return Math.atan2(cross, dot) * 180 / Math.PI;
}

/**
 * The point at a lane's end on an arm, at the arm's pull-back distance, and its travel direction:
 * the lane's centre, or (`edge`) its edge on the driver's left or right
 */
function laneEnd(arm: Arm, trim: number, direction: LaneDirection, index: number, approach: boolean, edge?: 'left' | 'right') {
    const k = arm.layout.lanes.findIndex(l => l.ref.direction === direction && l.ref.index === index);
    if (k === -1) return null;
    let wayOffset = (arm.edges[k] + arm.edges[k + 1]) / 2;
    if (edge) {
        // offsets to the driver's right: along the arm when leaving the node, against it when approaching
        const driverRight = (w: number) => (arm.alongWay ? w : -w) * (approach ? -1 : 1);
        const [a, b] = [arm.edges[k], arm.edges[k + 1]];
        const leftFirst = driverRight(a) < driverRight(b);
        wayOffset = edge === 'left' ? (leftFirst ? a : b) : (leftFirst ? b : a);
    }
    const armOffset = arm.alongWay ? wayOffset : -wayOffset;
    const at = pointAlong(arm.line, Math.min(trim, polylineLength(arm.line)));
    const point = add(at.point, scale(rightNormal(at.direction), armOffset));
    // an edge that is the road's outer edge, along the kerb
    const kerb = !!edge && (wayOffset === arm.edges[0] || wayOffset === arm.edges[arm.edges.length - 1]);
    return { point, tangent: approach ? scale(at.direction, -1) : at.direction, kerb };
}

/**
 * A line through a junction from one lane end to another. A turn bends round the corner where
 * the two directions of travel meet (a quadratic curve), so tight inner corners do not loop;
 * a lane shifting sideways, where they do not meet ahead, takes a gentle S-curve.
 */
function curve(a: { point: Vec2; tangent: Vec2 }, b: { point: Vec2; tangent: Vec2 }): Vec2[] {
    const cross = a.tangent[0] * b.tangent[1] - a.tangent[1] * b.tangent[0];
    if (Math.abs(cross) > 0.1) {
        const d = sub(b.point, a.point);
        const ahead = (d[0] * b.tangent[1] - d[1] * b.tangent[0]) / cross;    // along a's travel direction
        const behind = (a.tangent[0] * d[1] - a.tangent[1] * d[0]) / cross;   // back along b's direction
        if (ahead >= 0 && behind >= 0) {
            const corner = add(a.point, scale(a.tangent, ahead));
            return Array.from({ length: 17 }, (_, i) => {
                const t = i / 16;
                const u = 1 - t;
                return [
                    u * u * a.point[0] + 2 * u * t * corner[0] + t * t * b.point[0],
                    u * u * a.point[1] + 2 * u * t * corner[1] + t * t * b.point[1]
                ] as Vec2;
            });
        }
    }
    const chord = len(sub(b.point, a.point));
    const c = Math.max(1.5, chord * 0.4);
    const p1 = add(a.point, scale(a.tangent, c));
    const p2 = sub(b.point, scale(b.tangent, c));
    const points: Vec2[] = [];
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        points.push([
            u * u * u * a.point[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * b.point[0],
            u * u * u * a.point[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * b.point[1]
        ]);
    }
    return points;
}

interface LaneExits {
    upDirection: LaneDirection;
    /** the arms traffic from `up` can drive into, with the turn angle (left positive), in degrees */
    exits: { down: Arm; j: number; angle: number }[];
    /** for each approaching lane, the arms it leads to */
    targets: Set<number>[];
    /** no lane has turn arrows: the targets of a side road's lanes are a guess from the exits' order */
    inferred: boolean;
}

/**
 * Where each lane approaching a junction on arm `i` leads: by its turn arrows and the exit angles. With no arrows,
 * lanes on the main road carry on along it, and lanes of a side road (or at a junction with no main road) lead to
 * the exits not banned to them, shared out from left to right: one lane to every exit, the left lane of several to
 * the left turn and the right lane to the right turn (`banned` says which exits a restriction bans).
 */
function laneExits(arms: Arm[], i: number, through: [number, number] | null, banned?: (j: number) => boolean): LaneExits | null {
    const up = arms[i];
    const upDirection = armLaneDirection(up, true);
    const upLanes = up.layout.model.lanes[upDirection];
    if (!upLanes.length) return null;
    const exits = arms.map((down, j) => ({ down, j, angle: signedAngle(scale(up.direction, -1), down.direction) }))
        .filter(x => x.j !== i && x.down.layout.model.lanes[armLaneDirection(x.down, false)].length);
    if (!exits.length) return null;

    const isThrough = (j: number) => !!through && ((through[0] === i && through[1] === j) || (through[0] === j && through[1] === i));
    const turns = up.turns;
    const anyTagged = turns.some(t => t.length);
    if (!anyTagged && banned && !(through && through.includes(i))) {
        // no U-turns, and nothing a restriction bans; left turns first (lane 0 is the left lane)
        const open = exits.filter(x => Math.abs(x.angle) < 150 && !banned(x.j)).sort((a, b) => b.angle - a.angle);
        const n = turns.length;
        const m = open.length;
        const shared = turns.map(() => new Set<number>());
        open.forEach((x, r) => {
            const from = Math.floor(r * n / m);
            const to = Math.max(from + 1, Math.floor((r + 1) * n / m));
            for (let k = from; k < to; k++) shared[k].add(x.j);
        });
        return { upDirection, exits, targets: shared, inferred: true };
    }
    const targets = turns.map(values => {
        const result = new Set<number>();
        if (!anyTagged || (!values.length && through)) {
            // unmarked lanes carry on along the main road
            const partner = exits.find(x => isThrough(x.j));
            if (partner) result.add(partner.j);
            return result;
        }
        for (const value of (values.length ? values : ['through'])) {
            const ideal = idealAngle[value];
            if (ideal === undefined) continue;
            let best: { j: number; d: number } | null = null;
            for (const x of exits) {
                const d = Math.abs(((x.angle - ideal + 540) % 360) - 180);
                if (!best || d < best.d) best = { j: x.j, d };
            }
            if (best && best.d < 70) result.add(best.j);
        }
        return result;
    });
    return { upDirection, exits, targets, inferred: false };
}

/**
 * Where a road splits (a one-way slip road peeling off the main road), shifts the branch so its
 * lanes start where the lanes that lead into it end.
 */
function alignBranches(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>) {
    const arms = armsAt(node, graph, visuals);
    if (arms.length < 3) return;
    const through = throughPair(arms);
    // a roundabout's exits flare off the ring (see junctionAt) rather than carrying on one of its lanes
    if (!through || through.some(k => isRing(arms[k].way))) return;
    for (const i of through) {
        const up = arms[i];
        const lanes = laneExits(arms, i, through);
        if (!lanes) continue;
        for (const exit of lanes.exits) {
            const side = exit.down;
            if (through.includes(exit.j) || !side.isEnd || hasPlacement(side.way) || side.way.id === up.way.id) continue;
            // only a branch peeling off (one way, leaving at a shallow angle), not a side road
            if (Math.abs(exit.angle) > 60 || side.layout.model.lanes[armLaneDirection(side, true)].length) continue;
            const visual = visuals.get(side.way.id) ?? noVisual;
            if ((side.nodeIndex === 0 ? visual.start : visual.end) !== 0) continue;
            let fromLanes = lanes.targets.flatMap((set, index) => (set.has(exit.j) ? [index] : []));
            if (!fromLanes.length) {
                // no lane is marked for it: a one-lane slip road peels off the outer lane on its side
                // (a wider road leaving has no lane to line up with, and keeps to its way)
                const upCount = up.layout.model.lanes[lanes.upDirection].length;
                if (!upCount || side.layout.model.lanes[armLaneDirection(side, false)].length !== 1) continue;
                fromLanes = [exit.angle > 0 ? 0 : upCount - 1];
            }
            const sideDirection = armLaneDirection(side, false);
            const pairs = zipLanes(fromLanes, side.layout.model.lanes[sideDirection].length, exit.angle > 0)
                .filter(p => !p.merges);
            const differences = pairs.flatMap(p => {
                const u = travelOffset(up, lanes.upDirection, p.from);
                const d = travelOffset(side, sideDirection, p.to);
                return u === null || d === null ? [] : [u - d];
            });
            if (!differences.length) continue;
            const mean = differences.reduce((x, y) => x + y, 0) / differences.length;
            const delta = sideDirection === 'backward' ? -mean : mean;
            // a slip road leaves from the outer lane, which on a wide road is more than a lane from its centre
            if (Math.abs(delta) < 0.05 || Math.abs(delta) > branchShiftLimit(up)) continue;
            const next = { ...visual };
            if (side.nodeIndex === 0) next.start = delta;
            else next.end = delta;
            visuals.set(side.way.id, next);
        }
    }
}

/** The most a slip road is shifted to meet a road: as far as that road's outer edge */
const branchShiftLimit = (arm: Arm) => Math.max(maxJoinShift, (arm.right - arm.left) / 2 + 0.5);

/**
 * Where a one-way road joins a road that carries on (a slip road onto a motorway), shifts its end so
 * its lanes meet the lanes they become: the lanes gained on its side, or the outer lane it merges into.
 */
function alignMerges(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>) {
    const arms = armsAt(node, graph, visuals);
    if (arms.length < 3) return;
    const through = throughPair(arms);
    // a roundabout's entries flare into the ring (see junctionAt) rather than becoming one of its lanes
    if (!through || through.some(k => isRing(arms[k].way))) return;
    for (const [i, j] of [[through[0], through[1]], [through[1], through[0]]]) {
        const up = arms[i];
        const down = arms[j];
        const upDirection = armLaneDirection(up, true);
        const downDirection = armLaneDirection(down, false);
        const downCount = down.layout.model.lanes[downDirection].length;
        if (!up.layout.model.lanes[upDirection].length || !downCount) continue;

        // the lanes ahead that the through road does not feed
        const fed = new Set(continuationPairs(graph, up, down, node.id, false).map(p => p.to));
        const free = Array.from({ length: downCount }, (_, k) => k).filter(k => !fed.has(k));

        arms.forEach((side, k) => {
            if (through.includes(k) || !side.isEnd || hasPlacement(side.way) || side.way.id === down.way.id) return;
            const sideDirection = armLaneDirection(side, true);
            const sideLanes = side.layout.model.lanes[sideDirection];
            // only a one-way road arriving at a shallow angle, not a side road
            if (!sideLanes.length || side.layout.model.lanes[armLaneDirection(side, false)].length) return;
            const arriving = scale(side.direction, -1);
            const angle = Math.acos(Math.max(-1, Math.min(1, dot(unit(arriving), unit(down.direction))))) * 180 / Math.PI;
            if (angle > 60) return;
            const visual = visuals.get(side.way.id) ?? noVisual;
            if ((side.nodeIndex === 0 ? visual.start : visual.end) !== 0) return;

            // joining on the left meets the leftmost lanes ahead (lane 0 is the left one), on the right the rightmost
            const fromLeft = down.direction[0] * side.direction[1] - down.direction[1] * side.direction[0] > 0;
            const onSide = fromLeft ? free.filter(f => f < downCount / 2) : free.filter(f => f >= downCount / 2);
            // with no lane gained on its side, only a one-lane slip road lines up with the outer lane it merges
            // into; a wider road joining has no lanes to meet, and keeps to its way
            if (!onSide.length && sideLanes.length !== 1) return;
            const targets = onSide.length ? onSide : [fromLeft ? 0 : downCount - 1];
            const n = sideLanes.length;
            const pairs = sideLanes.map((_, from) => ({
                from,
                to: fromLeft ? targets[Math.min(from, targets.length - 1)] : targets[Math.max(0, targets.length - n + from)]
            }));
            const differences = pairs.flatMap(p => {
                const d = travelOffset(down, downDirection, p.to);
                const u = travelOffset(side, sideDirection, p.from);
                return u === null || d === null ? [] : [d - u];
            });
            if (!differences.length) return;
            const mean = differences.reduce((x, y) => x + y, 0) / differences.length;
            const delta = sideDirection === 'backward' ? -mean : mean;
            if (Math.abs(delta) < 0.05 || Math.abs(delta) > branchShiftLimit(down)) return;
            const next = { ...visual };
            if (side.nodeIndex === 0) next.start = delta;
            else next.end = delta;
            visuals.set(side.way.id, next);
        });
    }
}


/** Where roads join or leave a roundabout (see junctionAt) */
interface RingFlare {
    /** roads leaving the ring at a shallow angle, whose lanes peel off the ring's outer lanes */
    exits: Set<number>;
    /** how far along each half of the ring (keyed `ring arm:side arm`) the mouth of a joining road reaches */
    mouths: Map<string, number>;
}

/**
 * Lines through a junction from each approaching lane to the lanes it leads to: from connectivity
 * relations where they exist, else guide lines worked out from turn lanes and the exit angles.
 * Guide lines follow the lane edges; a relation's own line (lane centre to lane centre) is drawn for editing.
 */
function junctionConnections(node: osmNode, graph: coreGraph, arms: Arm[], trims: Map<string, number>, through: [number, number] | null,
    ring?: RingFlare, surfaces: Vec2[][] = []): JunctionConnection[] {
    const frame = metricFrame(node.loc);
    const result: JunctionConnection[] = [];
    const seen = new Set<string>();
    const trimOf = (arm: Arm) => trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0;
    const isThrough = (i: number, j: number) => !!through && ((through[0] === i && through[1] === j) || (through[0] === j && through[1] === i));
    const onRing = (i: number) => !!ring && !!through && through.includes(i);

    arms.forEach((up, i) => {
        const banned = (j: number) => turnBanned(graph, up.way, node.id, arms[j].way,
            signedAngle(scale(up.direction, -1), arms[j].direction));
        // (a roundabout's lanes go by the ring, and traffic goes round a mini-roundabout's circle, not a guess)
        const lanes = laneExits(arms, i, through, ring || miniRoundaboutRadius(node, graph) ? undefined : banned);
        if (!lanes) return;
        const { upDirection, exits } = lanes;
        // a guide with no arrows or connection to go by is a guess
        const guessed = (j: number) => (lanes.inferred && !related.has(j)) || undefined;
        const upCount = up.layout.model.lanes[upDirection].length;

        // connectivity relations say exactly which lanes lead where
        const byExit = new Map<number, LanePair[]>();
        const related = new Set<number>();
        for (const exit of exits) {
            const relation = up.isEnd && exit.down.isEnd ? connectivityRelation(graph, up.way.id, node.id, exit.down.way.id) : undefined;
            if (!relation) continue;
            const downDirection = armLaneDirection(exit.down, false);
            const pairs = relationPairs(relation);
            byExit.set(exit.j, pairs);
            related.add(exit.j);
            for (const p of pairs) {
                const a = laneEnd(up, trimOf(up), upDirection, p.from, true);
                const b = laneEnd(exit.down, trimOf(exit.down), downDirection, p.to, false);
                if (!a || !b) continue;
                result.push({
                    key: `${node.id}-r-${up.way.id}-${exit.down.way.id}-${p.from}-${p.to}`, nodeID: node.id,
                    kind: 'relation', optional: p.optional, line: curve(a, b).map(frame.toLoc), ways: [up.way.id, exit.down.way.id]
                });
            }
        }
        if (arms.length < 3) return;   // where two roads just join, lanes carry straight on

        // otherwise worked out: lanes to the roads their arrows point to, lined up in order
        const auto = new Map<number, number[]>();
        lanes.targets.forEach((targets, laneIndex) => {
            for (const j of targets) auto.set(j, [...(auto.get(j) ?? []), laneIndex]);
        });
        const lanesOf = (count: number) => Array.from({ length: count }, (_, k) => k);
        if (ring && !onRing(i)) {
            // every lane entering a roundabout joins the ring
            const onto = exits.find(x => onRing(x.j));
            auto.clear();
            if (onto) auto.set(onto.j, lanesOf(upCount));
        } else if (ring) {
            // the ring's outer lanes peel off into a road leaving at a shallow angle
            for (const exit of exits.filter(x => ring.exits.has(x.j))) {
                const count = Math.min(upCount, exit.down.layout.model.lanes[armLaneDirection(exit.down, false)].length);
                const outer = exit.angle > 0 ? lanesOf(count) : lanesOf(count).map(k => upCount - count + k);
                auto.set(exit.j, outer);
            }
        }
        for (const [j, fromLanes] of auto) {
            if (byExit.has(j)) continue;
            const exit = exits.find(x => x.j === j)!;
            const downCount = exit.down.layout.model.lanes[armLaneDirection(exit.down, false)].length;
            const pairs = isThrough(i, j) && !ring
                ? continuationPairs(graph, up, exit.down, node.id, false)
                : zipLanes(fromLanes, downCount, exit.angle > 0);   // turning left lines up on the left
            byExit.set(j, pairs.filter(p => fromLanes.includes(p.from)));
        }

        for (const [j, pairs] of byExit) {
            const down = arms[j];
            const downDirection = armLaneDirection(down, false);
            let upTrim: number;
            let downTrim: number;
            const ringJoin = !!ring && onRing(i) !== onRing(j);
            // a ring without painted lanes (lane_markings=no): lanes joining it stop at its edge, with no lines on into it
            if (ringJoin && !(onRing(i) ? up : down).layout.markings) continue;
            if (ringJoin) {
                // onto or off a roundabout: the lines run between the ends of the lanes they join, as a relation's
                // own line does, and meet the ring's lane lines where they start or stop; a road meeting the ring
                // square on sweeps round into it, to where its mouth meets the ring
                upTrim = trimOf(up);
                downTrim = trimOf(down);
                const steep = angleBetween(scale(up.firstSegment, -1), down.firstSegment) > 45;
                if (steep && onRing(j)) downTrim = Math.max(downTrim, ring!.mouths.get(`${j}:${i}`) ?? 0);
            } else {
                // a turn off or onto the main road (which runs through untrimmed) starts or ends
                // past the other road's kerb, so the curve has room to turn
                const turning = !isThrough(i, j);
                // a road running straight through with no gap needs no guide: its lanes join up by themselves
                if (!turning && trimOf(up) === 0 && trimOf(down) === 0) continue;
                upTrim = turning ? Math.max(trimOf(up), (down.right - down.left) / 2) : trimOf(up);
                downTrim = turning ? Math.max(trimOf(down), (up.right - up.left) / 2) : trimOf(down);
            }
            // guide lines follow the lane edges through the junction (each lane's left edge to the left
            // edge of the lane it leads to, and right to right); lanes turning side by side share a line
            const nearside = up.layout.model.driveSide === 'left' ? 'left' : 'right';
            for (const p of pairs) {
                const edges = (['left', 'right'] as const).map(edge => {
                    const a = laneEnd(up, upTrim, upDirection, p.from, true, edge);
                    const b = laneEnd(down, downTrim, downDirection, p.to, false, edge);
                    return a && b ? { edge, a, b, line: curve(a, b) } : null;
                });
                // the lanes are road all the way, wherever they run outside the junction's surface
                if ((ringJoin || related.has(j)) && edges[0] && edges[1]) {
                    surfaces.push([...edges[0].line, ...edges[1].line.slice().reverse()]);
                }
                for (const e of edges) {
                    if (!e) continue;
                    const { edge, a, b } = e;
                    // fragments shorter than 2 m only add clutter
                    if (len(sub(b.point, a.point)) < 2) continue;
                    // onto or off a roundabout, the kerb is the line along the outside (the nearside, away from the
                    // ring's middle); an offside edge running kerb to kerb crosses the ring, and is drawn
                    if (ringJoin && a.kerb && b.kerb && edge === nearside) continue;
                    const key = `${node.id}-g-${up.way.id}:${up.alongWay}-${down.way.id}:${down.alongWay}-` +
                        `${a.point[0].toFixed(1)},${a.point[1].toFixed(1)}-${b.point[0].toFixed(1)},${b.point[1].toFixed(1)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    result.push({
                        key, nodeID: node.id,
                        kind: 'guide', optional: false, inferred: guessed(j), line: e.line.map(frame.toLoc)
                    });
                }
            }
        }
    });
    return result;
}


/**
 * The edge of a junction box between the left kerb of one road (ending at `from`, running
 * `fromDirection` away from the node) and the right kerb of the next (ending at `to`): a curve bending
 * round the point where the two kerbs would meet, as a kerb rounds a corner; a straight line when they
 * do not meet on the junction's side, or only far away (very sharp angles).
 */
/**
 * The kerb where a roundabout's outer lanes run on into an exit: from the end of the ring's road (`from`, its
 * direction pointing back along the ring) sweeping on in the direction of travel into the exit's kerb (`to`)
 */
function peelCorner(from: Vec2, fromDirection: Vec2, to: Vec2, toDirection: Vec2): Vec2[] {
    return curve({ point: from, tangent: scale(fromDirection, -1) }, { point: to, tangent: toDirection });
}

/**
 * The parts of `shapes` that none of `covered` covers (all in metres), as rings to fill with the nonzero rule
 * (holes wound the other way), leaving out slivers less than 0.3 m wide on average
 */
function uncovered(shapes: Vec2[][], covered: Vec2[][]): Vec2[][] {
    // (to the millimetre, which keeps the clipping clear of near-coincident points)
    const closed = (ring: Vec2[]): [number, number][] => [...ring, ring[0]].map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]);
    let rest: [number, number][][][];
    try {
        const whole = union([closed(shapes[0])], ...shapes.slice(1).map(shape => [closed(shape)]));
        rest = difference(whole, ...covered.filter(c => c.length > 2).map(c => [closed(c)]));
    } catch {
        return [];   // the clipping can fail on degenerate shapes: leave the surface as it is
    }
    return rest.flatMap(polygon => {
        const outer = polygon[0].slice(0, -1) as Vec2[];
        let area = 0;
        let perimeter = 0;
        outer.forEach((p, i) => {
            const q = outer[(i + 1) % outer.length];
            area += p[0] * q[1] - q[0] * p[1];
            perimeter += len(sub(q, p));
        });
        // (twice the area over the perimeter is a thin shape's width)
        return Math.abs(area) / Math.max(perimeter, 1e-6) < 0.3 ? [] : polygon.map(ring => ring.slice(0, -1) as Vec2[]);
    });
}

/** A curve from `from` to `to` drawn towards `control` */
function quadraticCurve(from: Vec2, control: Vec2, to: Vec2): Vec2[] {
    return Array.from({ length: 9 }, (_, i) => {
        const a = i / 8;
        const b = 1 - a;
        return [
            b * b * from[0] + 2 * a * b * control[0] + a * a * to[0],
            b * b * from[1] + 2 * a * b * control[1] + a * a * to[1]
        ] as Vec2;
    });
}
function cornerCurve(from: Vec2, fromDirection: Vec2, to: Vec2, toDirection: Vec2): Vec2[] {
    // the kerbs run back towards the node: from - t × fromDirection and to - u × toDirection
    const cross = fromDirection[0] * toDirection[1] - fromDirection[1] * toDirection[0];
    if (Math.abs(cross) > 0.05) {
        const d = sub(to, from);
        const t = -(d[0] * toDirection[1] - d[1] * toDirection[0]) / cross;
        const u = -(d[0] * fromDirection[1] - d[1] * fromDirection[0]) / cross;
        if (t >= 0 && u >= 0 && t < 20 && u < 20) {
            const meet = sub(from, scale(fromDirection, t));
            return Array.from({ length: 9 }, (_, i) => {
                const a = i / 8;
                const b = 1 - a;
                return [
                    b * b * from[0] + 2 * a * b * meet[0] + a * a * to[0],
                    b * b * from[1] + 2 * a * b * meet[1] + a * a * to[1]
                ] as Vec2;
            });
        }
    }
    return [from, to];
}


// a junction depends on its roads, every node of them, their relations, and their drawing shifts
const junctionCache = new WeakMap<osmNode, { deps: unknown[]; signature: string; result: Junction }>();

function visualSignature(ways: osmWay[], visuals: Map<string, WayVisual>): string {
    return ways.map(w => {
        const v = visuals.get(w.id);
        return v ? `${w.id}:${v.start.toFixed(2)}:${v.end.toFixed(2)}:${v.taperStart.map(t => t.lane)}:${v.taperEnd.map(t => t.lane)}` +
            `:${v.fit ? v.fit.map(p => `${p[0].toFixed(0)}/${p[1].toFixed(2)}`).join(',') : ''}` : '';
    }).join('|');
}

/**
 * Where a two-way road divides into two roads carrying on from it at a shallow angle, at least one of them one way
 * (where a dual carriageway or a road round an island starts, as Oak Spinney Park at Ratby Lane, Leicester): the
 * two-way road and the two branches, or none. No traffic crosses there, so it is no junction: the roads meet at
 * the node.
 */
export function splitAt(arms: Arm[]): { stem: Arm; branches: [Arm, Arm] } | null {
    if (arms.length !== 3 || new Set(arms.map(arm => arm.way.id)).size !== 3) return null;
    for (const stem of arms) {
        const branches = arms.filter(arm => arm !== stem) as [Arm, Arm];
        const ahead = scale(stem.direction, -1);
        if (branches.some(arm => angleBetween(arm.direction, ahead) > 50)) continue;
        if (stem.layout.model.oneway || !branches.some(arm => arm.layout.model.oneway)) return null;
        return { stem, branches };
    }
    return null;
}

/** How far each road is pulled back at a node, the junction area that fills the gap, and the lane connections */
function junctionAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>, areaRoads: Set<string> = new Set()): Junction {
    const parents = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const deps = parents.flatMap(way => [way, ...way.nodes.map(id => graph.entity(id)), ...graph.parentRelations(way)]);
    const signature = visualSignature(parents, visuals) + '|' + parents.filter(way => areaRoads.has(way.id)).map(way => way.id).join(',');
    const cached = junctionCache.get(node);
    if (cached && cached.signature === signature && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
        return cached.result;
    }

    const arms = armsAt(node, graph, visuals);
    const trims = new Map<string, number>();
    const marks = new Map<string, MarkTrim>();
    const partners = new Map<string, Vec2>();
    const result: Junction = { trims, marks, partners, connections: [] };

    const split = miniRoundaboutRadius(node, graph) ? null : splitAt(arms);
    if (split) {
        // the roads run up to the node; the wedges between their square ends are road surface, not a junction box
        // the stem runs up to the node; each branch starts where it clears the other (the nose of the island
        // between them), and the road between is filled
        const frame = metricFrame(node.loc);
        const s = arms.indexOf(split.stem);
        const [a, b] = [arms[(s + 1) % 3], arms[(s + 2) % 3]];
        const apart = Math.min(maxClearance, Math.max(edgeMeeting(a, a.left, b, b.right) ?? 0, edgeMeeting(b, b.right, a, a.left) ?? 0));
        const corners = arms.flatMap(arm => {
            const t = Math.min(arm === split.stem ? 0 : apart, polylineLength(arm.line));
            trims.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), t);
            const at = pointAlong(arm.line, t);
            const normal = rightNormal(at.direction);
            const [left, right] = arm.sidesAt(t);
            return [add(at.point, scale(normal, left)), add(at.point, scale(normal, right))];
        });
        // the kerbs run on from the stem's edges to the branches' outer edges
        const corner = (arm: Arm, side: 0 | 1) => corners[arms.indexOf(arm) * 2 + side];
        const assumed = split.stem.layout.assumed || a.layout.assumed || b.layout.assumed;
        const kerbs = [[corner(split.stem, 0), corner(a, 1)], [corner(b, 0), corner(split.stem, 1)]]
            .filter(([p, q]) => len(sub(p, q)) > 0.3)
            .map(line => ({ line: line.map(frame.toLoc), assumed }));
        result.area = { nodeID: node.id, polygons: [wound(hull(corners).map(frame.toLoc))], kerbs, kind: 'flare' };
        junctionCache.set(node, { deps, signature, result });
        return result;
    }

    if (arms.length >= 2) {
        // round a mini-roundabout nothing runs straight through: every arm stops at its circle
        const mini = miniRoundaboutRadius(node, graph);
        const through = arms.length >= 3 && !mini ? throughPair(arms) : null;
        arms.forEach((arm, i) => {
            let trim = mini ?? 0;
            const onMainRoad = through && (through[0] === i || through[1] === i);
            if (arms.length >= 3 && !onMainRoad) {
                const leftNeighbour = arms[(i + 1) % arms.length];                 // counter-clockwise
                const rightNeighbour = arms[(i - 1 + arms.length) % arms.length];  // clockwise
                const l = edgeMeeting(arm, arm.left, leftNeighbour, leftNeighbour.right);
                const r = edgeMeeting(arm, arm.right, rightNeighbour, rightNeighbour.left);
                trim = Math.min(maxClearance, Math.max(trim, l ?? 0, r ?? 0));
            }
            trims.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), trim);
        });

        // side roads drawn by their own carriageway area: the area is their surface right up to the
        // main road, so the main road is left as it is (no box, its kerbs and lines unbroken)
        const onlyAreaSides = !!through && arms.every((arm, i) => through.includes(i) || areaRoads.has(arm.way.id));

        // the main road runs on through: its kerbs stop where side roads join, and its lane lines
        // stop at the junction box (except round a roundabout, whose lanes carry on)
        if (through && !onlyAreaSides) {
            for (const i of through) {
                const arm = arms[i];
                let left = 0;
                let right = 0;
                arms.forEach((side, j) => {
                    if (through.includes(j)) return;
                    const cross = arm.direction[0] * side.direction[1] - arm.direction[1] * side.direction[0];
                    const sin = Math.max(0.3, Math.abs(cross));
                    const reach = Math.min(maxClearance, (side.right - side.left) / 2 / sin + 0.5);
                    // counter-clockwise from the arm is its left
                    if (cross > 0) left = Math.max(left, reach);
                    else right = Math.max(right, reach);
                });
                // a roundabout's lane lines and kerbs carry on all the way round, across the mouths of its roads
                if (isRing(arm.way)) {
                    left = 0;
                    right = 0;
                }
                const lanes = isRing(arm.way) ? 0 : Math.max(left, right);
                // in the way's frame, an arm against the way has its sides swapped
                marks.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), arm.alongWay
                    ? { left, right, lanes }
                    : { left: right, right: left, lanes });
            }
        }

        // arms that carry straight on into each other meet on the bisector of their bend
        const pair = arms.length === 2 && !mini ? [0, 1] : through;
        if (pair) {
            const [p, q] = pair.map(i => arms[i]);
            partners.set(armKey(p.way.id, p.nodeIndex, p.alongWay), q.firstSegment);
            partners.set(armKey(q.way.id, q.nodeIndex, q.alongWay), p.firstSegment);
        }

        // the junction area joins the pulled-back ends of all arms
        // (the main road runs through untrimmed, so the box reaches along it as far as the side roads are wide)
        const frame = metricFrame(node.loc);
        const onMain = (i: number) => !!through && (through[0] === i || through[1] === i);
        const reach = Math.max(0, ...arms.filter((_, i) => !onMain(i)).map(arm => (arm.right - arm.left) / 2));
        // the side of a main road arm its side roads are on (1: its left, counter-clockwise; -1: its right),
        // or 0 when they are on both: round a roundabout, the outside of the ring
        const ringCentre = (arm: Arm): Vec2 => frame.toMetres(ringMiddle(arm.way, graph));
        const sideOf = (arm: Arm): number => {
            if (isRing(arm.way)) {
                const centre = ringCentre(arm);
                return Math.sign(-arm.direction[1] * -centre[0] + arm.direction[0] * -centre[1]) || 1;
            }
            const sides = arms.filter((_, j) => !onMain(j))
                .map(side => Math.sign(arm.direction[0] * side.direction[1] - arm.direction[1] * side.direction[0]));
            return sides.length && sides.every(side => side === sides[0]) ? sides[0] : 0;
        };
        // where no traffic crosses the main road (round a roundabout, or a one-way road that roads only join
        // or leave on one side, like a slip road) the box is only the mouth outside the main road's edge: the
        // entry or exit widening out, drawn as road
        const mouthOnly = !!through && through.every(k => isRing(arms[k].way)) ||
            !!through && through.every(k => !!arms[k].layout.model.oneway && sideOf(arms[k]) !== 0);
        const edgeAt = (arm: Arm, t: number, side: 'left' | 'right'): Vec2 => {
            const at = pointAlong(arm.line, Math.min(t, polylineLength(arm.line)));
            const [left, right] = arm.sidesAt(t);
            return add(at.point, scale(rightNormal(at.direction), side === 'left' ? left : right));
        };
        const directionAt = (arm: Arm, t: number) => pointAlong(arm.line, Math.min(t, polylineLength(arm.line))).direction;

        // a road joining a roundabout stops where both its edges are clear of the ring's curved outer edge,
        // plus room for its kerbs to flare into the ring (straight lines from the node, as used for other
        // junctions, miss the ring's curve: wide or slanting roads then overlapped it or left a gap)
        const ringJoin = mouthOnly && !!through && through.every(k => isRing(arms[k].way));
        const crossings = new Map<number, { left: Vec2; right: Vec2; flare: number }>();
        const ring: RingFlare | undefined = ringJoin ? { exits: new Set(), mouths: new Map() } : undefined;
        if (ringJoin) {
            const outerHalf = (arm: Arm) => {
                const side = sideOf(arm) > 0 ? 'left' : 'right';
                const length = Math.min(80, polylineLength(arm.line));
                const points: Vec2[] = [];
                for (let t = 0; t < length; t += 1) points.push(edgeAt(arm, t, side));
                points.push(edgeAt(arm, length, side));
                return points;
            };
            const [a, b] = through!.map(k => arms[k]);
            const outer = [...outerHalf(a).reverse(), ...outerHalf(b).slice(1)];
            const centre = ringCentre(a);
            const outside = (p: Vec2) => {
                const q = pointAlong(outer, projectOnto(outer, p)).point;
                return len(sub(p, centre)) > len(sub(q, centre)) + 0.05;
            };
            arms.forEach((arm, i) => {
                if (onMain(i)) return;
                const length = polylineLength(arm.line);
                const clear = (side: 'left' | 'right') => {
                    for (let t = 0; t <= Math.min(maxClearance, length); t += 0.25) {
                        const p = edgeAt(arm, t, side);
                        if (outside(p)) return { t, p };
                    }
                    return null;
                };
                const left = clear('left');
                const right = clear('right');
                if (!left || !right) return;
                const flare = Math.min(8, Math.max(2.5, (arm.right - arm.left) * 0.4));
                const trim = Math.min(Math.max(left.t, right.t) + flare, maxClearance, length * 0.45);
                trims.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), trim);
                crossings.set(i, { left: left.p, right: right.p, flare });
            });
        }

        type End = { right: Vec2; left: Vec2; rightAt: number; leftAt: number; rightDirection: Vec2; leftDirection: Vec2 };
        const ends: End[] = arms.map((arm, i) => {
            const trim = trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0;
            // the road's edges where it ends: a road shifted or tapering along its length is not where it is at the node
            const t = Math.min(onMain(i) && !mouthOnly ? Math.max(trim, reach) : trim, polylineLength(arm.line));
            const direction = directionAt(arm, t);
            return { right: edgeAt(arm, t, 'right'), left: edgeAt(arm, t, 'left'), rightAt: t, leftAt: t, rightDirection: direction, leftDirection: direction };
        });
        // where the ring's lanes run on into an exit (ring arm:exit arm), and the corner of the ring's road on
        // that side: where its edge meets the bisector its end is cut on (see buildPieces)
        const peeled = new Set<string>();
        const cutCorner = (i: number, side: 'left' | 'right'): Vec2 => {
            const p = edgeAt(arms[i], 0, side);
            const u = arms[i].firstSegment;
            const other = through!.find(k => k !== i);
            const d = other === undefined ? [0, 0] as Vec2 : sub(u, arms[other].firstSegment);
            if (len(d) < 1e-6) return p;
            const c = rightNormal(unit(d));
            const denominator = u[0] * c[1] - u[1] * c[0];
            if (Math.abs(denominator) < 0.1) return p;
            const t = -(p[0] * c[1] - p[1] * c[0]) / denominator;
            return Math.abs(t) < 10 ? add(p, scale(u, t)) : p;
        };
        // on the side a road joins, the main road's end of the box runs back to that road's corner, so a road
        // joining at a shallow angle meets a smooth wedge rather than a step
        const throughEnd = (i: number, through: [number, number]) => {
            const arm = arms[i];
            const length = polylineLength(arm.line);
            const extended = { left: 0, right: 0 };
            const extend = (side: 'left' | 'right', corner: Vec2, neighbour: number) => {
                // round a roundabout the ring's edge runs on past where the joining road's edge leaves it,
                // so the kerb curves smoothly from one to the other
                const crossing = crossings.get(neighbour);
                const leaving = crossing?.[side === 'left' ? 'right' : 'left'];
                const s = Math.min(maxClearance, leaving ? projectOnto(arm.line, leaving) + crossing!.flare : projectOnto(arm.line, corner));
                const key = side === 'left' ? 'leftAt' : 'rightAt';
                if (s <= ends[i][key] || s >= length) return;
                extended[side] = s;
                ends[i][key] = s;
                ends[i][side] = edgeAt(arm, s, side);
                ends[i][side === 'left' ? 'leftDirection' : 'rightDirection'] = directionAt(arm, s);
            };
            const next = (i + 1) % arms.length;
            const previous = (i - 1 + arms.length) % arms.length;
            const leaving = through.map(k => arms[k]).find(a => a.layout.model.lanes[armLaneDirection(a, false)].length > 0);
            const isExit = (k: number) => !onMain(k) && !!leaving &&
                !arms[k].layout.model.lanes[armLaneDirection(arms[k], true)].length &&
                arms[k].layout.model.lanes[armLaneDirection(arms[k], false)].length > 0 &&
                angleBetween(arms[k].firstSegment, leaving.firstSegment) < 40;
            // the ring's outer lanes run on into an exit leaving at a shallow angle: the ring's kerb carries on to
            // the end of its road and sweeps from there into the exit's kerb (see peelCorner)
            const peels = (k: number) => ringJoin && isRing(arm.way) && isExit(k) &&
                arm.layout.model.lanes[armLaneDirection(arm, true)].length > 0;
            if (!onMain(next) && !peels(next)) extend('left', ends[next].right, next);
            if (!onMain(previous) && !peels(previous)) extend('right', ends[previous].left, previous);
            for (const [k, side] of [[next, 'left'], [previous, 'right']] as const) {
                if (!peels(k)) continue;
                peeled.add(`${i}:${k}`);
                ends[i][side] = cutCorner(i, side);
                ends[i][side === 'left' ? 'leftAt' : 'rightAt'] = 0;
                ends[i][side === 'left' ? 'leftDirection' : 'rightDirection'] = directionAt(arm, 0);
            }
            // the main road's kerb stops where the box's edge starts; round a roundabout its edge line carries on
            // across the mouths of its roads (the give-way line at entries), except across an exit leaving at a
            // shallow angle, where it would run diagonally over the exit's lanes like a lane line
            const key = armKey(arm.way.id, arm.nodeIndex, arm.alongWay);
            const mark = marks.get(key);
            // the line stops over the whole mouth: up to where the exit's own lanes begin
            const mouth = (corner: Vec2) => Math.min(maxClearance, Math.max(0, projectOnto(arm.line, corner)));
            const cut = isRing(arm.way)
                ? {
                    left: isExit(next) ? Math.max(extended.left, mouth(ends[next].right)) : 0,
                    right: isExit(previous) ? Math.max(extended.right, mouth(ends[previous].left)) : 0
                }
                : extended;
            // round a roundabout: the exits the ring's outer lanes are guided off into, and how far along the ring
            // each road's mouth reaches
            if (ring) {
                for (const k of [next, previous]) if (isExit(k)) ring.exits.add(k);
                ring.mouths.set(`${i}:${next}`, Math.max(extended.left, mouth(ends[next].right)));
                ring.mouths.set(`${i}:${previous}`, Math.max(extended.right, mouth(ends[previous].left)));
            }
            if (mark && (cut.left || cut.right)) {
                const [wayLeft, wayRight] = arm.alongWay ? [cut.left, cut.right] : [cut.right, cut.left];
                marks.set(key, { ...mark, left: Math.max(mark.left, wayLeft), right: Math.max(mark.right, wayRight) });
            }
            // a mouth-only box keeps to the main road's edge on its side roads' side
            if (mouthOnly) {
                const facing = sideOf(arm) > 0 ? 'left' : 'right';
                const other = facing === 'left' ? 'right' : 'left';
                ends[i][other] = ends[i][facing];
                ends[i][other === 'left' ? 'leftAt' : 'rightAt'] = ends[i][facing === 'left' ? 'leftAt' : 'rightAt'];
                ends[i][other === 'left' ? 'leftDirection' : 'rightDirection'] = ends[i][facing === 'left' ? 'leftDirection' : 'rightDirection'];
            }
        };
        if (through) for (const i of through) throughEnd(i, through);
        // the edge of a mouth-only box between the two halves of the main road follows its kerb, which curves
        // round a roundabout, from one half's end back past the node and out to the other's
        // (at the node it takes in the corners where the two halves' roads are cut, on the bisector of their bend,
        // so where one half is wider than the other the step between them is filled)
        const alongKerb = (i: number, fromAt: number, j: number, toAt: number): Vec2[] => {
            const [from, to] = [arms[i], arms[j]];
            const fromSide = sideOf(from) > 0 ? 'left' : 'right';
            const toSide = sideOf(to) > 0 ? 'left' : 'right';
            const points: Vec2[] = [];
            for (let s = fromAt; s > 0; s -= 2) points.push(edgeAt(from, s, fromSide));
            points.push(edgeAt(from, 0, fromSide), cutCorner(i, fromSide), cutCorner(j, toSide), edgeAt(to, 0, toSide));
            for (let s = 2; s < toAt; s += 2) points.push(edgeAt(to, s, toSide));
            points.push(edgeAt(to, toAt, toSide));
            return points;
        };

        // the kerb from one road's end to the next's: sweeping on into an exit the ring's lanes run into, through
        // where a road's edge crosses the ring's, or round the corner where the two edges would meet
        const sideCorner = (i: number, j: number, end: End, next: End, crossing: Vec2 | undefined): Vec2[] => {
            if (peeled.has(`${i}:${j}`)) return peelCorner(end.left, end.leftDirection, next.right, next.rightDirection);
            if (peeled.has(`${j}:${i}`)) return peelCorner(next.right, next.rightDirection, end.left, end.leftDirection).reverse();
            return crossing ? quadraticCurve(end.left, crossing, next.right)
                : cornerCurve(end.left, end.leftDirection, next.right, next.rightDirection);
        };

        // arms are in counter-clockwise order, and each arm's right edge comes before its left, so the
        // outline never crosses itself; between two neighbouring arms it follows a kerb curve
        const points: Vec2[] = [];
        const kerbs: JunctionArea['kerbs'] = [];
        ends.forEach((end, i) => {
            const j = (i + 1) % ends.length;
            const next = ends[j];
            const throughCorner = onMain(i) && onMain(j);
            // round a roundabout a joining road's kerb curves through where its edge crosses the ring's edge
            // (the ring curves away from its tangent, so the two edges' straight lines may never meet)
            const crossing = !throughCorner && ringJoin ? (onMain(i) ? crossings.get(j)?.right : crossings.get(i)?.left) : undefined;
            const corner = throughCorner && mouthOnly
                ? alongKerb(i, end.leftAt, j, next.rightAt)
                : sideCorner(i, j, end, next, crossing);
            points.push(end.right, end.left, ...corner.slice(1, -1));
            // the corner is a kerb, except between the two halves of a road running straight through
            // (its own kerb is drawn) and round a mini-roundabout (its circle is the edge)
            if (arms.length >= 3 && !throughCorner && !mini && len(sub(next.right, end.left)) > 0.5) {
                kerbs.push({ line: corner.map(frame.toLoc), assumed: arms[i].layout.assumed || arms[j].layout.assumed });
            }
        });
        // (where two roads just join, they meet on the bisector and need no box)
        if ((arms.length >= 3 || mini) && !onlyAreaSides) {
            result.area = { nodeID: node.id, polygons: [wound(points.map(frame.toLoc))], kerbs, kind: mouthOnly ? 'flare' : 'junction' };
        }
        const surfaces: Vec2[][] = [];
        result.connections = junctionConnections(node, graph, arms, trims, through, ring, surfaces);
        if (result.area && surfaces.length) {
            // the road surface under connected lanes, where neither the junction's box nor a road already is
            const roads = arms.map(arm => {
                const from = Math.min(trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0, polylineLength(arm.line));
                const to = Math.min(from + 80, polylineLength(arm.line));
                const stations = Array.from({ length: Math.ceil((to - from) / 2) + 1 }, (_, k) => Math.min(to, from + k * 2));
                return [...stations.map(t => edgeAt(arm, t, 'left')), ...stations.reverse().map(t => edgeAt(arm, t, 'right'))];
            });
            // where the two halves of the main road meet, on the bisector of their bend
            const meeting = through ? (() => {
                const corners = through.flatMap(k => [edgeAt(arms[k], 0, 'left'), edgeAt(arms[k], 0, 'right')]);
                return corners.map((_, k) => corners.filter((__, m) => m !== k));
            })() : [];
            result.area.polygons.push(...uncovered(surfaces, [points, ...roads, ...meeting]).map(ring => ring.map(frame.toLoc)));
        }
    }

    junctionCache.set(node, { deps, signature, result });
    return result;
}


/* ---------- turning heads ---------- */

/** A turning circle, loop or hammerhead at the end of a road, drawn as part of it */
export interface TurningHead {
    nodeID: string;
    /** the head's surface beyond the road, as rings to fill even-odd */
    polygons: Vec2[][];
    kerbs: { line: Vec2[]; assumed: boolean }[];
    /** the island in the middle of a turning loop */
    island?: Vec2[];
    /** the road's pavement carried round the head */
    pavements: Vec2[][];
    assumed: boolean;
}

interface HeadAt {
    head: TurningHead;
    /** where the roads' kerbs and lane lines stop, keyed like a junction's `trims` */
    marks: Map<string, MarkTrim>;
    /** how far each road is pulled back */
    trims: Map<string, number>;
    partners: Map<string, Vec2>;
    /** the node is in the middle of a way, which is split there so its kerb can stop */
    cut: boolean;
}

const headCache = new WeakMap<osmNode, { deps: unknown[]; signature: string; result: HeadAt | null }>();

/** The turning head at a `highway=turning_circle|turning_loop` node with one or two roads */
function turningHeadAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>): HeadAt | null {
    const highway = node.tags.highway;
    if (highway !== 'turning_circle' && highway !== 'turning_loop') return null;
    const parents = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const deps = [node, ...parents.flatMap(way => [way, ...way.nodes.map(id => graph.entity(id))])];
    const signature = visualSignature(parents, visuals);
    const cached = headCache.get(node);
    if (cached && cached.signature === signature && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
        return cached.result;
    }

    const arms = armsAt(node, graph, visuals);
    // a pavement on either side of the road is carried round the head
    const pavementOf = (arm: Arm) => Math.max(0, ...(['left', 'right'] as const).map(side => {
        const strips = arm.layout.roadside[side];
        return strips.some(strip => strip.kind === 'sidewalk') ? strips.reduce((sum, strip) => sum + strip.width, 0) : 0;
    }));
    const shape = turningHead(node.tags, arms.map(arm => ({ direction: arm.firstSegment, left: arm.left, right: arm.right, pavement: pavementOf(arm) })));
    let result: HeadAt | null = null;
    if (shape) {
        const frame = metricFrame(node.loc);
        const marks = new Map<string, MarkTrim>();
        const trims = new Map<string, number>();
        const partners = new Map<string, Vec2>();
        arms.forEach((arm, i) => {
            const trim = shape.trims[i];
            if (trim.road > 0) trims.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), trim.road);
            // in the way's frame, an arm against the way has its sides swapped
            marks.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), arm.alongWay
                ? { left: trim.left, right: trim.right, lanes: trim.lanes, roadside: true }
                : { left: trim.right, right: trim.left, lanes: trim.lanes, roadside: true });
        });
        if (arms.length === 2) {
            partners.set(armKey(arms[0].way.id, arms[0].nodeIndex, arms[0].alongWay), arms[1].firstSegment);
            partners.set(armKey(arms[1].way.id, arms[1].nodeIndex, arms[1].alongWay), arms[0].firstSegment);
        }
        const assumed = arms.some(arm => arm.layout.assumed);
        result = {
            head: {
                nodeID: node.id,
                polygons: shape.polygons.map(ring => wound(ring.map(frame.toLoc))),
                kerbs: shape.kerbs.map(line => ({ line: line.map(frame.toLoc), assumed })),
                island: shape.island?.map(frame.toLoc),
                pavements: shape.pavements.map(ring => ring.map(frame.toLoc)),
                assumed
            },
            marks, trims, partners,
            cut: arms.length === 2 && !arms[0].isEnd
        };
    }
    headCache.set(node, { deps, signature, result });
    return result;
}


/* ---------- fitting roads into mapped carriageway areas ---------- */

const fitCache = new WeakMap<osmWay, { deps: unknown[]; fit: [number, number][] | undefined }>();

/**
 * Where a mapped carriageway area (`area:highway=primary` etc.) covers a road, the sideways shift
 * that centres the road's lanes in it, sampled along the way. Undefined when no area covers the
 * road, or it already sits in the middle.
 */
function fitToAreas(way: osmWay, graph: coreGraph, areas: osmWay[]): [number, number][] | undefined {
    if (!areas.length || hasPlacement(way)) return undefined;
    const extent = way.extent(graph);
    const near = areas.filter(area => area.extent(graph).intersects(extent));
    if (!near.length) return undefined;

    const deps: unknown[] = [...way.nodes.map(id => graph.entity(id)), ...near.flatMap(area => [area, ...area.nodes.map(id => graph.entity(id))])];
    const cached = fitCache.get(way);
    if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) return cached.fit;

    const layout = cachedLayout(way, graph);
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = lineLocs(way, graph).map(frame.toMetres);
    const total = polylineLength(points);
    const polygons = near.map(area => lineLocs(area, graph).map(frame.toMetres));
    const bandWidth = layout.total;

    const samples: [number, number][] = [];
    const step = Math.max(4, total / 150);
    for (let s = Math.min(2, total / 2); s < total; s += step) {
        const at = pointAlong(points, s);
        const normal = rightNormal(at.direction);
        const polygon = polygons.find(poly => pointInPolygon(at.point, poly));
        if (!polygon) continue;
        // the area's edges straight across the road from this point
        let left = -Infinity;
        let right = Infinity;
        for (let i = 0; i < polygon.length - 1; i++) {
            const a = polygon[i];
            const e = sub(polygon[i + 1], a);
            const denom = normal[0] * e[1] - normal[1] * e[0];
            if (Math.abs(denom) < 1e-9) continue;
            const d = sub(a, at.point);
            const t = (d[0] * e[1] - d[1] * e[0]) / denom;          // along the normal
            const u = (d[0] * normal[1] - d[1] * normal[0]) / denom; // along the edge
            if (u < 0 || u > 1) continue;
            if (t >= 0) right = Math.min(right, t);
            else left = Math.max(left, t);
        }
        if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
        const width = right - left;
        // an area much narrower or wider than the road is not its carriageway (a plaza, a car park)
        if (width < bandWidth * 0.6 || width > bandWidth * 2.5) continue;
        const t = total > 0 ? s / total : 0;
        const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t;
        const bandCentre = (layout.edges[0] + layout.edges[layout.edges.length - 1]) / 2 + shift;
        const offset = (left + right) / 2 - bandCentre;
        // moving the road by more than half its width would take it out of its own line: the area is not where it runs
        if (Math.abs(offset) > Math.max(1.5, bandWidth / 2)) continue;
        samples.push([s, offset]);
    }

    // a running median irons out kinks where the area's outline has corners
    const smoothed: [number, number][] = samples.map(([sAt], i) => {
        const window = samples.slice(Math.max(0, i - 2), i + 3).map(p => p[1]).sort((a, b) => a - b);
        return [sAt, window[Math.floor(window.length / 2)]];
    });
    const fit = smoothed.length && smoothed.some(p => Math.abs(p[1]) > 0.3) ? smoothed : undefined;
    fitCache.set(way, { deps, fit });
    return fit;
}


/**
 * Which road each mapped carriageway area is the surface of: the road lying most inside it (by
 * length inside, weighted by how much of the road that is). Roads only passing by or across an
 * area's edge, like the main road a side road's area joins, are not its road.
 */
function areaOwners(ways: osmWay[], graph: coreGraph, areas: osmWay[]): Map<string, osmWay> {
    const owners = new Map<string, osmWay>();
    for (const area of areas) {
        const extent = area.extent(graph);
        const frame = metricFrame((graph.entity(area.first()) as osmNode).loc);
        const polygon = lineLocs(area, graph).map(frame.toMetres);
        let best: { way: osmWay; score: number } | null = null;
        for (const way of ways) {
            if (!extent.intersects(way.extent(graph))) continue;
            const points = lineLocs(way, graph).map(frame.toMetres);
            const total = polylineLength(points);
            if (total <= 0) continue;
            const step = Math.max(1, total / 200);
            let inside = 0;
            for (let d = step / 2; d < total; d += step) {
                if (pointInPolygon(pointAlong(points, d).point, polygon)) inside += step;
            }
            if (inside < Math.min(10, total * 0.5)) continue;
            const score = inside * (inside / total);
            if (!best || score > best.score) best = { way, score };
        }
        if (best) owners.set(area.id, best.way);
    }
    return owners;
}


/* ---------- pieces ---------- */

function toLocs(frame: MetricFrame, points: Vec2[]): Vec2[] {
    return points.map(frame.toLoc);
}

function ring(left: Vec2[], right: Vec2[]): Vec2[] {
    return [...left, ...right.slice().reverse()];
}

/** Adds vertices at the given distances along a polyline, so a taper has corners where it starts and ends */
function withVerticesAt(points: Vec2[], distances: number[]): Vec2[] {
    const total = polylineLength(points);
    // (breaks closer than a centimetre are one: a zero-length segment has no direction to offset along)
    const wanted = distances.filter(d => d > 0.01 && d < total - 0.01).sort((a, b) => a - b)
        .filter((d, i, all) => i === 0 || d - all[i - 1] > 0.01);
    if (!wanted.length) return points;
    const cumulative = cumulativeLengths(points);
    const result: Vec2[] = [points[0]];
    let w = 0;
    for (let i = 1; i < points.length; i++) {
        while (w < wanted.length && wanted[w] < cumulative[i]) {
            if (wanted[w] > cumulative[i - 1] + 0.01 && wanted[w] < cumulative[i] - 0.01) result.push(pointAlong(points, wanted[w]).point);
            w++;
        }
        result.push(points[i]);
    }
    return result;
}


/** Builds the pieces of one road, between the nodes where it meets two or more other roads */
/**
 * Where traffic travelling `direction` along a way stops at a stop line, give-way line or traffic
 * signals on the way's node `index`: how far before the node the line is (as drawn by street.ts: at a
 * junction it stands back by half the widest other road), or null if the node has none for that direction
 */
function stopLineBack(way: osmWay, index: number, direction: 'forward' | 'backward', graph: coreGraph): number | null {
    const node = graph.entity(way.nodes[index]) as osmNode;
    const highway = node.tags.highway;
    if (highway !== 'stop' && highway !== 'give_way' && highway !== 'traffic_signals') return null;
    const roads = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const armCount = roads.reduce((n, w) => {
        const i = w.nodes.indexOf(node.id);
        return n + (i > 0 ? 1 : 0) + (i < w.nodes.length - 1 ? 1 : 0);
    }, 0);
    const atJunction = armCount >= 3;
    if (!(highway === 'traffic_signals' && atJunction)) {
        // which way the line faces: the direction tag, the road's one-way direction, or towards the nearer end
        const tagged = node.tags.direction ?? node.tags['traffic_signals:direction'] ?? node.tags['highway:direction'];
        const oneway = cachedLayout(way, graph).model.oneway;
        const last = way.nodes.length - 1;
        const signalCrossing = highway === 'traffic_signals' && !!node.tags.crossing && node.tags.crossing !== 'no';
        const facing = tagged === 'forward' || tagged === 'backward' ? [tagged]
            : tagged === 'both' || tagged === 'all' ? ['forward', 'backward']
                : oneway ? [oneway]
                    : signalCrossing ? ['forward', 'backward']
                    : [index === last || (index !== 0 && index >= last / 2) ? 'forward' : 'backward'];
        if (!facing.includes(direction)) return null;
    }
    if (!atJunction) return 0;
    const widest = Math.max(0, ...roads.filter(w => w.id !== way.id).map(w => cachedLayout(w, graph).total));
    return widest / 2 + 1;
}

/**
 * Where traffic travelling `direction` on the piece of a way from node `a` to node `b` stops before the end
 * it approaches: the stop line, give-way line or signals' line nearest that end, as a distance along the
 * piece (`along` gives each node's), moved back behind a pedestrian crossing just before it; null if none
 */
function stopBefore(way: osmWay, graph: coreGraph, a: number, b: number, along: (n: number) => number, pieceLength: number,
    [trimStart, trimEnd]: [number, number], direction: 'forward' | 'backward'): number | null {
    const sign = direction === 'forward' ? 1 : -1;
    let best: number | null = null;
    for (let n = a; n <= b; n++) {
        const back = stopLineBack(way, n, direction, graph);
        if (back === null) continue;
        const s = along(n) - sign * back;
        const fromEnd = direction === 'forward' ? pieceLength - s : s;
        // (a line in the junction, where the road is pulled back, still counts)
        if (fromEnd > stopReach || fromEnd < -(direction === 'forward' ? trimEnd : trimStart) - 0.01) continue;
        if (best === null || sign * s > sign * best) best = s;
    }
    if (best === null) return null;
    const crossings = Array.from({ length: b - a + 1 }, (_, k) => a + k).filter(n => {
        const node = graph.entity(way.nodes[n]) as osmNode;
        return node.tags.highway === 'crossing' || (!!node.tags.crossing && node.tags.crossing !== 'no') || graph.parentWays(node).some(w =>
            w.tags.footway === 'crossing' || w.tags.cycleway === 'crossing' || w.tags.path === 'crossing');
    }).map(along).sort((p, q) => sign * (q - p));
    for (const c of crossings) {
        // a crossing up to 10 m before the line (or on it): the line counts as just before the crossing
        const before = sign * (best - c);
        if (before > -0.5 && before < 10) best = c - sign * 2.5;
    }
    return best;
}

function buildPieces(way: osmWay, graph: coreGraph, junctionNodes: Set<string>, visual: WayVisual,
    trimAt: (index: number, alongWay: boolean) => number,
    markAt: (index: number, alongWay: boolean) => MarkTrim | undefined,
    partnerAt: (index: number, alongWay: boolean) => Vec2 | undefined = () => undefined): RoadPiece[] {

    const layout = cachedLayout(way, graph);
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = lineLocs(way, graph).map(frame.toMetres);
    const cumulative = cumulativeLengths(points);
    const total = cumulative[cumulative.length - 1];

    // split at interior junctions
    const cuts = [0];
    for (let i = 1; i < way.nodes.length - 1; i++) {
        if (junctionNodes.has(way.nodes[i])) cuts.push(i);
    }
    cuts.push(way.nodes.length - 1);

    const pieces: RoadPiece[] = [];
    for (let p = 0; p < cuts.length - 1; p++) {
        const a = cuts[p];
        const b = cuts[p + 1];
        const line = points.slice(a, b + 1);
        const length = cumulative[b] - cumulative[a];
        if (length <= 0) continue;

        let trimStart = trimAt(a, true);
        let trimEnd = trimAt(b, false);
        if (trimStart + trimEnd > length * 0.9) {
            const k = (length * 0.9) / (trimStart + trimEnd);
            trimStart *= k;
            trimEnd *= k;
        }
        const startAt = cumulative[a] + trimStart;
        // vertices where tapers end, so the taper is drawn as a straight slope
        const breaks = [
            ...visual.taperStart.map(t => t.length - startAt),
            ...visual.taperEnd.map(t => total - t.length - startAt)
        ];
        const sliced = withVerticesAt(slicePolyline(line, trimStart, length - trimEnd), breaks);
        const local = cumulativeLengths(sliced);
        const rows = local.map(s => edgesAt(layout, visual, startAt + s, total));
        // an untrimmed end that carries straight on into another road is cut on the bisector of the bend
        const partnerIn = trimStart < 0.01 ? partnerAt(a, true) : undefined;
        const partnerOut = trimEnd < 0.01 ? partnerAt(b, false) : undefined;
        const ends = { into: partnerIn ? scale(partnerIn, -1) : undefined, outOf: partnerOut };
        const offset = (distances: number[]) => offsetPolyline(sliced, distances, ends);
        const column = (k: number, plus = 0) => rows.map(r => r[k] + plus);

        const boundaries = layout.edges.map((_, k) => offset(column(k)));
        const lanes = layout.lanes.map((_, i) => ring(boundaries[i], boundaries[i + 1]));
        const centres = layout.lanes.map((_, i) => offset(rows.map(r => (r[i] + r[i + 1]) / 2)));
        const dividerSides = layout.edges.map((_, k): [Vec2[], Vec2[]] =>
            k === 0 || k === layout.edges.length - 1 ? [[], []] : [offset(column(k, -0.12)), offset(column(k, 0.12))]);

        const pieceLength = polylineLength(sliced);

        // painted lines stop short of where side roads join
        const markStart = markAt(a, true);
        const markEnd = markAt(b, false);
        const clip = (points: Vec2[], fromStart: number, fromEnd: number) => {
            if (!fromStart && !fromEnd) return points;
            const total = polylineLength(points);
            const k = pieceLength > 0 ? total / pieceLength : 1;
            const from = Math.max(0, fromStart - trimStart) * k;
            const to = total - Math.max(0, fromEnd - trimEnd) * k;
            return to - from > 0.5 ? slicePolyline(points, from, to) : [];
        };
        const lastEdge = layout.edges.length - 1;
        const markFor = (k: number, m: MarkTrim | undefined) => !m ? 0 : k === 0 ? m.left : k === lastEdge ? m.right : m.lanes;
        const lines = boundaries.map((line, k) => clip(line, markFor(k, markStart), markFor(k, markEnd)));
        const lineSides = dividerSides.map(([l, r], k): [Vec2[], Vec2[]] =>
            [clip(l, markFor(k, markStart), markFor(k, markEnd)), clip(r, markFor(k, markStart), markFor(k, markEnd))]);
        const arrows: LaneMark[] = [];
        const labels: LaneMark[] = [];
        layout.lanes.forEach((lane, i) => {
            const mark = (s: number, against: boolean): LaneMark => {
                const at = pointAlong(centres[i], s);
                const direction = against ? scale(at.direction, -1) : at.direction;
                return { lane: i, loc: frame.toLoc(at.point), ahead: frame.toLoc(add(at.point, direction)) };
            };
            const against = lane.ref.direction === 'backward';
            labels.push(mark(pieceLength / 2, against));
            if (!parseTurn(lane.turn).length) return;

            if (lane.ref.direction === 'both_ways') {
                // centre lanes are used from both sides
                if (pieceLength > 12) arrows.push(mark(pieceLength * 0.3, true), mark(pieceLength * 0.7, false));
                else if (pieceLength > 3) arrows.push(mark(pieceLength * 0.5, false));
                return;
            }
            // turn arrows sit on the approach to the junction the lane leads to, repeated every 60 m;
            // short pieces (on roundabouts, between close junctions) get one arrow in the middle
            const approach = against ? a === 0 : b === way.nodes.length - 1;
            if (!approach) return;
            if (pieceLength < 12) {
                // (a short link inside a junction cluster is not drawn, arrows included)
                if (pieceLength > 2.5) arrows.push(mark(pieceLength / 2, against));
                return;
            }
            // a lane that merges away into its neighbour has its arrow just before the taper starts
            let first = Math.min(8, pieceLength * 0.3);
            const taper = (against ? visual.taperStart : visual.taperEnd).find(t => t.lane === i);
            const merges = parseTurn(lane.turn).some(turn => turn === 'merge_to_left' || turn === 'merge_to_right');
            if (merges && taper) {
                const beforeTaper = taper.length - (against ? trimStart : trimEnd) + 3;
                if (beforeTaper < pieceLength - 4) first = Math.max(first, beforeTaper);
            }
            // at a stop line, give-way line or traffic signals near the end, the arrows of all lanes stand
            // level just behind the line (straight across the road from the same point on it)
            const stop = stopBefore(way, graph, a, b, n => cumulative[n] - cumulative[a] - trimStart, pieceLength, [trimStart, trimEnd],
                against ? 'backward' : 'forward');
            if (stop !== null) {
                const gap = 2 + Math.min(lane.width * 1.4, 5) / 2;
                const at = pointAlong(sliced, against ? stop + gap : stop - gap).point;
                const s = projectOnto(centres[i], at);
                const dist = against ? s : pieceLength - s;
                if (dist > 0 && dist < pieceLength - 4) first = dist;
            }
            for (let dist = first; dist < pieceLength - 4; dist += 60) {
                arrows.push(mark(against ? dist : pieceLength - dist, against));
            }
        });

        // one-way roads: small direction arrows spread along each lane, clear of the piece ends
        // (junctions) and of the lane's turn arrows
        const travel: LaneMark[] = [];
        if (layout.model.oneway && pieceLength > 2 * travelClearance) {
            layout.lanes.forEach((lane, i) => {
                const against = lane.ref.direction === 'backward';
                // how far along the lane its turn arrows are
                const cumulative = cumulativeLengths(centres[i]);
                const busy = arrows.filter(m => m.lane === i).map(m => {
                    const p = frame.toMetres(m.loc);
                    let best = 0;
                    let nearest = Infinity;
                    centres[i].forEach((c, k) => {
                        const d = Math.hypot(c[0] - p[0], c[1] - p[1]);
                        if (d < nearest) {
                            nearest = d;
                            best = cumulative[k];
                        }
                    });
                    return best;
                });
                const count = Math.max(1, Math.floor((pieceLength - 2 * travelClearance) / travelSpacing) + 1);
                const span = pieceLength - 2 * travelClearance;
                for (let k = 0; k < count; k++) {
                    const dist = travelClearance + (count === 1 ? span / 2 : span * k / (count - 1));
                    if (busy.some(b => Math.abs(b - dist) < 12)) continue;
                    const at = pointAlong(centres[i], dist);
                    const direction = against ? scale(at.direction, -1) : at.direction;
                    travel.push({ lane: i, loc: frame.toLoc(at.point), ahead: frame.toLoc(add(at.point, direction)) });
                }
            });
        }

        const roadside: RoadPiece['roadside'] = [];
        for (const side of ['left', 'right'] as const) {
            const sign = side === 'left' ? -1 : 1;
            const k = side === 'left' ? 0 : lastEdge;
            // strips stop with the kerb where it runs on round a turning head
            const fromStart = markStart?.roadside ? markFor(k, markStart) : 0;
            const fromEnd = markEnd?.roadside ? markFor(k, markEnd) : 0;
            let cursor = column(k);
            for (const strip of layout.roadside[side]) {
                const outer = cursor.map(c => c + sign * strip.width);
                const inner = clip(offset(cursor), fromStart, fromEnd);
                const outside = clip(offset(outer), fromStart, fromEnd);
                if (inner.length > 1 && outside.length > 1) {
                    roadside.push({ side, kind: strip.kind, assumed: strip.assumed, polygon: toLocs(frame, ring(inner, outside)), parking: strip.parking });
                }
                cursor = outer;
            }
        }

        pieces.push({
            wayID: way.id,
            index: p,
            layout,
            carriageway: toLocs(frame, ring(boundaries[0], boundaries[boundaries.length - 1])),
            lanes: lanes.map(l => toLocs(frame, l)),
            boundaries: boundaries.map(l => toLocs(frame, l)),
            centres: centres.map(l => toLocs(frame, l)),
            dividerSides: dividerSides.map(([l, r]) => [toLocs(frame, l), toLocs(frame, r)]),
            lines: lines.map(l => toLocs(frame, l)),
            lineSides: lineSides.map(([l, r]) => [toLocs(frame, l), toLocs(frame, r)]),
            arrows,
            travel,
            labels,
            roadside,
            length: pieceLength,
            atWayStart: a === 0,
            atWayEnd: b === way.nodes.length - 1,
            fromNode: way.nodes[a],
            toNode: way.nodes[b],
            short: total < shortWayLength,
            middle: frame.toLoc(pointAlong(sliced, pieceLength / 2).point)
        });
    }
    return pieces;
}


const pieceCache = new WeakMap<osmWay, { nodes: osmNode[]; signature: string; pieces: RoadPiece[] }>();

/* ---------- junction clusters ---------- */

/** The distance in metres from a point to a polygon's outline (0 inside it) */
function distanceToPolygon(p: Vec2, polygon: Vec2[]): number {
    if (pointInPolygon(p, polygon)) return 0;
    let best = Infinity;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j];
        const segment = sub(polygon[i], a);
        const l2 = dot(segment, segment);
        const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), segment) / l2)) : 0;
        best = Math.min(best, len(sub(p, add(a, scale(segment, t)))));
    }
    return best;
}

// junction nodes joined by a road shorter than this form one junction, in metres
export const clusterLink = 25;

/** A polygon wound counter-clockwise (in lon/lat), so overlapping parts fill as one shape */
function wound(polygon: Vec2[]): Vec2[] {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += (polygon[j][0] - polygon[i][0]) * (polygon[j][1] + polygon[i][1]);
    }
    return area > 0 ? polygon.slice().reverse() : polygon;
}

/** Groups of junction nodes joined by short roads, as node id → group id */
function junctionClusters(ways: osmWay[], graph: coreGraph, junctionNodes: Set<string>): Map<string, string> {
    const parent = new Map<string, string>();
    const find = (id: string): string => {
        let root = id;
        while (parent.get(root) && parent.get(root) !== root) root = parent.get(root)!;
        parent.set(id, root);
        return root;
    };
    for (const way of ways) {
        // a roundabout's ring carries on between its junctions: they are never merged along it
        if (isRing(way)) {
            for (const id of way.nodes) if (junctionNodes.has(id) && !parent.has(id)) parent.set(id, id);
            continue;
        }
        const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
        const cumulative = cumulativeLengths(lineLocs(way, graph).map(frame.toMetres));
        let last = -1;
        way.nodes.forEach((id, i) => {
            if (!junctionNodes.has(id)) return;
            if (!parent.has(id)) parent.set(id, id);
            if (last >= 0 && cumulative[i] - cumulative[last] < clusterLink) {
                const a = find(way.nodes[last]);
                const b = find(id);
                if (a !== b) parent.set(a, b);
            }
            last = i;
        });
    }
    const result = new Map<string, string>();
    for (const id of parent.keys()) result.set(id, find(id));
    return result;
}


export interface RoadGeometry {
    /** drawing-only shifts and tapers per way id, for markings that should move with their road */
    visuals: Map<string, WayVisual>;
    pieces: RoadPiece[];
    /** short pieces inside a junction cluster: drawn only as lane guide lines */
    innerPieces: Set<RoadPiece>;
    /**
     * the links inside a junction holding traffic islands (a channelised junction), whole and untrimmed: their
     * lanes are drawn over the junction, running between the islands, in place of guide lines
     */
    channelled: RoadPiece[];
    junctions: JunctionArea[];
    connections: JunctionConnection[];
    /** turning circles, loops and hammerheads at road ends */
    heads: TurningHead[];
    /** the road each mapped carriageway area is the surface of, by area id */
    areaRoads: Map<string, string>;
}

/** Whether a traffic island lies inside a junction's polygons or within 3 m of them (beside one of its links) */
function holdsIsland(islandRings: Vec2[][], polygons: Vec2[][]): boolean {
    return islandRings.some(ring => {
        const frame = metricFrame(ring[0]);
        const shapes = polygons.map(polygon => polygon.map(frame.toMetres));
        return ring.some(loc => shapes.some(shape => distanceToPolygon(frame.toMetres(loc), shape) < 3));
    });
}

/** Cuts the traffic islands out of the junctions' surfaces */
function cutIslands(junctions: Map<string, JunctionArea>, islandRings: Vec2[][]) {
    if (!islandRings.length) return;
    const holes = islandRings.map(ring => [ring.map(p => [p[0], p[1]] as [number, number])]);
    for (const [key, area] of junctions) {
        try {
            const left = difference(area.polygons.map(polygon => [polygon.map(p => [p[0], p[1]] as [number, number])]), ...holes);
            junctions.set(key, { ...area, polygons: left.flatMap(shape => shape.map(ring => ring as Vec2[])) });
        } catch {
            // a box that can't be cut is drawn whole
        }
    }
}

/** Lane geometry for a set of roads, reusing everything whose inputs have not changed */
export function roadGeometry(ways: osmWay[], graph: coreGraph, carriagewayAreas: osmWay[] = [], islands: osmWay[] = []): RoadGeometry {
    const pieces: RoadPiece[] = [];
    const junctions = new Map<string, JunctionArea>();
    const connections = new Map<string, JunctionConnection[]>();
    const junctionNodes = new Set<string>();
    const byNode = new Map<string, Junction>();

    const armCount = (nodeID: NodeId) => {
        const node = graph.entity(nodeID) as osmNode;
        let count = 0;
        for (const parent of graph.parentWays(node)) {
            if (!isLaneRoad(parent)) continue;
            const nodes = (parent as osmWay).nodes;
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i] === nodeID) count += (i > 0 ? 1 : 0) + (i < nodes.length - 1 ? 1 : 0);
            }
        }
        return count;
    };

    // 0. roads fitted into the mapped carriageway areas that are their surface (other roads are left alone)
    const visuals = new Map<string, WayVisual>();
    const owners = carriagewayAreas.length ? areaOwners(ways, graph, carriagewayAreas) : new Map<string, osmWay>();
    for (const way of ways) {
        const own = carriagewayAreas.filter(area => owners.get(area.id) === way);
        const fit = own.length ? fitToAreas(way, graph, own) : undefined;
        if (fit) visuals.set(way.id, { ...noVisual, fit });
    }
    const areaRoadIDs = new Set([...owners.values()].map(way => way.id));

    // 1. which nodes join roads, and the drawing-only shifts and tapers that line their lanes up
    const joinNodes = new Map<string, number>();
    for (const way of ways) {
        way.nodes.forEach((id, i) => {
            if (joinNodes.has(id)) return;
            const arms = armCount(id);
            const isEnd = i === 0 || i === way.nodes.length - 1;
            const mini = arms >= 2 && (graph.entity(id) as osmNode).tags.highway === 'mini_roundabout';
            if (arms >= 3 || (isEnd && arms === 2) || mini) joinNodes.set(id, arms);
            if (arms >= 3 || mini) junctionNodes.add(id);
        });
    }
    for (const [id] of joinNodes) alignAt(graph.entity(id as NodeId) as osmNode, graph, visuals);
    for (const [id, arms] of joinNodes) {
        if (arms >= 3) {
            alignBranches(graph.entity(id as NodeId) as osmNode, graph, visuals);
            alignMerges(graph.entity(id as NodeId) as osmNode, graph, visuals);
        }
    }

    // 2. junctions: pull-backs, areas and lane connections
    for (const [id] of joinNodes) {
        const junction = junctionAt(graph.entity(id as NodeId) as osmNode, graph, visuals, areaRoadIDs);
        byNode.set(id, junction);
        if (junction.area) junctions.set(id, junction.area);
        if (junction.connections.length) connections.set(id, junction.connections);
    }

    // turning heads at nodes no other road joins: the roads' kerbs run into them
    const heads = new Map<string, HeadAt>();
    const cutNodes = new Set(junctionNodes);
    for (const way of ways) {
        for (const id of way.nodes) {
            if (heads.has(id) || junctionNodes.has(id)) continue;
            const head = turningHeadAt(graph.entity(id as NodeId) as osmNode, graph, visuals);
            if (!head) continue;
            heads.set(id, head);
            if (head.cut) cutNodes.add(id);
        }
    }

    // 3. the roads themselves
    for (const way of ways) {
        const nodes = way.nodes.map(id => graph.entity(id) as osmNode);
        const visual = visuals.get(way.id) ?? noVisual;
        const sig: string[] = [visualSignature([way], visuals)];
        way.nodes.forEach((id, i) => {
            const head = heads.get(id);
            if (head) {
                sig.push(`${i}:head:` + [...head.marks.entries()].filter(([k]) => k.startsWith(way.id + ':'))
                    .map(([k, v]) => `${k}=${v.left.toFixed(2)},${v.right.toFixed(2)},${v.lanes.toFixed(2)},${(head.trims.get(k) ?? 0).toFixed(2)}`)
                    .join(',') + (head.cut ? ':cut' : ''));
            }
            const junction = byNode.get(id);
            if (!junction) return;
            const own = (k: string) => k.startsWith(way.id + ':');
            sig.push(`${i}:${[...junction.trims.entries()].filter(([k]) => own(k)).map(([k, v]) => k + '=' + v.toFixed(3)).join(',')}`);
            sig.push([...junction.partners.entries()].filter(([k]) => own(k))
                .map(([k, v]) => `${k}~${v[0].toFixed(3)},${v[1].toFixed(3)}`).join(','));
            sig.push([...junction.marks.entries()].filter(([k]) => own(k))
                .map(([k, v]) => `${k}=${v.left.toFixed(2)},${v.right.toFixed(2)},${v.lanes.toFixed(2)}`).join(','));
        });
        const signature = sig.join('|');

        const cached = pieceCache.get(way);
        if (cached && cached.signature === signature && cached.nodes.length === nodes.length &&
            cached.nodes.every((n, i) => n === nodes[i]) && cached.pieces[0]?.layout === cachedLayout(way, graph)) {
            pieces.push(...cached.pieces);
            continue;
        }

        const trimAt = (index: number, alongWay: boolean) => {
            const key = armKey(way.id, index, alongWay);
            return heads.get(way.nodes[index])?.trims.get(key) ?? byNode.get(way.nodes[index])?.trims.get(key) ?? 0;
        };
        const markAt = (index: number, alongWay: boolean) => {
            const key = armKey(way.id, index, alongWay);
            return heads.get(way.nodes[index])?.marks.get(key) ?? byNode.get(way.nodes[index])?.marks.get(key);
        };
        const partnerAt = (index: number, alongWay: boolean) => {
            const key = armKey(way.id, index, alongWay);
            return heads.get(way.nodes[index])?.partners.get(key) ?? byNode.get(way.nodes[index])?.partners.get(key);
        };
        const built = buildPieces(way, graph, cutNodes, visual, trimAt, markAt, partnerAt);
        pieceCache.set(way, { nodes, signature, pieces: built });
        pieces.push(...built);
    }

    // 4. junction clusters: the short links inside are not drawn as roads, and one box covers it all
    const clusters = junctionClusters(ways, graph, junctionNodes);
    const members = new Map<string, string[]>();
    for (const [id, root] of clusters) members.set(root, [...(members.get(root) ?? []), id]);
    const innerPieces = new Set<RoadPiece>();
    for (const piece of pieces) {
        const a = clusters.get(piece.fromNode);
        if (a && a === clusters.get(piece.toNode) && piece.fromNode !== piece.toNode && piece.length < clusterLink) innerPieces.add(piece);
    }
    // the traffic islands' outlines, to find the junctions holding one: an island inside the junction or within
    // 3 m of it (beside one of its links)
    const islandRings = islands.map(island => lineLocs(island, graph));
    const channelledRoots = new Set<string>();
    for (const [root, ids] of members) {
        if (ids.length < 2) continue;
        // the nodes' boxes and the short roads joining them, filled as one shape
        const polygons: Vec2[][] = [];
        const kerbs: JunctionArea['kerbs'] = [];
        let kind: JunctionArea['kind'] = 'flare';
        for (const id of ids) {
            const area = junctions.get(id);
            if (area) {
                polygons.push(...area.polygons);
                kerbs.push(...area.kerbs);
                if (area.kind === 'junction') kind = 'junction';
            }
            junctions.delete(id);
        }
        for (const piece of innerPieces) {
            if (clusters.get(piece.fromNode) === root) polygons.push(wound(piece.carriageway));
        }
        if (polygons.length) {
            const key = `cluster-${ids.slice().sort().join('-')}`;
            junctions.set(key, { nodeID: key, polygons, kerbs, kind });
            if (holdsIsland(islandRings, polygons)) channelledRoots.add(root);
        }
    }

    // 5. channelised junctions (traffic islands inside): the links between the islands are drawn whole, so their
    // lanes run round the islands, and the islands are cut out of the junction boxes
    const channelled: RoadPiece[] = [];
    const links = new Map<string, RoadPiece[]>();
    for (const piece of innerPieces) {
        if (channelledRoots.has(clusters.get(piece.fromNode) ?? '')) links.set(piece.wayID, [...(links.get(piece.wayID) ?? []), piece]);
    }
    for (const [wayID, inner] of links) {
        const way = graph.entity(wayID as WayId) as osmWay;
        const whole = buildPieces(way, graph, cutNodes, visuals.get(wayID) ?? noVisual, () => 0, () => undefined);
        channelled.push(...whole.filter(piece => inner.some(p => p.fromNode === piece.fromNode && p.toNode === piece.toNode)));
    }
    cutIslands(junctions, islandRings);

    return {
        visuals, pieces, innerPieces, channelled,
        junctions: [...junctions.values()], connections: [...connections.values()].flat(),
        heads: [...heads.values()].map(h => h.head),
        areaRoads: new Map([...owners].map(([areaID, way]) => [areaID, way.id]))
    };
}

// exported for tests
export const _test = { throughPair, zipLanes, unit, uncovered };

/** How lanes meet at junctions, for working out the routes through them (see routing.ts) */
export const junctionRules = {
    armsAt: (node: osmNode, graph: coreGraph) => armsAt(node, graph, new Map()),
    throughPair, armLaneDirection, signedAngle, idealAngle, connectivityRelation, relationPairs, zipLanes, continuationPairs, isRing, curve,
    arrowExit
};
