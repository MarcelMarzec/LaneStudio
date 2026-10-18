import type { coreGraph } from '../../core/graph';
import type { Action } from '../../core/history';
import type { Vec2 } from '../../geo/vector';
import type { NodeId } from '../../osm';
import { osmNode } from '../../osm/node';
import { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { add, metricFrame, pointAlong, rightNormal, scale } from '../geometry/frame';
import { laneLayout } from '../geometry/layout';
import { offsetFromWay } from '../geometry/measure';
import { signTags, type SignChoice } from '../model/signs';

/**
 * Puts a sign, message sign or camera beside a road, level with `loc`: on the near side of the traffic
 * travelling `direction` (the left in left-hand traffic), just beyond the kerb and any pavement, and
 * facing that traffic (`direction=*` is the bearing the sign faces).
 */
export function actionAddSign(wayID: osmWay['id'], loc: Vec2, travel: 'forward' | 'backward', choice: SignChoice, graph: coreGraph): { action: Action; nodeID: NodeId } {
    const way = graph.entity(wayID) as osmWay;
    const frame = metricFrame(loc);
    const points = way.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
    const { along, total } = offsetFromWay(way, graph, loc);
    const at = pointAlong(points, along);
    const layout = laneLayout(way, graph);
    const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * (total ? along / total : 0);

    // the near side of that traffic, in the way's frame
    const leftHand = laneDriveSide(way, graph) === 'left';
    const wayLeft = leftHand === (travel === 'forward');
    const side = wayLeft ? 'left' : 'right';
    const verge = layout.roadside[side].reduce((sum, strip) => sum + strip.width, 0);
    const edge = (wayLeft ? layout.edges[0] : layout.edges[layout.edges.length - 1]) + shift;
    const across = edge + (wayLeft ? -1 : 1) * (verge + 0.8);
    const position = frame.toLoc(add(at.point, scale(rightNormal(at.direction), across)));

    // facing the traffic: against its direction of travel
    const heading = travel === 'forward' ? at.direction : scale(at.direction, -1);
    const facing = Math.round(((Math.atan2(-heading[0], -heading[1]) * 180 / Math.PI) + 360) % 360);

    // a surveillance camera's bearing is camera:direction (the key iD's preset edits)
    const directionKey = choice === 'camera:red_light' ? 'camera:direction' : 'direction';
    const node = new osmNode({ loc: position, tags: { ...signTags(choice, way.tags.maxspeed), [directionKey]: String(facing) } });
    if (choice !== 'camera:red_light') {
        return { action: (g: coreGraph) => g.replace(node), nodeID: node.id };
    }
    // a red light camera belongs to an enforcement relation, as its device
    const relation = new osmRelation({
        tags: { type: 'enforcement', enforcement: 'traffic_signals' },
        members: [{ id: node.id, type: 'node', role: 'device' }]
    });
    return { action: (g: coreGraph) => g.replace(node).replace(relation), nodeID: node.id };
}
