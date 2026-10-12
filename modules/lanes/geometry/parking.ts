import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { isStreetParking, parkingOnCarriageway } from '../model/street_features';
import { metricFrame, sub, add, scale, dot, len, unit, rightNormal, pointAlong, cumulativeLengths } from './frame';
import { cachedLayout } from './road_geometry';

/*
 * Street parking mapped as areas (`amenity=parking` with `parking=street_side|lane|layby…`):
 * the area drawn as road surface with its bays, and, where it sits beside the road, a layby
 * joining it to the road's kerb.
 */

// a parking area further than this from the kerb is not joined to the road, in metres
const maxGap = 8;

export interface ParkingShape {
    id: string;
    polygon: Vec2[];
    /** the area between the parking and the road's kerb, if it does not touch the road */
    connector: Vec2[] | null;
    /** lines between bays, from `capacity=*` */
    bays: Vec2[][];
    /** the road it belongs to */
    roadID: string | null;
}

interface Projected {
    /** distance along the road */
    along: number;
    /** signed distance from the road's centre line, right positive */
    offset: number;
}

function project(road: Vec2[], cumulative: number[], p: Vec2): Projected & { distance: number } {
    let best = { distance: Infinity, along: 0, offset: 0 };
    for (let i = 1; i < road.length; i++) {
        const a = road[i - 1];
        const seg = sub(road[i], a);
        const l = len(seg);
        if (l === 0) continue;
        const d = unit(seg);
        const t = Math.max(0, Math.min(l, dot(sub(p, a), d)));
        const foot = add(a, scale(d, t));
        const distance = len(sub(p, foot));
        if (distance < best.distance) best = { distance, along: cumulative[i - 1] + t, offset: dot(sub(p, foot), rightNormal(d)) };
    }
    return best;
}

/** The point `offset` metres to the right of the road, `along` metres along it */
function roadPoint(road: Vec2[], along: number, offset: number): Vec2 {
    const at = pointAlong(road, along);
    return add(at.point, scale(rightNormal(at.direction), offset));
}

/** The longest run of consecutive (cyclic) indexes where `test` holds */
function longestRun(n: number, test: (i: number) => boolean): number[] {
    let best: number[] = [];
    for (let start = 0; start < n; start++) {
        if (!test(start) || test((start - 1 + n) % n)) continue;   // runs start after a failing point
        const run: number[] = [];
        for (let k = 0; k < n && test((start + k) % n); k++) run.push((start + k) % n);
        if (run.length > best.length) best = run;
    }
    if (!best.length && Array.from({ length: n }, (_, i) => i).every(test)) best = Array.from({ length: n }, (_, i) => i);
    return best;
}

const cache = new WeakMap<osmWay, { deps: OsmEntity[]; shape: ParkingShape }>();

function parkingShape(area: osmWay, roads: osmWay[], graph: coreGraph): ParkingShape {
    const frame = metricFrame((graph.entity(area.first()) as osmNode).loc);
    const ring = area.nodes.slice(0, -1).map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
    const shape: ParkingShape = { id: area.id, polygon: ring.map(frame.toLoc), connector: null, bays: [], roadID: null };
    if (ring.length < 3) return shape;

    // the nearest road, and which side of it the parking is on; offsets are measured away from the road
    let best: { road: osmWay; points: Vec2[]; projected: Projected[]; side: number; kerb: number; gap: number } | null = null;
    for (const road of roads) {
        const points = road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
        const cumulative = cumulativeLengths(points);
        const raw = ring.map(p => project(points, cumulative, p));
        const side = Math.sign(raw.reduce((sum, p) => sum + p.offset, 0)) || 1;
        // the parking must be on one side, not across the road
        if (raw.some(p => Math.sign(p.offset) === -side && Math.abs(p.offset) > 1)) continue;
        const layout = cachedLayout(road, graph);
        const shift = (layout.shiftStart + layout.shiftEnd) / 2;
        const kerb = side > 0 ? layout.edges[layout.edges.length - 1] + shift : -(layout.edges[0] + shift);
        const projected = raw.map(p => ({ along: p.along, offset: p.offset * side }));
        const gap = Math.min(...projected.map(p => p.offset - kerb));
        if (gap > maxGap || gap < -kerb - 1) continue;
        if (!best || gap < best.gap) best = { road, points, projected, side, kerb, gap };
    }
    if (!best) return shape;
    shape.roadID = best.road.id;
    const { points, projected, side, kerb, gap } = best;

    // the edge of the parking facing the road
    const depth = Math.max(...projected.map(p => p.offset)) - Math.min(...projected.map(p => p.offset));
    const tolerance = Math.min(2.5, depth * 0.4);
    const near = longestRun(ring.length, i => projected[i].offset - kerb <= gap + tolerance);

    if (!parkingOnCarriageway(area.tags) && gap > 0.2 && near.length >= 2) {
        const outer = near.map(i => ring[i]);
        const inner = near.map(i => roadPoint(points, projected[i].along, side * kerb)).reverse();
        shape.connector = [...outer, ...inner].map(frame.toLoc);
    }

    // bays across the parking, spread evenly along the road
    const capacity = parseInt(area.tags.capacity ?? '', 10);
    if (capacity >= 2 && capacity <= 200 && near.length >= 2) {
        const alongs = near.map(i => projected[i].along);
        const from = Math.min(...alongs);
        const to = Math.max(...alongs);
        const inside = Math.min(...projected.map(p => p.offset));
        const outside = Math.max(...projected.map(p => p.offset));
        for (let k = 1; k < capacity; k++) {
            const along = from + (to - from) * k / capacity;
            shape.bays.push([roadPoint(points, along, side * inside), roadPoint(points, along, side * outside)].map(frame.toLoc));
        }
    }
    return shape;
}

/** Street parking areas among `entities`, joined to the lane roads near them */
export function parkingGeometry(entities: OsmEntity[], graph: coreGraph): ParkingShape[] {
    const roads = entities.filter(isLaneRoad) as osmWay[];
    const result: ParkingShape[] = [];
    for (const entity of entities) {
        if (entity.type !== 'way' || !isStreetParking(entity.tags)) continue;
        const area = entity as osmWay;
        if (!area.isClosed() || area.nodes.length < 4) continue;
        const extent = area.extent(graph).padByMeters(maxGap + 20);
        const near = roads.filter(road => extent.intersects(road.extent(graph)));
        const deps: OsmEntity[] = [area, ...area.nodes.map(id => graph.entity(id)),
            ...near.flatMap(road => [road, ...road.nodes.map(id => graph.entity(id))])];
        const cached = cache.get(area);
        if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
            result.push(cached.shape);
            continue;
        }
        const shape = parkingShape(area, near, graph);
        cache.set(area, { deps, shape });
        result.push(shape);
    }
    return result;
}
