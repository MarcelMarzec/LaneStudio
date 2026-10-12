import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, WayId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import {
    metricFrame, sub, add, scale, rightNormal, len, unit,
    pointAlong, slicePolyline, offsetPolyline, cumulativeLengths, polylineLength, pointInPolygon, type MetricFrame
} from './frame';
import { laneLayout, parseWidth, type LaneLayout, type RoadsideKind } from './layout';
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
    roadside: { side: 'left' | 'right'; kind: RoadsideKind; assumed: boolean; polygon: Vec2[] }[];
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
    line: Vec2[];
}


/* ---------- drawing-only adjustments at way ends ---------- */

/** A lane that narrows to nothing at one end of a way (a lane added or dropped where roads join) */
interface Taper {
    /** lane index, left to right along the way; only the outermost lanes can taper */
    lane: number;
    /** metres */
    length: number;
}

/**
 * How a way is drawn shifted sideways at each end so its lanes line up with the road it continues,
 * and which lanes taper. Drawing only: tags are never changed.
 */
export interface WayVisual {
    start: number;
    end: number;
    taperStart: Taper | null;
    taperEnd: Taper | null;
    /**
     * Shifts that fit the road into a mapped carriageway area, as (distance along the way, shift)
     * points in order; between points the shift is interpolated, beyond them it fades out.
     */
    fit?: [number, number][];
}

const noVisual: WayVisual = { start: 0, end: 0, taperStart: null, taperEnd: null };

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
 * Lane boundary offsets from the way line at distance `s` along it (right positive): the layout's
 * edges, its placement shift, the drawing-only shift and any tapering outer lane.
 */
export function edgesAt(layout: LaneLayout, visual: WayVisual, s: number, total: number): number[] {
    const t = total > 0 ? s / total : 0;
    const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t + visualShift(visual, s, total);
    const edges = layout.edges.slice();
    const n = layout.lanes.length;

    const factors = new Map<number, number>();
    const taper = (spec: Taper | null, f: number) => {
        if (!spec) return;
        factors.set(spec.lane, Math.min(factors.get(spec.lane) ?? 1, Math.max(0, Math.min(1, f))));
    };
    taper(visual.taperStart, visual.taperStart ? s / visual.taperStart.length : 1);
    taper(visual.taperEnd, visual.taperEnd ? (total - s) / visual.taperEnd.length : 1);
    for (const [k, f] of factors) {
        const width = layout.lanes[k].width * f;
        if (k === 0) edges[0] = edges[1] - width;
        else if (k === n - 1) edges[n] = edges[n - 1] + width;
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

interface Arm {
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
}

const armKey = (wayID: string, nodeIndex: number, alongWay: boolean) => `${wayID}:${nodeIndex}:${alongWay}`;

/** The road arms meeting at a node: each way end there gives one arm, a way passing through gives two */
function armsAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>): Arm[] {
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
                arms.push({
                    way, layout, nodeIndex: i, alongWay, isEnd, line, direction, edges,
                    angle: Math.atan2(direction[1], direction[0]),
                    left: alongWay ? wayLeft : -wayRight,
                    right: alongWay ? wayRight : -wayLeft
                });
            };
            if (i < way.nodes.length - 1) push(true);
            if (i > 0) push(false);
        });
    }
    return arms.sort((a, b) => a.angle - b.angle);
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

    const turns = upLanes.map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
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

    let delta: number | null = null;
    for (const [up, down] of [[a, b], [b, a]] as const) {
        const upDirection = armLaneDirection(up, true);
        const downDirection = armLaneDirection(down, false);
        const pairs = continuationPairs(graph, up, down, node.id, twoArms);
        if (!pairs.length) continue;

        if (delta === null) {
            const differences = pairs.filter(p => !p.merges).flatMap(p => {
                const u = travelOffset(up, upDirection, p.from);
                const d = travelOffset(down, downDirection, p.to);
                return u === null || d === null ? [] : [u - d];
            });
            if (differences.length) {
                const mean = differences.reduce((x, y) => x + y, 0) / differences.length;
                // shift the moved way so the travel offsets match, in the moved way's own frame
                if (moved === down) delta = downDirection === 'backward' ? -mean : mean;
                else delta = upDirection === 'backward' ? mean : -mean;
            }
        }

        // where roads simply join, an unpaired outer lane of the wider road tapers away
        if (twoArms) {
            const wide = count(up) > count(down) ? up : count(down) > count(up) ? down : null;
            if (wide) {
                const direction = wide === up ? upDirection : downDirection;
                const used = new Set(pairs.filter(p => !p.merges).map(p => (wide === up ? p.from : p.to)));
                wide.layout.model.lanes[direction].forEach((_, index) => {
                    if (used.has(index)) return;
                    const k = wide.layout.lanes.findIndex(l => l.ref.direction === direction && l.ref.index === index);
                    if (k !== 0 && k !== wide.layout.lanes.length - 1) return;
                    const total = polylineLength(lineLocs(wide.way, graph).map(metricFrame(node.loc).toMetres));
                    const visual = { ...(visuals.get(wide.way.id) ?? noVisual) };
                    const taper = { lane: k, length: Math.min(taperLength, total * 0.45) };
                    if (wide.nodeIndex === 0) visual.taperStart = taper;
                    else visual.taperEnd = taper;
                    visuals.set(wide.way.id, visual);
                });
            }
        }
    }

    if (delta !== null && Math.abs(delta) > 0.05) {
        const visual = { ...(visuals.get(moved.way.id) ?? noVisual) };
        if (moved.nodeIndex === 0) visual.start = delta;
        else visual.end = delta;
        visuals.set(moved.way.id, visual);
    }
}


