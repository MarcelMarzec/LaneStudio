import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { metricFrame, sub, dot, len, rightNormal, unit, cumulativeLengths } from './frame';

export interface WayOffset {
    /** signed distance from the way's centre line in metres, right of travel positive */
    offset: number;
    /** distance along the way to the nearest point, in metres */
    along: number;
    /** the way's length in metres */
    total: number;
}

/** Where a point lies relative to a way: how far to its side, and how far along it */
export function offsetFromWay(way: osmWay, graph: coreGraph, loc: Vec2): WayOffset {
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = way.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
    const cumulative = cumulativeLengths(points);
    const p = frame.toMetres(loc);

    let best = { distance: Infinity, offset: 0, along: 0 };
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const seg = sub(points[i], a);
        const l = len(seg);
        if (l === 0) continue;
        const t = Math.max(0, Math.min(l, dot(sub(p, a), unit(seg))));
        const foot: Vec2 = [a[0] + unit(seg)[0] * t, a[1] + unit(seg)[1] * t];
        const distance = len(sub(p, foot));
        if (distance < best.distance) {
            best = { distance, offset: dot(sub(p, foot), rightNormal(unit(seg))), along: cumulative[i - 1] + t };
        }
    }
    return { offset: best.offset, along: best.along, total: cumulative[cumulative.length - 1] };
}
