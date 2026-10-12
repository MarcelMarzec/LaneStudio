import type { Vec2 } from '../../geo/vector';

// metres per degree of latitude on the WGS84 sphere iD uses for its geometry
const metresPerDegree = 6378137 * Math.PI / 180;

/**
 * A local flat frame in metres around `origin` (x east, y north), accurate to well under 1%
 * across a few kilometres: enough to lay out lanes along one road in real metres.
 */
export interface MetricFrame {
    toMetres(loc: Vec2): Vec2;
    toLoc(p: Vec2): Vec2;
}

export function metricFrame(origin: Vec2): MetricFrame {
    const [lon0, lat0] = origin;
    const kx = metresPerDegree * Math.cos(lat0 * Math.PI / 180);
    const ky = metresPerDegree;
    return {
        toMetres: ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky],
        toLoc: ([x, y]) => [lon0 + x / kx, lat0 + y / ky]
    };
}


/* Small vector helpers in metres */

export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const len = (a: Vec2) => Math.hypot(a[0], a[1]);
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const unit = (a: Vec2): Vec2 => {
    const l = len(a);
    return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
};
/** the normal pointing to the right of direction `d` (x east, y north) */
export const rightNormal = (d: Vec2): Vec2 => [d[1], -d[0]];


export function polylineLength(points: Vec2[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) total += len(sub(points[i], points[i - 1]));
    return total;
}

/** The point at distance `s` along a polyline, and the direction of travel there */
export function pointAlong(points: Vec2[], s: number): { point: Vec2; direction: Vec2 } {
    let remaining = Math.max(0, s);
    for (let i = 1; i < points.length; i++) {
        const seg = sub(points[i], points[i - 1]);
        const l = len(seg);
        if (remaining <= l || i === points.length - 1) {
            const t = l > 0 ? Math.min(1, remaining / l) : 0;
            return { point: add(points[i - 1], scale(seg, t)), direction: unit(seg) };
        }
        remaining -= l;
    }
    return { point: points[0], direction: [0, 1] };
}

/** Cuts a polyline down to the part between distances `from` and `to` */
export function slicePolyline(points: Vec2[], from: number, to: number): Vec2[] {
    const result: Vec2[] = [pointAlong(points, from).point];
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
        walked += len(sub(points[i], points[i - 1]));
        if (walked > from && walked < to) result.push(points[i]);
    }
    result.push(pointAlong(points, to).point);
    return result;
}

/**
 * Offsets a polyline sideways by a distance per vertex (positive = right of travel).
 * Corners use mitre joins capped at twice the offset, so sharp bends do not spike.
 */
export function offsetPolyline(points: Vec2[], distances: number[]): Vec2[] {
    const n = points.length;
    const result: Vec2[] = [];
    for (let i = 0; i < n; i++) {
        const before = i > 0 ? unit(sub(points[i], points[i - 1])) : null;
        const after = i < n - 1 ? unit(sub(points[i + 1], points[i])) : null;
        const n1 = rightNormal(before ?? after!);
        const n2 = rightNormal(after ?? before!);
        const mitre = unit(add(n1, n2));
        const cos = dot(mitre, n1);
        const d = distances[i];
        const k = cos > 0.5 ? d / cos : 2 * d;
        result.push(add(points[i], scale(len(mitre) > 0 ? mitre : n1, k)));
    }
    return result;
}

/** Distances from the start of a polyline to each vertex */
export function cumulativeLengths(points: Vec2[]): number[] {
    const result = [0];
    for (let i = 1; i < points.length; i++) result.push(result[i - 1] + len(sub(points[i], points[i - 1])));
    return result;
}


/** Whether a point lies inside a polygon (ring of points, closed or not), in any planar coordinates */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
