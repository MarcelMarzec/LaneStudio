import { actionAddMidpoint } from '../../actions/add_midpoint';
import { actionChangeTags } from '../../actions/change_tags';
import type { coreGraph } from '../../core/graph';
import type { Action } from '../../core/history';
import type { Vec2 } from '../../geo/vector';
import type { NodeId } from '../../osm';
import { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { metricFrame, cumulativeLengths, pointAlong } from '../geometry/frame';
import { offsetFromWay } from '../geometry/measure';
import { markingType, withMarkingType, type MarkingType } from '../model/markings';

/**
 * Puts a road marking (crossing, stop sign, …) on a road at the point nearest `loc`:
 * tags an existing node there if one is within a metre and has no marking yet, otherwise adds a node
 * on the road's centre line. Returns the action and the node it tags.
 */
export function actionAddMarking(wayID: osmWay['id'], loc: Vec2, type: MarkingType, graph: coreGraph): { action: Action; nodeID: NodeId } {
    const way = graph.entity(wayID) as osmWay;
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = way.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
    const cumulative = cumulativeLengths(points);
    const { along } = offsetFromWay(way, graph, loc);

    // an existing node close by? (not one shared with another road: a junction is no place for a sign)
    const near = way.nodes.findIndex((_, i) => Math.abs(cumulative[i] - along) < 1);
    if (near !== -1) {
        const node = graph.entity(way.nodes[near]) as osmNode;
        if (markingType(node.tags) === 'none' && graph.parentWays(node).length === 1) {
            return { action: actionChangeTags(node.id, withMarkingType(node.tags, type)), nodeID: node.id };
        }
    }

    let i = cumulative.findIndex(s => s > along);
    if (i <= 0) i = points.length - 1;
    const point = frame.toLoc(pointAlong(points, along).point);
    const node = new osmNode({ tags: withMarkingType({}, type) });
    return {
        action: actionAddMidpoint({ loc: point, edge: [way.nodes[i - 1], way.nodes[i]] }, node),
        nodeID: node.id
    };
}
