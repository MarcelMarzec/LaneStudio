import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { NodeId, OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { asBuilt, builtHighway, isLaneRoad, isUnderConstruction, laneRoadHighways } from '../core/roads';
import {
    metricFrame, sub, add, scale, unit, dot, len, rightNormal, pointAlong,
    offsetPolyline, cumulativeLengths, polylineLength, type MetricFrame
} from './frame';
import { parseWidth, type LaneLayout } from './layout';
import { roadMaxspeed, speedTypeOf } from '../model/speed_limits';
import { cachedLayout, edgesAt, visualShift, miniRoundaboutRadius, type WayVisual } from './road_geometry';
import { isFord } from './structures';
import { isTrafficIsland, islandSurface, surfaceGroup, type SurfaceGroup } from '../model/street_features';

/*
 * Everything on and beside the road that is not a lane: footways and paths at their real width,
 * mapped areas (pavements, traffic islands, `area:highway=*`), mapped kerbs, and markings on road
 * nodes (crossings, stop and give-way lines, traffic signals, traffic calming, mini-roundabouts).
 * All output is in lon/lat, ready to project.
 */

/** Paths drawn at true width, with their default width in metres */
export const pathWidths: Record<string, number> = {
    footway: 2, path: 1.5, cycleway: 2, steps: 2, pedestrian: 4, bridleway: 2.5, corridor: 2
};

export type PathKind = 'sidewalk' | 'crossing' | 'footway' | 'path' | 'cycleway' | 'steps' | 'pedestrian' | 'bridleway';
/** How a crossing is painted (wiki: Key:crossing:markings) */
export type CrossingMarkings = 'zebra' | 'zebra_double' | 'zebra_paired' | 'zebra_bicolour' | 'lines' | 'lines_paired' | 'ladder'
    | 'ladder_skewed' | 'ladder_paired' | 'dashes' | 'dots' | 'surface' | 'pictograms' | 'none';

/** One painted mark of a crossing: a bar or patch (closed), or a line, and how it is drawn */
export interface CrossingMark {
    points: Vec2[];
    closed: boolean;
    /** the CSS class: `marking-zebra_bar`, `marking-crossing_line`… with its variant */
    cls: string;
}

/**
 * The marks of a crossing, laid out in its own terms: `t` along the way people walk (0 to `length`), `u` across it
 * (±`width`/2). Bars of a zebra run with the traffic, half a metre wide every metre; lines run along the edges.
 */
export function crossingMarks(markings: CrossingMarkings, length: number, width: number): { points: [number, number][]; closed: boolean; cls: string }[] {
    const out: { points: [number, number][]; closed: boolean; cls: string }[] = [];
    const h = width / 2;
    const bar = (t: number, w: number, u0 = -h, u1 = h, cls = 'marking marking-zebra_bar') =>
        out.push({ points: [[t, u0], [t + w, u0], [t + w, u1], [t, u1]], closed: true, cls });
    const line = (u: number, cls = 'marking marking-crossing_line') => out.push({ points: [[0, u], [length, u]], closed: false, cls });
    const bars = (u0 = -h, u1 = h, step = 1, w = 0.5) => {
        let k = 0;
        for (let t = 0.25; t + w <= length; t += step, k++) bar(t, w, u0, u1, 'marking marking-zebra_bar' + (markings === 'zebra_bicolour' && k % 2 ? ' alt' : ''));
    };
    switch (markings) {
        case 'zebra':
        case 'zebra_bicolour':
            bars();
            break;
        case 'zebra_double':
            // two zebras side by side, a gap down the middle
            bars(-h, -0.15);
            bars(0.15, h);
            break;
        case 'zebra_paired':
            for (let t = 0.25; t + 0.6 <= length; t += 1.4) {
                bar(t, 0.25);
                bar(t + 0.4, 0.25);
            }
            break;
        case 'lines':
            line(-h);
            line(h);
            break;
        case 'lines_paired':
            for (const u of [-h, -h + 0.3, h - 0.3, h]) line(u);
            break;
        case 'ladder':
            line(-h);
            line(h);
            bars(-h, h, 1, 0.4);
            break;
        case 'ladder_paired':
            for (const u of [-h, -h + 0.3, h - 0.3, h]) line(u);
            bars(-h + 0.3, h - 0.3, 1, 0.4);
            break;
        case 'ladder_skewed':
            line(-h);
            line(h);
            for (let t = 0.25; t + 0.9 <= length; t += 1) {
                out.push({ points: [[t, -h], [t + 0.4, -h], [t + 0.9, h], [t + 0.5, h]], closed: true, cls: 'marking marking-zebra_bar' });
            }
            break;
        case 'dashes':
            line(-h, 'marking marking-crossing_line dashes');
            line(h, 'marking marking-crossing_line dashes');
            break;
        case 'dots':
            line(-h, 'marking marking-crossing_line dots');
            line(h, 'marking marking-crossing_line dots');
            break;
        case 'surface':
            out.push({ points: [[0, -h], [length, -h], [length, h], [0, h]], closed: true, cls: 'marking marking-crossing_surface' });
            break;
        case 'pictograms':
            // a symbol painted every few metres down the middle
            for (let t = 1; t + 0.8 <= length; t += 3) {
                out.push({ points: [[t, 0], [t + 0.4, -0.4], [t + 0.8, 0], [t + 0.4, 0.4]], closed: true, cls: 'marking marking-crossing_pictogram' });
            }
            break;
    }
    return out;
}

export interface PathShape {
    id: string;
    kind: PathKind;
    polygon: Vec2[];
    assumed: boolean;
    /** what the path is surfaced with, when tagged */
    surface?: SurfaceGroup;
    /** foot and cycle traffic: `segregated` paths are split down the middle, `shared` ones are mixed */
    use?: 'segregated' | 'shared';
    /** the line between the foot and cycle halves of a segregated path */
    divider?: Vec2[];
    /** the foot half of a segregated path (the rest is the cycle half) */
    footHalf?: Vec2[];
    /** crossing paths only */
    markings?: CrossingMarkings;
    /** a crossing's painted marks (see crossingMarks) */
    marks: CrossingMark[];
    /** being built (`highway=construction`) */
    construction?: boolean;
    /** in a tunnel or below ground (`layer` < 0) */
    below?: boolean;
    /** on a bridge or above ground (`layer` > 0): drawn over the roads, where other paths are drawn under them */
    above?: boolean;
}

/**
 * What a mapped area is drawn as (wiki: Key:area:highway, Proposal:Street area): a traffic island, a pavement or other
 * footway area, a cycleway, a road's carriageway (a stretch of road, a junction, a turning circle or loop, a passing
 * place, an escape lane), something else beside the road (a verge), or, painted over the road inside its area, white
 * hatching (`emergency`, `prohibited`), a bus or taxi area (`bus`, `bus_stop`, `taxi_stop`), a hard shoulder
 * (`shoulder`), or a crossing (a zebra, or a cycle crossing)
 */
export type AreaKind = 'island' | 'pavement' | 'cycleway' | 'carriageway' | 'other' | 'hatched' | 'bus' | 'shoulder' | 'crossing' | 'cycle_crossing';

/** The kinds of area painted over the road, above its lanes, rather than lying under them */
export const paintedAreaKinds = new Set<AreaKind>(['hatched', 'bus', 'shoulder', 'crossing', 'cycle_crossing']);

export interface AreaShape {
    id: string;
    kind: AreaKind;
    polygon: Vec2[];
    /** what the area is covered with (always set for traffic islands, which default to concrete) */
    surface?: SurfaceGroup;
    /** a zebra crossing's white bars, across the way people walk, or hatching's (clipped to the area when drawn) */
    stripes?: Vec2[][];
}

export interface KerbLine {
    id: string;
    /** `kerb=*`: raised, lowered, flush, rolled… */
    kerb: string;
    line: Vec2[];
}

export type MarkingKind =
    | 'crossing' | 'zebra_bar' | 'crossing_line' | 'crossing_surface' | 'crossing_pictogram' | 'island'
    | 'stop_line' | 'give_way_line' | 'signal_line'
    | 'calming' | 'mini_roundabout' | 'kerb_node' | 'ford'
    | 'mini_roundabout_surface' | 'passing_place_surface' | 'turning_loop_island'
    | 'barrier_line' | 'barrier_post' | 'barrier_node' | 'cattle_grid';

export interface MarkingShape {
    key: string;
    kind: MarkingKind;
    /** a closed polygon, or an open line for `*_line` kinds */
    points: Vec2[];
    closed: boolean;
    nodeID: string;
    variant?: string;
}

export type SymbolKind = 'stop_text' | 'give_way_triangle' | 'signals' | 'speed_limit' | 'min_speed' | 'national_limit' | 'motorway_start';

export interface SymbolShape {
    key: string;
    kind: SymbolKind;
    loc: Vec2;
    /** a point 1 m further along the direction the symbol faces (travel direction) */
    ahead: Vec2;
    /** metres the symbol should span */
    size: number;
    /** painted text, for speed limits */
    text?: string;
}

/** A barrier mapped as a line (fence, wall, guard rail, hedge…), drawn at its width */
export interface BarrierLine {
    id: string;
    kind: string;
    line: Vec2[];
    /** metres */
    width: number;
}

export interface StreetGeometry {
    paths: PathShape[];
    areas: AreaShape[];
    kerbs: KerbLine[];
    /** road surfaces round mini-roundabout nodes (turning heads are drawn with their roads) */
    surfaces: MarkingShape[];
    markings: MarkingShape[];
    symbols: SymbolShape[];
    barriers: BarrierLine[];
}

/** Default widths of barriers mapped as lines, in metres */
export const barrierWidths: Record<string, number> = {
    wall: 0.3, retaining_wall: 0.4, city_wall: 1.5, fence: 0.1, guard_rail: 0.3, jersey_barrier: 0.6,
    hedge: 1, handrail: 0.08, cable_barrier: 0.1, railing: 0.1, wire_fence: 0.1, chain: 0.05, ditch: 1
};

// barriers on a road node drawn as a line across it, or as a row of posts
const lineBarriers = new Set(['gate', 'swing_gate', 'sliding_gate', 'lift_gate', 'chain', 'rope', 'bar', 'hampshire_gate',
    'border_control', 'toll_booth', 'height_restrictor', 'spikes', 'debris', 'log', 'kissing_gate', 'cycle_barrier',
    'turnstile', 'full-height_turnstile', 'stile', 'motorcycle_barrier', 'entrance', 'barrier_board']);
const postBarriers: Record<string, { spacing: number; size: number }> = {
    bollard: { spacing: 1.5, size: 0.35 }, block: { spacing: 2, size: 0.8 }, planter: { spacing: 2.2, size: 1 },
    jersey_barrier: { spacing: 1.3, size: 0.6 }, sump_buster: { spacing: 2.5, size: 0.4 }, bus_trap: { spacing: 2.5, size: 0.5 }
};

const circle = (centre: Vec2, r: number, steps = 32): Vec2[] => Array.from({ length: steps }, (_, a) =>
    [centre[0] + r * Math.cos(a * 2 * Math.PI / steps), centre[1] + r * Math.sin(a * 2 * Math.PI / steps)] as Vec2);


/* ---------- crossings ---------- */

/** How a crossing is painted, from `crossing:markings` or the older `crossing=*` values */
export function crossingMarkings(tags: Tags): CrossingMarkings {
    const markings = tags['crossing:markings'];
    if (markings) {
        const known: Record<string, CrossingMarkings> = {
            no: 'none', zebra: 'zebra', 'zebra:double': 'zebra_double', 'zebra:paired': 'zebra_paired', 'zebra:bicolour': 'zebra_bicolour',
            lines: 'lines', 'lines:paired': 'lines_paired', ladder: 'ladder', 'ladder:skewed': 'ladder_skewed',
            'ladder:paired': 'ladder_paired', dashes: 'dashes', dots: 'dots', surface: 'surface', pictograms: 'pictograms'
        };
        return known[markings] ?? 'zebra';   // yes, and anything else painted
    }
    const crossing = tags.crossing;
    if (crossing === 'zebra' || crossing === 'marked' || tags.crossing_ref === 'zebra') return 'zebra';
    if (crossing === 'unmarked' || crossing === 'no' || crossing === 'informal') return 'none';
    if (crossing === 'traffic_signals') return 'lines';
    if (crossing === 'uncontrolled') return 'zebra';
    return 'none';
}

const isCrossingPath = (tags: Tags) =>
    tags.footway === 'crossing' || tags.cycleway === 'crossing' || tags.path === 'crossing';


function pathKind(tags: Tags): PathKind {
    if (isCrossingPath(tags)) return 'crossing';
    if (tags.footway === 'sidewalk' || tags.path === 'sidewalk') return 'sidewalk';
    if (tags.highway === 'cycleway') return 'cycleway';
    if (tags.highway === 'path' && tags.bicycle === 'designated' && tags.foot !== 'designated') return 'cycleway';
    return (['steps', 'pedestrian', 'bridleway', 'path'].includes(tags.highway ?? '') ? tags.highway : 'footway') as PathKind;
}


function locs(way: osmWay, graph: coreGraph): Vec2[] {
    return way.nodes.map(id => (graph.entity(id) as osmNode).loc);
}


/* ---------- footways and paths ---------- */

const pathCache = new WeakMap<osmWay, { nodes: OsmEntity[]; stretch: [number, number]; ends: string; shape: PathShape }>();

/** Whether a path stops at a node with no other road or path joining it there: its end is drawn rounded */
function freeEnd(way: osmWay, nodeID: string, graph: coreGraph): boolean {
    if (way.isClosed()) return false;
    return (graph.parentWays(graph.entity(nodeID as NodeId)) as osmWay[]).filter(w => !!w.tags.highway).length === 1;
}

/** A half circle round `end` of radius `r`, from the path's left edge round its end to its right (`outward` the way on) */
function endArc(end: Vec2, outward: Vec2, r: number): Vec2[] {
    const n = rightNormal(outward);
    return Array.from({ length: 9 }, (_, k) => {
        const a = (k / 8) * Math.PI;
        return add(end, add(scale(n, -r * Math.cos(a)), scale(outward, r * Math.sin(a))));
    }).slice(1, -1);
}

export function isTrueWidthPath(entity: OsmEntity): boolean {
    if (entity.type !== 'way') return false;
    const way = entity as osmWay;
    return (builtHighway(way.tags) ?? '') in pathWidths && !way.isArea() && way.nodes.length > 1;
}

/**
 * How far a crossing path must reach past its own ends to still cover the road it crosses where
 * that road is drawn shifted sideways: [extra at the start, extra at the end], in metres.
 */
function crossingStretch(way: osmWay, graph: coreGraph, points: Vec2[], frame: MetricFrame, visuals?: Map<string, WayVisual>): [number, number] {
    if (!visuals?.size || points.length < 2) return [0, 0];
    const dir = unit(sub(points[points.length - 1], points[0]));
    let atStart = 0;
    let atEnd = 0;
    for (const id of way.nodes) {
        const node = graph.entity(id) as osmNode;
        for (const road of graph.parentWays(node)) {
            const visual = visuals.get(road.id);
            if (!visual || !isLaneRoad(road)) continue;
            const roadWay = road as osmWay;
            const i = roadWay.nodes.indexOf(id);
            const roadPoints = locs(roadWay, graph).map(frame.toMetres);
            const cumulative = cumulativeLengths(roadPoints);
            const shift = visualShift(visual, cumulative[i], cumulative[cumulative.length - 1]);
            const ahead = roadPoints[Math.min(roadPoints.length - 1, i + 1)];
            const behind = roadPoints[Math.max(0, i - 1)];
            const along = dot(scale(rightNormal(unit(sub(ahead, behind))), shift), dir);
            if (along > 0) atEnd = Math.max(atEnd, along);
            else atStart = Math.max(atStart, -along);
        }
    }
    return [atStart, atEnd];
}

function pathShape(way: osmWay, graph: coreGraph, visuals?: Map<string, WayVisual>): PathShape {
    const nodes = way.nodes.map(id => graph.entity(id));
    // a path under construction is drawn as the path it will be
    const tags = asBuilt(way.tags);
    const frame = metricFrame((nodes[0] as osmNode).loc);
    let points = locs(way, graph).map(frame.toMetres);
    const stretch: [number, number] = isCrossingPath(tags) ? crossingStretch(way, graph, points, frame, visuals) : [0, 0];
    // a free end (nothing joining) is drawn rounded, a crossing's never (it meets the road)
    const ends = isCrossingPath(tags) ? '' : `${freeEnd(way, way.first(), graph)},${freeEnd(way, way.last(), graph)}`;
    const cached = pathCache.get(way);
    if (cached && cached.nodes.every((n, i) => n === nodes[i]) && cached.nodes.length === nodes.length &&
        cached.stretch[0] === stretch[0] && cached.stretch[1] === stretch[1] && cached.ends === ends) return cached.shape;

    if (stretch[0] || stretch[1]) {
        const first = unit(sub(points[1], points[0]));
        const last = unit(sub(points[points.length - 1], points[points.length - 2]));
        points = [sub(points[0], scale(first, stretch[0])), ...points.slice(1, -1), add(points[points.length - 1], scale(last, stretch[1]))];
    }
    const tagged = parseWidth(tags.width) ?? parseWidth(tags.est_width);
    const width = tagged ?? pathWidths[tags.highway!];
    const left = offsetPolyline(points, points.map(() => -width / 2));
    const right = offsetPolyline(points, points.map(() => width / 2));
    const kind = pathKind(tags);

    const marks: CrossingMark[] = [];
    let markings: CrossingMarkings | undefined;
    if (kind === 'crossing') {
        markings = crossingMarkings(tags);
        const length = polylineLength(points);
        // laid out along the path (t) and across it (u)
        const place = ([t, u]: [number, number]) => {
            const at = pointAlong(points, Math.max(0, Math.min(length, t)));
            return frame.toLoc(add(at.point, scale(rightNormal(at.direction), u)));
        };
        for (const mark of crossingMarks(markings, length, width)) {
            // a line along the path follows its bends
            const points2 = !mark.closed && mark.points.length === 2
                ? Array.from({ length: Math.max(2, Math.ceil(length)) + 1 }, (_, k) => place([length * k / Math.max(2, Math.ceil(length)), mark.points[0][1]]))
                : mark.points.map(place);
            marks.push({ points: points2, closed: mark.closed, cls: mark.cls });
        }
    }

    // foot and cycle traffic together: split down the middle when segregated
    const foot = tags.foot === 'designated' || tags.highway === 'footway';
    const bike = tags.bicycle === 'designated' || tags.highway === 'cycleway';
    let use: PathShape['use'];
    let divider: Vec2[] | undefined;
    let footHalf: Vec2[] | undefined;
    if (foot && bike && kind !== 'crossing') {
        use = tags.segregated === 'yes' ? 'segregated' : 'shared';
        if (use === 'segregated') {
            // OSM does not say which side is which; the foot half is drawn on the left
            divider = points.map(frame.toLoc);
            footHalf = [...left, ...points.slice().reverse()].map(frame.toLoc);
        }
    }

    const shape: PathShape = {
        id: way.id, kind, assumed: tagged === undefined, markings, marks, construction: isUnderConstruction(way.tags),
        surface: surfaceGroup(tags.surface), use, divider, footHalf,
        below: (!!tags.tunnel && tags.tunnel !== 'no') || Number(tags.layer) < 0,
        above: (!!tags.bridge && tags.bridge !== 'no') || Number(tags.layer) > 0,
        polygon: [
            ...left,
            ...(ends.endsWith('true') && points.length > 1 ? endArc(points[points.length - 1], unit(sub(points[points.length - 1], points[points.length - 2])), width / 2) : []),
            ...right.reverse(),
            ...(ends.startsWith('true') && points.length > 1 ? endArc(points[0], unit(sub(points[0], points[1])), width / 2) : [])
        ].map(frame.toLoc)
    };
    pathCache.set(way, { nodes, stretch, ends, shape });
    return shape;
}


/* ---------- areas and kerbs ---------- */

function areaKind(tags: Tags): AreaKind | null {
    const value = tags['area:highway'];
    if (isTrafficIsland(tags)) return 'island';
    if (value) {
        if (value === 'footway' && tags.footway === 'crossing') return 'crossing';
        if (value === 'cycleway' && tags.cycleway === 'crossing') return 'cycle_crossing';
        if (['footway', 'pedestrian', 'path', 'steps', 'bridleway', 'corridor'].includes(value)) return 'pavement';
        if (value === 'cycleway') return 'cycleway';
        if (value === 'emergency' || value === 'prohibited') return 'hatched';
        if (value === 'bus' || value === 'bus_stop' || value === 'taxi_stop') return 'bus';
        if (value === 'shoulder') return 'shoulder';
        if (value === 'verge' || value === 'grass') return 'other';
        // a road's carriageway: a stretch of road, a junction (junction=yes), a turning circle, a bus bay…
        return 'carriageway';
    }
    // a road mapped as an area (area=yes + highway=service etc.) is the road's surface
    if (tags.area === 'yes' && laneRoadHighways.has(tags.highway ?? '')) return 'carriageway';
    if (tags.highway === 'pedestrian' && (tags.area === 'yes')) return 'pavement';
    if ((tags.highway === 'footway' || tags.highway === 'path') && tags.area === 'yes') return 'pavement';
    return null;
}


/**
 * An area's long axis: the direction its corners spread furthest along (their principal axis), and their middle
 * (the line between the two corners furthest apart would be a rectangle's diagonal)
 */
function longAxis(points: Vec2[]): { centre: Vec2; axis: Vec2; reach: number } {
    const ring = points.length > 1 && len(sub(points[0], points[points.length - 1])) < 1e-6 ? points.slice(0, -1) : points;
    const centre = scale(ring.reduce((sum, p) => add(sum, p), [0, 0] as Vec2), 1 / ring.length);
    let xx = 0, yy = 0, xy = 0;
    for (const p of ring) {
        const [x, y] = sub(p, centre);
        xx += x * x;
        yy += y * y;
        xy += x * y;
    }
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const axis: Vec2 = [Math.cos(angle), Math.sin(angle)];
    const reach = Math.max(...ring.map(p => len(sub(p, centre))));
    return { centre, axis, reach };
}

/**
 * A zebra crossing's bars across a crossing mapped as an area: half a metre wide and half a metre apart, along its
 * long axis (the way people walk over the road), as long as the area is wide (clipped to it when drawn)
 */
function zebraStripes(polygon: Vec2[]): Vec2[][] {
    const frame = metricFrame(polygon[0]);
    const points = polygon.map(frame.toMetres);
    const { centre, axis: walk, reach } = longAxis(points);
    const longest = reach * 2;
    const across = rightNormal(walk);
    const stripes: Vec2[][] = [];
    for (let t = -longest / 2; t < longest / 2; t += 1) {
        const a = add(centre, scale(walk, t));
        const b = add(a, scale(walk, 0.5));
        stripes.push([add(a, scale(across, longest)), add(b, scale(across, longest)), sub(b, scale(across, longest)), sub(a, scale(across, longest))]
            .map(frame.toLoc));
    }
    return stripes;
}

const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

/**
 * Hatching's white bars across an area (`area:highway=emergency`): 0.3 m wide every 1.5 m, running the way
 * `direction=*` gives (degrees or a compass point), else at 45° to the area's length (clipped to the area when drawn)
 */
function hatchStripes(polygon: Vec2[], direction: string | undefined): Vec2[][] {
    const frame = metricFrame(polygon[0]);
    const points = polygon.map(frame.toMetres);
    const shape = longAxis(points);
    const centre = shape.centre;
    const reach = shape.reach + 1;
    const tagged = direction === undefined ? NaN : cardinals[direction.toUpperCase()] ?? parseFloat(direction);
    let along: Vec2;
    if (Number.isFinite(tagged)) {
        const a = tagged * Math.PI / 180;
        along = [Math.sin(a), Math.cos(a)];
    } else {
        // the area's long axis, turned 45°
        along = unit(add(shape.axis, rightNormal(shape.axis)));
    }
    const across = rightNormal(along);
    const bars: Vec2[][] = [];
    for (let t = -reach; t < reach; t += 1.5) {
        const a = add(centre, scale(across, t));
        const b = add(a, scale(across, 0.3));
        bars.push([add(a, scale(along, reach)), add(b, scale(along, reach)), sub(b, scale(along, reach)), sub(a, scale(along, reach))].map(frame.toLoc));
    }
    return bars;
}

/** A mapped area that is a road's carriageway, which roads inside it are fitted to */
export function isCarriagewayArea(entity: OsmEntity): boolean {
    return entity.type === 'way' && (entity as osmWay).isClosed() && areaKind(entity.tags) === 'carriageway';
}


/* ---------- markings on road nodes ---------- */

interface CrossSection {
    frame: MetricFrame;
    /** travel direction of the way at the node, in metres around the node */
    direction: Vec2;
    normal: Vec2;
    /** carriageway lane boundaries at the node (right of the way positive), placement included */
    edges: number[];
    layout: LaneLayout;
    way: osmWay;
    nodeIndex: number;
}

/** The road's lanes across the road at one of its nodes */
function crossSection(way: osmWay, nodeIndex: number, graph: coreGraph, visuals?: Map<string, WayVisual>): CrossSection {
    const node = graph.entity(way.nodes[nodeIndex]) as osmNode;
    const frame = metricFrame(node.loc);
    const points = locs(way, graph).map(frame.toMetres);
    const before = points[Math.max(0, nodeIndex - 1)];
    const after = points[Math.min(points.length - 1, nodeIndex + 1)];
    const direction = unit(sub(after, before));
    const layout = cachedLayout(way, graph);
    const cumulative = cumulativeLengths(points);
    const total = cumulative[cumulative.length - 1];
    // the road as drawn: placement, and any drawing-only shift that lines it up or fits it to its area
    const visual = visuals?.get(way.id);
    const edges = visual
        ? edgesAt(layout, visual, cumulative[nodeIndex], total)
        : layout.edges.map(e => e + layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * (total ? cumulative[nodeIndex] / total : 0));
    return { frame, direction, normal: rightNormal(direction), layout, way, nodeIndex, edges };
}

/** A rectangle along the road from `a` to `b` metres (travel direction) and across from `left` to `right` */
function band(cs: CrossSection, a: number, b: number, left: number, right: number): Vec2[] {
    const p = (along: number, across: number) => add(scale(cs.direction, along), scale(cs.normal, across));
    return [p(a, left), p(b, left), p(b, right), p(a, right)].map(cs.frame.toLoc);
}

/**
 * Traffic calming on a road node, as built and marked on British roads (wiki: Key:traffic_calming), each value of a
 * `;` list, across the lanes `direction=forward|backward` says or all of them:
 * - a hump (and a dynamic bump): a band 3.7 m long with a white triangle on each lane's approach ramp
 * - a table: a flat top 6 m long in paving colour, triangles on both ramps; a painted table: paint alone
 * - a bump: a short band 0.9 m long; mini bumps: a row of small domes; a rumble strip: thin bars across the lanes
 * - cushions: a pad 1.8 m wide in the middle of each lane, with its triangle
 * - a dip (or a double dip): a dashed outline across the road
 * - a choker: the kerb built out into the road on both sides; a chicane: on alternate sides, one after the other
 * - an island: a small island in the middle of the road
 * - choked_table, choked_island: a choker with a table or an island; anything else: a hatched band
 */
function calmingShapes(node: osmNode, cs: CrossSection, out: StreetGeometry, left: number, right: number) {
    const tags = node.tags;
    const direction = tags.direction === 'forward' || tags.direction === 'backward' ? tags.direction : null;
    const range = direction ? approachRange(cs, direction) : null;
    const [from, to] = range ?? [left, right];
    const p = (along: number, across: number) => cs.frame.toLoc(add(scale(cs.direction, along), scale(cs.normal, across)));
    const push = (key: string, variant: string, points: Vec2[], closed = true) =>
        out.markings.push({ key: `${node.id}-calming-${key}`, kind: 'calming', nodeID: node.id, closed, variant, points });
    // a white triangle on each lane's approach ramp, pointing the way its traffic goes
    const teeth = (key: string, a: number, b: number, lanes = cs.layout.lanes.map((_, i) => i)) => lanes.forEach(i => {
        const lane = cs.layout.lanes[i];
        const [l, r] = [cs.edges[i], cs.edges[i + 1]];
        if (r <= from || l >= to || lane.ref.direction === 'both_ways') return;
        const forward = lane.ref.direction === 'forward';
        const edge = forward ? a : b;
        const tip = edge + (forward ? 1 : -1) * Math.min(0.9, (b - a) / 2);
        const mid = (l + r) / 2;
        push(`${key}-tooth-${i}`, 'tooth', [p(edge, mid - 0.5), p(tip, mid), p(edge, mid + 0.5)]);
    });
    const values = tags.traffic_calming.split(';').map(v => v.trim());
    const buildOut = (key: string, along: number, side: 'left' | 'right') => {
        const edge = side === 'left' ? left : right;
        const inward = side === 'left' ? 1 : -1;
        push(key, 'buildout', [p(along - 3, edge), p(along - 1.5, edge + inward * 1.5), p(along + 1.5, edge + inward * 1.5), p(along + 3, edge)]);
    };
    for (const value of values) {
        if (value === 'hump' || value === 'dynamic_bump' || value === 'speed_hump') {
            push(value, 'hump', band(cs, -1.85, 1.85, from, to));
            teeth(value, -1.85, 1.85);
        } else if (value === 'table' || value === 'choked_table') {
            push(value, 'table', band(cs, -3, 3, from, to));
            teeth(value, -3, 3);
        } else if (value === 'painted_table') {
            push(value, 'painted', band(cs, -3, 3, from, to));
        } else if (value === 'bump' || value === 'speed_bump') {
            push(value, 'bump', band(cs, -0.45, 0.45, from, to));
        } else if (value === 'mini_bumps') {
            for (let across = from + 0.6, k = 0; across < to - 0.3; across += 1.2, k++) {
                const c: Vec2 = add(scale(cs.normal, across), [0, 0]);
                push(`${value}-${k}`, 'dome', Array.from({ length: 10 }, (_, j) => cs.frame.toLoc(add(c, scale([Math.cos(j * Math.PI / 5), Math.sin(j * Math.PI / 5)], 0.35)))));
            }
        } else if (value === 'rumble_strip') {
            for (let k = 0; k < 6; k++) push(`${value}-${k}`, 'rumble', band(cs, -2 + k * 0.8, -1.85 + k * 0.8, from, to));
        } else if (value === 'cushion') {
            cs.layout.lanes.forEach((lane, i) => {
                const mid = (cs.edges[i] + cs.edges[i + 1]) / 2;
                if (mid <= from || mid >= to || lane.ref.direction === 'both_ways') return;
                push(`${value}-${i}`, 'cushion', band(cs, -1.5, 1.5, mid - 0.9, mid + 0.9));
            });
            teeth(value, -1.5, 1.5);
        } else if (value === 'dip' || value === 'double_dip') {
            push(value, 'dip', band(cs, -2, 2, from, to));
            if (value === 'double_dip') push(`${value}-2`, 'dip', band(cs, 3, 7, from, to));
        } else if (value === 'island') {
            const centre = (from + to) / 2;
            push(value, 'island', [p(-4, centre), p(-1.5, centre - 0.8), p(1.5, centre - 0.8), p(4, centre), p(1.5, centre + 0.8), p(-1.5, centre + 0.8)]);
        } else if (value === 'choker') {
            // (built out on the side the direction tag gives, or both)
            if (!direction || from <= left + 0.01) buildOut(`${value}-l`, 0, 'left');
            if (!direction || to >= right - 0.01) buildOut(`${value}-r`, 0, 'right');
        } else if (value === 'chicane') {
            buildOut(`${value}-l`, -5, 'left');
            buildOut(`${value}-r`, 5, 'right');
        } else if (value === 'choked_island') {
            const centre = (left + right) / 2;
            push(value, 'island', [p(-4, centre), p(-1.5, centre - 0.8), p(1.5, centre - 0.8), p(4, centre), p(1.5, centre + 0.8), p(-1.5, centre + 0.8)]);
        } else {
            push(value, 'band', band(cs, -1.5, 1.5, from, to));
        }
        if (value === 'choked_table' || value === 'choked_island') {
            buildOut(`${value}-l`, 0, 'left');
            buildOut(`${value}-r`, 0, 'right');
        }
    }
}

/** Lane boundary range of the lanes travelling in `direction`, or null if there are none */
function approachRange(cs: CrossSection, direction: 'forward' | 'backward'): [number, number] | null {
    const indexes = cs.layout.lanes.map((lane, i) => (lane.ref.direction === direction ? i : -1)).filter(i => i >= 0);
    if (!indexes.length) return null;
    return [cs.edges[Math.min(...indexes)], cs.edges[Math.max(...indexes) + 1]];
}

/**
 * Which way traffic approaches a stop line or sign at a node: the `direction` tag, the road's
 * oneway direction, or (for a sign near one end of a two-way road) towards that end.
 */
function approachDirections(tags: Tags, cs: CrossSection): ('forward' | 'backward')[] {
    const tagged = tags.direction ?? tags['traffic_signals:direction'] ?? tags['highway:direction'];
    if (tagged === 'forward' || tagged === 'backward') return [tagged];
    if (tagged === 'both' || tagged === 'all') return ['forward', 'backward'];
    const oneway = cs.layout.model.oneway;
    if (oneway) return [oneway];
    // signals for a crossing stop the traffic both ways
    if (tags.highway === 'traffic_signals' && tags.crossing && tags.crossing !== 'no') return ['forward', 'backward'];
    const n = cs.way.nodes.length;
    if (cs.nodeIndex === n - 1) return ['forward'];
    if (cs.nodeIndex === 0) return ['backward'];
    return cs.nodeIndex >= (n - 1) / 2 ? ['forward'] : ['backward'];
}


/** A node where people cross a road: tagged as a crossing, or where a crossing path meets it */
const isCrossingNode = (node: osmNode, graph: coreGraph) => node.tags.highway === 'crossing' ||
    (!!node.tags.crossing && node.tags.crossing !== 'no') || graph.parentWays(node).some(w => isCrossingPath(w.tags));

/**
 * Where a stop, give-way or signals' line for traffic travelling `direction` towards node `index` of a road stands,
 * in metres along the direction of travel from the node (negative: before it), given where it would be (`at`): a
 * line on a pedestrian crossing, or up to 10 m past one, stands just before the crossing instead, where traffic
 * waits (road_geometry's stopBefore puts the lane arrows to match)
 */
function lineBeforeCrossing(road: osmWay, index: number, graph: coreGraph, direction: 'forward' | 'backward', at: number): number {
    const frame = metricFrame((graph.entity(road.nodes[index]) as osmNode).loc);
    const cumulative = cumulativeLengths(road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc)));
    const sign = direction === 'forward' ? 1 : -1;
    const crossings = road.nodes.flatMap((id, n) => (isCrossingNode(graph.entity(id) as osmNode, graph) ? [sign * (cumulative[n] - cumulative[index])] : []))
        .sort((p, q) => q - p);
    let line = at;
    for (const c of crossings) {
        const past = line - c;
        if (past > -0.5 && past < 10) line = c - crossingClear;
    }
    return line;
}

