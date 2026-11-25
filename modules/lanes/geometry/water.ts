import type { Vec2 } from '../../geo/vector';
import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { add, metricFrame, offsetPolyline, pointInPolygon, rightNormal, scale, sub, unit, type MetricFrame } from './frame';
import { parseWidth } from './layout';
import { isCovered } from './structures';
import { multipolygonRings } from './street';

/*
 * Water: watercourses drawn as lines (`waterway=river`, `stream`, `canal`, `drain`, `ditch`…) at their width, water
 * mapped as areas (`natural=water` with any `water=*`), and what stands in the water: weirs, dams, lock gates,
 * waterfalls, rapids, sluice gates and other barriers. (wiki: Key:waterway, Key:water)
 * All output is in lon/lat, ready to project.
 */

/** Watercourses drawn at their width */
export type ChannelKind = 'river' | 'stream' | 'tidal_channel' | 'canal' | 'drain' | 'ditch' | 'pressurised' | 'fish_pass' | 'canoe_pass';

/**
 * Widths in metres when a watercourse has no `width` (or `est_width`), from UK practice: a field ditch about a metre
 * across, a drain (often a lined channel) two, a stream that can be stepped over 1.5 (wiki: Tag:waterway=stream), a
 * river ten; a broad canal about 12 m; a pressurised pipe a metre
 */
export const channelWidths: Record<ChannelKind, number> = {
    river: 10, stream: 1.5, tidal_channel: 5, canal: 12, drain: 2, ditch: 1, pressurised: 1, fish_pass: 1.5, canoe_pass: 2
};

const channelKinds = new Set<string>(Object.keys(channelWidths));

export interface WaterChannel {
    /** the piece's key (a way runs in and out of water areas, one piece for each stretch outside them) */
    key: string;
    id: string;
    kind: ChannelKind;
    width: number;
    polygon: Vec2[];
    /** the two banks, left and right along the way */
    banks: Vec2[][];
    /** in a culvert or tunnel, or a pressurised pipe: drawn faded with dashed walls */
    covered: boolean;
    /** dry part of the year (`intermittent=yes`, or `seasonal`): drawn paler with dashed banks */
    intermittent: boolean;
}

export interface WaterArea {
    id: string;
    /** the `water=*` value (`river`, `pond`, `lock`…), or `water` when untagged */
    kind: string;
    polygon: Vec2[];
    /** a multipolygon's other rings (inner rings leave holes) */
    rings?: Vec2[][];
    intermittent: boolean;
    /** `natural=water` (hidden with Hide natural features); the deprecated `landuse=reservoir` and `basin` are land use */
    natural: boolean;
}

export type WaterFeatureKind = 'weir' | 'dam' | 'lock_gate' | 'waterfall' | 'rapids' | 'gate' | 'screen' | 'lip';

export interface WaterFeature {
    key: string;
    id: string;
    kind: WaterFeatureKind;
    points: Vec2[];
    closed: boolean;
}

export interface WaterGeometry {
    channels: WaterChannel[];
    /** watercourses whose whole length runs through water mapped as an area (the area is drawn for them) */
    inAreas: string[];
    areas: WaterArea[];
    features: WaterFeature[];
}

const no = (value: string | undefined) => !value || value === 'no';

/** Water that is not there all year (wiki: Key:intermittent, Key:seasonal) */
const intermittentOf = (tags: Tags) => tags.intermittent === 'yes' || (!no(tags.seasonal) && tags.seasonal !== 'no');

/**
 * Whether an area is water: `natural=water` (any `water=*`), and what the wiki has replaced but is still mapped:
 * `waterway=riverbank`, `landuse=reservoir` and `landuse=basin` (now `natural=water` + `water=river`, `reservoir`,
 * `basin`); a dock (`waterway=dock`) is water too
 */
export function waterAreaKind(tags: Tags): string | null {
    if (tags.natural === 'water') return tags.water ?? 'water';
    if (tags.waterway === 'riverbank') return 'river';
    if (tags.waterway === 'dock') return 'dock';
    if (tags.landuse === 'reservoir' || tags.landuse === 'basin') return tags.landuse;
    return null;
}

/** A watercourse's kind, or none for what is not one (or not drawn: `link`, `fairway` and `flowline` are routes over water) */
export function channelKind(tags: Tags): ChannelKind | null {
    const value = tags.waterway ?? '';
    return channelKinds.has(value) ? value as ChannelKind : null;
}

