import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, RelationId, WayId } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import {
    connectivityRef, connectivitySyntaxProblems, parseConnectivity, sameLaneRef,
    type ConnectivitySyntaxProblem, type LaneDirection, type LaneRef
} from '../model';
import { metricFrame, sub, unit } from './frame';
import { cachedLayout, junctionRules, type RoadPiece } from './road_geometry';
import { junctionLaneMoves, restrictionAt } from './routing';

/*
 * Lane connections through junctions (wiki: Relation:connectivity), for the Connectivity tool: the ones a
 * type=connectivity relation declares, and the ones Lane Studio works out where there is none (by the turn arrows and
 * lane counts, as routes go). Connection curves of the normal drawing are road_geometry's junctionConnections.
 */

/** The direction lanes travel towards a junction node (`approach`) or away from it, if any */
export function laneDirectionAt(way: osmWay, nodeID: NodeId, approach: boolean): LaneDirection | null {
    const atEnd = way.last() === nodeID;
    const atStart = way.first() === nodeID;
    if (!atEnd && !atStart) return null;
    // arriving at the last node, or leaving the first node, is travelling forward
    return (approach ? atEnd : atStart) ? 'forward' : 'backward';
}

/** A lane of a road */
export interface LaneEnd {
    wayID: WayId;
    ref: LaneRef;
}

/** One lane leading into another through a junction */
export interface LaneLink {
    key: string;
    /** the junction node the from lane arrives at */
    nodeID: NodeId;
    /** where the to lane starts: the junction node, or the far end of a relation's via ways */
    toNodeID: NodeId;
    from: LaneEnd;
    to: LaneEnd;
    /** declared by a type=connectivity relation (else worked out by Lane Studio) */
    declared: boolean;
    /** a lane change is needed to reach the to lane (`(n)` in the tag): not the lane's default */
    optional: boolean;
    relationID?: RelationId;
    /** a relation's via ways, which it passes over */
    viaWays?: WayId[];
    /** two roads simply join here, with as many lanes each way: the lanes carry on */
    plain: boolean;
}

/** A type=connectivity relation's members, read as the wiki defines them */
export interface ResolvedConnectivity {
    relation: osmRelation;
    from: osmWay;
    to: osmWay;
    /** where the from road arrives (its end at the via node, or at the via ways) and where the to road leaves */
    fromNode: NodeId;
    toNode: NodeId;
    fromDirection: Exclude<LaneDirection, 'both_ways'>;
    toDirection: Exclude<LaneDirection, 'both_ways'>;
    viaWays: WayId[];
}

/** What is wrong with a connectivity relation */
export type ConnectivityProblem = ConnectivitySyntaxProblem
    /** not exactly one from way and one to way, and one via node or via ways */
    | 'members'
    /** the from and to roads do not end at the via node (or at an end of the via ways) */
    | 'not_joined'
    /** a lane number beyond the lanes of the from road, or of the to road, in the direction travelled */
    | 'from_lane' | 'to_lane';