// how far before the middle of a pedestrian crossing a line stands: half the crossing (1.5 m) and a metre clear
const crossingClear = 2.5;

/** A crossing mapped as a node on a road: its band, stripes or lines, island and signals */
function crossingNodeMarkings(node: osmNode, cs: CrossSection, out: StreetGeometry, signalCrossing: boolean) {
    const tags = node.tags;
    const left = cs.edges[0];
    const right = cs.edges[cs.edges.length - 1];
    const markings = crossingMarkings(tags);
    const half = 1.5;
    out.markings.push({ key: `${node.id}-crossing`, kind: 'crossing', nodeID: node.id, closed: true, variant: markings, points: band(cs, -half, half, left, right) });
    // walking across the road (t, from one kerb) within the crossing's width along the road (u)
    crossingMarks(markings, right - left, half * 2).forEach((mark, k) => {
        const kind = (/marking-(\w+)/.exec(mark.cls)?.[1] ?? 'zebra_bar') as MarkingKind;
        const variant = mark.cls.split(' ').slice(2).join(' ') || undefined;
        out.markings.push({
            key: `${node.id}-mark-${k}`, kind, nodeID: node.id, closed: mark.closed, variant,
            points: mark.points.map(([t, u]) => cs.frame.toLoc(add(scale(cs.normal, left + t), scale(cs.direction, u))))
        });
    });
    if (tags['crossing:island'] === 'yes') {
        // the island sits between the two directions, or in the middle
        const forward = approachRange(cs, 'forward');
        const backward = approachRange(cs, 'backward');
        const middle = forward && backward
            ? (cs.layout.model.driveSide === 'left' ? (forward[1] + backward[0]) / 2 : (backward[1] + forward[0]) / 2)
            : (left + right) / 2;
        out.markings.push({ key: `${node.id}-island`, kind: 'island', nodeID: node.id, closed: true, points: band(cs, -2.5, 2.5, middle - 0.75, middle + 0.75) });
    }
    if ((tags.crossing === 'traffic_signals' || tags['crossing:signals'] === 'yes') && !signalCrossing) {
        // a signal head for each direction the crossing stops (direction=forward|backward, or both), on that traffic's
        // nearside kerb before the crossing, facing it
        const tagged = tags.direction ?? tags['traffic_signals:direction'];
        const directions: ('forward' | 'backward')[] = tagged === 'forward' || tagged === 'backward' ? [tagged] : ['forward', 'backward'];
        const nearside = (direction: 'forward' | 'backward') => (cs.layout.model.driveSide === 'left') === (direction === 'forward') ? left - 0.6 : right + 0.6;
        for (const direction of directions) {
            const sign = direction === 'forward' ? 1 : -1;
            const x = nearside(direction);
            const loc = cs.frame.toLoc(add(scale(cs.direction, sign * (-half - 0.5)), scale(cs.normal, x)));
            const ahead = cs.frame.toLoc(add(scale(cs.direction, sign * (0.5 - half)), scale(cs.normal, x)));
            out.symbols.push({ key: `${node.id}-signal-${direction}`, kind: 'signals', loc, ahead, size: 1.5 });
        }
    }
}


