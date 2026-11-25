import { difference, intersection, union } from 'polyclip-ts';

import type { Vec2 } from '../../geo/vector';
import { add, metricFrame, rightNormal, scale, sub, unit } from './frame';

/*
 * A junction's road surface shared out among the roads meeting there, for colouring each part by its own road (the Speed
 * Limit tool: where a 30 mph road meets a 40 mph roundabout, the box is 30 where the 30 road runs into it and 40 on the
 * ring, rather than all one road's colour). All in lon/lat.
 */

export interface JunctionRoad<T> {
    /** the road's line (its way's nodes) */
    line: Vec2[];
    /** half its carriageway's width, metres */
    halfWidth: number;
    value: T;
}

export interface JunctionShare<T> {
    value: T;
    /** polygons, each its outer ring and any holes */
    polygons: Vec2[][][];
}

type Ring = [number, number][];

/** A ring of `n` points round `p` (metres), radius `r` */
function disc(p: Vec2, r: number, n = 8): Ring {
    return Array.from({ length: n + 1 }, (_, i) => {
        const a = (i % n) * 2 * Math.PI / n;
        return [Math.round((p[0] + r * Math.cos(a)) * 100) / 100, Math.round((p[1] + r * Math.sin(a)) * 100) / 100] as [number, number];
    });
}

/** The strip `half` metres either side of a line (metres), over the stretch within `box` (metres: min x, min y, max x, max y) */
function corridor(points: Vec2[], half: number, box: [number, number, number, number]): Ring[][] {
    const [x0, y0, x1, y1] = [box[0] - half, box[1] - half, box[2] + half, box[3] + half];
    const near = (a: Vec2, b: Vec2) => Math.max(a[0], b[0]) >= x0 && Math.min(a[0], b[0]) <= x1 &&
        Math.max(a[1], b[1]) >= y0 && Math.min(a[1], b[1]) <= y1;
    const parts: Ring[][] = [];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (!near(a, b)) continue;
        const d = sub(b, a);
        if (Math.hypot(d[0], d[1]) < 1e-6) continue;
        const n = scale(rightNormal(unit(d)), half);
        const quad = [add(a, n), add(b, n), sub(b, n), sub(a, n), add(a, n)].map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]) as Ring;
        parts.push([quad]);
        // (round the bends, so a curving road's strip has no notches)
        if (i < points.length - 1) parts.push([disc(b, half)]);
    }
    return parts;
}

/** How far past its kerbs a road reaches for the corners between roads, metres, nearest first */
const reaches = [0, 2, 5, 10, 20];

/**
 * The junction's polygons shared out among `roads`, in order of priority (the main road first): each road takes the
 * part its own carriageway runs through, a road before it winning where two cross; the corners between roads then go
 * to the nearest road (the main road where it's as near), and anything further to the main road. Parts of the same
 * value come out as one. Null if the polygons can't be cut, to draw the box whole.
 */
export function shareJunction<T>(polygons: Vec2[][], roads: JunctionRoad<T>[]): JunctionShare<T>[] | null {
    if (!roads.length || !polygons.length) return null;
    const frame = metricFrame(polygons[0][0]);
    // (to the centimetre: the clipping fails on near-coincident edges otherwise)
    const cm = (p: Vec2) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100] as [number, number];
    const toRing = (ring: Vec2[]) => ring.map(p => cm(frame.toMetres(p)));
    const fromShape = (shape: Ring[][]) => shape.map(polygon => polygon.map(ring => ring.map(p => frame.toLoc(p as Vec2))));
    try {
        const box = polygons.map(polygon => [toRing(polygon)]);
        const all = box.flat(2);
        const bounds: [number, number, number, number] = [Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])),
            Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1]))];
        let left: Ring[][] = union(box[0], ...box.slice(1));
        const shares = new Map<T, Ring[][][]>();
        const lines = roads.map(road => road.line.map(frame.toMetres));
        for (const reach of reaches) {
            for (let i = 0; i < roads.length && left.length; i++) {
                const strip = corridor(lines[i], roads[i].halfWidth + reach, bounds);
                if (!strip.length) continue;
                try {
                    const taken = intersection(left, union(strip[0], ...strip.slice(1)));
                    if (!taken.length) continue;
                    const rest = difference(left, taken);
                    shares.set(roads[i].value, [...(shares.get(roads[i].value) ?? []), taken]);
                    left = rest;
                } catch {
                    // (a strip that can't be cut is skipped: the box's part there goes to a road after it)
                }
            }
        }
        if (left.length) shares.set(roads[0].value, [...(shares.get(roads[0].value) ?? []), left]);
        const out: JunctionShare<T>[] = [];
        for (const [value, parts] of shares) {
            const shape = union(parts[0], ...parts.slice(1));
            if (shape.length) out.push({ value, polygons: fromShape(shape) });
        }
        return out;
    } catch {
        return null;
    }
}