/* ---------- junctions ---------- */

/** How far from a node lane lines and each kerb stop, where they are drawn shorter than the road */
interface MarkTrim {
    /** the way's left and right kerbs (as seen along the way) */
    left: number;
    right: number;
    /** lines between lanes */
    lanes: number;
}

interface Junction {
    /** pull-back distance per arm, keyed `${wayID}:${nodeIndex}:${alongWay}` */
    trims: Map<string, number>;
    /** where kerbs and lane lines stop on arms that run on through the junction, keyed like `trims` */
    marks: Map<string, MarkTrim>;
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

/** The point at a lane's end on an arm, at the arm's pull-back distance, and its travel direction */
function laneEnd(arm: Arm, trim: number, direction: LaneDirection, index: number, approach: boolean) {
    const k = arm.layout.lanes.findIndex(l => l.ref.direction === direction && l.ref.index === index);
    if (k === -1) return null;
    const wayOffset = (arm.edges[k] + arm.edges[k + 1]) / 2;
    const armOffset = arm.alongWay ? wayOffset : -wayOffset;
    const at = pointAlong(arm.line, Math.min(trim, polylineLength(arm.line)));
    const point = add(at.point, scale(rightNormal(at.direction), armOffset));
    return { point, tangent: approach ? scale(at.direction, -1) : at.direction };
}

function curve(a: { point: Vec2; tangent: Vec2 }, b: { point: Vec2; tangent: Vec2 }): Vec2[] {
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
}

/** Where each lane approaching a junction on arm `i` leads: by its turn arrows and the exit angles */
function laneExits(arms: Arm[], i: number, through: [number, number] | null): LaneExits | null {
    const up = arms[i];
    const upDirection = armLaneDirection(up, true);
    const upLanes = up.layout.model.lanes[upDirection];
    if (!upLanes.length) return null;
    const exits = arms.map((down, j) => ({ down, j, angle: signedAngle(scale(up.direction, -1), down.direction) }))
        .filter(x => x.j !== i && x.down.layout.model.lanes[armLaneDirection(x.down, false)].length);
    if (!exits.length) return null;

    const isThrough = (j: number) => !!through && ((through[0] === i && through[1] === j) || (through[0] === j && through[1] === i));
    const turns = upLanes.map(lane => parseTurn(lane.values['turn:lanes'] ?? ''));
    const anyTagged = turns.some(t => t.length);
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
    return { upDirection, exits, targets };
}

/**
 * Where a road splits (a one-way slip road peeling off the main road), shifts the branch so its
 * lanes start where the lanes that lead into it end.
 */
function alignBranches(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>) {
    const arms = armsAt(node, graph, visuals);
    if (arms.length < 3) return;
    const through = throughPair(arms);
    if (!through) return;
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
            const fromLanes = lanes.targets.flatMap((set, index) => (set.has(exit.j) ? [index] : []));
            if (!fromLanes.length) continue;
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
            if (Math.abs(delta) < 0.05) continue;
            const next = { ...visual };
            if (side.nodeIndex === 0) next.start = delta;
            else next.end = delta;
            visuals.set(side.way.id, next);
        }
    }
}


