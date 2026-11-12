import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { roadMarkingStyle, type RoadMarkingStyle, type StrokeStyle } from '../model/street_features';
import { metricFrame, sub, unit, offsetPolyline, dot, len, add, scale, rightNormal, pointAlong, polylineLength } from './frame';
import { chevronStripes, hatchStripes, multipolygonRings } from './street';

/*
 * Painted road markings mapped as their own features (`road_marking=*`): lines painted with
 * `stroke=*` (or `stroke:left` and `stroke:right` for a pair), areas filled with `pattern=*`,
 * and text painted on the road, all in `colour=*` at `width=*` metres.
 */

export interface MarkingLine {
    key: string;
    id: string;
    stroke: StrokeStyle;
    line: Vec2[];
    style: RoadMarkingStyle;
}

export interface MarkingArea {
    key: string;
    id: string;
    polygon: Vec2[];
    /** a multipolygon's other rings, drawn in the same shape (inner rings leave holes: a traffic island) */
    rings?: Vec2[][];
    style: RoadMarkingStyle;
    /** hatching or chevrons as bars, turned to the road (clipped to the polygon when drawn) */
    stripes?: Vec2[][];
}

export interface MarkingText {
    key: string;
    id: string;
    text: string;
    loc: Vec2;
    /** a point 1 m further along the direction the text is read */
    ahead: Vec2;
    style: RoadMarkingStyle;
}

/** Shapes painted solid along a line: shark's teeth (`stroke=sharks_teeth`) */
export interface MarkingShape {
    key: string;
    id: string;
    polygons: Vec2[][];
    style: RoadMarkingStyle;
}

/**
 * A pictogram painted on the road: an arrow mapped as a way from its base to its tip (`road_marking=arrow` with
 * `arrow=*`, the values of `turn=*`), or a cycle symbol on a node (`road_marking=symbol`, `symbol=bicycle`)
 */
export interface MarkingSymbol {
    key: string;
    id: string;
    kind: 'arrow' | 'cycle';
    /** an arrow's `turn` values */
    turns?: string[];
    /** its middle, and a point 1 m further the way it points */
    loc: Vec2;
    ahead: Vec2;
    /** how long it is painted, in metres */
    length: number;
    style: RoadMarkingStyle;
}

export interface RoadMarkings {
    lines: MarkingLine[];
    areas: MarkingArea[];
    texts: MarkingText[];
    shapes: MarkingShape[];
    symbols: MarkingSymbol[];
}

/**
 * `road_marking=*` read the wiki's way: its legacy values as the values that replace them (`solid_stop_line` is a
 * `stop_line`, `dash` a dashed `lane_divider`, `gore_chevron` a `restriction` with chevrons, `left` an arrow)
 */
export function markingKind(value: string | undefined): string {
    switch (value) {
        case 'solid_stop_line': return 'stop_line';
        case 'solid_lane_divider': case 'dash': return 'lane_divider';
        case 'solid_crossing_edge': return 'crossing_edge';
        case 'solid_road_edge': return 'edge_line';
        case 'gore_chevron': return 'restriction';
        case 'left': case 'right': case 'through': return 'arrow';
        default: return value ?? '';
    }
}

/** An arrow's `turn` values: `arrow=*`, or the legacy value itself (`road_marking=left`), straight on by default */
function arrowTurns(tags: Tags): string[] {
    const value = tags.arrow ?? (['left', 'right', 'through'].includes(tags.road_marking ?? '') ? tags.road_marking : undefined) ?? 'through';
    return value.split(';').map(v => v.trim()).filter(Boolean);
}

/** Shark's teeth along a line (wiki: `stroke=sharks_teeth`): triangles on it, pointing to its right */
function sharksTeeth(points: Vec2[], width: number): Vec2[][] {
    const total = polylineLength(points);
    // continental give-way teeth: 0.5 m across the base, 0.6 m long, 0.5 m apart (narrower for a thin `width`)
    const base = Math.max(0.3, Math.min(0.5, width * 3));
    const depth = base * 1.2;
    const teeth: Vec2[][] = [];
    for (let s = base / 2; s + base <= total + 1e-6; s += base * 2) {
        const a = pointAlong(points, s).point;
        const b = pointAlong(points, s + base);
        const tip = add(pointAlong(points, s + base / 2).point, scale(rightNormal(b.direction), depth));
        teeth.push([a, b.point, tip]);
    }
    return teeth;
}

