import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { add, dot, len, metricFrame, scale, sub } from './frame';

/** What a parking space is for, by `parking_space=*`: each kind has its own colour */
export type ParkingSpaceKind = 'normal' | 'disabled' | 'charging' | 'parent' | 'motorcycle' | 'other';

export interface ParkingSpaceShape {
    id: string;
    kind: ParkingSpaceKind;
    polygon: Vec2[];
    /** the painted lines round the bay: every side but the one it is driven into from */
    lines: Vec2[][];
    /** where the bay's symbol goes (the middle, towards the back) */
    middle: Vec2;
}

/** A car park's surface (`amenity=parking` mapped as an area, at ground level) */
export interface CarParkShape {
    id: string;
    polygon: Vec2[];
}

const spaceKinds: Record<string, ParkingSpaceKind> = {
    disabled: 'disabled', charging: 'charging', parent: 'parent', parent_child: 'parent', mother_child: 'parent',
    motorcycle: 'motorcycle', normal: 'normal', standard: 'normal'
};

/** The kind of parking space by its tags */
export function parkingSpaceKind(tags: Tags): ParkingSpaceKind {
    const value = tags.parking_space;
    if (!value) return tags.capacity_disabled === 'yes' || tags['capacity:disabled'] === 'yes' ? 'disabled' : 'normal';
    return spaceKinds[value] ?? 'other';
}

const ringOf = (way: osmWay, graph: coreGraph): Vec2[] => way.nodes.slice(0, -1).map(id => (graph.entity(id) as osmNode).loc as Vec2);

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab))));
    return len(sub(p, add(a, scale(ab, t))));
}

/**
 * Parking spaces mapped as areas of their own (`amenity=parking_space`), with the lines painted round them, and car
 * parks' surfaces (`amenity=parking`, `parking=surface`). A bay's open side is the one nearest the road or aisle
 * it is driven into from (within 6 m); a bay with no road near has lines all round.
 */
export function parkingSpaceGeometry(entities: OsmEntity[], graph: coreGraph): { spaces: ParkingSpaceShape[]; carParks: CarParkShape[] } {
    const spaces: ParkingSpaceShape[] = [];
    const carParks: CarParkShape[] = [];
    const roads = entities.filter(e => e.type === 'way' && !!e.tags.highway && !(e as osmWay).isClosed()) as osmWay[];
    for (const entity of entities) {
        if (entity.type !== 'way' || !(entity as osmWay).isClosed()) continue;
        const way = entity as osmWay;
        const amenity = way.tags.amenity;
        if (amenity === 'parking' && (!way.tags.parking || way.tags.parking === 'surface')) {
            carParks.push({ id: way.id, polygon: ringOf(way, graph) });
            continue;
        }
        if (amenity !== 'parking_space') continue;
        const ring = ringOf(way, graph);
        if (ring.length < 3) continue;
        const frame = metricFrame(ring[0]);
        const points = ring.map(frame.toMetres);
        // the roads near the bay, in its frame
        const near = roads.map(road => road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc as Vec2)))
            .filter(line => line.some(p => len(p) < 40));
        const edgeDistance = (i: number) => {
            const middle = scale(add(points[i], points[(i + 1) % points.length]), 0.5);
            return Math.min(Infinity, ...near.map(line => Math.min(...line.slice(1).map((q, k) => segmentDistance(middle, line[k], q)))));
        };
        const distances = points.map((_, i) => edgeDistance(i));
        const nearest = distances.indexOf(Math.min(...distances));
        const open = distances[nearest] < 6 ? nearest : -1;
        const lines = points.flatMap((p, i) => (i === open ? [] : [[p, points[(i + 1) % points.length]].map(frame.toLoc)]));
        const centre = scale(points.reduce((sum, p) => add(sum, p), [0, 0] as Vec2), 1 / points.length);
        // the symbol sits towards the back of the bay, away from its open side
        let middle = centre;
        if (open >= 0) {
            const mouth = scale(add(points[open], points[(open + 1) % points.length]), 0.5);
            middle = add(centre, scale(sub(centre, mouth), 0.25));
        }
        spaces.push({ id: way.id, kind: parkingSpaceKind(way.tags), polygon: ring, lines, middle: frame.toLoc(middle) });
    }
    return { spaces, carParks };
}
