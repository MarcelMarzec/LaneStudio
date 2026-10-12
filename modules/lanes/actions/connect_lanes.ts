import { actionAddEntity } from '../../actions/add_entity';
import { actionChangeTags } from '../../actions/change_tags';
import { actionDeleteRelation } from '../../actions/delete_relation';
import type { coreGraph } from '../../core/graph';
import type { Action } from '../../core/history';
import type { NodeId, RelationId } from '../../osm';
import { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { laneDirectionAt } from '../geometry/connectivity';
import { toggleConnection, type LaneRef } from '../model';

export type ConnectProblem = 'same_road' | 'not_joined' | 'wrong_direction';

/** The junction node where `from` lanes can drive onto `to` lanes: an end of both ways */
export function connectionNode(from: osmWay, fromRef: LaneRef, to: osmWay, toRef: LaneRef): { nodeID: NodeId } | { problem: ConnectProblem } {
    if (from.id === to.id) return { problem: 'same_road' };
    const shared = [from.first(), from.last()].filter(id => id === to.first() || id === to.last());
    if (!shared.length) return { problem: 'not_joined' };
    for (const nodeID of shared) {
        if (laneDirectionAt(from, nodeID, true) === fromRef.direction && laneDirectionAt(to, nodeID, false) === toRef.direction) {
            return { nodeID };
        }
    }
    return { problem: 'wrong_direction' };
}

/** The connectivity relation for a from road, junction node and to road, if there is one */
export function findConnectivity(graph: coreGraph, fromID: osmWay['id'], nodeID: NodeId, toID: osmWay['id']): osmRelation | undefined {
    return graph.parentRelations(graph.entity(fromID)).find(r => {
        if (r.tags.type !== 'connectivity') return false;
        const members = (r as osmRelation).members;
        return members.some(m => m.role === 'from' && m.id === fromID) &&
            members.some(m => m.role === 'via' && m.id === nodeID) &&
            members.some(m => m.role === 'to' && m.id === toID);
    }) as osmRelation | undefined;
}

/**
 * Adds a lane-to-lane connection at a junction (Relation:connectivity), creating the relation if
 * needed; connecting the same two lanes again removes the connection, and the relation once empty.
 * Lanes are numbered from the driver's left, as the tag counts them.
 */
export function actionConnectLanes(fromID: osmWay['id'], fromRef: LaneRef, nodeID: NodeId, toID: osmWay['id'], toRef: LaneRef): Action {
    return function(graph) {
        const from = `${fromRef.index + 1}`;
        const to = `${toRef.index + 1}`;
        const existing = findConnectivity(graph, fromID, nodeID, toID);
        if (existing) {
            const value = toggleConnection(existing.tags.connectivity ?? '', from, to);
            if (!value) return actionDeleteRelation(existing.id as RelationId, true)(graph);
            return actionChangeTags(existing.id, { ...existing.tags, connectivity: value })(graph);
        }
        const relation = new osmRelation({
            tags: { type: 'connectivity', connectivity: toggleConnection('', from, to) },
            members: [
                { id: fromID, type: 'way', role: 'from' },
                { id: nodeID, type: 'node', role: 'via' },
                { id: toID, type: 'way', role: 'to' }
            ]
        });
        return actionAddEntity(relation)(graph);
    };
}
