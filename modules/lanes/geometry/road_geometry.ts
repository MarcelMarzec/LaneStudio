import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, WayId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import {
    metricFrame, sub, add, scale, rightNormal,
    pointAlong, slicePolyline, offsetPolyline, cumulativeLengths, polylineLength, type MetricFrame
} from './frame';
import { laneLayout, type LaneLayout, type RoadsideKind } from './layout';
import { parseTurn } from '../model';

// Longest distance a road is pulled back from a junction, in metres
const maxClearance = 30;


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
    /** where turn arrows go: a point on a lane and a point 1 m further in its direction of travel */
    arrows: LaneMark[];
    /** where lane labels go, one per lane in the middle of the piece */
    labels: LaneMark[];
    roadside: { side: 'left' | 'right'; kind: RoadsideKind; assumed: boolean; polygon: Vec2[] }[];
    /** metres */
    length: number;
    /** whether this piece starts at the way's first node / ends at its last node */
    atWayStart: boolean;
    atWayEnd: boolean;
}

export interface LaneMark {
    /** lane index, left to right looking along the way */
    lane: number;
    loc: Vec2;
    ahead: Vec2;
}

export interface JunctionArea {
    nodeID: string;
    polygon: Vec2[];
}


interface Arm {
    way: osmWay;
    /** the node's position in `way.nodes` */
    nodeIndex: number;
    /** true when the arm leaves the node in the way's drawing direction */
    alongWay: boolean;
    /** the road's centre line leaving the node, in metres in the node's frame */
    line: Vec2[];
    direction: Vec2;
    angle: number;
    /** carriageway edge offsets relative to the arm's direction (right positive) */
    left: number;
    right: number;
}


/* Per-entity caches. iD entities are immutable, so an unchanged entity means unchanged input. */

const layoutCache = new WeakMap<osmWay, LaneLayout>();

function cachedLayout(way: osmWay, graph: coreGraph): LaneLayout {
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


/** The placement shift at distance `s` along a way of length `total` */
function shiftAt(layout: LaneLayout, s: number, total: number): number {
    const t = total > 0 ? s / total : 0;
    return layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t;
}


/** The road arms meeting at a node: each way end there gives one arm, a way passing through gives two */
function armsAt(node: osmNode, graph: coreGraph): Arm[] {
    const frame = metricFrame(node.loc);
    const arms: Arm[] = [];
    const ways = graph.parentWays(node).filter(isLaneRoad) as osmWay[];

    for (const way of ways) {
        const layout = cachedLayout(way, graph);
        const points = lineLocs(way, graph).map(frame.toMetres);
        const cumulative = cumulativeLengths(points);
        const total = cumulative[cumulative.length - 1];

        way.nodes.forEach((id, i) => {
            if (id !== node.id) return;
            const shift = shiftAt(layout, cumulative[i], total);
            const wayLeft = layout.edges[0] + shift;
            const wayRight = layout.edges[layout.edges.length - 1] + shift;

            const add = (alongWay: boolean) => {
                const line = alongWay ? points.slice(i) : points.slice(0, i + 1).reverse();
                if (line.length < 2 || polylineLength(line) === 0) return;
                const direction = pointAlong(line, Math.min(5, polylineLength(line))).direction;
                arms.push({
                    way, nodeIndex: i, alongWay, line, direction,
                    angle: Math.atan2(direction[1], direction[0]),
                    left: alongWay ? wayLeft : -wayRight,
                    right: alongWay ? wayRight : -wayLeft
                });
            };
            if (i < way.nodes.length - 1) add(true);
            if (i > 0) add(false);
        });
    }
    return arms.sort((a, b) => a.angle - b.angle);
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


interface JunctionTrims {
    /** pull-back distance per arm, keyed `${wayID}:${nodeIndex}:${alongWay}` */
    trims: Map<string, number>;
    area?: JunctionArea;
}

const armKey = (wayID: string, nodeIndex: number, alongWay: boolean) => `${wayID}:${nodeIndex}:${alongWay}`;

// a junction depends on its roads and on every node of them (a moved node turns an arm)
const junctionCache = new WeakMap<osmNode, { deps: unknown[]; result: JunctionTrims }>();

/** Works out how far each road is pulled back at a node, and the junction area that fills the gap */
function junctionAt(node: osmNode, graph: coreGraph): JunctionTrims {
    const parents = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const deps = parents.flatMap(way => [way, ...way.nodes.map(id => graph.entity(id))]);
    const cached = junctionCache.get(node);
    if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
        return cached.result;
    }

    const arms = armsAt(node, graph);
    const trims = new Map<string, number>();
    const result: JunctionTrims = { trims };

    if (arms.length >= 2) {
        arms.forEach((arm, i) => {
            let trim = 0;
            if (arms.length >= 3) {
                const leftNeighbour = arms[(i + 1) % arms.length];                 // counter-clockwise
                const rightNeighbour = arms[(i - 1 + arms.length) % arms.length];  // clockwise
                const l = edgeMeeting(arm, arm.left, leftNeighbour, leftNeighbour.right);
                const r = edgeMeeting(arm, arm.right, rightNeighbour, rightNeighbour.left);
                trim = Math.min(maxClearance, Math.max(0, l ?? 0, r ?? 0));
            }
            trims.set(armKey(arm.way.id, arm.nodeIndex, arm.alongWay), trim);
        });

        // the junction area joins the trimmed ends of all arms
        const frame = metricFrame(node.loc);
        const points: Vec2[] = [];
        for (const arm of arms) {
            const t = Math.min(trims.get(armKey(arm.way.id, arm.nodeIndex, arm.alongWay)) ?? 0, polylineLength(arm.line));
            const at = pointAlong(arm.line, t);
            const normal = rightNormal(at.direction);
            points.push(add(at.point, scale(normal, arm.left)), add(at.point, scale(normal, arm.right)));
        }
        points.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
        result.area = { nodeID: node.id, polygon: points.map(frame.toLoc) };
    }

    junctionCache.set(node, { deps, result });
    return result;
}


function toLocs(frame: MetricFrame, points: Vec2[]): Vec2[] {
    return points.map(frame.toLoc);
}

function ring(left: Vec2[], right: Vec2[]): Vec2[] {
    return [...left, ...right.slice().reverse()];
}


/** Builds the pieces of one road, between the nodes where it meets two or more other roads */
function buildPieces(way: osmWay, graph: coreGraph, junctionNodes: Set<string>, trimAt: (index: number, alongWay: boolean) => number): RoadPiece[] {
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
        const sliced = slicePolyline(line, trimStart, length - trimEnd);
        const local = cumulativeLengths(sliced);
        const shifts = local.map(s => shiftAt(layout, cumulative[a] + trimStart + s, total));
        const offset = (d: number) => offsetPolyline(sliced, shifts.map(shift => d + shift));

        const boundaries = layout.edges.map(edge => offset(edge));
        const lanes = layout.lanes.map((_, i) => ring(boundaries[i], boundaries[i + 1]));
        const centres = layout.lanes.map((_, i) => offset((layout.edges[i] + layout.edges[i + 1]) / 2));
        const dividerSides = layout.edges.map((edge, k): [Vec2[], Vec2[]] =>
            k === 0 || k === layout.edges.length - 1 ? [[], []] : [offset(edge - 0.12), offset(edge + 0.12)]);

        const pieceLength = polylineLength(sliced);
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
                return;
            }
            // turn arrows sit on the approach to the junction the lane leads to, repeated every 60 m
            const approach = against ? a === 0 : b === way.nodes.length - 1;
            if (!approach) return;
            for (let dist = Math.min(8, pieceLength * 0.3); dist < pieceLength - 4; dist += 60) {
                arrows.push(mark(against ? dist : pieceLength - dist, against));
            }
        });

        const roadside: RoadPiece['roadside'] = [];
        for (const side of ['left', 'right'] as const) {
            const sign = side === 'left' ? -1 : 1;
            let cursor = side === 'left' ? layout.edges[0] : layout.edges[layout.edges.length - 1];
            for (const strip of layout.roadside[side]) {
                const outer = cursor + sign * strip.width;
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
            arrows,
            labels,
            roadside,
            length: pieceLength,
            atWayStart: a === 0,
            atWayEnd: b === way.nodes.length - 1
        });
    }
    return pieces;
}