/**
 * Lines through a junction from each approaching lane to the lanes it leads to: from connectivity
 * relations where they exist, else guide lines worked out from turn lanes and the exit angles.
 */
function junctionConnections(node: osmNode, graph: coreGraph, arms: Arm[], trims: Map<string, number>, through: [number, number] | null): JunctionConnection[] {
    const frame = metricFrame(node.loc);
    const result: JunctionConnection[] = [];
    const trimOf = (arm: Arm) => trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0;
    const isThrough = (i: number, j: number) => !!through && ((through[0] === i && through[1] === j) || (through[0] === j && through[1] === i));

    arms.forEach((up, i) => {
        const lanes = laneExits(arms, i, through);
        if (!lanes) return;
        const { upDirection, exits } = lanes;

        // connectivity relations say exactly which lanes lead where
        const byExit = new Map<number, number[]>();
        const relations = new Set<number>();
        for (const exit of exits) {
            const relation = up.isEnd && exit.down.isEnd ? connectivityRelation(graph, up.way.id, node.id, exit.down.way.id) : undefined;
            if (!relation) continue;
            relations.add(exit.j);
            const downDirection = armLaneDirection(exit.down, false);
            for (const p of relationPairs(relation)) {
                const a = laneEnd(up, trimOf(up), upDirection, p.from, true);
                const b = laneEnd(exit.down, trimOf(exit.down), downDirection, p.to, false);
                if (!a || !b) continue;
                result.push({
                    key: `${node.id}-r-${up.way.id}-${exit.down.way.id}-${p.from}-${p.to}`, nodeID: node.id,
                    kind: 'relation', optional: p.optional, line: curve(a, b).map(frame.toLoc)
                });
            }
        }
        if (arms.length < 3) return;   // where two roads just join, lanes carry straight on

        lanes.targets.forEach((targets, laneIndex) => {
            for (const j of targets) {
                if (relations.has(j)) continue;
                byExit.set(j, [...(byExit.get(j) ?? []), laneIndex]);
            }
        });

        for (const [j, fromLanes] of byExit) {
            const exit = exits.find(x => x.j === j)!;
            const down = exit.down;
            const downDirection = armLaneDirection(down, false);
            const downCount = down.layout.model.lanes[downDirection].length;
            const pairs = isThrough(i, j)
                ? continuationPairs(graph, up, down, node.id, false)
                : zipLanes(fromLanes, downCount, exit.angle > 0);   // turning left lines up on the left
            // a turn off or onto the main road (which runs through untrimmed) starts or ends
            // past the other road's kerb, so the curve has room to turn
            const turning = !isThrough(i, j);
            const upTrim = turning ? Math.max(trimOf(up), (down.right - down.left) / 2) : trimOf(up);
            const downTrim = turning ? Math.max(trimOf(down), (up.right - up.left) / 2) : trimOf(down);
            for (const p of pairs) {
                if (!fromLanes.includes(p.from)) continue;
                const a = laneEnd(up, upTrim, upDirection, p.from, true);
                const b = laneEnd(down, downTrim, downDirection, p.to, false);
                if (!a || !b || len(sub(b.point, a.point)) < 1.5) continue;
                result.push({
                    key: `${node.id}-g-${up.way.id}:${up.alongWay}-${down.way.id}:${down.alongWay}-${p.from}-${p.to}`, nodeID: node.id,
                    kind: 'guide', optional: false, line: curve(a, b).map(frame.toLoc)
                });
            }
        }
    });
    return result;
}