/**
 * A passing place (wiki: Tag:highway=passing_place): the road widening into a bay where oncoming traffic can pass, on
 * the side `direction=forward|backward|both` gives (forward: beside traffic going along the way, which is its left
 * where traffic drives on the left), else `passing_place=left|right|both`, else both, as a turning circle is drawn all
 * round: 20 m long, tapering out from the carriageway's edge to 3 m beyond it and back
 */
function passingPlace(node: osmNode, cs: CrossSection, out: StreetGeometry, left: number, right: number) {
    const tags = node.tags;
    const forwardSide = cs.layout.model.driveSide === 'left' ? -1 : 1;
    const sides = tags.direction === 'forward' ? [forwardSide] : tags.direction === 'backward' ? [-forwardSide]
        : tags.passing_place === 'left' ? [-1] : tags.passing_place === 'right' ? [1] : [-1, 1];
    for (const s of sides) {
        const edge = s > 0 ? right : left;
        // (overlapping the carriageway a little, so no seam shows along its edge)
        const at = (along: number, offset: number) => cs.frame.toLoc(add(scale(cs.direction, along), scale(cs.normal, offset)));
        const points = [at(-10, edge - s * 0.3), at(-10, edge), at(-4, edge + s * 3), at(4, edge + s * 3), at(10, edge), at(10, edge - s * 0.3)];
        out.surfaces.push({ key: `${node.id}-passing-${s}`, kind: 'passing_place_surface', nodeID: node.id, closed: true, points });
    }
}

