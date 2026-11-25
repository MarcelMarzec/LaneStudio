import type { Vec2 } from '../../geo/vector';
import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { futureFeature, hasRoadworks, isBuildingUnderConstruction, isConstructionSite } from '../core/lifecycle';
import { add, cumulativeLengths, dot, len, metricFrame, offsetPolyline, pointAlong, rightNormal, scale, slicePolyline, sub, unit } from './frame';
import type { RoadPiece } from './road_geometry';
import { multipolygonRings } from './street';

/*
 * Building work (wiki: Key:construction): construction sites (`landuse=construction`) behind their fence, buildings
 * going up (`building=construction`) in scaffolding, other features being built (`construction:amenity=parking`…)
 * striped as works, and roadworks on a road that stays open (`construction=minor`) as cones along its kerbs.
 * Roads, paths and railways being built are drawn as what they will be (see roads.ts and railway.ts).
 * All output is in lon/lat, ready to project.
 */

export type WorksKind = 'site' | 'building' | 'area' | 'cone';

export interface WorksShape {
    key: string;
    id: string;
    kind: WorksKind;
    points: Vec2[];
    /** a multipolygon's other rings (inner rings leave holes) */
    rings?: Vec2[][];
}

/** Cones along roadworks: one every few metres, set in from the kerb */
const coneSpacing = 6;
const coneInset = 0.5;
const coneRadius = 0.35;

function ringOf(entity: OsmEntity, graph: coreGraph): { outer: Vec2[]; rings?: Vec2[][] } | undefined {
    if (entity.type === 'way') {
        const way = entity as osmWay;
        if (!way.isClosed() || way.nodes.length < 4) return undefined;
        const outer = way.nodes.map(id => (graph.hasEntity(id) as osmNode | undefined)?.loc as Vec2 | undefined).filter((p): p is Vec2 => !!p);
        return outer.length > 3 ? { outer } : undefined;
    }
    if (entity.type === 'relation') return multipolygonRings(entity, graph);
    return undefined;
}

/** What kind of works an area is, if any */
export function worksKind(tags: Tags): Exclude<WorksKind, 'cone'> | null {
    if (isConstructionSite(tags)) return 'site';
    if (isBuildingUnderConstruction(tags)) return 'building';
    if (futureFeature(tags)) return 'area';
    return null;
}

/** A cone at `p` (metres): a small square turned to face along the road, read as a cone from above at any zoom */
function cone(p: Vec2, along: Vec2): Vec2[] {
    const a = scale(along, coneRadius);
    const n = scale(rightNormal(along), coneRadius);
    return [add(p, a), add(p, n), sub(p, a), sub(p, n)];
}

/** Cones along both kerbs of a road piece with roadworks, set in from the kerb */
function roadworksCones(piece: RoadPiece): WorksShape[] {
    const kerbs = [piece.boundaries[0], piece.boundaries[piece.boundaries.length - 1]];
    const out: WorksShape[] = [];
    kerbs.forEach((kerb, side) => {
        if (!kerb || kerb.length < 2) return;
        const frame = metricFrame(kerb[0]);
        const points = kerb.map(frame.toMetres);
        const total = cumulativeLengths(points)[points.length - 1];
        // (inward: the left kerb's cones to its right, the right kerb's to its left)
        const inward = side === 0 ? 1 : -1;
        for (let s = coneSpacing / 2, k = 0; s < total; s += coneSpacing, k++) {
            const { point, direction } = pointAlong(points, s);
            const at = add(point, scale(rightNormal(unit(direction)), inward * coneInset));
            out.push({ key: `${piece.wayID}-${piece.index}-cone-${side}-${k}`, id: piece.wayID, kind: 'cone', points: cone(at, unit(direction)).map(frame.toLoc) });
        }
    });
    return out;
}

/** Building work in view: sites, scaffolding and works areas, and cones along the road pieces with roadworks */
export function worksGeometry(entities: OsmEntity[], graph: coreGraph, pieces: RoadPiece[]): WorksShape[] {
    const out: WorksShape[] = [];
    for (const entity of entities) {
        const kind = worksKind(entity.tags);
        if (!kind) continue;
        const ring = ringOf(entity, graph);
        if (ring) out.push({ key: entity.id, id: entity.id, kind, points: ring.outer, ...(ring.rings?.length ? { rings: ring.rings } : {}) });
    }
    for (const piece of pieces) {
        const way = graph.hasEntity(piece.wayID);
        if (way && hasRoadworks(way.tags)) out.push(...roadworksCones(piece));
    }
    return out;
}

/**
 * The stretch of a road being built that lies inside a junction box at `nodeID` (from the node to where the road's own
 * drawing starts, pulled back from the junction), at the road's width: striped as works where the junction also
 * holds a road in use, so it is drawn as a junction of that road (as w1563755167 off Fulney Lane North, Spalding)
 */
export function stretchIntoJunction(piece: RoadPiece, nodeID: string, graph: coreGraph): Vec2[] | null {
    const way = graph.hasEntity(piece.wayID) as osmWay | undefined;
    if (!way) return null;
    const locs = way.nodes.map(id => (graph.hasEntity(id) as osmNode | undefined)?.loc as Vec2 | undefined);
    if (locs.some(p => !p)) return null;
    const frame = metricFrame(locs[0]!);
    const points = (locs as Vec2[]).map(frame.toMetres);
    const lengths = cumulativeLengths(points);
    const atStart = piece.fromNode === nodeID;
    const index = atStart ? way.nodes.indexOf(nodeID as osmNode['id'], 0) : way.nodes.lastIndexOf(nodeID as osmNode['id']);
    if (index < 0) return null;
    // where the piece starts: the middle of its end between its kerbs, as a distance along the way
    const kerbs = [piece.boundaries[0], piece.boundaries[piece.boundaries.length - 1]];
    if (!kerbs[0]?.length || !kerbs[1]?.length) return null;
    const end = (line: Vec2[]) => frame.toMetres(atStart ? line[0] : line[line.length - 1]);
    const middle = scale(add(end(kerbs[0]), end(kerbs[1])), 0.5);
    let best = { distance: Infinity, s: lengths[index] };
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const ab = sub(points[i], a);
        const l = len(ab);
        if (l === 0) continue;
        const t = Math.max(0, Math.min(1, dot(sub(middle, a), ab) / (l * l)));
        const d = len(sub(middle, add(a, scale(ab, t))));
        if (d < best.distance) best = { distance: d, s: lengths[i - 1] + t * l };
    }
    const [from, to] = [Math.min(lengths[index], best.s), Math.max(lengths[index], best.s)];
    if (to - from < 0.5) return null;
    const line = slicePolyline(points, from, to);
    const half = piece.layout.total / 2;
    const left = offsetPolyline(line, line.map(() => -half));
    const right = offsetPolyline(line, line.map(() => half));
    return [...left, ...right.reverse()].map(frame.toLoc);
}
