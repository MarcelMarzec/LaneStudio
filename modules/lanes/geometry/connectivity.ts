import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { parseConnectivity, type LaneDirection, type LaneRef } from '../model';
import { metricFrame, sub, add, scale, unit, rightNormal } from './frame';
import { cachedLayout } from './road_geometry';

// how far from the junction node lane ends are drawn, in metres
const clearance = 7;

/** The direction lanes travel towards a junction node (`approach`) or away from it, if any */
export function laneDirectionAt(way: osmWay, nodeID: NodeId, approach: boolean): LaneDirection | null {
    const atEnd = way.last() === nodeID;
    const atStart = way.first() === nodeID;
    if (!atEnd && !atStart) return null;
    // arriving at the last node, or leaving the first node, is travelling forward
    return (approach ? atEnd : atStart) ? 'forward' : 'backward';
}

interface LaneEnd {
    point: Vec2;
    /** travel direction at the lane end */
    tangent: Vec2;
}

/** Where a lane ends (approaching) or starts (leaving) near a junction node, in the node's metric frame */
function laneEnd(way: osmWay, ref: LaneRef, nodeID: NodeId, graph: coreGraph, frame: ReturnType<typeof metricFrame>): LaneEnd | null {
    const layout = cachedLayout(way, graph);
    const k = layout.lanes.findIndex(l => l.ref.direction === ref.direction && l.ref.index === ref.index);
    if (k === -1) return null;
    const atEnd = way.last() === nodeID;
    const neighbour = graph.entity(atEnd ? way.nodes[way.nodes.length - 2] : way.nodes[1]) as osmNode;
    const node = frame.toMetres((graph.entity(nodeID) as osmNode).loc);
    // the way's drawing direction at this end
    const wayDir = atEnd ? unit(sub(node, frame.toMetres(neighbour.loc))) : unit(sub(frame.toMetres(neighbour.loc), node));
    const shift = atEnd ? layout.shiftEnd : layout.shiftStart;
    const offset = (layout.edges[k] + layout.edges[k + 1]) / 2 + shift;
    const along = atEnd ? -clearance : clearance;
    const point = add(add(node, scale(wayDir, along)), scale(rightNormal(wayDir), offset));
    const tangent = ref.direction === 'backward' ? scale(wayDir, -1) : wayDir;
    return { point, tangent };
}

/** A smooth curve from the end of one lane to the start of another, in lon/lat */
export function connectionCurve(from: { way: osmWay; ref: LaneRef }, to: { way: osmWay; ref: LaneRef }, nodeID: NodeId, graph: coreGraph): Vec2[] | null {
    const frame = metricFrame((graph.entity(nodeID) as osmNode).loc);
    const a = laneEnd(from.way, from.ref, nodeID, graph, frame);
    const b = laneEnd(to.way, to.ref, nodeID, graph, frame);
    if (!a || !b) return null;
    const p1 = add(a.point, scale(a.tangent, 5));
    const p2 = sub(b.point, scale(b.tangent, 5));
    const points: Vec2[] = [];
    for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const u = 1 - t;
        points.push([
            u * u * u * a.point[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * b.point[0],
            u * u * u * a.point[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * b.point[1]
        ]);
    }
    return points.map(frame.toLoc);
}

export interface ConnectionShape {
    key: string;
    relationID: string;
    optional: boolean;
    line: Vec2[];
}

/** Curves for every connection of the type=connectivity relations among `entities` */
export function connectivityShapes(entities: OsmEntity[], graph: coreGraph): ConnectionShape[] {
    const shapes: ConnectionShape[] = [];
    for (const entity of entities) {
        if (entity.type !== 'relation' || entity.tags.type !== 'connectivity') continue;
        const relation = entity as osmRelation;
        const fromID = relation.members.find(m => m.role === 'from' && m.type === 'way')?.id;
        const viaID = relation.members.find(m => m.role === 'via' && m.type === 'node')?.id as NodeId | undefined;
        const toID = relation.members.find(m => m.role === 'to' && m.type === 'way')?.id;
        const from = fromID && graph.hasEntity(fromID) as osmWay | undefined;
        const to = toID && graph.hasEntity(toID) as osmWay | undefined;
        if (!from || !to || !viaID || !graph.hasEntity(viaID)) continue;
        const fromDirection = laneDirectionAt(from, viaID, true);
        const toDirection = laneDirectionAt(to, viaID, false);
        if (!fromDirection || !toDirection) continue;

        for (const group of parseConnectivity(relation.tags.connectivity ?? '')) {
            const fromIndex = parseInt(group.from, 10) - 1;
            if (Number.isNaN(fromIndex)) continue;
            for (const connection of group.to) {
                const toIndex = parseInt(connection.to, 10) - 1;
                if (Number.isNaN(toIndex)) continue;
                const line = connectionCurve(
                    { way: from, ref: { direction: fromDirection, index: fromIndex } },
                    { way: to, ref: { direction: toDirection, index: toIndex } }, viaID, graph);
                if (line) shapes.push({ key: `${relation.id}-${group.from}-${connection.to}`, relationID: relation.id, optional: connection.optional, line });
            }
        }
    }
    return shapes;
}