/** The barriers and features in the water, by `waterway=*` value */
const featureKinds: Record<string, WaterFeatureKind> = {
    weir: 'weir', dam: 'dam', lock_gate: 'lock_gate', waterfall: 'waterfall', rapids: 'rapids',
    sluice_gate: 'gate', floodgate: 'gate', security_lock: 'gate', check_dam: 'gate', debris_screen: 'screen'
};

/** Waterway values for the features in the water Lane Studio draws */
export const waterFeatureValues = Object.keys(featureKinds);

function lineLocs(way: osmWay, graph: coreGraph): Vec2[] {
    return way.nodes.map(id => (graph.hasEntity(id) as osmNode | undefined)?.loc as Vec2 | undefined).filter((p): p is Vec2 => !!p);
}

/** A width from `width` or `est_width` in metres */
const tagWidth = (tags: Tags) => parseWidth(tags.width) ?? parseWidth(tags.est_width);

/** A strip of `width` metres centred on a line (in metres), as a closed ring */
function strip(points: Vec2[], width: number, ends: { into?: Vec2; outOf?: Vec2 } = {}): { ring: Vec2[]; left: Vec2[]; right: Vec2[] } {
    const left = offsetPolyline(points, points.map(() => -width / 2), ends);
    const right = offsetPolyline(points, points.map(() => width / 2), ends);
    return { ring: [...left, ...right.slice().reverse()], left, right };
}

/** A bar `thickness` metres thick from `a` to `b` (in metres) */
function bar(a: Vec2, b: Vec2, thickness: number): Vec2[] {
    const n = scale(rightNormal(unit(sub(b, a))), thickness / 2);
    return [add(a, n), add(b, n), sub(b, n), sub(a, n)];
}

/**
 * The direction another watercourse carries on in beyond a way's end (sharing its end node), so the two are cut on
 * the bisector and meet without a notch
 */
function carryOn(way: osmWay, nodeID: string, graph: coreGraph, frame: MetricFrame, atEnd: boolean): Vec2 | undefined {
    const node = graph.hasEntity(nodeID as osmNode['id']) as osmNode | undefined;
    if (!node) return undefined;
    for (const other of graph.parentWays(node) as osmWay[]) {
        if (other.id === way.id || !channelKind(other.tags)) continue;
        const nodes = other.nodes;
        const i = nodes.indexOf(nodeID as osmNode['id']);
        const neighbour = i === 0 ? nodes[1] : i === nodes.length - 1 ? nodes[nodes.length - 2] : undefined;
        const n = neighbour ? graph.hasEntity(neighbour) as osmNode | undefined : undefined;
        if (!n) continue;
        const here = frame.toMetres(node.loc as Vec2);
        const there = frame.toMetres(n.loc as Vec2);
        // (as the way runs: beyond its end the other way leads away, before its start it leads in)
        return atEnd ? unit(sub(there, here)) : unit(sub(here, there));
    }
    return undefined;
}

/**
 * A watercourse at its width, cut into the stretches outside water areas: where the river's own water is mapped as an
 * area, the area is its surface (wiki: Tag:waterway=river: water=river round the centre line)
 */
function channelShapes(way: osmWay, kind: ChannelKind, graph: coreGraph, areas: WaterArea[]): WaterChannel[] {
    const locs = lineLocs(way, graph);
    if (locs.length < 2) return [];
    const frame = metricFrame(locs[0]);
    const points = locs.map(frame.toMetres);
    const width = tagWidth(way.tags) ?? channelWidths[kind];
    const covered = isCovered(way.tags) || kind === 'pressurised';
    // a segment lies in a water area when its middle does (a culvert under an area of water is still drawn)
    // (a multipolygon's rings are its other outers and its inners: inside an odd number of them all is in the water)
    const inArea = (i: number) => !covered && areas.some(area => {
        const mid: Vec2 = [(locs[i][0] + locs[i + 1][0]) / 2, (locs[i][1] + locs[i + 1][1]) / 2];
        return [area.polygon, ...(area.rings ?? [])].filter(ring => pointInPolygon(mid, ring)).length % 2 === 1;
    });
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < locs.length - 1; i++) {
        if (inArea(i)) {
            if (start >= 0) runs.push([start, i]);
            start = -1;
        } else if (start < 0) start = i;
    }
    if (start >= 0) runs.push([start, locs.length - 1]);
    const into = carryOn(way, way.first(), graph, frame, false);
    const outOf = carryOn(way, way.last(), graph, frame, true);
    return runs.map(([a, b], k) => {
        const run = points.slice(a, b + 1);
        const shape = strip(run, width, { into: a === 0 ? into : undefined, outOf: b === points.length - 1 ? outOf : undefined });
        return {
            key: `${way.id}-${k}`, id: way.id, kind, width, covered, intermittent: intermittentOf(way.tags),
            polygon: shape.ring.map(frame.toLoc), banks: [shape.left.map(frame.toLoc), shape.right.map(frame.toLoc)]
        };
    });
}

