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


// a few hundred places at most are looked up while drawing; their answers are kept by rounded location
const ukCache = new Map<string, boolean>();

/**
 * Whether a place marks its roads as the UK does (Great Britain, Northern Ireland, the Isle of Man and the Channel
 * Islands): zig-zags and Belisha beacons at crossings, studs across signal crossings, yellow bus stop boxes
 */
export function ukMarkings(loc: [number, number]): boolean {
    const key = `${loc[0].toFixed(2)},${loc[1].toFixed(2)}`;
    let answer = ukCache.get(key);
    if (answer === undefined) {
        answer = ['GB', 'IM', 'JE', 'GG'].includes(countryCoder.iso1A2Code(loc) ?? '');
        if (ukCache.size > 2000) ukCache.clear();
        ukCache.set(key, answer);
    }
    return answer;
}