function nodeMarkings(node: osmNode, graph: coreGraph, out: StreetGeometry, visuals?: Map<string, WayVisual>) {
    const tags = node.tags;
    const parents = graph.parentWays(node);
    const road = parents.find(isLaneRoad) as osmWay | undefined;
    if (!road) {
        // other barriers on paths: a marker
        if (tags.barrier && tags.barrier !== 'kerb' && parents.length) {
            const frame = metricFrame(node.loc);
            out.markings.push({
                key: `${node.id}-barrier`, kind: 'barrier_node', nodeID: node.id, closed: true, variant: tags.barrier,
                points: circle([0, 0], 0.35, 12).map(frame.toLoc)
            });
            return;
        }
        // kerb points on footways
        if (tags.barrier === 'kerb' || tags.kerb) {
            const frame = metricFrame(node.loc);
            const r = 0.5;
            out.markings.push({
                key: `${node.id}-kerb`, kind: 'kerb_node', nodeID: node.id, closed: true, variant: tags.kerb ?? 'raised',
                points: [[-r, -r], [r, -r], [r, r], [-r, r]].map(p => frame.toLoc(p as Vec2))
            });
        }
        return;
    }

    const cs = crossSection(road, road.nodes.indexOf(node.id), graph, visuals);
    const left = cs.edges[0];
    const right = cs.edges[cs.edges.length - 1];
    const highway = tags.highway;

    // crossings drawn as a crossing way are drawn with the way
    const crossingWay = parents.some(w => isCrossingPath(w.tags));
    // (a node tagged both as signals and as their crossing is drawn as the crossing, its line before it)
    const signalCrossing = highway === 'traffic_signals' && !!tags.crossing && tags.crossing !== 'no';
    if ((highway === 'crossing' || (tags.crossing && !highway) || signalCrossing) && !crossingWay) {
        crossingNodeMarkings(node, cs, out, signalCrossing);
    }
    if (highway === 'passing_place') passingPlace(node, cs, out, left, right);

    // signals, stop or give way tagged on a junction node itself: the lines go on the approaches, at the
    // edge of the junction, not across the middle of it
    const roads = parents.filter(isLaneRoad) as osmWay[];
    const armCount = roads.reduce((n, w) => {
        const i = w.nodes.indexOf(node.id);
        return n + (i > 0 ? 1 : 0) + (i < w.nodes.length - 1 ? 1 : 0);
    }, 0);
    const atJunction = armCount >= 3;
    if (highway === 'traffic_signals' && atJunction) junctionSignalLines(node, roads, graph, out, visuals);

    if (highway === 'stop' || highway === 'give_way' || (highway === 'traffic_signals' && !atJunction)) {
        const kind: MarkingKind = highway === 'stop' ? 'stop_line' : highway === 'give_way' ? 'give_way_line' : 'signal_line';
        // at a junction node, the line stands back by half the width of the widest other road
        const back = atJunction ? junctionClearance(node, road, graph) : 0;
        for (const direction of approachDirections(tags, cs)) {
            const range = approachRange(cs, direction);
            if (!range) continue;
            // the line faces traffic coming towards the node
            const travel = direction === 'forward' ? cs.direction : scale(cs.direction, -1);
            const line = lineBeforeCrossing(road, cs.nodeIndex, graph, direction, -back);
            const at = (along: number, across: number) => cs.frame.toLoc(add(scale(travel, along + line), scale(cs.normal, across)));
            out.markings.push({ key: `${node.id}-${kind}-${direction}`, kind, nodeID: node.id, closed: false, points: [at(0, range[0]), at(0, range[1])] });

            // painted STOP or give-way triangles on each approach lane, a few metres before the line
            if (highway === 'traffic_signals') continue;
            cs.layout.lanes.forEach((lane, i) => {
                if (lane.ref.direction !== direction) return;
                const mid = (cs.edges[i] + cs.edges[i + 1]) / 2;
                out.symbols.push({
                    key: `${node.id}-${kind}-${direction}-${i}`,
                    kind: highway === 'stop' ? 'stop_text' : 'give_way_triangle',
                    loc: at(-4, mid), ahead: at(-3, mid), size: Math.min(lane.width * 0.8, 2.5)
                });
            });
        }
        if (highway === 'traffic_signals') {
            const loc = cs.frame.toLoc(scale(cs.normal, right + 0.8));
            out.symbols.push({ key: `${node.id}-signals`, kind: 'signals', loc, ahead: cs.frame.toLoc(add(scale(cs.normal, right + 0.8), cs.direction)), size: 1.8 });
        }
    }

    if (tags.traffic_calming && tags.traffic_calming !== 'no') calmingShapes(node, cs, out, left, right);

    // a ford on a road node: water across the road
    if (isFord(tags)) out.markings.push({ key: `${node.id}-ford`, kind: 'ford', nodeID: node.id, closed: true, points: band(cs, -2.5, 2.5, left, right) });

    if (highway === 'mini_roundabout') miniRoundaboutMarkings(node, parents, cs, graph, out, visuals);
    if (tags.barrier && tags.barrier !== 'kerb' && tags.barrier !== 'no') barrierMarkings(node, cs, out);
}