/** The members of a connectivity relation, or why they cannot be read */
export function resolveConnectivity(graph: coreGraph, relation: osmRelation): ResolvedConnectivity | { problem: 'members' | 'not_joined' } {
    const froms = relation.members.filter(m => m.role === 'from');
    const tos = relation.members.filter(m => m.role === 'to');
    const vias = relation.members.filter(m => m.role === 'via');
    if (froms.length !== 1 || tos.length !== 1 || froms[0].type !== 'way' || tos[0].type !== 'way' || !vias.length) return { problem: 'members' };
    const viaNodes = vias.filter(m => m.type === 'node');
    if (viaNodes.length > 1 || (viaNodes.length && vias.length > 1) || vias.some(m => m.type === 'relation')) return { problem: 'members' };
    const from = graph.hasEntity(froms[0].id as WayId) as osmWay | undefined;
    const to = graph.hasEntity(tos[0].id as WayId) as osmWay | undefined;
    if (!from || !to) return { problem: 'members' };

    const ends = (way: osmWay) => [way.first(), way.last()];
    let fromNode: NodeId | undefined;
    let toNode: NodeId | undefined;
    const viaWays: WayId[] = [];
    if (viaNodes.length) {
        fromNode = viaNodes[0].id as NodeId;
        toNode = fromNode;
    } else {
        const ways = vias.map(m => graph.hasEntity(m.id as WayId) as osmWay | undefined);
        if (ways.some(w => !w)) return { problem: 'members' };
        const viaEnds = new Set((ways as osmWay[]).flatMap(ends));
        viaWays.push(...(ways as osmWay[]).map(w => w.id));
        fromNode = ends(from).find(id => viaEnds.has(id));
        toNode = ends(to).find(id => viaEnds.has(id) && id !== fromNode);
    }
    if (!fromNode || !toNode) return { problem: 'not_joined' };
    const fromDirection = laneDirectionAt(from, fromNode, true);
    const toDirection = laneDirectionAt(to, toNode, false);
    if (!fromDirection || !toDirection || fromDirection === 'both_ways' || toDirection === 'both_ways') return { problem: 'not_joined' };
    return { relation, from, to, fromNode, toNode, fromDirection, toDirection, viaWays };
}

/** The lanes a relation's tag connects, as lanes of its roads (lanes beyond the roads' lanes are left out) */
function declaredLinks(graph: coreGraph, r: ResolvedConnectivity): LaneLink[] {
    const fromLanes = cachedLayout(r.from, graph).model.lanes;
    const toLanes = cachedLayout(r.to, graph).model.lanes;
    const exists = (lanes: typeof fromLanes, ref: LaneRef) => ref.index < lanes[ref.direction].length;
    return parseConnectivity(r.relation.tags.connectivity ?? '').flatMap(group => {
        const from = connectivityRef(group.from, r.fromDirection);
        if (!from || !exists(fromLanes, from)) return [];
        return group.to.flatMap(c => {
            const to = connectivityRef(c.to, r.toDirection);
            if (!to || !exists(toLanes, to)) return [];
            return [{
                key: `${r.relation.id}-${group.from}-${c.to}`, nodeID: r.fromNode, toNodeID: r.toNode,
                from: { wayID: r.from.id, ref: from }, to: { wayID: r.to.id, ref: to },
                declared: true, optional: c.optional, relationID: r.relation.id as RelationId,
                viaWays: r.viaWays.length ? r.viaWays : undefined, plain: false
            }];
        });
    });
}

/** The connectivity relations whose from road arrives at a node */
function relationsAt(graph: coreGraph, node: osmNode): ResolvedConnectivity[] {
    const relations = new Set<osmRelation>();
    for (const way of graph.parentWays(node)) {
        for (const relation of graph.parentRelations(way) as osmRelation[]) {
            if (relation.tags.type === 'connectivity') relations.add(relation);
        }
    }
    return [...relations].flatMap(relation => {
        const r = resolveConnectivity(graph, relation);
        return 'problem' in r || r.fromNode !== node.id ? [] : [r];
    });
}

const linksCache = new WeakMap<coreGraph, Map<string, { deps: unknown[]; links: LaneLink[] }>>();

/**
 * Every lane connection from the lanes arriving at a node: declared by the connectivity relations there, and,
 * between roads no relation covers, worked out by Lane Studio (none where a turn restriction bans the turn)
 */
