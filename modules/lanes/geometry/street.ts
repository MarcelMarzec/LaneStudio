import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad, laneRoadHighways } from '../core/roads';
import {
    metricFrame, sub, add, scale, unit, dot, rightNormal, pointAlong,
    offsetPolyline, cumulativeLengths, polylineLength, type MetricFrame
} from './frame';
import { parseWidth, type LaneLayout } from './layout';
import { cachedLayout, edgesAt, visualShift, type WayVisual } from './road_geometry';
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
export type CrossingMarkings = 'zebra' | 'lines' | 'dots' | 'none';

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
    /** zebra bars or edge lines for crossings */
    marks: Vec2[][];
}

export type AreaKind = 'island' | 'pavement' | 'cycleway' | 'carriageway' | 'other';

export interface AreaShape {
    id: string;
    kind: AreaKind;
    polygon: Vec2[];
    /** what the area is covered with (always set for traffic islands, which default to concrete) */
    surface?: SurfaceGroup;
}

export interface KerbLine {
    id: string;
    /** `kerb=*`: raised, lowered, flush, rolled… */
    kerb: string;
    line: Vec2[];
}

export type MarkingKind =
    | 'crossing' | 'zebra_bar' | 'crossing_line' | 'island'
    | 'stop_line' | 'give_way_line' | 'signal_line'
    | 'calming' | 'mini_roundabout' | 'kerb_node';

export interface MarkingShape {
    key: string;
    kind: MarkingKind;
    /** a closed polygon, or an open line for `*_line` kinds */
    points: Vec2[];
    closed: boolean;
    nodeID: string;
    variant?: string;
}

export type SymbolKind = 'stop_text' | 'give_way_triangle' | 'signals';

export interface SymbolShape {
    key: string;
    kind: SymbolKind;
    loc: Vec2;
    /** a point 1 m further along the direction the symbol faces (travel direction) */
    ahead: Vec2;
    /** metres the symbol should span */
    size: number;
}

export interface StreetGeometry {
    paths: PathShape[];
    areas: AreaShape[];
    kerbs: KerbLine[];
    markings: MarkingShape[];
    symbols: SymbolShape[];
}


/* ---------- crossings ---------- */

