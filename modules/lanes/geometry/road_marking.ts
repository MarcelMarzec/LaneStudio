import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { roadMarkingStyle, type RoadMarkingStyle, type StrokeStyle } from '../model/street_features';
import { metricFrame, sub, unit, offsetPolyline, dot, len } from './frame';
import { chevronStripes, hatchStripes } from './street';

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

export interface RoadMarkings {
    lines: MarkingLine[];
    areas: MarkingArea[];
    texts: MarkingText[];
}

const areaMarkings = new Set(['restriction', 'hatched', 'coloured', 'crossing', 'parking', 'bus_stop', 'box_junction', 'gore_chevron']);

/** A closed `road_marking` way is an area when tagged so, or when it fills a space */
function isAreaMarking(way: osmWay): boolean {
    if (!way.isClosed()) return false;
    const tags = way.tags;
    if (tags.area === 'no') return false;
    return tags.area === 'yes' || !!tags.pattern || areaMarkings.has(tags.road_marking ?? '');
}

const cache = new WeakMap<osmWay, { nodes: OsmEntity[]; lines: MarkingLine[]; area: MarkingArea | null }>();

function wayMarkings(way: osmWay, graph: coreGraph): { lines: MarkingLine[]; area: MarkingArea | null } {
    const nodes = way.nodes.map(id => graph.entity(id));
    const cached = cache.get(way);
    if (cached && cached.nodes.length === nodes.length && cached.nodes.every((n, i) => n === nodes[i])) return cached;

    const style = roadMarkingStyle(way.tags);
    const locs = nodes.map(n => (n as osmNode).loc);
    let result: { lines: MarkingLine[]; area: MarkingArea | null };
    if (isAreaMarking(way)) {
        result = { lines: [], area: { key: way.id, id: way.id, polygon: locs.slice(0, -1), style } };
    } else {
        const frame = metricFrame(locs[0]);
        const points = locs.map(frame.toMetres);
        // a pair of lines sits either side of the way, a line's width apart
        const offsets = style.lines.length === 2 ? [-style.width, style.width] : [0];
        const lines = style.lines.map((stroke, i) => ({
            key: `${way.id}-${i}`, id: way.id, stroke, style,
            line: (offsets[i] ? offsetPolyline(points, points.map(() => offsets[i])) : points).map(frame.toLoc)
        }));
        result = { lines, area: null };
    }
    cache.set(way, { nodes, ...result });
    return result;
}

/** Painted text on a node (`road_marking=text` with `inscription=*`), read along the road it is on */
function nodeText(node: osmNode, graph: coreGraph): MarkingText | null {
    const text = node.tags.inscription ?? node.tags['road_marking:text'];
    if (!text) return null;
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
    return {
        key: node.id, id: node.id, text, style: roadMarkingStyle(node.tags),
        loc: node.loc, ahead: frame.toLoc(direction)
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

const stripeCache = new WeakMap<osmWay, { key: string; stripes: Vec2[][] | undefined }>();

/** An area's hatching or chevrons as bars turned to the road beside it (other patterns are filled) */
function areaStripes(way: osmWay, area: MarkingArea, roads: osmWay[], graph: coreGraph): Vec2[][] | undefined {
    const pattern = area.style.pattern;
    const chevrons = pattern === 'chevron' || way.tags.road_marking === 'gore_chevron';
    if (!chevrons && pattern !== 'hatch' && pattern !== 'stripes' && pattern !== 'diagonal') return undefined;
    const travel = chevrons ? travelPast(area.polygon, roads, graph) : undefined;
    const key = `${area.polygon.map(p => p.join(',')).join(';')}|${travel?.map(v => v.toFixed(2))}|${way.tags.direction}|${chevrons}`;
    const cached = stripeCache.get(way);
    if (cached?.key === key) return cached.stripes;
    const stripes = chevrons ? chevronStripes(area.polygon, travel, way.tags.direction) : hatchStripes(area.polygon, way.tags.direction);
    stripeCache.set(way, { key, stripes });
    return stripes;
}

/** Road markings among `entities` */
export function roadMarkingGeometry(entities: OsmEntity[], graph: coreGraph): RoadMarkings {
    const out: RoadMarkings = { lines: [], areas: [], texts: [] };
    let roads: osmWay[] | undefined;
    for (const entity of entities) {
        if (!entity.tags.road_marking) continue;
        if (entity.type === 'way') {
            const way = entity as osmWay;
            if (way.nodes.length < 2) continue;
            const { lines, area } = wayMarkings(way, graph);
            out.lines.push(...lines);
            if (area) {
                roads ??= entities.filter(e => e.type === 'way' && isLaneRoad(e)) as osmWay[];
                const stripes = areaStripes(way, area, roads, graph);
                out.areas.push(stripes ? { ...area, stripes } : area);
            }
        } else if (entity.type === 'node') {
            const text = nodeText(entity as osmNode, graph);
            if (text) out.texts.push(text);
        }
    }
    return out;
}
