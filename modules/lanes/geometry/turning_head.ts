import { difference, union } from 'polyclip-ts';

import type { Vec2 } from '../../geo/vector';
import { add, len, pointInPolygon, rightNormal, scale, sub, unit, offsetPolyline } from './frame';
import { parseWidth } from './layout';

/*
 * Turning heads at the end of a road (`highway=turning_circle`, `highway=turning_loop`), in the
 * shape `turning_circle=*` gives: circle (the default), oval, square, hammer, or knuckle (a bulge
 * on the outside of a bend). The head flares out of the road's kerbs, so road and head read as one
 * surface, and only the part the road does not already cover is drawn.
 * All positions are metres in the node's frame.
 */

/** A road leaving the turning node */
export interface HeadArm {
    /** unit direction the road leaves the node in */
    direction: Vec2;
    /** carriageway edges across the road, relative to `direction` (right positive) */
    left: number;
    right: number;
    /** width of the pavement beside the road, carried round the head (0 for none) */
    pavement?: number;
}

/** How far from the node an arm's kerbs and lane lines stop, where the head takes over */
export interface HeadTrim {
    left: number;
    right: number;
    lanes: number;
    /** how far the road itself is pulled back: at a dead end the head covers the road's last metres */
    road: number;
}

export interface TurningHeadShape {
    /** the head's surface beyond the roads, as rings to fill even-odd */
    polygons: Vec2[][];
    /** its kerb, running on from one road kerb round to the next */
    kerbs: Vec2[][];
    /** the road's pavement carried on round the kerb */
    pavements: Vec2[][];
    /** the island in the middle of a turning loop */
    island?: Vec2[];
    /** per arm, in `arms` order */
    trims: HeadTrim[];
}

export const turningHeadShapes = ['circle', 'oval', 'square', 'hammer', 'knuckle'] as const;
export type TurningHeadKind = typeof turningHeadShapes[number];

/** The head's shape from its tags; unknown values are drawn as a circle */
export function turningHeadKind(tags: Tags): TurningHeadKind {
    const value = tags.turning_circle;
    return (turningHeadShapes as readonly string[]).includes(value ?? '') ? value as TurningHeadKind : 'circle';
}

/** Points round an ellipse centred on `centre`, with semi-axes `a` along `u` and `b` along `v` */
function ellipse(centre: Vec2, u: Vec2, v: Vec2, a: number, b: number, segments = 40): Vec2[] {
    const points: Vec2[] = [];
    for (let i = 0; i < segments; i++) {
        const t = i / segments * 2 * Math.PI;
        points.push(add(centre, add(scale(u, a * Math.cos(t)), scale(v, b * Math.sin(t)))));
    }
    return points;
}

/** A rectangle from `u0` to `u1` along `u` and `v0` to `v1` along `v`, from `origin`, its corners rounded by `r` */
function roundedRect(origin: Vec2, u: Vec2, v: Vec2, u0: number, u1: number, v0: number, v1: number, r: number): Vec2[] {
    const points: Vec2[] = [];
    const corners: [number, number, number][] = [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]];
    for (const [cu, cv, start] of corners) {
        for (let k = 0; k <= 6; k++) {
            const t = (start + k * 15) * Math.PI / 180;
            points.push(add(origin, add(scale(u, cu + r * Math.cos(t)), scale(v, cv + r * Math.sin(t)))));
        }
    }
    return points;
}

