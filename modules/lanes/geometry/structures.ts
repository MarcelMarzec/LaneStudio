import type { Vec2 } from '../../geo/vector';
import { add, metricFrame, pointAlong, polylineLength, rightNormal, scale } from './frame';

/*
 * Structures a road or path is built on or in, drawn along its outer edges: bridge parapets, tunnel
 * walls, the slopes of cuttings and embankments, and the water of a ford.
 * (wiki: Key:bridge, Key:tunnel, Key:covered, Key:cutting, Key:embankment, Key:ford)
 */

export type StructureKind = 'parapet' | 'tunnel' | 'slope' | 'ford';

export interface StructureShape {
    key: string;
    wayID: string;
    kind: StructureKind;
    /** for slopes: which way the ground falls */
    variant?: 'cutting' | 'embankment';
    points: Vec2[];
    closed: boolean;
}

type Sides = { left: boolean; right: boolean };

const no = (value: string | undefined) => !value || value === 'no';

/** Which sides of a way a `cutting=*` or `embankment=*` value covers (left and right along the way) */
export function slopeSides(value: string | undefined): Sides | null {
    if (no(value)) return null;
    if (value === 'left') return { left: true, right: false };
    if (value === 'right') return { left: false, right: true };
    return { left: true, right: true };   // yes, both, dyke…
}

export const isBridge = (tags: Tags) => !no(tags.bridge);
/** In a tunnel or under a roof: drawn faded, as it is out of sight from above */
export const isCovered = (tags: Tags) => !no(tags.tunnel) || tags.covered === 'yes';
export const isFord = (tags: Tags) => !no(tags.ford);

// slope marks: a wedge every `spacing` metres, `depth` metres down the slope
const spacing = 2.5;
const depth = 2;
const base = 0.9;

/** Wedges along `edge` (lon/lat, along the way), on the side `outward` points to (1 right, -1 left), pointing downhill */
function slopeMarks(edge: Vec2[], outward: 1 | -1, variant: 'cutting' | 'embankment'): Vec2[][] {
    if (edge.length < 2) return [];
    const frame = metricFrame(edge[0]);
    const line = edge.map(frame.toMetres);
    const length = polylineLength(line);
    const marks: Vec2[][] = [];
    for (let s = spacing / 2; s < length - 0.5; s += spacing) {
        const at = pointAlong(line, s);
        const out = scale(rightNormal(at.direction), outward);
        const along = scale(at.direction, base / 2);
        // an embankment falls away from the road; a cutting falls towards it from the ground outside
        const top = variant === 'embankment' ? at.point : add(at.point, scale(out, depth));
        const foot = variant === 'embankment' ? add(at.point, scale(out, depth)) : at.point;
        marks.push([add(top, along), foot, add(top, scale(along, -1))].map(frame.toLoc));
    }
    return marks;
}

/**
 * The structures along one stretch of road or path, from its tags and its outer edges (lon/lat, both
 * running along the way: `left` is the left edge looking along the way). `surface` is the stretch's
 * outline, for a ford.
 */
export function edgeStructures(key: string, wayID: string, tags: Tags, left: Vec2[], right: Vec2[], surface: Vec2[]): StructureShape[] {
    const out: StructureShape[] = [];
    if (isBridge(tags)) {
        out.push({ key: `${key}-parapet-l`, wayID, kind: 'parapet', points: left, closed: false });
        out.push({ key: `${key}-parapet-r`, wayID, kind: 'parapet', points: right, closed: false });
    }
    if (isCovered(tags)) {
        out.push({ key: `${key}-tunnel-l`, wayID, kind: 'tunnel', points: left, closed: false });
        out.push({ key: `${key}-tunnel-r`, wayID, kind: 'tunnel', points: right, closed: false });
    }
    for (const variant of ['cutting', 'embankment'] as const) {
        const sides = slopeSides(tags[variant]);
        if (!sides) continue;
        const marks = [
            ...(sides.left ? slopeMarks(left, -1, variant) : []),
            ...(sides.right ? slopeMarks(right, 1, variant) : [])
        ];
        marks.forEach((points, i) => out.push({ key: `${key}-${variant}-${i}`, wayID, kind: 'slope', variant, points, closed: true }));
    }
    if (isFord(tags)) out.push({ key: `${key}-ford`, wayID, kind: 'ford', points: surface, closed: true });
    return out;
}

/** Splits a ring made of two edges (`[...a, ...b.reverse()]`, as strips and paths are built) back into them */
export function ringEdges(ring: Vec2[]): [Vec2[], Vec2[]] {
    const n = Math.floor(ring.length / 2);
    return [ring.slice(0, n), ring.slice(n).reverse()];
}