// a junction depends on its roads, every node of them, their relations, and their drawing shifts
const junctionCache = new WeakMap<osmNode, { deps: unknown[]; signature: string; result: Junction }>();

function visualSignature(ways: osmWay[], visuals: Map<string, WayVisual>): string {
    return ways.map(w => {
        const v = visuals.get(w.id);
        return v ? `${w.id}:${v.start.toFixed(2)}:${v.end.toFixed(2)}:${v.taperStart?.lane ?? ''}:${v.taperEnd?.lane ?? ''}` +
            `:${v.fit ? v.fit.map(p => `${p[0].toFixed(0)}/${p[1].toFixed(2)}`).join(',') : ''}` : '';
    }).join('|');
}

/** How far each road is pulled back at a node, the junction area that fills the gap, and the lane connections */
function junctionAt(node: osmNode, graph: coreGraph, visuals: Map<string, WayVisual>): Junction {
    const parents = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const deps = parents.flatMap(way => [way, ...way.nodes.map(id => graph.entity(id)), ...graph.parentRelations(way)]);
    const signature = visualSignature(parents, visuals);
    const cached = junctionCache.get(node);
    if (cached && cached.signature === signature && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
        return cached.result;
    }

    const arms = armsAt(node, graph, visuals);
    const trims = new Map<string, number>();
    const marks = new Map<string, MarkTrim>();
    const result: Junction = { trims, marks, connections: [] };

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

        // the main road runs on through: its kerbs stop where side roads join, and its lane lines
        // stop at the junction box (except round a roundabout, whose lanes carry on)
        if (through) {
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
                const lanes = isRing(arm.way) ? 0 : Math.max(left, right);
                // in the way's frame, an arm against the way has its sides swapped
                marks.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), arm.alongWay
                    ? { left, right, lanes }
                    : { left: right, right: left, lanes });
            }
        }

        // the junction area joins the pulled-back ends of all arms
        // (the main road runs through untrimmed, so the box reaches along it as far as the side roads are wide)
        const frame = metricFrame(node.loc);
        const points: Vec2[] = [];
        const onMain = (i: number) => !!through && (through[0] === i || through[1] === i);
        const reach = Math.max(0, ...arms.filter((_, i) => !onMain(i)).map(arm => (arm.right - arm.left) / 2));
        for (const [i, arm] of arms.entries()) {
            const trim = trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0;
            const t = Math.min(onMain(i) ? Math.max(trim, reach) : trim, polylineLength(arm.line));
            const at = pointAlong(arm.line, t);
            const normal = rightNormal(at.direction);
            // arms are in counter-clockwise order, and each arm's right edge comes before its left,
            // so the outline never crosses itself however sharp the angles between arms
            points.push(add(at.point, scale(normal, arm.right)), add(at.point, scale(normal, arm.left)));
        }
        result.area = { nodeID: node.id, polygons: [wound(points.map(frame.toLoc))] };
        result.connections = junctionConnections(node, graph, arms, trims, through);
    }

    junctionCache.set(node, { deps, signature, result });
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
        samples.push([s, (left + right) / 2 - bandCentre]);
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
    const wanted = distances.filter(d => d > 0.01 && d < total - 0.01).sort((a, b) => a - b);
    if (!wanted.length) return points;
    const cumulative = cumulativeLengths(points);
    const result: Vec2[] = [points[0]];
    let w = 0;
    for (let i = 1; i < points.length; i++) {
        while (w < wanted.length && wanted[w] < cumulative[i]) {
            if (wanted[w] > cumulative[i - 1] + 0.01) result.push(pointAlong(points, wanted[w]).point);
            w++;
        }
        result.push(points[i]);
    }
    return result;
}


