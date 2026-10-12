import type { NodeId } from '../../osm';
import type { osmWay } from '../../osm/way';
import type { LaneDirection } from '../model';

// connection curves through junctions are drawn by road_geometry's junctionConnections

/** The direction lanes travel towards a junction node (`approach`) or away from it, if any */
export function laneDirectionAt(way: osmWay, nodeID: NodeId, approach: boolean): LaneDirection | null {
    const atEnd = way.last() === nodeID;
    const atStart = way.first() === nodeID;
    if (!atEnd && !atStart) return null;
    // arriving at the last node, or leaving the first node, is travelling forward
    return (approach ? atEnd : atStart) ? 'forward' : 'backward';
}
