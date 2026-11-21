import { actionAddEntity } from '../../actions/add_entity';
import { actionChangeTags } from '../../actions/change_tags';
import { actionDeleteRelation } from '../../actions/delete_relation';
import { actionSplit } from '../../actions/split';
import type { coreGraph } from '../../core/graph';
import type { Action } from '../../core/history';
import type { NodeId, RelationId, WayId } from '../../osm';
import { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { defaultLinks, resolveConnectivity, type LaneLink, type LaneSpot } from '../geometry/connectivity';
import {
    connectionState, connectivityLane, formatConnectivity, parseConnectivity, setConnection,
    type ConnectionState, type ConnectivityGroup
} from '../model';

export type ConnectProblem = 'same_road' | 'not_joined' | 'cannot_split';

/**
 * The junction node where the `from` lane can drive into the `to` lane: where the stretch it is on arrives and the
 * stretch of the other road leaves (a both_ways lane runs either way)
 */
export function connectionNode(graph: coreGraph, from: LaneSpot, to: LaneSpot): { nodeID: NodeId } | { problem: ConnectProblem } {
    if (from.wayID === to.wayID) return { problem: 'same_road' };
    const arrives = from.ref.direction === 'both_ways' ? [from.to, from.from] : [from.to];
    const leaves = to.ref.direction === 'both_ways' ? [to.from, to.to] : [to.from];
    const nodeID = arrives.find(id => leaves.includes(id));
    if (nodeID) {
        // roads running through the junction are split there: they must allow it
        for (const spot of [from, to]) {
            const way = graph.entity(spot.wayID) as osmWay;
            if (way.first() === nodeID || way.last() === nodeID) continue;
            if (actionSplit([nodeID]).limitWays([spot.wayID]).disabled?.(graph)) return { problem: 'cannot_split' };
        }
        return { nodeID };
    }
    // over a relation's via ways
    for (const relation of graph.parentRelations(graph.entity(from.wayID)) as osmRelation[]) {
        if (relation.tags.type !== 'connectivity') continue;
        const r = resolveConnectivity(graph, relation);
        if (!('problem' in r) && r.viaWays.length && r.from.id === from.wayID && r.to.id === to.wayID &&
            arrives.includes(r.fromNode) && leaves.includes(r.toNode)) return { nodeID: r.fromNode };
    }
    return { problem: 'not_joined' };
}

/** The connectivity relation for a from road, junction node (or the via ways from it) and to road, if there is one */
export function findConnectivity(graph: coreGraph, fromID: WayId, nodeID: NodeId, toID: WayId): osmRelation | undefined {
    return (graph.parentRelations(graph.entity(fromID)) as osmRelation[]).find(relation => {
        if (relation.tags.type !== 'connectivity') return false;
        const r = resolveConnectivity(graph, relation);
        return !('problem' in r) && r.from.id === fromID && r.to.id === toID && r.fromNode === nodeID;
    });
}

/** The `connectivity` value of the lanes Lane Studio connects from one road into another, as a relation would say it */
export function defaultConnectivity(links: LaneLink[]): string {
    const groups = new Map<string, ConnectivityGroup>();
    for (const link of links) {
        const from = connectivityLane(link.from.ref);
        const group = groups.get(from) ?? { from, to: [] };
        const to = connectivityLane(link.to.ref);
        if (!group.to.some(c => c.to === to)) group.to.push({ to, optional: link.optional });
        groups.set(from, group);
    }
    return formatConnectivity([...groups.values()]);
}

/** Splits a road running through `nodeID` there, keeping the half the stretch `spot` is on; the way that ends there */
function endAt(graph: coreGraph, spot: LaneSpot, nodeID: NodeId): { graph: coreGraph; wayID: WayId } {
    const way = graph.entity(spot.wayID) as osmWay;
    // (a road beyond a relation's via ways does not reach the node at all)
    if (way.first() === nodeID || way.last() === nodeID || !way.nodes.includes(nodeID)) return { graph, wayID: spot.wayID };
    const split = actionSplit([nodeID]).limitWays([spot.wayID]);
    const next = split(graph);
    const other = spot.from === nodeID ? spot.to : spot.from;
    const halves = [spot.wayID, ...(split.getCreatedWayIDs?.() ?? [])].map(id => next.entity(id) as osmWay);
    const half = halves.find(w => w.nodes.includes(other) && (w.first() === nodeID || w.last() === nodeID)) ?? halves[0];
    return { graph: next, wayID: half.id };
}

/**
 * Sets the `connectivity` of the relation from one road into another at a node: creates the relation, updates its
 * tag, or removes it when nothing is left
 */
export function actionSetConnectivity(fromID: WayId, nodeID: NodeId, toID: WayId, value: string): Action {
    return function(graph) {
        const existing = findConnectivity(graph, fromID, nodeID, toID);
        const formatted = formatConnectivity(parseConnectivity(value));
        if (existing) {
            if (!formatted) return actionDeleteRelation(existing.id as RelationId, true)(graph);
            return actionChangeTags(existing.id, { ...existing.tags, connectivity: formatted })(graph);
        }
        if (!formatted) return graph;
        const relation = new osmRelation({
            tags: { type: 'connectivity', connectivity: formatted },
            members: [
                { id: fromID, type: 'way', role: 'from' },
                { id: nodeID, type: 'node', role: 'via' },
                { id: toID, type: 'way', role: 'to' }
            ]
        });
        return actionAddEntity(relation)(graph);
    };
}

/** What a click does to a connection: sets it, or toggles it as straight on (`toggle`) or needing a lane change */
export type ConnectChange = ConnectionState | 'toggle' | 'toggle_optional';

/** The direction a lane travels on the stretch `spot` when arriving at or leaving `nodeID` (a both_ways lane either) */
function travelDirection(spot: LaneSpot, nodeID: NodeId, arriving: boolean): 'forward' | 'backward' {
    if (spot.ref.direction !== 'both_ways') return spot.ref.direction;
    // (a both_ways lane's stretch is in the way's direction)
    return (arriving ? spot.to === nodeID : spot.from === nodeID) ? 'forward' : 'backward';
}

/**
 * What changing how one lane leads into another would write: the relation there is, the `connectivity` it has now (or,
 * with none, the connections Lane Studio works out between the two roads, which a new relation starts from: a relation
 * lists every lane that leads from its from road to its to road), the value after the change, and whether it changes
 * anything (a new relation saying only what Lane Studio works out, or saying nothing, is not written)
 */
export function connectionChange(graph: coreGraph, from: LaneSpot, nodeID: NodeId, to: LaneSpot, change: ConnectChange) {
    const existing = findConnectivity(graph, from.wayID, nodeID, to.wayID);
    const fromDirection = travelDirection(from, nodeID, true);
    const toDirection = travelDirection(to, nodeID, false);
    const current = existing ? existing.tags.connectivity ?? '' : defaultConnectivity(defaultLinks(graph, from.wayID, nodeID, to.wayID)
        .filter(l => l.from.ref.direction === fromDirection && l.to.ref.direction === toDirection));
    const fromLane = connectivityLane(from.ref);
    const toLane = connectivityLane(to.ref);
    const state = connectionState(current, fromLane, toLane);
    const next: ConnectionState = change === 'toggle' ? (state === 'default' ? 'none' : 'default')
        : change === 'toggle_optional' ? (state === 'optional' ? 'none' : 'optional')
            : change;
    const value = setConnection(current, fromLane, toLane, next);
    return { existing, current, value, changes: existing ? value !== current : value !== current && !!value };
}

/**
 * Changes how one lane leads into another at a junction (wiki: Relation:connectivity), as `connectionChange` works
 * out. A road running through the junction is split there first, as a relation's from and to roads end at its via
 * node. When nothing is left, the relation goes.
 */
export function actionConnectLanes(from: LaneSpot, nodeID: NodeId, to: LaneSpot, change: ConnectChange = 'toggle'): Action {
    return function(graph) {
        const { value, changes } = connectionChange(graph, from, nodeID, to, change);
        if (!changes) return graph;
        const a = endAt(graph, from, nodeID);
        const b = endAt(a.graph, to, nodeID);
        return actionSetConnectivity(a.wayID, nodeID, b.wayID, value)(b.graph);
    };
}

/**
 * Writes the connections Lane Studio works out from one lane's road into another road as a relation, to edit from
 * there (splitting a road running through the junction, as connecting lanes does)
 */
export function actionDeclareConnectivity(from: LaneSpot, nodeID: NodeId, to: LaneSpot): Action {
    return function(graph) {
        const fromDirection = travelDirection(from, nodeID, true);
        const toDirection = travelDirection(to, nodeID, false);
        const value = defaultConnectivity(defaultLinks(graph, from.wayID, nodeID, to.wayID)
            .filter(l => l.from.ref.direction === fromDirection && l.to.ref.direction === toDirection));
        if (!value || findConnectivity(graph, from.wayID, nodeID, to.wayID)) return graph;
        const a = endAt(graph, from, nodeID);
        const b = endAt(a.graph, to, nodeID);
        return actionSetConnectivity(a.wayID, nodeID, b.wayID, value)(b.graph);
    };
}
