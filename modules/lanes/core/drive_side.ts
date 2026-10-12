import * as countryCoder from '@rapideditor/country-coder';

import type { coreGraph } from '../../core/graph';
import type { osmWay } from '../../osm/way';
import type { DriveSide } from '../model';

/** The side traffic keeps to where the way is, from the middle node; right-hand traffic if unknown */
export function laneDriveSide(way: osmWay, graph: coreGraph): DriveSide {
    const nodeID = way.nodes[Math.floor(way.nodes.length / 2)];
    const node = nodeID && graph.hasEntity(nodeID);
    if (!node) return 'right';
    return countryCoder.driveSide(node.loc) === 'left' ? 'left' : 'right';
}