const pieceCache = new WeakMap<osmWay, { nodes: osmNode[]; signature: string; pieces: RoadPiece[] }>();

export interface RoadGeometry {
    pieces: RoadPiece[];
    junctions: JunctionArea[];
}

/** Lane geometry for a set of roads, reusing everything whose inputs have not changed */
export function roadGeometry(ways: osmWay[], graph: coreGraph): RoadGeometry {
    const pieces: RoadPiece[] = [];
    const junctions = new Map<string, JunctionArea>();
    const junctionNodes = new Set<string>();
    const trimsByNode = new Map<string, JunctionTrims>();

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

    for (const way of ways) {
        const nodes = way.nodes.map(id => graph.entity(id) as osmNode);
        const sig: string[] = [];
        nodes.forEach((node, i) => {
            const arms = armCount(node.id);
            const isEnd = i === 0 || i === nodes.length - 1;
            if (arms >= 3 || (isEnd && arms === 2)) {
                if (arms >= 3) junctionNodes.add(node.id);
                let j = trimsByNode.get(node.id);
                if (!j) {
                    j = junctionAt(node, graph);
                    trimsByNode.set(node.id, j);
                    if (j.area) junctions.set(node.id, j.area);
                }
                sig.push(`${i}:${[...j.trims.entries()].filter(([k]) => k.startsWith(way.id + ':')).map(([k, v]) => k + '=' + v.toFixed(3)).join(',')}`);
            }
        });
        const signature = sig.join('|');

        const cached = pieceCache.get(way);
        if (cached && cached.signature === signature && cached.nodes.length === nodes.length &&
            cached.nodes.every((n, i) => n === nodes[i]) && cached.pieces[0]?.layout === cachedLayout(way, graph)) {
            pieces.push(...cached.pieces);
            continue;
        }

        const trimAt = (index: number, alongWay: boolean) =>
            trimsByNode.get(way.nodes[index])?.trims.get(armKey(way.id, index, alongWay)) ?? 0;
        const built = buildPieces(way, graph, junctionNodes, trimAt);
        pieceCache.set(way, { nodes, signature, pieces: built });
        pieces.push(...built);
    }

    return { pieces, junctions: [...junctions.values()] };
}