/**
 * How far the water reaches either side of a point along `across` (metres, in `frame`): to the edges of the water
 * area the point lies in (a lock chamber, a river mapped as an area), so what spans the water meets its banks.
 * Null where it lies in no area.
 */
function reachInArea(loc: Vec2, across: Vec2, frame: MetricFrame, areas: WaterArea[]): [number, number] | null {
    const containing = areas.filter(area => [area.polygon, ...(area.rings ?? [])].filter(ring => pointInPolygon(loc, ring)).length % 2 === 1);
    if (!containing.length) return null;
    const p = frame.toMetres(loc);
    let left = Infinity;
    let right = Infinity;
    for (const area of containing) {
        for (const ring of [area.polygon, ...(area.rings ?? [])]) {
            const points = ring.map(frame.toMetres);
            for (let i = 1; i < points.length; i++) {
                // where the line through p along `across` crosses the edge a→b: p + t·across = a + u·(b − a)
                const a = points[i - 1];
                const e = sub(points[i], a);
                const denom = across[0] * e[1] - across[1] * e[0];
                if (Math.abs(denom) < 1e-9) continue;
                const d = sub(a, p);
                const t = (d[0] * e[1] - d[1] * e[0]) / denom;
                const u = (d[0] * across[1] - d[1] * across[0]) / denom;
                if (u < 0 || u > 1) continue;
                if (t > 0) right = Math.min(right, t);
                else left = Math.min(left, -t);
            }
        }
    }
    return Number.isFinite(left) && Number.isFinite(right) ? [left, right] : null;
}

/** The watercourse through a node, its width and its direction there (downstream: waterways are drawn with the flow) */
function channelAt(node: osmNode, graph: coreGraph, frame: MetricFrame): { width: number; along: Vec2 } | null {
    for (const way of graph.parentWays(node) as osmWay[]) {
        const kind = channelKind(way.tags);
        if (!kind) continue;
        const i = way.nodes.indexOf(node.id);
        const prev = i > 0 ? graph.hasEntity(way.nodes[i - 1]) as osmNode | undefined : undefined;
        const next = i < way.nodes.length - 1 ? graph.hasEntity(way.nodes[i + 1]) as osmNode | undefined : undefined;
        if (!prev && !next) continue;
        const from = frame.toMetres((prev ?? node).loc as Vec2);
        const to = frame.toMetres((next ?? node).loc as Vec2);
        return { width: tagWidth(way.tags) ?? channelWidths[kind], along: unit(sub(to, from)) };
    }
    return null;
}

/**
 * A feature mapped on a node of a watercourse, laid across it (or along it, downstream):
 * - a weir: a sill across the water, white water below it
 * - a waterfall: its lip, and white water below
 * - rapids: white water along the stretch
 * - lock gates: a pair of mitre gates meeting in a V pointing upstream (they close against the higher water)
 * - sluice gates, flood gates, flood barriers, check dams: a gate across the water
 * - a debris screen: a screen across the water
 */