/** A mini-roundabout: its circular carriageway, the white disc, and give way where roads join it */
function miniRoundaboutMarkings(node: osmNode, parents: OsmEntity[], cs: CrossSection, graph: coreGraph, out: StreetGeometry, visuals?: Map<string, WayVisual>) {
    const R = miniRoundaboutRadius(node, graph) ?? 6;
    // the circular carriageway, under the lanes, and the white disc in the middle
    out.surfaces.push({ key: `${node.id}-mini-surface`, kind: 'mini_roundabout_surface', nodeID: node.id, closed: true, points: circle([0, 0], R).map(cs.frame.toLoc) });
    const r = Math.max(1, Math.min(4, R * 0.35));
    out.markings.push({ key: `${node.id}-mini`, kind: 'mini_roundabout', nodeID: node.id, closed: true, points: circle([0, 0], r, 24).map(cs.frame.toLoc) });
    // give way where each road joins the circle: traffic on a mini-roundabout has priority, so
    // the lines are implied (one mapped on the approach is used instead)
    for (const way of parents.filter(isLaneRoad) as osmWay[]) {
        const i = way.nodes.indexOf(node.id);
        const arm = crossSection(way, i, graph, visuals);
        for (const side of [1, -1]) {
            if ((side > 0 && i === way.nodes.length - 1) || (side < 0 && i === 0)) continue;
            const approach = side > 0 ? 'backward' : 'forward';
            const range = approachRange(arm, approach);
            if (!range || mappedGiveWay(way, i, side, R + 10, graph)) continue;
            const dir = scale(arm.direction, side);
            const at = (across: number) => arm.frame.toLoc(add(scale(dir, R), scale(arm.normal, across)));
            out.markings.push({
                key: `${node.id}-mini-giveway-${way.id}-${side}`, kind: 'give_way_line', nodeID: node.id, closed: false,
                points: [at(range[0]), at(range[1])]
            });
        }
    }
}


