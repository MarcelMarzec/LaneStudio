import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { TrackShape } from '../geometry/railway';
import { attrChanged, joinPaths, pathFor, pxPerMetre } from './street';

type Group = d3.Selection<SVGGElement>;

/** A track's classes: its kind, status, and its way's id (so it lights up with the way when hovered or selected) */
const trackClass = (track: TrackShape, part: string) =>
    `rail-${part} rail-${track.kind} rail-${track.status} ${track.id}` +
    (track.covered ? ' lanes-covered' : '') + (track.status === 'construction' ? ' lanes-construction' : '');

/**
 * Railways, Underground and tram lines: ballast, sleepers and rails under the roads (a road crossing a railway
 * covers it), and the rails of tram lines set in the road over the road's lanes.
 */
export function drawRailways(group: (name: string) => Group, tracks: TrackShape[], projection: Projection) {
    const path = pathFor(projection);
    const many = (lines: Vec2[][], closed: boolean) => lines.map(line => path(line, closed)).join('');
    // rails are drawn at the width of their foot (150 mm), never thinner than a hairline
    const ppm = pxPerMetre(projection, tracks[0]?.rails[0]?.[0]);
    const railWidth = Math.min(4, Math.max(1, 0.15 * ppm)).toFixed(2);

    joinPaths(group('rail-beds'), tracks.filter(t => t.bed), t => t.id, t => trackClass(t, 'bed'), t => path(t.bed!, true));
    joinPaths(group('rail-sleepers'), tracks.filter(t => t.sleepers.length), t => t.id, t => trackClass(t, 'sleepers'), t => many(t.sleepers, true));

    for (const [name, list] of [['rails', tracks.filter(t => !t.embedded)], ['tram-rails', tracks.filter(t => t.embedded)]] as const) {
        const shapes = list.flatMap(t => [
            { key: t.id, cls: trackClass(t, 'rails'), d: many(t.rails, false) },
            ...(t.conductors.length ? [{ key: `${t.id}-conductor`, cls: trackClass(t, 'conductor'), d: many(t.conductors, false) }] : [])
        ]);
        joinPaths(group(name), shapes, s => s.key, s => s.cls, s => s.d);
        group(name).selectAll('path').each(attrChanged('stroke-width', railWidth));
    }
}

