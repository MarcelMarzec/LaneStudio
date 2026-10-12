import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { roadMarkingStyle, type RoadMarkingStyle, type StrokeStyle } from '../model/street_features';
import { metricFrame, sub, unit, offsetPolyline } from './frame';

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

const areaMarkings = new Set(['restriction', 'hatched', 'coloured', 'crossing', 'parking', 'bus_stop', 'box_junction']);

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

/** Road markings among `entities` */
export function roadMarkingGeometry(entities: OsmEntity[], graph: coreGraph): RoadMarkings {
    const out: RoadMarkings = { lines: [], areas: [], texts: [] };
    for (const entity of entities) {
        if (!entity.tags.road_marking) continue;
        if (entity.type === 'way') {
            const way = entity as osmWay;
            if (way.nodes.length < 2) continue;
            const { lines, area } = wayMarkings(way, graph);
            out.lines.push(...lines);
            if (area) out.areas.push(area);
        } else if (entity.type === 'node') {
            const text = nodeText(entity as osmNode, graph);
            if (text) out.texts.push(text);
        }
    }
    return out;
}