/** How a crossing is painted, from `crossing:markings` or the older `crossing=*` values */
export function crossingMarkings(tags: Tags): CrossingMarkings {
    const markings = tags['crossing:markings'];
    if (markings) {
        if (markings === 'no') return 'none';
        if (markings === 'lines' || markings === 'lines:paired' || markings === 'ladder:paired') return 'lines';
        if (markings === 'dots' || markings === 'dashes') return 'dots';
        return 'zebra';   // yes, zebra, ladder, ladder:skewed, zebra:double…
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

const pathCache = new WeakMap<osmWay, { nodes: OsmEntity[]; stretch: [number, number]; shape: PathShape }>();

export function isTrueWidthPath(entity: OsmEntity): boolean {
    if (entity.type !== 'way') return false;
    const way = entity as osmWay;
    return (way.tags.highway ?? '') in pathWidths && !way.isArea() && way.nodes.length > 1;
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
    const tags = way.tags;
    const frame = metricFrame((nodes[0] as osmNode).loc);
    let points = locs(way, graph).map(frame.toMetres);
    const stretch: [number, number] = isCrossingPath(tags) ? crossingStretch(way, graph, points, frame, visuals) : [0, 0];
    const cached = pathCache.get(way);
    if (cached && cached.nodes.every((n, i) => n === nodes[i]) && cached.nodes.length === nodes.length &&
        cached.stretch[0] === stretch[0] && cached.stretch[1] === stretch[1]) return cached.shape;

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

    const marks: Vec2[][] = [];
    let markings: CrossingMarkings | undefined;
    if (kind === 'crossing') {
        markings = crossingMarkings(tags);
        const length = polylineLength(points);
        if (markings === 'zebra') {
            // bars across the path every metre: the stripes run with the traffic
            for (let s = 0.3; s + 0.5 < length; s += 1) {
                const a = pointAlong(points, s);
                const b = pointAlong(points, s + 0.5);
                const n = rightNormal(a.direction);
                marks.push([add(a.point, scale(n, -width / 2)), add(b.point, scale(n, -width / 2)),
                    add(b.point, scale(n, width / 2)), add(a.point, scale(n, width / 2))].map(frame.toLoc));
            }
        } else if (markings === 'lines' || markings === 'dots') {
            marks.push(left.map(frame.toLoc), right.map(frame.toLoc));
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
        id: way.id, kind, assumed: tagged === undefined, markings, marks,
        surface: surfaceGroup(tags.surface), use, divider, footHalf,
        polygon: [...left, ...right.reverse()].map(frame.toLoc)
    };
    pathCache.set(way, { nodes, stretch, shape });
    return shape;
}


/* ---------- areas and kerbs ---------- */

function areaKind(tags: Tags): AreaKind | null {
    const value = tags['area:highway'];
    if (isTrafficIsland(tags)) return 'island';
    if (value) {
        if (['footway', 'pedestrian', 'path', 'steps'].includes(value)) return 'pavement';
        if (value === 'cycleway') return 'cycleway';
        if (value === 'emergency' || value === 'verge') return 'other';
        return 'carriageway';
    }
    // a road mapped as an area (area=yes + highway=service etc.) is the road's surface
    if (tags.area === 'yes' && laneRoadHighways.has(tags.highway ?? '')) return 'carriageway';
    if (tags.highway === 'pedestrian' && (tags.area === 'yes')) return 'pavement';
    if ((tags.highway === 'footway' || tags.highway === 'path') && tags.area === 'yes') return 'pavement';
    return null;
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
    const n = cs.way.nodes.length;
    if (cs.nodeIndex === n - 1) return ['forward'];
    if (cs.nodeIndex === 0) return ['backward'];
    return cs.nodeIndex >= (n - 1) / 2 ? ['forward'] : ['backward'];
}


function nodeMarkings(node: osmNode, graph: coreGraph, out: StreetGeometry, visuals?: Map<string, WayVisual>) {
    const tags = node.tags;
    const parents = graph.parentWays(node);
    const road = parents.find(isLaneRoad) as osmWay | undefined;
    if (!road) {
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
    if ((highway === 'crossing' || (tags.crossing && !highway)) && !crossingWay) {
        const markings = crossingMarkings(tags);
        const half = 1.5;
        out.markings.push({ key: `${node.id}-crossing`, kind: 'crossing', nodeID: node.id, closed: true, variant: markings, points: band(cs, -half, half, left, right) });
        if (markings === 'zebra') {
            for (let x = left + 0.25; x + 0.5 <= right; x += 1) {
                out.markings.push({ key: `${node.id}-bar-${x.toFixed(2)}`, kind: 'zebra_bar', nodeID: node.id, closed: true, points: band(cs, -half, half, x, x + 0.5) });
            }
        } else if (markings === 'lines' || markings === 'dots') {
            for (const along of [-half, half]) {
                out.markings.push({
                    key: `${node.id}-line-${along}`, kind: 'crossing_line', nodeID: node.id, closed: false, variant: markings,
                    points: [add(scale(cs.direction, along), scale(cs.normal, left)), add(scale(cs.direction, along), scale(cs.normal, right))].map(cs.frame.toLoc)
                });
            }
        }
        if (tags['crossing:island'] === 'yes') {
            // the island sits between the two directions, or in the middle
            const forward = approachRange(cs, 'forward');
            const backward = approachRange(cs, 'backward');
            const middle = forward && backward
                ? (cs.layout.model.driveSide === 'left' ? (forward[1] + backward[0]) / 2 : (backward[1] + forward[0]) / 2)
                : (left + right) / 2;
            out.markings.push({ key: `${node.id}-island`, kind: 'island', nodeID: node.id, closed: true, points: band(cs, -2.5, 2.5, middle - 0.75, middle + 0.75) });
        }
        if (tags.crossing === 'traffic_signals' || tags['crossing:signals'] === 'yes') {
            for (const [x, side] of [[left - 0.6, 'l'], [right + 0.6, 'r']] as const) {
                const loc = cs.frame.toLoc(add(scale(cs.direction, -half - 0.5), scale(cs.normal, x)));
                out.symbols.push({ key: `${node.id}-signal-${side}`, kind: 'signals', loc, ahead: cs.frame.toLoc(add(scale(cs.direction, 0.5 - half), scale(cs.normal, x))), size: 1.5 });
            }
        }
    }

    if (highway === 'stop' || highway === 'give_way' || highway === 'traffic_signals') {
        const kind: MarkingKind = highway === 'stop' ? 'stop_line' : highway === 'give_way' ? 'give_way_line' : 'signal_line';
        for (const direction of approachDirections(tags, cs)) {
            const range = approachRange(cs, direction);
            if (!range) continue;
            // the line faces traffic coming towards the node
            const travel = direction === 'forward' ? cs.direction : scale(cs.direction, -1);
            const at = (along: number, across: number) => cs.frame.toLoc(add(scale(travel, along), scale(cs.normal, across)));
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

    const calming = tags.traffic_calming;
    if (calming && calming !== 'island' && calming !== 'no') {
        const length = calming === 'table' ? 6 : calming === 'rumble_strip' ? 4 : 3;
        out.markings.push({ key: `${node.id}-calming`, kind: 'calming', nodeID: node.id, closed: true, variant: calming, points: band(cs, -length / 2, length / 2, left, right) });
    }

    if (highway === 'mini_roundabout') {
        const r = Math.max(1.5, Math.min(4, (right - left) * 0.3));
        const ring: Vec2[] = [];
        for (let a = 0; a < 24; a++) ring.push([r * Math.cos(a * Math.PI / 12), r * Math.sin(a * Math.PI / 12)]);
        out.markings.push({ key: `${node.id}-mini`, kind: 'mini_roundabout', nodeID: node.id, closed: true, points: ring.map(p => cs.frame.toLoc(p)) });
    }
}


/** Footways, areas, kerbs and road markings among `entities` (usually everything in view) */
export function streetGeometry(entities: OsmEntity[], graph: coreGraph, visuals?: Map<string, WayVisual>): StreetGeometry {
    const out: StreetGeometry = { paths: [], areas: [], kerbs: [], markings: [], symbols: [] };

    for (const entity of entities) {
        if (entity.type === 'way') {
            const way = entity as osmWay;
            const tags = way.tags;
            if (isTrueWidthPath(way)) {
                out.paths.push(pathShape(way, graph, visuals));
            } else if (way.isClosed() && way.nodes.length > 3) {
                const kind = areaKind(tags);
                if (kind) out.areas.push({ id: way.id, kind, polygon: locs(way, graph), surface: kind === 'island' ? islandSurface(tags) : surfaceGroup(tags.surface) });
            }
            if (tags.barrier === 'kerb') {
                out.kerbs.push({ id: way.id, kerb: tags.kerb ?? 'raised', line: locs(way, graph) });
            }
        } else if (entity.type === 'node' && Object.keys(entity.tags).length) {
            nodeMarkings(entity as osmNode, graph, out, visuals);
        }
    }

    // islands sit on top of other areas
    out.areas.sort((a, b) => (a.kind === 'island' ? 1 : 0) - (b.kind === 'island' ? 1 : 0));
    return out;
}