/** The convex hull of a set of points, counter-clockwise */
export function hull(points: Vec2[]): Vec2[] {
    const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower: Vec2[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    const upper: Vec2[] = [];
    for (const p of sorted.reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const closed = (ring: Vec2[]): [number, number][] => [...ring, ring[0]].map(p => [p[0], p[1]]);
const open = (ring: [number, number][]): Vec2[] => ring.slice(0, -1).map(p => [p[0], p[1]]);

/**
 * The turning head at a node whose roads leave in `arms` (one for a dead end, two where the node is
 * on a bend or between two ways), sized by `diameter=*` or the road's width.
 */
export function turningHead(tags: Tags, arms: HeadArm[]): TurningHeadShape | null {
    if (!arms.length || arms.length > 2) return null;
    const kind = turningHeadKind(tags);
    const widest = Math.max(...arms.map(a => a.right - a.left));
    const half = widest / 2;
    const R = Math.max(half + 1.5, (parseWidth(tags.diameter) ?? Math.max(12, 2 * widest)) / 2);

    // the shape, and how far its flares run back along the road
    let shape: Vec2[];
    let island: Vec2[] | undefined;
    let flare = Math.max(2, Math.min(6, R * 0.6));
    const first = arms[0];
    const n = rightNormal(first.direction);
    const centreLine = scale(n, (first.left + first.right) / 2);

    // a knuckle only stands out on the outside of its bend
    let outside: Vec2 | null = null;
    if (arms.length === 2 && kind === 'knuckle') {
        // a bulge on the outside of the bend, its inner edge on the inner kerb
        const sum = add(arms[0].direction, arms[1].direction);
        const outward = len(sum) > 0.2 ? scale(unit(sum), -1) : n;
        outside = outward;
        shape = ellipse(scale(outward, R - half), outward, rightNormal(outward), R, R);
    } else if (arms.length === 2) {
        shape = ellipse(centreLine, first.direction, n, R, R);
    } else {
        // the head lies beyond the end of the road: `ahead` points away from the road
        const ahead = scale(first.direction, -1);
        if (kind === 'oval') {
            const across = Math.max(half + 1.5, R * 0.75);
            const along = R * 1.3;
            shape = ellipse(add(centreLine, scale(ahead, along - across)), ahead, n, along, across);
        } else if (kind === 'square') {
            const size = R * 0.9;
            shape = roundedRect(centreLine, ahead, n, -size * 0.6, size * 1.4, -size, size, Math.min(2, size * 0.25));
        } else if (kind === 'hammer') {
            // a T: a bar across the end of the road
            const reach = Math.max(R, half + 6);
            const depth = Math.max(5.5, widest * 0.9);
            shape = roundedRect(centreLine, ahead, n, -depth * 0.35, depth * 0.65, -reach, reach, 0.8);
            flare = 2.5;
        } else {
            shape = ellipse(centreLine, ahead, n, R, R);
        }
        if (tags.highway === 'turning_loop') {
            const inner = (parseWidth(tags.inner_diameter) ?? R) / 2;
            island = ellipse(add(centreLine, scale(ahead, kind === 'oval' ? R * 0.3 : 0)), ahead, n, inner, inner, 32);
        }
    }

    // each road's kerbs flare out to the head from a little before the head reaches them
    const inside = (p: Vec2) => pointInPolygon(p, shape);
    const flares: Vec2[][] = [];
    const bands: Vec2[][] = [];
    // the roads, a touch wider and longer, to tell the kerb from the edges the head shares with a road
    const kerbBands: Vec2[][] = [];
    const trims: HeadTrim[] = arms.map(arm => {
        const normal = rightNormal(arm.direction);
        const at = (s: number, across: number) => add(scale(arm.direction, s), scale(normal, across));
        const reach = (across: number, outward: number) => {
            // a knuckle's inner side is the road's own corner
            if (outside && (normal[0] * outside[0] + normal[1] * outside[1]) * outward < 0) return null;
            // the head must stand out beyond this kerb near the node
            if (!inside(at(0, across + outward * 0.3)) && !inside(at(0.5, across + outward * 0.3))) return null;
            let s = 0;
            while (s < 3 * R && inside(at(s + 0.2, across))) s += 0.2;
            return s;
        };
        const leftReach = reach(arm.left, -1);
        const rightReach = reach(arm.right, 1);
        const trimLeft = leftReach === null ? 0 : leftReach + flare;
        const trimRight = rightReach === null ? 0 : rightReach + flare;
        if (kind === 'hammer' && arms.length === 1) {
            // small fillets into the bar's inside corners
            for (const [across, outward, s] of [[arm.left, -1, leftReach], [arm.right, 1, rightReach]] as const) {
                if (s === null) continue;
                flares.push([at(s + flare, across), at(s, across), at(s, across + outward * flare)]);
            }
        } else {
            const points = [...shape];
            if (leftReach !== null) points.push(at(trimLeft, arm.left));
            if (rightReach !== null) points.push(at(trimRight, arm.right));
            // one side only: anchor the flare on the centre line, so it does not reach the other kerb
            if ((leftReach === null) !== (rightReach === null)) points.push(at(Math.max(trimLeft, trimRight), (arm.left + arm.right) / 2));
            if (points.length > shape.length) flares.push(hull(points));
        }
        const far = Math.max(trimLeft, trimRight, R) + 30;
        if (arms.length === 1) {
            // a dead end stops where the head starts, and the head covers the rest of it
            const road = Math.min(trimLeft || Infinity, trimRight || Infinity, far - 30);
            flares.push([at(0, arm.left), at(road, arm.left), at(road, arm.right), at(0, arm.right)]);
            bands.push([at(road, arm.left), at(far, arm.left), at(far, arm.right), at(road, arm.right)]);
            kerbBands.push([at(road - 0.1, arm.left - 0.01), at(far, arm.left - 0.01), at(far, arm.right + 0.01), at(road - 0.1, arm.right + 0.01)]);
            return { left: trimLeft, right: trimRight, lanes: road, road };
        }
        return { left: trimLeft, right: trimRight, lanes: 0, road: 0 };
    });
    if (arms.length === 2) {
        // the road through the node, joined on the bisector of the bend as its pieces are
        const far = (arm: HeadArm) => scale(arm.direction, 3 * R + 30);
        const line = [far(arms[1]), [0, 0] as Vec2, far(arms[0])];
        const [a, b] = arms;
        const left = offsetPolyline(line, [-b.right, a.left, a.left]);
        const right = offsetPolyline(line, [-b.left, a.right, a.right]);
        bands.push([...left, ...right.reverse()]);
        kerbBands.push(bands[bands.length - 1]);
    }

    const whole = union([closed(shape)], ...flares.map(f => [closed(f)]));
    const surface = difference(whole, ...bands.map(b => [closed(b)]));
    const polygons = surface.flatMap(poly => poly.map(open));

    // the kerb: the head's outline where it is not inside a road
    const kerbs: Vec2[][] = [];
    const inRoad = (p: Vec2) => kerbBands.some(band => pointInPolygon(p, band));
    for (const poly of whole) {
        const ring = open(poly[0]);
        const outside = ring.map((p, i) => !inRoad(midpoint(p, ring[(i + 1) % ring.length])));
        // start the walk where a run outside the roads begins, so each kerb comes out in one piece
        let startAt = outside.findIndex((out, i) => out && !outside[(i - 1 + ring.length) % ring.length]);
        if (startAt < 0) startAt = outside.indexOf(true);
        if (startAt < 0) continue;
        let current: Vec2[] = [];
        for (let k = 0; k < ring.length; k++) {
            const i = (startAt + k) % ring.length;
            if (!outside[i]) {
                if (current.length > 1) kerbs.push(current);
                current = [];
                continue;
            }
            if (!current.length) current.push(ring[i]);
            current.push(ring[(i + 1) % ring.length]);
        }
        if (current.length > 1) kerbs.push(current);
    }

    // the pavement follows the kerb round, outside it
    const pavement = Math.max(0, ...arms.map(a => a.pavement ?? 0));
    const pavements: Vec2[][] = [];
    if (pavement > 0) {
        // the outline is walked counter-clockwise, so outside is on the right of each kerb
        const outward = whole.length && signedArea(open(whole[0][0])) < 0 ? -1 : 1;
        // where a kerb meets a road's kerb, a short lead-in along the road squares the pavement's
        // end off, so it meets the road's own pavement
        const leadIn = (p: Vec2): Vec2 | null => {
            for (const arm of arms) {
                const normal = rightNormal(arm.direction);
                for (const across of [arm.left, arm.right]) {
                    const along = p[0] * arm.direction[0] + p[1] * arm.direction[1];
                    const off = p[0] * normal[0] + p[1] * normal[1];
                    if (along > 0.01 && Math.abs(off - across) < 0.05) return add(p, scale(arm.direction, 0.05));
                }
            }
            return null;
        };
        for (const kerb of kerbs) {
            const before = leadIn(kerb[0]);
            const after = leadIn(kerb[kerb.length - 1]);
            const line = [...(before ? [before] : []), ...kerb, ...(after ? [after] : [])];
            const outer = offsetPolyline(line, line.map(() => outward * pavement));
            pavements.push([...line, ...outer.reverse()]);
        }
    }

    return { polygons, kerbs, pavements, island, trims };
}

function signedArea(ring: Vec2[]): number {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    return area / 2;
}

const midpoint = (a: Vec2, b: Vec2): Vec2 => scale(add(a, b), 0.5);

// exported for tests
export const _test = { hull, sub };