export function laneLinksAt(graph: coreGraph, nodeID: string): LaneLink[] {
    const node = graph.hasEntity(nodeID as NodeId) as osmNode | undefined;
    if (!node) return [];
    const ways = graph.parentWays(node).filter(isLaneRoad) as osmWay[];
    const deps = [node, ...ways, ...ways.flatMap(w => graph.parentRelations(w))];
    let byNode = linksCache.get(graph);
    if (!byNode) linksCache.set(graph, byNode = new Map());
    const cached = byNode.get(nodeID);
    if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) return cached.links;

    const links: LaneLink[] = [];
    const declared = relationsAt(graph, node);
    for (const r of declared) links.push(...declaredLinks(graph, r));
    const covered = new Set(declared.filter(r => !r.viaWays.length).map(r => `${r.from.id}>${r.to.id}`));

    if (ways.length > 1) {
        const { arms, moves } = junctionLaneMoves(graph, nodeID);
        arms.forEach((up, i) => {
            const upDirection = junctionRules.armLaneDirection(up, true);
            const upCount = up.layout.model.lanes[upDirection].length;
            moves[i].forEach((laneMoves, lane) => {
                for (const move of laneMoves) {
                    const down = arms[move.j];
                    if (down.way.id === up.way.id) continue;
                    if (up.isEnd && down.isEnd && covered.has(`${up.way.id}>${down.way.id}`)) continue;
                    if (restrictionAt(graph, up.way, nodeID, down.way, 'car')) continue;
                    const downDirection = junctionRules.armLaneDirection(down, false);
                    const downCount = down.layout.model.lanes[downDirection].length;
                    links.push({
                        key: `${nodeID}-${up.way.id}:${up.nodeIndex}-${lane}-${down.way.id}:${down.nodeIndex}-${move.toLane}`,
                        nodeID: nodeID as NodeId, toNodeID: nodeID as NodeId,
                        from: { wayID: up.way.id, ref: { direction: upDirection, index: lane } },
                        to: { wayID: down.way.id, ref: { direction: downDirection, index: move.toLane } },
                        declared: false, optional: false, plain: arms.length === 2 && upCount === downCount
                    });
                }
            });
        });
    }
    byNode.set(nodeID, { deps, links });
    return links;
}

/** The connections Lane Studio works out from one road into another at a node, as if no relation declared them */
export function defaultLinks(graph: coreGraph, fromID: WayId, nodeID: NodeId, toID: WayId): LaneLink[] {
    const relations = (graph.parentRelations(graph.entity(fromID)) as osmRelation[]).filter(r => {
        if (r.tags.type !== 'connectivity') return false;
        const resolved = resolveConnectivity(graph, r);
        return !('problem' in resolved) && !resolved.viaWays.length && resolved.fromNode === nodeID && resolved.to.id === toID;
    });
    const without = relations.reduce((g, r) => g.remove(r), graph);
    return laneLinksAt(without, nodeID).filter(l => !l.declared && l.from.wayID === fromID && l.to.wayID === toID);
}

/** What is wrong with a connectivity relation: its members, its tag's syntax, and lanes its roads do not have */
export function connectivityProblems(graph: coreGraph, relation: osmRelation): ConnectivityProblem[] {
    const problems: ConnectivityProblem[] = [...connectivitySyntaxProblems(relation.tags.connectivity)];
    const r = resolveConnectivity(graph, relation);
    if ('problem' in r) return [r.problem, ...problems];
    const fromLanes = cachedLayout(r.from, graph).model.lanes;
    const toLanes = cachedLayout(r.to, graph).model.lanes;
    const beyond = (lanes: typeof fromLanes, lane: string, direction: 'forward' | 'backward') => {
        const ref = connectivityRef(lane, direction);
        return !!ref && ref.index >= lanes[ref.direction].length;
    };
    const groups = parseConnectivity(relation.tags.connectivity ?? '');
    if (groups.some(g => beyond(fromLanes, g.from, r.fromDirection))) problems.push('from_lane');
    if (groups.some(g => g.to.some(c => beyond(toLanes, c.to, r.toDirection)))) problems.push('to_lane');
    return problems;
}

/**
 * Whether a via-node relation says no more than Lane Studio works out without it (the wiki: relations are only
 * needed where the connections are not the default)
 */