/** A zigzag line (`stroke=zigzag`, as beside a zebra crossing): stretches of about 1 m swinging 0.25 m either side */
function zigzag(points: Vec2[]): Vec2[] {
    const total = polylineLength(points);
    const count = Math.max(1, Math.round(total));
    return Array.from({ length: count + 1 }, (_, i) => {
        const at = pointAlong(points, total * i / count);
        return add(at.point, scale(rightNormal(at.direction), i % 2 ? 0.25 : -0.25));
    });
}

const areaMarkings = new Set(['restriction', 'hatched', 'coloured', 'crossing', 'parking', 'bus_stop', 'box_junction', 'gore_chevron']);

/** A closed `road_marking` way is an area when tagged so, or when it fills a space */
function isAreaMarking(way: osmWay): boolean {
    if (!way.isClosed()) return false;
    const tags = way.tags;
    if (tags.area === 'no') return false;
    return tags.area === 'yes' || !!tags.pattern || areaMarkings.has(tags.road_marking ?? '');
}

type WayResult = { lines: MarkingLine[]; area: MarkingArea | null; shapes: MarkingShape[]; symbols: MarkingSymbol[] };
const cache = new WeakMap<osmWay, { nodes: OsmEntity[] } & WayResult>();

function wayMarkings(way: osmWay, graph: coreGraph): WayResult {
    const nodes = way.nodes.map(id => graph.entity(id));
    const cached = cache.get(way);
    if (cached && cached.nodes.length === nodes.length && cached.nodes.every((n, i) => n === nodes[i])) return cached;

    const style = roadMarkingStyle(way.tags);
    const locs = nodes.map(n => (n as osmNode).loc);
    let result: WayResult;
    const frame = metricFrame(locs[0]);
    const points = locs.map(frame.toMetres);
    const stroke = way.tags.stroke;
    if (isAreaMarking(way)) {
        result = { lines: [], area: { key: way.id, id: way.id, polygon: locs.slice(0, -1), style }, shapes: [], symbols: [] };
    } else if (markingKind(way.tags.road_marking) === 'arrow') {
        // an arrow mapped from its base to its tip
        const length = polylineLength(points);
        const middle = pointAlong(points, length / 2);
        result = { lines: [], area: null, shapes: [], symbols: [{
            key: way.id, id: way.id, kind: 'arrow', turns: arrowTurns(way.tags), length, style,
            loc: frame.toLoc(middle.point), ahead: frame.toLoc(add(middle.point, middle.direction))
        }] };
    } else if (stroke === 'sharks_teeth') {
        result = { lines: [], area: null, symbols: [],
            shapes: [{ key: way.id, id: way.id, style, polygons: sharksTeeth(points, style.width).map(tooth => tooth.map(frame.toLoc)) }] };
    } else if (stroke === 'zigzag') {
        result = { lines: [{ key: `${way.id}-0`, id: way.id, stroke: 'solid', style, line: zigzag(points).map(frame.toLoc) }], area: null, shapes: [], symbols: [] };
    } else {
        // a pair of lines sits either side of the way, a line's width apart
        const offsets = style.lines.length === 2 ? [-style.width, style.width] : [0];
        const lines = style.lines.map((stroke, i) => ({
            key: `${way.id}-${i}`, id: way.id, stroke, style,
            line: (offsets[i] ? offsetPolyline(points, points.map(() => offsets[i])) : points).map(frame.toLoc)
        }));
        result = { lines, area: null, shapes: [], symbols: [] };
    }
    cache.set(way, { nodes, ...result });
    return result;
}

