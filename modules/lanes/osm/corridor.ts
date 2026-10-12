import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { metricFrame, sub, unit, pointAlong, polylineLength, len } from '../geometry/frame';
import { laneOneway } from '../model';

/** One way of leaving a junction */
export interface CorridorExit {
    way: osmWay;
    /** true when leaving along the way's drawing direction */
    alongWay: boolean;
    /** turn angle in degrees: 0 straight on, positive to the left, negative to the right */
    angle: number;
    /** the `turn` value this angle suggests */
    turn: string;
    /** what a sign would most likely show for this exit */
    destination?: string;
    destinationRef?: string;
    /** for a roundabout: which exit this is, counting from the entry (1 = first exit) */
    exitNumber?: number;
}

/** One road in the corridor, in the order they are driven */
export interface CorridorStep {
    way: osmWay;
    /** true when the corridor drives this way along its drawing direction */
    alongWay: boolean;
    /** metres driven so far at the end of this way */
    distance: number;
    /** the junction at the end of this way: every exit, including the one the corridor takes */
    exits: CorridorExit[];
    /** the node the step ends at */
    endNode: NodeId;
}

export interface CorridorOptions {
    /** drive the first way along (`forward`) or against (`backward`) its drawing direction */
    direction: 'forward' | 'backward';
    maxWays?: number;
    maxMetres?: number;
}


/** The `turn` value for a turn angle (degrees, positive left), in the usual bands */
export function turnForAngle(angle: number): string {
    const a = Math.abs(angle);
    const side = angle > 0 ? 'left' : 'right';
    if (a < 20) return 'through';
    if (a < 60) return `slight_${side}`;
    if (a < 125) return side;
    if (a < 165) return `sharp_${side}`;
    return 'reverse';
}


function lineOf(way: osmWay, graph: coreGraph, frame: ReturnType<typeof metricFrame>): Vec2[] {
    return way.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
}

/** May traffic drive this way in this direction? */
function drivable(way: osmWay, alongWay: boolean): boolean {
    const oneway = laneOneway(way.tags);
    if (!oneway) return true;
    return oneway === 'forward' ? alongWay : !alongWay;
}

/** The direction of travel leaving or entering `nodeID` along a way, looking up to 10 m away */
function headingAt(way: osmWay, nodeID: NodeId, leaving: boolean, alongWay: boolean, graph: coreGraph, frame: ReturnType<typeof metricFrame>): Vec2 | null {
    const points = lineOf(way, graph, frame);
    const i = alongWay ? way.nodes.indexOf(nodeID) : way.nodes.lastIndexOf(nodeID);
    if (i === -1) return null;
    // the stretch of road leaving the node in the travel direction, or arriving at it
    const stretch = leaving
        ? (alongWay ? points.slice(i) : points.slice(0, i + 1).reverse())
        : (alongWay ? points.slice(0, i + 1).reverse() : points.slice(i));
    if (stretch.length < 2) return null;
    const ahead = pointAlong(stretch, Math.min(10, polylineLength(stretch))).point;
    const d = unit(sub(ahead, stretch[0]));
    return leaving ? d : [-d[0], -d[1]];
}

function signedAngle(from: Vec2, to: Vec2): number {
    const cross = from[0] * to[1] - from[1] * to[0];
    const dot = from[0] * to[0] + from[1] * to[1];
    return Math.atan2(cross, dot) * 180 / Math.PI;
}


/** Every road you can drive onto at `nodeID` after arriving along `fromWay` */
export function junctionExits(fromWay: osmWay, alongWay: boolean, nodeID: NodeId, graph: coreGraph): CorridorExit[] {
    const node = graph.entity(nodeID) as osmNode;
    const frame = metricFrame(node.loc);
    const incoming = headingAt(fromWay, nodeID, false, alongWay, graph, frame);
    if (!incoming) return [];

    const exits: CorridorExit[] = [];
    for (const way of graph.parentWays(node)) {
        if (!isLaneRoad(way)) continue;
        const nodes = (way as osmWay).nodes;
        nodes.forEach((id, i) => {
            if (id !== nodeID) return;
            for (const along of [true, false]) {
                if (along && i === nodes.length - 1) continue;
                if (!along && i === 0) continue;
                if (way.id === fromWay.id && along !== alongWay) continue;   // no U-turn back onto the same way
                if (way.id === fromWay.id && ((alongWay && i === 0) || (!alongWay && i === nodes.length - 1))) continue;
                if (!drivable(way as osmWay, along)) continue;
                const heading = headingAt(way as osmWay, nodeID, true, along, graph, frame);
                if (!heading || len(heading) === 0) continue;
                const angle = signedAngle(incoming, heading);
                const tags = way.tags;
                exits.push({
                    way: way as osmWay,
                    alongWay: along,
                    angle,
                    turn: turnForAngle(angle),
                    destination: tags.destination ?? tags[`destination:${along ? 'forward' : 'backward'}`] ?? tags.name,
                    destinationRef: tags['destination:ref'] ?? tags.ref
                });
            }
        });
    }
    // left to right as the driver sees them
    return exits.sort((a, b) => b.angle - a.angle);
}


const isRing = (way: osmWay) => way.tags.junction === 'roundabout' || way.tags.junction === 'circular';

