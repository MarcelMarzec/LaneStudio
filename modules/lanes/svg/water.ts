import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { WaterArea, WaterChannel, WaterGeometry } from '../geometry/water';
import { joinPaths, pathFor } from './street';

type Group = d3.Selection<SVGGElement>;

/** An area's or channel's classes: its kind, whether it dries up, and its feature's id (to light up with it) */
const areaClass = (area: WaterArea) => `water-area water-${area.kind} ${area.id}` + (area.intermittent ? ' water-intermittent' : '') +
    (area.natural ? ' lanes-natural' : ' lanes-landuse');
const channelClass = (channel: WaterChannel) => `water-channel water-${channel.kind} ${channel.id}` +
    (channel.intermittent ? ' water-intermittent' : '') + (channel.covered ? ' lanes-covered' : '');

/**
 * Water under everything else: areas and watercourses drawn solid and faded as one layer (so a river running into
 * its own area is one even colour), their banks, and weirs, dams, gates and white water over them
 */
export function drawWater(group: (name: string) => Group, water: WaterGeometry, projection: Projection) {
    const path = pathFor(projection);
    const rings = (outer: Vec2[], others: Vec2[][] = []) => [outer, ...others].map(ring => path(ring, true)).join('');
    joinPaths(group('water'), [
        ...water.areas.map(area => ({ key: area.id, cls: areaClass(area), d: rings(area.polygon, area.rings) })),
        ...water.channels.map(channel => ({ key: channel.key, cls: channelClass(channel), d: path(channel.polygon, true) }))
    ], d => d.key, d => d.cls, d => d.d);
    joinPaths(group('water-banks'), [
        ...water.channels.map(channel => ({ key: channel.key, cls: `water-bank ${channel.id}` + (channel.intermittent ? ' water-intermittent' : '') +
            (channel.covered ? ' lanes-covered' : ''), d: channel.banks.map(bank => path(bank, false)).join('') })),
        ...water.areas.map(area => ({ key: area.id, cls: `water-bank water-area-edge ${area.id}` + (area.intermittent ? ' water-intermittent' : '') +
            (area.natural ? ' lanes-natural' : ' lanes-landuse'), d: rings(area.polygon, area.rings) }))
    ], d => d.key, d => d.cls, d => d.d);
    joinPaths(group('water-features'), water.features, d => d.key, d => `water-feature water-${d.kind} ${d.id}`, d => path(d.points, d.closed));
}

/** The ways and nodes drawn here, so iD's own drawing of them can be hidden (Hide iD's lines and points under lanes) */
export function drawnWater(water: WaterGeometry): { ways: string[]; nodes: string[] } {
    const ids = [...water.channels.map(c => c.id), ...water.inAreas, ...water.areas.map(a => a.id), ...water.features.map(f => f.id)];
    return { ways: ids.filter(id => !id.startsWith('n')), nodes: ids.filter(id => id.startsWith('n')) };
}