export function sameAsDefault(graph: coreGraph, relation: osmRelation): boolean {
    const r = resolveConnectivity(graph, relation);
    if ('problem' in r || r.viaWays.length) return false;
    const declared = declaredLinks(graph, r);
    if (!declared.length || declared.some(l => l.optional)) return false;
    const defaults = defaultLinks(graph, r.from.id, r.fromNode, r.to.id);
    const id = (l: LaneLink) => `${l.from.ref.direction}${l.from.ref.index}>${l.to.ref.direction}${l.to.ref.index}`;
    const a = new Set(declared.map(id));
    const b = new Set(defaults.map(id));
    return a.size === b.size && [...a].every(x => b.has(x));
}

/** The piece of a road whose end is at a node, and the lane's centre line point and direction of travel there */
export function laneEndAt(pieces: RoadPiece[], lane: LaneEnd, nodeID: string, arriving: boolean): { point: Vec2; along: Vec2 } | null {
    for (const piece of pieces) {
        if (piece.wayID !== lane.wayID) continue;
        const k = piece.layout.lanes.findIndex(l => sameLaneRef(l.ref, lane.ref));
        if (k < 0) continue;
        const line = piece.centres[k];
        if (!line || line.length < 2) continue;
        // the lane's travel along the piece: forward lanes arrive at its end and leave its start, backward the reverse
        let atEnd: boolean;
        if (lane.ref.direction === 'both_ways') {
            if (piece.toNode === nodeID) atEnd = true;
            else if (piece.fromNode === nodeID) atEnd = false;
            else continue;
        } else {
            atEnd = (lane.ref.direction === 'forward') === arriving;
            if ((atEnd ? piece.toNode : piece.fromNode) !== nodeID) continue;
        }
        const [p, q] = atEnd ? [line[line.length - 1], line[line.length - 2]] : [line[0], line[1]];
        // the direction of travel at the end: into the node when arriving, out of it when leaving
        return { point: p, along: arriving ? sub(p, q) : sub(q, p) };
    }
    return null;
}

/**
 * The line a connection is drawn with: from the end of the from lane's centre line to the start of the to lane's,
 * curving as the lanes run; null when either road is not drawn
 */
export function laneLinkLine(link: LaneLink, pieces: RoadPiece[], graph: coreGraph): Vec2[] | null {
    const a = laneEndAt(pieces, link.from, link.nodeID, true);
    const b = laneEndAt(pieces, link.to, link.toNodeID, false);
    const node = graph.hasEntity(link.nodeID) as osmNode | undefined;
    if (!a || !b || !node) return null;
    const frame = metricFrame(node.loc);
    const end = (x: { point: Vec2; along: Vec2 }) => {
        const point = frame.toMetres(x.point);
        const ahead = frame.toMetres([x.point[0] + x.along[0], x.point[1] + x.along[1]]);
        return { point, tangent: unit(sub(ahead, point)) };
    };
    return junctionRules.curve(end(a), end(b)).map(frame.toLoc);
}

/**
 * The lanes a lane can lead into at the junctions it arrives at: the lanes of the other roads leaving each junction
 * (also roads running through it, which are split there when connected), and the to road of any relation over via
 * ways from it
 */
