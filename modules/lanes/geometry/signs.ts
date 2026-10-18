import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { isLaneRoad } from '../core/roads';
import { add, metricFrame, rightNormal, scale, sub, unit, cumulativeLengths, slicePolyline } from './frame';
import { cachedLayout } from './road_geometry';

/*
 * Traffic signs (wiki: Key:traffic_sign), variable message signs (Tag:traffic_sign=variable_message)
 * on their gantries (man_made=gantry), and enforcement cameras (Tag:highway=speed_camera,
 * Relation:enforcement): where each stands, which way it faces, and what it shows.
 */

/** One sign on a post: its code as tagged (`GB:670`), and a value given with it (`40` from `GB:670[40]`) */
export interface SignFace {
    code: string;
    value?: string;
}

export type SignKind = 'sign' | 'message' | 'camera';
export type CameraKind = 'speed' | 'average_speed' | 'red_light' | 'other';

export interface SignShape {
    key: string;
    nodeID: string;
    kind: SignKind;
    /** where the sign stands (lon/lat) */
    anchor: Vec2;
    /** the way the sign faces, as a bearing in degrees clockwise from north; null when not known */
    facing: number | null;
    faces: SignFace[];
    /** on a gantry over the road: drawn without a post */
    overhead: boolean;
    camera?: CameraKind;
}

export interface GantryShape {
    id: string;
    line: Vec2[];
}

/** The stretch of road an average-speed camera system covers */
export interface EnforcementSection {
    key: string;
    relationID: string;
    line: Vec2[];
    /** the section's ends, where the from and to markers go */
    ends: Vec2[];
}

export interface SignGeometry {
    signs: SignShape[];
    gantries: GantryShape[];
    sections: EnforcementSection[];
}


/* ---------- tag values ---------- */

/**
 * The signs in a `traffic_sign=*` value: several are separated by `;` or `,`, a country prefix is
 * given once for those that follow it (`GB:616,954`), and a sign's own value is in brackets
 * (`GB:670[40]`).
 */
export function parseTrafficSign(value: string | undefined): SignFace[] {
    if (!value || value === 'no' || value === 'none') return [];
    const faces: SignFace[] = [];
    let prefix = '';
    for (const raw of value.split(/[;,]/)) {
        let part = raw.trim();
        if (!part) continue;
        const colon = part.match(/^([A-Za-z]{2,3}):(.*)$/);
        if (colon) {
            prefix = colon[1].toUpperCase();
            part = colon[2];
        }
        const bracket = part.match(/^(.*?)\[(.*)\]$/);
        const code = (bracket ? bracket[1] : part).trim();
        if (!code) continue;
        faces.push({ code: prefix && /^\d/.test(code) ? `${prefix}:${code}` : code, value: bracket?.[2].trim() || undefined });
    }
    return faces;
}