/** Which way a marking on a node is read: `direction` as a bearing, else along the road it is on (`backward`: against it) */
function nodeDirection(node: osmNode, graph: coreGraph): Vec2 {
    const frame = metricFrame(node.loc);
    let direction: Vec2 = [0, 1];
    const road = graph.parentWays(node).find(isLaneRoad) as osmWay | undefined;
    const bearing = parseFloat(node.tags.direction ?? '');
    if (Number.isFinite(bearing)) {
        direction = [Math.sin(bearing * Math.PI / 180), Math.cos(bearing * Math.PI / 180)];
    } else if (road) {
        const i = road.nodes.indexOf(node.id);
        const before = (graph.entity(road.nodes[Math.max(0, i - 1)]) as osmNode).loc;
        const after = (graph.entity(road.nodes[Math.min(road.nodes.length - 1, i + 1)]) as osmNode).loc;
        direction = unit(sub(frame.toMetres(after), frame.toMetres(before)));
        if (node.tags.direction === 'backward') direction = [-direction[0], -direction[1]];
    }
    return direction;
}

const cycleSymbols = new Set(['bicycle', 'cycle', 'cyclist', 'bicycle_lane']);

/** The words painted for a node: `inscription`, a symbol's name (`symbol=bus`: BUS), or a painted sign's number */
function nodeWords(tags: Tags): string | undefined {
    const text = tags.inscription ?? tags['road_marking:text'];
    if (text) return text;
    const kind = markingKind(tags.road_marking);
    if (kind === 'symbol' && tags.symbol && !cycleSymbols.has(tags.symbol)) return tags.symbol.replace(/_/g, ' ').toUpperCase();
    if (kind === 'traffic_sign') {
        // a speed limit painted on the road: `traffic_sign=GB:670[30]`, or `maxspeed=30 mph`
        const number = /\[(\d+)\]/.exec(tags.traffic_sign ?? '')?.[1] ?? /^(\d+)/.exec(tags.maxspeed ?? '')?.[1];
        if (number) return number;
    }
    return undefined;
}

/**
 * Painted text on a node (`road_marking=text` with `inscription=*`; a `symbol` drawn as its name; a speed limit painted
 * as a `traffic_sign`), read along the road it is on
 */
function nodeText(node: osmNode, graph: coreGraph): MarkingText | null {
    const text = nodeWords(node.tags);
    if (!text) return null;
    const frame = metricFrame(node.loc);
    return {
        key: node.id, id: node.id, text, style: roadMarkingStyle(node.tags),
        loc: node.loc, ahead: frame.toLoc(nodeDirection(node, graph))
    };
}

/** A cycle symbol painted on a node (`road_marking=symbol`, `symbol=bicycle`), facing the way it is read, `length` metres long */
function nodeSymbol(node: osmNode, graph: coreGraph): MarkingSymbol | null {
    if (markingKind(node.tags.road_marking) !== 'symbol' || !cycleSymbols.has(node.tags.symbol ?? '')) return null;
    const frame = metricFrame(node.loc);
    const length = parseFloat(node.tags.length ?? '');
    return {
        key: node.id, id: node.id, kind: 'cycle', loc: node.loc, ahead: frame.toLoc(nodeDirection(node, graph)),
        length: Number.isFinite(length) && length > 0 && length < 10 ? length : 2, style: roadMarkingStyle(node.tags)
    };
}

/**
 * The direction traffic runs past an area, in metres in the frame of its first point: along the nearest road within
 * 25 m of its middle (against a `oneway=-1` road), or undefined with none near
 */
function travelPast(polygon: Vec2[], roads: osmWay[], graph: coreGraph): Vec2 | undefined {
    const frame = metricFrame(polygon[0]);
    const points = polygon.map(frame.toMetres);
    const middle: Vec2 = [points.reduce((t, p) => t + p[0], 0) / points.length, points.reduce((t, p) => t + p[1], 0) / points.length];
    let best: { d: number; direction: Vec2 } | undefined;
    for (const road of roads) {
        const line = road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
        for (let i = 0; i < line.length - 1; i++) {
            const e = sub(line[i + 1], line[i]);
            const l = len(e);
            if (l < 0.01) continue;
            const t = Math.max(0, Math.min(1, dot(sub(middle, line[i]), e) / (l * l)));
            const d = len(sub(middle, [line[i][0] + e[0] * t, line[i][1] + e[1] * t]));
            if (d < 25 && (!best || d < best.d)) best = { d, direction: road.tags.oneway === '-1' ? unit([-e[0], -e[1]]) : unit(e) };
        }
    }
    return best?.direction;
}

const stripeCache = new WeakMap<OsmEntity, { key: string; stripes: Vec2[][] | undefined }>();

