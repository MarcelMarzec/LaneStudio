import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { isLaneRoad } from '../core/roads';
import { add, cumulativeLengths, metricFrame, rightNormal, scale, sub, unit } from './frame';
import { cachedLayout } from './road_geometry';

/*
 * Road numbers in shields and motorway junction numbers (wiki: Key:ref, Tag:highway=motorway_junction).
 */

/** How a road number is signed in the UK: motorways blue, primary routes green, other A and B roads white */
export type ShieldStyle = 'motorway' | 'primary' | 'other';

export interface ShieldRef {
    text: string;
    style: ShieldStyle;
}

/** Roads that carry shields: links and minor roads do not */
const shieldHighways = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);

/** A UK road number: `M6`, `A1(M)`, `A46`, `B5004` */
const ukRef = /^(?:M\d+|A\d+\(M\)|A\d+|B\d+)$/;

/** The shield-worthy road numbers on a road, in the order tagged (`ref=A46;A1` gives two) */
export function shieldRefs(tags: Tags): ShieldRef[] {
    if (!shieldHighways.has(tags.highway ?? '') || !tags.ref) return [];
    return tags.ref.split(';').map(v => v.trim().replace(/\s+/g, '')).filter(v => ukRef.test(v)).map(text => ({
        text,
        style: text.startsWith('M') || text.endsWith('(M)') ? 'motorway'
            // primary routes are mapped as trunk roads in the UK, and signed green
            : text.startsWith('A') && tags.highway === 'trunk' ? 'primary'
                : 'other'
    }));
}

export interface JunctionLabel {
    nodeID: string;
    /** where the label stands: beside the road, on the side the slip road leaves */
    anchor: Vec2;
    ref?: string;
    name?: string;
}

/**
 * Motorway junctions (`highway=motorway_junction`) with their number (`ref`) and name, placed beside
 * the main road on the side its slip road leaves, or the side traffic keeps to when there is none
 */
export function junctionLabels(entities: OsmEntity[], graph: coreGraph): JunctionLabel[] {
    const out: JunctionLabel[] = [];
    for (const entity of entities) {
        if (entity.type !== 'node' || entity.tags.highway !== 'motorway_junction') continue;
        const node = entity as osmNode;
        const ref = node.tags['junction:ref'] ?? node.tags.ref;
        const name = node.tags.name;
        if (!ref && !name) continue;

        const parents = graph.parentWays(node) as osmWay[];
        const road = parents.find(w => isLaneRoad(w) && !/_link$/.test(w.tags.highway ?? ''));
        if (!road) {
            out.push({ nodeID: node.id, anchor: node.loc, ref, name });
            continue;
        }
        const frame = metricFrame(node.loc);
        const i = road.nodes.indexOf(node.id);
        const points = road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
        const along = unit(sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));

        // the side the slip road leaves on, else the side traffic keeps to
        let wayLeft: boolean;
        const link = parents.find(w => w !== road && /_link$/.test(w.tags.highway ?? '') && w.first() === node.id);
        if (link) {
            const next = frame.toMetres((graph.entity(link.nodes[1]) as osmNode).loc);
            wayLeft = along[0] * next[1] - along[1] * next[0] > 0;
        } else {
            wayLeft = laneDriveSide(road, graph) === 'left';
        }

        const layout = cachedLayout(road, graph);
        const total = cumulativeLengths(points);
        const t = total[total.length - 1] ? total[i] / total[total.length - 1] : 0;
        const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t;
        const side = wayLeft ? 'left' : 'right';
        const verge = layout.roadside[side].reduce((sum, strip) => sum + strip.width, 0);
        const edge = (wayLeft ? layout.edges[0] : layout.edges[layout.edges.length - 1]) + shift;
        const across = edge + (wayLeft ? -1 : 1) * (verge + 3);
        out.push({ nodeID: node.id, anchor: frame.toLoc(add([0, 0], scale(rightNormal(along), across))), ref, name });
    }
    return out;
}


export interface ShieldPlacement {
    key: string;
    wayID: string;
    /** screen position */
    point: Vec2;
    refs: ShieldRef[];
}

/**
 * Where shields go on screen: along each numbered road every ~900 px (one in the middle of a short
 * one), keeping shields of the same number `spacing` px apart, so a dual carriageway or a road split
 * into many ways still gets few shields. Candidates are taken in a fixed order, so they hold still
 * while the map pans.
 */
export function placeShields(ways: osmWay[], graph: coreGraph, project: (loc: Vec2) => Vec2,
    view: { width: number; height: number }, spacing = 900): ShieldPlacement[] {
    const candidates: (ShieldPlacement & { order: string })[] = [];
    for (const way of ways) {
        const refs = shieldRefs(way.tags);
        if (!refs.length) continue;
        const points = way.nodes.map(id => project((graph.entity(id) as osmNode).loc));
        const cumulative = cumulativeLengths(points);
        const length = cumulative[cumulative.length - 1];
        if (length < 120) continue;
        const stations = length < spacing ? [length / 2] : Array.from({ length: Math.floor((length - spacing / 2) / spacing) + 1 }, (_, k) => spacing / 2 + k * spacing);
        stations.forEach((s, k) => {
            let i = 1;
            while (i < cumulative.length - 1 && cumulative[i] < s) i++;
            const a = points[i - 1];
            const b = points[i];
            const f = (s - cumulative[i - 1]) / ((cumulative[i] - cumulative[i - 1]) || 1);
            const point: Vec2 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
            if (point[0] < -50 || point[1] < -50 || point[0] > view.width + 50 || point[1] > view.height + 50) return;
            candidates.push({ key: `${way.id}-${k}`, wayID: way.id, point, refs, order: `${way.id.length}${way.id}-${String(k).padStart(4, '0')}` });
        });
    }
    candidates.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));

    const placed: ShieldPlacement[] = [];
    const label = (p: ShieldPlacement) => p.refs.map(r => r.text).join(';');
    for (const c of candidates) {
        const clash = placed.some(p => {
            const d = Math.hypot(p.point[0] - c.point[0], p.point[1] - c.point[1]);
            return d < 60 || (d < spacing && label(p) === label(c));
        });
        if (!clash) placed.push({ key: c.key, wayID: c.wayID, point: c.point, refs: c.refs });
    }
    return placed;
}