const cardinals: Record<string, number> = {
    N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
    S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

/** A `direction=*` value as a bearing in degrees (`90`, `E`, `45-90`), or null for none or `forward`/`backward` */
export function bearingOf(value: string | undefined): number | null {
    if (!value) return null;
    const v = value.trim().toUpperCase();
    if (v in cardinals) return cardinals[v];
    const range = v.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (range) {
        const a = parseFloat(range[1]);
        let b = parseFloat(range[2]);
        if (b < a) b += 360;
        return ((a + b) / 2) % 360;
    }
    const n = parseFloat(v);
    return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null;
}

/** The bearing of a direction in metres (x east, y north), in degrees clockwise from north */
const bearingOfVector = (d: Vec2) => ((Math.atan2(d[0], d[1]) * 180 / Math.PI) + 360) % 360;

const isMessageSign = (tags: Tags) => tags.traffic_sign === 'variable_message' || tags.highway === 'variable_message_sign';
const isCamera = (tags: Tags) => tags.highway === 'speed_camera';


/* ---------- placement ---------- */

/** On a road: which travel direction a sign on the road applies to, from its tags */
function roadDirection(tags: Tags): 'forward' | 'backward' | null {
    const value = tags['traffic_sign:direction'] ?? tags.direction;
    return value === 'forward' || value === 'backward' ? value : null;
}

/**
 * Where a sign tagged on a road node stands: at the kerb on the near side of the traffic it is for
 * (the left in left-hand traffic), facing that traffic. Without a direction it stands on the node.
 */
function onRoad(node: osmNode, road: osmWay, graph: coreGraph, direction: 'forward' | 'backward' | null): { anchor: Vec2; facing: number | null } {
    const i = road.nodes.indexOf(node.id);
    const frame = metricFrame(node.loc);
    const points = road.nodes.map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
    const along = unit(sub(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]));
    if (!direction) return { anchor: node.loc, facing: null };
    const travel = direction === 'forward' ? along : scale(along, -1);
    const layout = cachedLayout(road, graph);
    const total = cumulativeLengths(points);
    const t = total[total.length - 1] ? total[i] / total[total.length - 1] : 0;
    const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * t;
    // the near side of that traffic, in the way's frame (right of the way positive)
    const leftHand = laneDriveSide(road, graph) === 'left';
    const nearLeftOfTravel = leftHand;
    const travelLeftIsWayLeft = direction === 'forward';
    const wayLeft = nearLeftOfTravel === travelLeftIsWayLeft;
    const edge = (wayLeft ? layout.edges[0] : layout.edges[layout.edges.length - 1]) + shift;
    const outward = wayLeft ? -1 : 1;
    const anchor = add(scale(rightNormal(along), edge + outward * 0.8), [0, 0]);
    return { anchor: frame.toLoc(anchor), facing: bearingOfVector(scale(travel, -1)) };
}

/** The camera system a camera belongs to, from its enforcement relations */
function cameraKind(node: osmNode, graph: coreGraph): CameraKind {
    for (const relation of graph.parentRelations(node)) {
        if (relation.tags.type !== 'enforcement') continue;
        const enforcement = relation.tags.enforcement;
        if (enforcement === 'average_speed') return 'average_speed';
        if (enforcement === 'traffic_signals') return 'red_light';
        if (enforcement === 'maxspeed' || enforcement === 'mindistance') return 'speed';
        return 'other';
    }
    return node.tags.highway === 'speed_camera' ? 'speed' : 'other';
}

/** The speed limit a camera enforces: its own maxspeed, its relation's, or the road's */
function cameraLimit(node: osmNode, graph: coreGraph, road: osmWay | undefined): string | undefined {
    const own = node.tags.maxspeed;
    if (own) return own;
    for (const relation of graph.parentRelations(node)) {
        if (relation.tags.type === 'enforcement' && relation.tags.maxspeed) return relation.tags.maxspeed;
    }
    return road?.tags.maxspeed;
}

/** The number in a speed value (`30 mph` → `30`) */
export const speedNumber = (value: string | undefined) => value?.match(/\d+/)?.[0];


/* ---------- all of it ---------- */

