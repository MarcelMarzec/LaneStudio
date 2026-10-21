import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { asBuilt, builtHighway, isLaneRoad, isUnderConstruction, laneRoadHighways } from '../core/roads';
import {
    metricFrame, sub, add, scale, unit, dot, rightNormal, pointAlong,
    offsetPolyline, cumulativeLengths, polylineLength, type MetricFrame
} from './frame';
import { parseWidth, type LaneLayout } from './layout';
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
    /** being built (`highway=construction`) */
    construction?: boolean;
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
    | 'calming' | 'mini_roundabout' | 'kerb_node' | 'ford'
    | 'mini_roundabout_surface' | 'turning_loop_island'
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

export type SymbolKind = 'stop_text' | 'give_way_triangle' | 'signals' | 'speed_limit' | 'min_speed';

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
        id: way.id, kind, assumed: tagged === undefined, markings, marks, construction: isUnderConstruction(way.tags),
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
            const at = (along: number, across: number) => cs.frame.toLoc(add(scale(travel, along - back), scale(cs.normal, across)));
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
            const at = (across: number) => arm.frame.toLoc(add(scale(dir, back), scale(arm.normal, across)));
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
 */
function speedLimitSymbols(way: osmWay, graph: coreGraph, visuals: Map<string, WayVisual> | undefined, out: StreetGeometry) {
    const layout = cachedLayout(way, graph);
    const frame = metricFrame((graph.entity(way.first()) as osmNode).loc);
    const points = locs(way, graph).map(frame.toMetres);
    const cumulative = cumulativeLengths(points);
    const total = cumulative[cumulative.length - 1];
    if (total < 20) return;
    const roadLimit = (w: osmWay, key: 'maxspeed' | 'minspeed', direction: 'forward' | 'backward') => w.tags[`${key}:${direction}`] ?? w.tags[key];
    // a lane's own value, else the road's
    const laneLimit = (w: osmWay, key: 'maxspeed' | 'minspeed', direction: 'forward' | 'backward', index: number) => {
        const lane = cachedLayout(w, graph).lanes.find(l => l.ref.direction === direction && l.ref.index === index);
        return paintedLimit(lane?.values[`${key}:lanes`] || roadLimit(w, key, direction));
    };

    for (const direction of ['forward', 'backward'] as const) {
        if (!layout.lanes.some(lane => lane.ref.direction === direction)) continue;
        // the road traffic arrives from: the one other road ending here, or the one with the same name or ref
        const entryID = direction === 'forward' ? way.first() : way.last();
        const entry = graph.entity(entryID) as osmNode;
        const others = graph.parentWays(entry).filter(w => w.id !== way.id && isLaneRoad(w) &&
            ((w as osmWay).first() === entryID || (w as osmWay).last() === entryID)) as osmWay[];
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
            return i >= 0 && i < previousCount ? laneLimit(previous, key, previousDirection, i) : paintedLimit(roadLimit(previous, key, previousDirection));
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
                if (kind) out.areas.push({ id: way.id, kind, polygon: locs(way, graph), surface: kind === 'island' ? islandSurface(tags) : surfaceGroup(tags.surface) });
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