/**
 * The roads leaving a roundabout, for traffic entering it from `fromWay` at `nodeID`: numbered in the
 * order they are passed going round, with the turn their direction suggests relative to the entry.
 */
export function roundaboutExits(fromWay: osmWay, alongWay: boolean, nodeID: NodeId, graph: coreGraph): CorridorExit[] {
    const node = graph.entity(nodeID) as osmNode;
    const frame = metricFrame(node.loc);
    const incoming = headingAt(fromWay, nodeID, false, alongWay, graph, frame);
    if (!incoming) return [];

    // ring ways are one-way along their drawing direction: follow them from the entry node
    const ringWays = graph.parentWays(node).filter(w => isRing(w as osmWay)) as osmWay[];
    if (!ringWays.length) return [];
    let way = ringWays.find(w => w.nodes.indexOf(nodeID) < w.nodes.length - 1) ?? ringWays[0];
    let index = way.nodes.indexOf(nodeID);
    const exits: CorridorExit[] = [];
    const seen = new Set<string>();
    let exitNumber = 0;
    for (let guard = 0; guard < 500; guard++) {
        index++;
        if (index >= way.nodes.length) {
            // on to the ring way that starts where this one ends
            const current = way;
            const end = current.nodes[current.nodes.length - 1];
            const next = graph.parentWays(graph.entity(end))
                .find(w => isRing(w as osmWay) && w.id !== current.id && (w as osmWay).nodes[0] === end) as osmWay | undefined;
            if (!next) {
                if (way.isClosed()) index = 1;
                else break;
            } else {
                way = next;
                index = 1;
            }
        }
        const id = way.nodes[index] as NodeId;
        if (id === nodeID || seen.has(id)) break;
        seen.add(id);

        const ringNode = graph.entity(id) as osmNode;
        let numbered = false;
        for (const parent of graph.parentWays(ringNode)) {
            const exitWay = parent as osmWay;
            if (isRing(exitWay) || !isLaneRoad(exitWay)) continue;
            const i = exitWay.nodes.indexOf(id);
            for (const along of [true, false]) {
                if (along && i === exitWay.nodes.length - 1) continue;
                if (!along && i === 0) continue;
                if (!drivable(exitWay, along)) continue;
                const heading = headingAt(exitWay, id, true, along, graph, metricFrame(ringNode.loc));
                if (!heading) continue;
                if (!numbered) {
                    exitNumber++;
                    numbered = true;
                }
                const angle = signedAngle(incoming, heading);
                const tags = exitWay.tags;
                exits.push({
                    way: exitWay, alongWay: along, angle, turn: turnForAngle(angle), exitNumber,
                    destination: tags.destination ?? tags[`destination:${along ? 'forward' : 'backward'}`] ?? tags.name,
                    destinationRef: tags['destination:ref'] ?? tags.ref
                });
            }
        }
    }
    return exits;
}


/** The exit that continues the road: same ref, then same name, then same class, then the straightest */
export function continuation(fromWay: osmWay, exits: CorridorExit[]): CorridorExit | undefined {
    const score = (exit: CorridorExit) =>
        (fromWay.tags.ref && exit.way.tags.ref === fromWay.tags.ref ? 8 : 0) +
        (fromWay.tags.name && exit.way.tags.name === fromWay.tags.name ? 4 : 0) +
        (exit.way.tags.highway === fromWay.tags.highway ? 2 : 0) +
        (Math.abs(exit.angle) < 45 ? 1 : 0);
    return [...exits]
        .filter(exit => Math.abs(exit.angle) < 120)
        .sort((a, b) => score(b) - score(a) || Math.abs(a.angle) - Math.abs(b.angle))[0];
}


/**
 * Walks ahead from a road, junction by junction, choosing the continuation each time.
 * Read-only: it never changes the graph. Stops at the limits, a dead end, a loop,
 * or on reaching a roundabout (which has its own view).
 */
export function laneCorridor(start: osmWay, graph: coreGraph, options: CorridorOptions): CorridorStep[] {
    const maxWays = options.maxWays ?? 5;
    const maxMetres = options.maxMetres ?? 500;
    const steps: CorridorStep[] = [];
    const visited = new Set<string>();

    let way = start;
    let alongWay = options.direction === 'forward';
    let distance = 0;

    while (steps.length < maxWays && !visited.has(way.id)) {
        visited.add(way.id);
        const endNode = alongWay ? way.last() : way.first();
        const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
        distance += polylineLength(lineOf(way, graph, frame));
        let exits = junctionExits(way, alongWay, endNode, graph);
        // entering a roundabout: the exits that matter are the roads leaving the ring
        if (!isRing(way) && exits.some(exit => isRing(exit.way))) {
            const ringExits = roundaboutExits(way, alongWay, endNode, graph);
            if (ringExits.length) exits = ringExits;
        }
        steps.push({ way, alongWay, distance, exits, endNode });
        if (exits.some(exit => exit.exitNumber)) break;

        if (distance >= maxMetres) break;
        const next = continuation(way, exits);
        if (!next) break;
        const entersRoundabout = next.way.tags.junction === 'roundabout' && way.tags.junction !== 'roundabout';
        if (entersRoundabout) break;
        way = next.way;
        alongWay = next.alongWay;
    }
    return steps;
}