/** A barrier on a road: a line across it, a row of posts, or a cattle grid */
function barrierMarkings(node: osmNode, cs: CrossSection, out: StreetGeometry) {
    const left = cs.edges[0];
    const right = cs.edges[cs.edges.length - 1];
    const barrier = node.tags.barrier!;
    if (barrier === 'cattle_grid') {
        out.markings.push({ key: `${node.id}-cattle`, kind: 'cattle_grid', nodeID: node.id, closed: true, points: band(cs, -1.25, 1.25, left, right) });
    } else if (postBarriers[barrier]) {
        const { spacing, size } = postBarriers[barrier];
        const count = Math.max(2, Math.round((right - left) / spacing));
        for (let k = 0; k < count; k++) {
            const x = left + (right - left) * (k + 0.5) / count;
            out.markings.push({
                key: `${node.id}-post-${k}`, kind: 'barrier_post', nodeID: node.id, closed: true, variant: barrier,
                points: band(cs, -size / 2, size / 2, x - size / 2, x + size / 2)
            });
        }
    } else if (lineBarriers.has(barrier)) {
        out.markings.push({
            key: `${node.id}-barrier`, kind: 'barrier_line', nodeID: node.id, closed: false, variant: barrier,
            points: [scale(cs.normal, left), scale(cs.normal, right)].map(cs.frame.toLoc)
        });
    }
}