/** An area's hatching or chevrons as bars turned to the road beside it (other patterns are filled) */
function areaStripes(way: OsmEntity, area: MarkingArea, roads: osmWay[], graph: coreGraph): Vec2[][] | undefined {
    const pattern = area.style.pattern;
    const chevrons = pattern === 'chevron';
    if (!chevrons && pattern !== 'hatch' && pattern !== 'stripes' && pattern !== 'diagonal') return undefined;
    const travel = chevrons ? travelPast(area.polygon, roads, graph) : undefined;
    const key = `${area.polygon.map(p => p.join(',')).join(';')}|${travel?.map(v => v.toFixed(2))}|${way.tags.direction}|${chevrons}`;
    const cached = stripeCache.get(way);
    if (cached?.key === key) return cached.stripes;
    const stripes = chevrons ? chevronStripes(area.polygon, travel, way.tags.direction) : hatchStripes(area.polygon, way.tags.direction);
    stripeCache.set(way, { key, stripes });
    return stripes;
}

const relationCache = new WeakMap<OsmEntity, { deps: OsmEntity[]; area: MarkingArea | null }>();

/** A painted area mapped as a multipolygon (`type=multipolygon`): its first outer ring, and its holes and other outers */
function relationArea(relation: OsmEntity, graph: coreGraph): MarkingArea | null {
    const members: OsmEntity[] = [];
    for (const member of (relation as unknown as { members: { id: string }[] }).members) {
        const entity = graph.hasEntity(member.id as never) as OsmEntity | undefined;
        if (entity) members.push(entity);
    }
    const deps = [relation, ...members, ...members.flatMap(m => m.type === 'way' ? (m as osmWay).nodes.map(id => graph.entity(id)) : [])];
    const cached = relationCache.get(relation);
    if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) return cached.area;
    const rings = multipolygonRings(relation, graph);
    const area = rings ? {
        key: relation.id, id: relation.id, style: roadMarkingStyle(relation.tags),
        polygon: rings.outer.slice(0, -1), ...(rings.rings.length ? { rings: rings.rings } : {})
    } : null;
    relationCache.set(relation, { deps, area });
    return area;
}

/** Road markings among `entities` */
export function roadMarkingGeometry(entities: OsmEntity[], graph: coreGraph): RoadMarkings {
    const out: RoadMarkings = { lines: [], areas: [], texts: [], shapes: [], symbols: [] };
    let roads: osmWay[] | undefined;
    for (const entity of entities) {
        if (!entity.tags.road_marking) continue;
        if (entity.type === 'way') {
            const way = entity as osmWay;
            if (way.nodes.length < 2) continue;
            const { lines, area, shapes, symbols } = wayMarkings(way, graph);
            out.lines.push(...lines);
            out.shapes.push(...shapes);
            out.symbols.push(...symbols);
            if (area) {
                roads ??= entities.filter(e => e.type === 'way' && isLaneRoad(e)) as osmWay[];
                const stripes = areaStripes(way, area, roads, graph);
                out.areas.push(stripes ? { ...area, stripes } : area);
            }
        } else if (entity.type === 'node') {
            const text = nodeText(entity as osmNode, graph);
            if (text) out.texts.push(text);
            const symbol = nodeSymbol(entity as osmNode, graph);
            if (symbol) out.symbols.push(symbol);
        } else if (entity.type === 'relation' && entity.tags.type === 'multipolygon') {
            const area = relationArea(entity, graph);
            if (!area) continue;
            roads ??= entities.filter(e => e.type === 'way' && isLaneRoad(e)) as osmWay[];
            const stripes = areaStripes(entity, area, roads, graph);
            out.areas.push(stripes ? { ...area, stripes } : area);
        }
    }
    return out;
}

/** The ways (and multipolygons) and the nodes drawn as road markings, so iD need not draw them too */
export function roadMarkingIDs(markings: RoadMarkings): { ways: string[]; nodes: string[] } {
    const ids = [...markings.lines, ...markings.areas, ...markings.shapes, ...markings.symbols, ...markings.texts].map(m => m.id);
    return { ways: ids.filter(id => !id.startsWith('n')), nodes: ids.filter(id => id.startsWith('n')) };
}