/** Builds the pieces of one road, between the nodes where it meets two or more other roads */
function buildPieces(way: osmWay, graph: coreGraph, junctionNodes: Set<string>, visual: WayVisual,
    trimAt: (index: number, alongWay: boolean) => number,
    markAt: (index: number, alongWay: boolean) => MarkTrim | undefined): RoadPiece[] {

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
            visual.taperStart ? visual.taperStart.length - startAt : -1,
            visual.taperEnd ? total - visual.taperEnd.length - startAt : -1
        ];
        const sliced = withVerticesAt(slicePolyline(line, trimStart, length - trimEnd), breaks);
        const local = cumulativeLengths(sliced);
        const rows = local.map(s => edgesAt(layout, visual, startAt + s, total));
        const offset = (distances: number[]) => offsetPolyline(sliced, distances);
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
            for (let dist = Math.min(8, pieceLength * 0.3); dist < pieceLength - 4; dist += 60) {
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
            let cursor = side === 'left' ? column(0) : column(layout.edges.length - 1);
            for (const strip of layout.roadside[side]) {
                const outer = cursor.map(c => c + sign * strip.width);
                roadside.push({
                    side, kind: strip.kind, assumed: strip.assumed,
                    polygon: toLocs(frame, ring(offset(cursor), offset(outer)))
                });
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
    junctions: JunctionArea[];
    connections: JunctionConnection[];
}

/** Lane geometry for a set of roads, reusing everything whose inputs have not changed */
export function roadGeometry(ways: osmWay[], graph: coreGraph, carriagewayAreas: osmWay[] = []): RoadGeometry {
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

    // 0. roads fitted into mapped carriageway areas
    const visuals = new Map<string, WayVisual>();
    for (const way of ways) {
        const fit = fitToAreas(way, graph, carriagewayAreas);
        if (fit) visuals.set(way.id, { ...noVisual, fit });
    }

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
        if (arms >= 3) alignBranches(graph.entity(id as NodeId) as osmNode, graph, visuals);
    }

    // 2. junctions: pull-backs, areas and lane connections
    for (const [id] of joinNodes) {
        const junction = junctionAt(graph.entity(id as NodeId) as osmNode, graph, visuals);
        byNode.set(id, junction);
        if (junction.area) junctions.set(id, junction.area);
        if (junction.connections.length) connections.set(id, junction.connections);
    }

    // 3. the roads themselves
    for (const way of ways) {
        const nodes = way.nodes.map(id => graph.entity(id) as osmNode);
        const visual = visuals.get(way.id) ?? noVisual;
        const sig: string[] = [visualSignature([way], visuals)];
        way.nodes.forEach((id, i) => {
            const junction = byNode.get(id);
            if (!junction) return;
            const own = (k: string) => k.startsWith(way.id + ':');
            sig.push(`${i}:${[...junction.trims.entries()].filter(([k]) => own(k)).map(([k, v]) => k + '=' + v.toFixed(3)).join(',')}`);
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

        const trimAt = (index: number, alongWay: boolean) =>
            byNode.get(way.nodes[index])?.trims.get(armKey(way.id, index, alongWay)) ?? 0;
        const markAt = (index: number, alongWay: boolean) =>
            byNode.get(way.nodes[index])?.marks.get(armKey(way.id, index, alongWay));
        const built = buildPieces(way, graph, junctionNodes, visual, trimAt, markAt);
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
    for (const [root, ids] of members) {
        if (ids.length < 2) continue;
        // the nodes' boxes and the short roads joining them, filled as one shape
        const polygons: Vec2[][] = [];
        for (const id of ids) {
            const area = junctions.get(id);
            if (area) polygons.push(...area.polygons);
            junctions.delete(id);
        }
        for (const piece of innerPieces) {
            if (clusters.get(piece.fromNode) === root) polygons.push(wound(piece.carriageway));
        }
        if (polygons.length) {
            const key = `cluster-${ids.slice().sort().join('-')}`;
            junctions.set(key, { nodeID: key, polygons });
        }
    }

    return {
        visuals, pieces, innerPieces,
        junctions: [...junctions.values()], connections: [...connections.values()].flat()
    };
}

// exported for tests
export const _test = { throughPair, zipLanes, unit };