/** Signs, message signs, cameras, gantries and enforcement sections among `entities` */
export function signGeometry(entities: OsmEntity[], graph: coreGraph): SignGeometry {
    const signs: SignShape[] = [];
    const gantries: GantryShape[] = [];
    const sections: EnforcementSection[] = [];
    const seenRelations = new Set<string>();

    for (const entity of entities) {
        if (entity.type === 'way') {
            const way = entity as osmWay;
            if (way.tags.man_made === 'gantry' && way.nodes.length > 1) {
                gantries.push({ id: way.id, line: way.nodes.map(id => (graph.entity(id) as osmNode).loc) });
            }
            continue;
        }
        if (entity.type !== 'node') continue;
        const node = entity as osmNode;
        const tags = node.tags;
        const message = isMessageSign(tags);
        const camera = isCamera(tags) || graph.parentRelations(node).some(r => r.tags.type === 'enforcement' && r.memberById(node.id)?.role === 'device');
        const faces = message ? [] : parseTrafficSign(tags.traffic_sign ?? tags['traffic_sign:forward'] ?? tags['traffic_sign:backward']);
        if (!message && !camera && !faces.length) continue;

        const parents = graph.parentWays(node);
        const road = parents.find(isLaneRoad) as osmWay | undefined;
        const overhead = parents.some(w => w.tags.man_made === 'gantry');
        let anchor = node.loc;
        let facing = bearingOf(tags.direction ?? tags['camera:direction']);
        if (road && !overhead) {
            const direction = roadDirection(tags) ?? (tags['traffic_sign:forward'] ? 'forward' : tags['traffic_sign:backward'] ? 'backward' : null);
            const placed = onRoad(node, road, graph, direction);
            anchor = placed.anchor;
            facing = placed.facing ?? facing;
        }

        if (camera) {
            const limit = cameraLimit(node, graph, road);
            signs.push({ key: `${node.id}-camera`, nodeID: node.id, kind: 'camera', anchor, facing, overhead, faces: limit ? [{ code: 'maxspeed', value: speedNumber(limit) }] : [], camera: cameraKind(node, graph) });
        } else if (message) {
            signs.push({ key: `${node.id}-message`, nodeID: node.id, kind: 'message', anchor, facing, overhead, faces: [] });
        } else {
            // a speed limit sign without its number takes it from the sign node or the road
            const withValues = faces.map(face => (isSpeedLimit(face.code) && !face.value ? { ...face, value: speedNumber(tags.maxspeed ?? road?.tags.maxspeed) } : face));
            signs.push({ key: `${node.id}-sign`, nodeID: node.id, kind: 'sign', anchor, facing, overhead, faces: withValues });
        }

        // the stretch an average-speed system covers
        for (const relation of graph.parentRelations(node)) {
            if (relation.tags.type !== 'enforcement' || seenRelations.has(relation.id)) continue;
            seenRelations.add(relation.id);
            sections.push(...enforcementSections(relation, graph));
        }
    }
    return { signs, gantries, sections };
}

export const isSpeedLimit = (code: string) => code === 'GB:670' || code === 'maxspeed' || /^[A-Z]{2}:(274|R2-1|C14)$/.test(code);

/** The road an enforcement relation covers: its `section` ways, else the road between its `from` and `to` */
function enforcementSections(relation: osmRelation, graph: coreGraph): EnforcementSection[] {
    const out: EnforcementSection[] = [];
    const nodeLoc = (id: string) => (graph.hasEntity(id as osmNode['id']) as osmNode | undefined)?.loc;
    const sectionWays = relation.members.filter(m => m.type === 'way' && m.role === 'section')
        .map(m => graph.hasEntity(m.id as osmWay['id']) as osmWay | undefined).filter((w): w is osmWay => !!w);
    const from = relation.members.find(m => m.role === 'from' && m.type === 'node');
    const to = relation.members.find(m => m.role === 'to' && m.type === 'node');
    const ends = [from, to].map(m => (m ? nodeLoc(m.id) : undefined)).filter((p): p is Vec2 => !!p);

    if (sectionWays.length) {
        sectionWays.forEach((way, i) => out.push({
            key: `${relation.id}-section-${i}`, relationID: relation.id,
            line: way.nodes.map(id => (graph.entity(id) as osmNode).loc), ends
        }));
        return out;
    }
    if (!from || !to) return out;
    // the from and to on one road: the road between them
    const fromNode = graph.hasEntity(from.id as osmNode['id']) as osmNode | undefined;
    if (!fromNode) return out;
    for (const way of graph.parentWays(fromNode)) {
        const a = way.nodes.indexOf(from.id as osmNode['id']);
        const b = way.nodes.indexOf(to.id as osmNode['id']);
        if (a === -1 || b === -1) continue;
        const frame = metricFrame(fromNode.loc);
        const points = way.nodes.slice(Math.min(a, b), Math.max(a, b) + 1).map(id => frame.toMetres((graph.entity(id) as osmNode).loc));
        const line = slicePolyline(points, 0, cumulativeLengths(points)[points.length - 1]).map(frame.toLoc);
        out.push({ key: `${relation.id}-section`, relationID: relation.id, line, ends });
        break;
    }
    return out;
}