export function linkTargets(pieces: RoadPiece[], graph: coreGraph, from: LaneSpot): (LaneSpot & { nodeID: NodeId })[] {
    const way = graph.hasEntity(from.wayID) as osmWay | undefined;
    if (!way) return [];
    const arrivals = from.ref.direction === 'both_ways' ? [from.to, from.from] : [from.to];
    const result: (LaneSpot & { nodeID: NodeId })[] = [];
    const seen = new Set<string>();
    for (const piece of pieces) {
        if (piece.wayID === from.wayID) continue;
        for (const lane of piece.layout.lanes) {
            const leaves = lane.ref.direction === 'both_ways' ? [piece.fromNode, piece.toNode]
                : [lane.ref.direction === 'forward' ? piece.fromNode : piece.toNode];
            const nodeID = arrivals.find(id => leaves.includes(id)) as NodeId | undefined;
            if (!nodeID) continue;
            // (not into a road a turn restriction bans from here, as only_straight_on on w253670825, Frankfurt)
            const into = graph.hasEntity(piece.wayID as WayId) as osmWay | undefined;
            if (!into || restrictionAt(graph, way, nodeID, into, 'car')) continue;
            const spot = spotOf(piece, lane.ref);
            const key = `${piece.wayID}-${spot.from}-${spot.to}-${lane.ref.direction}${lane.ref.index}`;
            if (seen.has(key)) continue;
            seen.add(key);
            result.push({ ...spot, nodeID });
        }
    }
    // the roads beyond via ways, where a relation already leads there
    for (const relation of graph.parentRelations(way) as osmRelation[]) {
        if (relation.tags.type !== 'connectivity') continue;
        const r = resolveConnectivity(graph, relation);
        if ('problem' in r || !r.viaWays.length || r.from.id !== from.wayID || !arrivals.includes(r.fromNode)) continue;
        for (const piece of pieces.filter(p => p.wayID === r.to.id)) {
            for (const lane of piece.layout.lanes) {
                const spot = spotOf(piece, lane.ref);
                const leaves = lane.ref.direction === 'both_ways' ? [spot.from, spot.to] : [spot.from];
                if (!leaves.includes(r.toNode)) continue;
                result.push({ ...spot, nodeID: r.fromNode });
            }
        }
    }
    return result;
}

/**
 * A lane on one stretch of a road: the nodes the stretch runs between, in the order the lane is driven (a both_ways
 * lane in the way's direction)
 */
export interface LaneSpot extends LaneEnd {
    from: NodeId;
    to: NodeId;
}

/** The lane `ref` on a drawn piece of road */
export function spotOf(piece: RoadPiece, ref: LaneRef): LaneSpot {
    const backward = ref.direction === 'backward';
    return {
        wayID: piece.wayID, ref,
        from: (backward ? piece.toNode : piece.fromNode) as NodeId,
        to: (backward ? piece.fromNode : piece.toNode) as NodeId
    };
}

/**
 * A connection's lane as a stretch of its road next to the junction (`nodeID`), to edit the connection with: the
 * stretch to the next node along the way in the lane's direction of travel
 */
export function spotAt(graph: coreGraph, lane: LaneEnd, nodeID: NodeId, arriving: boolean): LaneSpot | null {
    const way = graph.hasEntity(lane.wayID) as osmWay | undefined;
    if (!way) return null;
    if (lane.ref.direction === 'both_ways') {
        // (a both_ways lane's stretch is in the way's direction)
        const k = way.nodes.indexOf(nodeID);
        if (k < 0 || way.nodes.length < 2) return null;
        return k > 0 ? { ...lane, from: way.nodes[k - 1] as NodeId, to: nodeID } : { ...lane, from: nodeID, to: way.nodes[1] as NodeId };
    }
    const i = arriving === (lane.ref.direction === 'forward') ? way.nodes.lastIndexOf(nodeID) : way.nodes.indexOf(nodeID);
    if (i < 0) return null;
    const step = lane.ref.direction === 'forward' ? 1 : -1;
    const other = way.nodes[arriving ? i - step : i + step] as NodeId | undefined;
    if (!other) return null;
    return arriving ? { ...lane, from: other, to: nodeID } : { ...lane, from: nodeID, to: other };
}

/**
 * A lane picked before an edit, on the graph after it: a road split at a junction keeps the stretch the lane is on
 * under one of its halves, which may be the new way
 */
export function respot(graph: coreGraph, spot: LaneSpot): LaneSpot | null {
    const has = (way: osmWay | undefined) => !!way && way.nodes.includes(spot.from) && way.nodes.includes(spot.to);
    if (has(graph.hasEntity(spot.wayID) as osmWay | undefined)) return spot;
    const node = graph.hasEntity(spot.to);
    if (!node) return null;
    const way = (graph.parentWays(node as osmNode) as osmWay[]).find(w => has(w));
    return way ? { ...spot, wayID: way.id } : null;
}