/** How far back from a junction node its approach lines stand: half the widest other road, plus 1 m */
function junctionClearance(node: osmNode, approach: osmWay, graph: coreGraph): number {
    const others = graph.parentWays(node).filter(w => w.id !== approach.id && isLaneRoad(w)) as osmWay[];
    const widest = Math.max(0, ...others.map(w => cachedLayout(w, graph).total));
    return widest / 2 + 1;
}

/** Traffic signals on a junction node: a stop line on every road approaching it, at the junction's edge */
function junctionSignalLines(node: osmNode, roads: osmWay[], graph: coreGraph, out: StreetGeometry, visuals?: Map<string, WayVisual>) {
    for (const way of roads) {
        const i = way.nodes.indexOf(node.id);
        const arm = crossSection(way, i, graph, visuals);
        const back = junctionClearance(node, way, graph);
        for (const side of [1, -1]) {
            if ((side > 0 && i === way.nodes.length - 1) || (side < 0 && i === 0)) continue;
            // traffic on the arm leaving along the way approaches against it
            const range = approachRange(arm, side > 0 ? 'backward' : 'forward');
            if (!range) continue;
            const dir = scale(arm.direction, side);
            const line = lineBeforeCrossing(way, i, graph, side > 0 ? 'backward' : 'forward', -back);
            const at = (across: number) => arm.frame.toLoc(add(scale(dir, -line), scale(arm.normal, across)));
            out.markings.push({
                key: `${node.id}-signal_line-${way.id}-${side}`, kind: 'signal_line', nodeID: node.id, closed: false,
                points: [at(range[0]), at(range[1])]
            });
        }
    }
}

/** Is there a mapped give way on a road within `distance` metres of node `index`, going `side` along it? */
function mappedGiveWay(way: osmWay, index: number, side: number, distance: number, graph: coreGraph): boolean {
    const origin = (graph.entity(way.nodes[index]) as osmNode).loc;
    const frame = metricFrame(origin);
    for (let i = index + side; i >= 0 && i < way.nodes.length; i += side) {
        const node = graph.entity(way.nodes[i]) as osmNode;
        const p = frame.toMetres(node.loc);
        if (Math.hypot(p[0], p[1]) > distance) break;
        if (node.tags.highway === 'give_way' || node.tags.highway === 'stop') return true;
    }
    return false;
}


/* ---------- speed limits ---------- */

/** A road's limit as painted: its `maxspeed`, or the limit its UK type sets, but never the national speed limit */
function paintedRoadLimit(tags: Tags): string | undefined {
    if (/^GB:(nsl_single|nsl_dual|motorway)$/.test(speedTypeOf(tags) ?? '')) return undefined;
    return roadMaxspeed(tags);
}

/** Whether a road's limit is the national limit or a motorway's, by its type (or `maxspeed=national`) */
function nationalKindOf(tags: Tags): 'national' | 'motorway' | undefined {
    const type = speedTypeOf(tags);
    if (type === 'GB:motorway') return 'motorway';
    return type === 'GB:nsl_single' || type === 'GB:nsl_dual' || tags.maxspeed === 'national' ? 'national' : undefined;
}

/** A posted limit as painted on the road (the number), or null when it is not a plain number */
function paintedLimit(value: string | undefined): string | null {
    const match = (value ?? '').trim().toLowerCase().match(/^(\d+)\s*(mph|km\/h|kmh|kph|knots)?$/);
    return match ? match[1] : null;
}

/**
 * Speed roundels painted on each lane at the start of a way:
 *  - a red limit where the lane's limit changes from that lane on the road before (only when the road
 *    before had a limit: a limit appearing from nothing is not painted), or where a lane has its own
 *    limit (`maxspeed:lanes`) that differs from the road's
 *  - a blue minimum speed (`minspeed`, `minspeed:lanes`) where one begins or changes
 *  - the national speed limit's sign (a white disc with a black band) or a motorway's (blue, with the motorway
 *    symbol) where the limit becomes the national limit or a motorway's, from a road with another limit
 */