function nodeFeature(node: osmNode, kind: WaterFeatureKind, graph: coreGraph, areas: WaterArea[]): WaterFeature[] {
    const frame = metricFrame(node.loc as Vec2);
    const channel = channelAt(node, graph, frame);
    if (!channel) return [];
    const { along } = channel;
    const across = rightNormal(along);
    // across the water: its width tagged on the node, else to the banks of the area it is in, else the watercourse's
    const tagged = tagWidth(node.tags);
    const reach: [number, number] = tagged !== undefined ? [tagged / 2, tagged / 2]
        : reachInArea(node.loc as Vec2, across, frame, areas) ?? [channel.width / 2, channel.width / 2];
    const w = reach[0] + reach[1];
    // (into the bank a little, where it is built in)
    const side = (k: number, t = 0): Vec2 => add(scale(across, k < 0 ? -(reach[0] + 0.3) : reach[1] + 0.3), scale(along, t));
    const patch = (t0: number, t1: number): Vec2[] => [
        add(scale(across, -reach[0]), scale(along, t0)), add(scale(across, reach[1]), scale(along, t0)),
        add(scale(across, reach[1]), scale(along, t1)), add(scale(across, -reach[0]), scale(along, t1))
    ];
    const out: { kind: WaterFeatureKind; points: Vec2[] }[] = [];
    switch (kind) {
        case 'weir':
            out.push({ kind: 'rapids', points: patch(0.4, 0.4 + Math.max(1.5, w * 0.3)) });
            out.push({ kind: 'weir', points: bar(side(-1), side(1), 0.8) });
            break;
        case 'waterfall':
            out.push({ kind: 'rapids', points: patch(0, Math.max(2, w * 0.5)) });
            out.push({ kind: 'lip', points: bar(side(-1), side(1), 0.3) });
            break;
        case 'rapids':
            out.push({ kind: 'rapids', points: patch(-Math.max(2, w), Math.max(2, w)) });
            break;
        case 'lock_gate': {
            // two leaves from the walls to a point upstream in the middle, at the mitre angle of about 18°
            const apex: Vec2 = add(scale(across, (reach[1] - reach[0]) / 2), scale(along, -w * 0.16));
            out.push({ kind: 'lock_gate', points: bar(side(-1), apex, 0.5) });
            out.push({ kind: 'lock_gate', points: bar(side(1), apex, 0.5) });
            break;
        }
        case 'dam':
            out.push({ kind: 'dam', points: bar(side(-1), side(1), 3) });
            break;
        default:
            out.push({ kind, points: bar(side(-1), side(1), kind === 'screen' ? 0.3 : 0.6) });
    }
    return out.map((shape, i) => ({ key: `${node.id}-${i}`, id: node.id, kind: shape.kind, points: shape.points.map(frame.toLoc), closed: true }));
}

/** Widths in metres of features mapped as lines when no `width` is tagged: a dam's crest, a weir's sill, a gate */
const featureLineWidths: Partial<Record<WaterFeatureKind, number>> = { dam: 4, weir: 1, lock_gate: 0.5, gate: 0.6, screen: 0.3, rapids: 5 };

/** A feature mapped as a line (a dam's crest, a weir or gate across a river mapped as an area, rapids along a stretch) */
function lineFeature(way: osmWay, kind: WaterFeatureKind, graph: coreGraph): WaterFeature[] {
    const locs = lineLocs(way, graph);
    if (locs.length < 2) return [];
    const frame = metricFrame(locs[0]);
    const width = tagWidth(way.tags) ?? featureLineWidths[kind] ?? 1;
    const shape = strip(locs.map(frame.toMetres), width);
    return [{ key: way.id, id: way.id, kind, points: shape.ring.map(frame.toLoc), closed: true }];
}

/** Water and what stands in it, for the entities in view */
export function waterGeometry(entities: OsmEntity[], graph: coreGraph): WaterGeometry {
    const out: WaterGeometry = { channels: [], inAreas: [], areas: [], features: [] };

    // areas first: watercourses are left out where an area is their water
    for (const entity of entities) {
        const kind = waterAreaKind(entity.tags);
        if (!kind) continue;
        const natural = entity.tags.natural === 'water' || entity.tags.waterway === 'riverbank' || entity.tags.waterway === 'dock';
        const intermittent = intermittentOf(entity.tags);
        if (entity.type === 'way' && (entity as osmWay).isClosed() && (entity as osmWay).nodes.length > 3) {
            out.areas.push({ id: entity.id, kind, polygon: lineLocs(entity as osmWay, graph), intermittent, natural });
        } else if (entity.type === 'relation') {
            const rings = multipolygonRings(entity, graph);
            if (rings) out.areas.push({ id: entity.id, kind, polygon: rings.outer, rings: rings.rings, intermittent, natural });
        }
    }

    for (const entity of entities) {
        const tags = entity.tags;
        const featureKind = featureKinds[tags.waterway ?? ''];
        if (entity.type === 'way') {
            const way = entity as osmWay;
            const kind = channelKind(tags);
            if (kind) {
                const shapes = channelShapes(way, kind, graph, out.areas);
                if (shapes.length) out.channels.push(...shapes);
                else if (way.nodes.length > 1) out.inAreas.push(way.id);
            } else if (featureKind) {
                // a dam, gate or rapids mapped as an area: its outline
                if (way.isClosed() && way.nodes.length > 3 && (featureKind === 'dam' || featureKind === 'rapids' || featureKind === 'gate')) {
                    out.features.push({ key: way.id, id: way.id, kind: featureKind, points: lineLocs(way, graph), closed: true });
                } else {
                    out.features.push(...lineFeature(way, featureKind, graph));
                }
            }
        } else if (entity.type === 'node' && featureKind) {
            out.features.push(...nodeFeature(entity as osmNode, featureKind, graph, out.areas));
        }
    }
    return out;
}