function speedLimitSymbols(way: osmWay, graph: coreGraph, visuals: Map<string, WayVisual> | undefined, out: StreetGeometry) {
    const layout = cachedLayout(way, graph);
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = locs(way, graph).map(frame.toMetres);
    const cumulative = cumulativeLengths(points);
    const total = cumulative[cumulative.length - 1];
    if (total < 20) return;
    // (a road tagged only with a UK limit type is painted with its limit; the national limit is never painted, but
    // counts as the limit before a change, so 50 after the national limit is painted)
    const roadLimit = (w: osmWay, key: 'maxspeed' | 'minspeed', direction: 'forward' | 'backward', painted = true) => w.tags[`${key}:${direction}`] ??
        (key === 'maxspeed' ? (painted ? paintedRoadLimit(w.tags) : roadMaxspeed(w.tags)) : w.tags[key]);
    // a lane's own value, else the road's
    const laneLimit = (w: osmWay, key: 'maxspeed' | 'minspeed', direction: 'forward' | 'backward', index: number, painted = true) => {
        const lane = cachedLayout(w, graph).lanes.find(l => l.ref.direction === direction && l.ref.index === index);
        return paintedLimit(lane?.values[`${key}:lanes`] || roadLimit(w, key, direction, painted));
    };

    for (const direction of ['forward', 'backward'] as const) {
        if (!layout.lanes.some(lane => lane.ref.direction === direction)) continue;
        // the road traffic arrives from: the one other road ending here, or the one with the same name or ref
        const entryID = direction === 'forward' ? way.first() : way.last();
        const entry = graph.entity(entryID) as osmNode;
        // (only roads with lanes arriving here: where a road splits into a dual carriageway, the half leaving is not one)
        const arriving = (w: osmWay) => cachedLayout(w, graph).model.lanes[w.last() === entryID ? 'forward' : 'backward'].length > 0;
        const others = (graph.parentWays(entry).filter(w => w.id !== way.id && isLaneRoad(w) &&
            ((w as osmWay).first() === entryID || (w as osmWay).last() === entryID)) as osmWay[]).filter(arriving);
        let previous = others.length === 1 ? others[0] : undefined;
        if (!previous) {
            const same = others.filter(w => (way.tags.ref && w.tags.ref === way.tags.ref) || (way.tags.name && w.tags.name === way.tags.name));
            if (same.length === 1) previous = same[0];
        }
        const previousDirection = previous && previous.last() === entryID ? 'forward' : 'backward';
        const previousCount = previous ? cachedLayout(previous, graph).model.lanes[previousDirection].length : 0;
        // the lane before: the same lane counted from the kerb side traffic keeps to
        const before = (key: 'maxspeed' | 'minspeed', index: number, count: number) => {
            if (!previous) return null;
            const keepLeft = layout.model.driveSide === 'left';
            const i = keepLeft ? index : previousCount - (count - index);
            return i >= 0 && i < previousCount ? laneLimit(previous, key, previousDirection, i, false) : paintedLimit(roadLimit(previous, key, previousDirection, false));
        };

        const s = direction === 'forward' ? 10 : total - 10;
        const edges = edgesAt(layout, visuals?.get(way.id) ?? { start: 0, end: 0, taperStart: [], taperEnd: [] }, s, total);
        const count = layout.model.lanes[direction].length;
        layout.lanes.forEach((lane, k) => {
            if (lane.ref.direction !== direction) return;
            const size = Math.min(lane.width * 0.85, 3);
            const place = (along: number) => {
                const at = pointAlong(points, direction === 'forward' ? s + along : s - along);
                const travel = direction === 'forward' ? at.direction : scale(at.direction, -1);
                const centre = add(at.point, scale(rightNormal(at.direction), (edges[k] + edges[k + 1]) / 2));
                return { loc: frame.toLoc(centre), ahead: frame.toLoc(add(centre, travel)) };
            };

            const limit = laneLimit(way, 'maxspeed', direction, lane.ref.index);
            const road = paintedLimit(roadLimit(way, 'maxspeed', direction));
            const was = before('maxspeed', lane.ref.index, count);
            const changed = !!limit && !!was && was !== limit;
            const ownLimit = !!limit && !!lane.values['maxspeed:lanes'] && limit !== road;
            if (changed || ownLimit) {
                out.symbols.push({ key: `${way.id}-speed-${direction}-${k}`, kind: 'speed_limit', text: limit!, size, ...place(0) });
            }
            // the start of the national limit or a motorway (a lane with a number of its own keeps that)
            const kindHere = lane.values['maxspeed:lanes'] ? undefined : nationalKindOf(way.tags);
            const kindBefore = previous ? nationalKindOf(previous.tags) : undefined;
            const hadLimit = !!previous && (!!kindBefore || !!roadMaxspeed(previous.tags));
            if (kindHere && hadLimit && kindHere !== kindBefore) {
                out.symbols.push({ key: `${way.id}-${kindHere}-${direction}-${k}`, kind: kindHere === 'motorway' ? 'motorway_start' : 'national_limit', size, ...place(0) });
            }

            const minimum = laneLimit(way, 'minspeed', direction, lane.ref.index);
            if (minimum && minimum !== before('minspeed', lane.ref.index, count)) {
                // after the limit, further along the lane
                out.symbols.push({ key: `${way.id}-minspeed-${direction}-${k}`, kind: 'min_speed', text: minimum, size, ...place(changed || ownLimit ? size + 1.5 : 0) });
            }
        });
    }
}


/** Footways, areas, kerbs and road markings among `entities` (usually everything in view) */
export function streetGeometry(entities: OsmEntity[], graph: coreGraph, visuals?: Map<string, WayVisual>): StreetGeometry {
    const out: StreetGeometry = { paths: [], areas: [], kerbs: [], surfaces: [], markings: [], symbols: [], barriers: [] };

    for (const entity of entities) {
        if (entity.type === 'way') {
            const way = entity as osmWay;
            const tags = way.tags;
            if (isTrueWidthPath(way)) {
                out.paths.push(pathShape(way, graph, visuals));
            } else if (way.isClosed() && way.nodes.length > 3) {
                const kind = areaKind(tags);
                const polygon = locs(way, graph);
                if (kind) {
                    out.areas.push({
                        id: way.id, kind, polygon, surface: kind === 'island' ? islandSurface(tags) : surfaceGroup(tags.surface),
                        ...(kind === 'crossing' && (tags.crossing === 'zebra' || tags['crossing:markings'] === 'zebra' || !tags['crossing:markings'] ||
                            tags['crossing:markings'] === 'yes') && tags['crossing:markings'] !== 'no' ? { stripes: zebraStripes(polygon) } : {}),
                        ...(kind === 'hatched' ? { stripes: hatchStripes(polygon, tags.direction) } : {})
                    });
                }
            }
            if (tags.barrier === 'kerb') {
                out.kerbs.push({ id: way.id, kerb: tags.kerb ?? 'raised', line: locs(way, graph) });
            } else if (tags.barrier && barrierWidths[tags.barrier] !== undefined && way.nodes.length > 1) {
                out.barriers.push({ id: way.id, kind: tags.barrier, line: locs(way, graph), width: parseWidth(tags.width) ?? barrierWidths[tags.barrier] });
            }
            if (isLaneRoad(way)) speedLimitSymbols(way, graph, visuals, out);
        } else if (entity.type === 'node' && Object.keys(entity.tags).length) {
            nodeMarkings(entity as osmNode, graph, out, visuals);
        }
    }

    // islands sit on top of other areas
    out.areas.sort((a, b) => (a.kind === 'island' ? 1 : 0) - (b.kind === 'island' ? 1 : 0));
    return out;
}
