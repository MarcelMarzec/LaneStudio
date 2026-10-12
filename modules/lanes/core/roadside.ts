import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import type { Vec2 } from '../../geo/vector';
import { metricFrame, pointAlong, polylineLength } from '../geometry/frame';
import { offsetFromWay } from '../geometry/measure';

export type Side = 'left' | 'right';

export interface ParallelWay {
    way: osmWay;
    /** median distance from the road's centre line in metres (left negative, right positive) */
    offset: number;
}

/** Points every few metres along a way, so short two-node ways are measured along their length */
function samples(way: osmWay, graph: coreGraph): Vec2[] {
    const nodes = way.nodes.map(id => graph.hasEntity(id) as osmNode | undefined).filter((n): n is osmNode => !!n);
    if (nodes.length < 2) return [];
    const frame = metricFrame(nodes[0].loc);
    const points = nodes.map(n => frame.toMetres(n.loc));
    const length = polylineLength(points);
    const step = Math.max(2, length / 40);
    const result: Vec2[] = [];
    for (let s = 0; s <= length; s += step) result.push(frame.toLoc(pointAlong(points, s).point));
    return result;
}


/**
 * Ways that run alongside `road` (mostly within `maxOffset` metres, not crossing it),
 * split by the side of the road they are on. Used to find separately mapped pavements and kerbs.
 */
export function parallelWays(road: osmWay, graph: coreGraph, candidates: OsmEntity[],
    test: (way: osmWay) => boolean, minOffset = 1.5, maxOffset = 20): Record<Side, ParallelWay[]> {

    const result: Record<Side, ParallelWay[]> = { left: [], right: [] };
    for (const entity of candidates) {
        if (entity.type !== 'way' || entity.id === road.id) continue;
        const way = entity as osmWay;
        if (!test(way)) continue;

        const offsets: number[] = [];
        for (const loc of samples(way, graph)) {
            const at = offsetFromWay(road, graph, loc);
            // ignore the parts of the candidate beyond the road's ends
            if (at.along <= 0.5 || at.along >= at.total - 0.5) continue;
            offsets.push(at.offset);
        }
        if (offsets.length < 2) continue;
        offsets.sort((a, b) => a - b);
        const median = offsets[Math.floor(offsets.length / 2)];
        const sameSide = offsets.every(o => Math.sign(o) === Math.sign(median));
        if (!sameSide || Math.abs(median) < minOffset || Math.abs(median) > maxOffset) continue;
        result[median < 0 ? 'left' : 'right'].push({ way, offset: median });
    }
    for (const side of ['left', 'right'] as const) {
        result[side].sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset));
    }
    return result;
}

export const isSidewalkWay = (way: osmWay) =>
    way.tags.footway === 'sidewalk' || way.tags.path === 'sidewalk' ||
    (way.tags.highway === 'footway' && !way.tags.footway);

export const isKerbWay = (way: osmWay) => way.tags.barrier === 'kerb';


/** A road side's `sidewalk` value: from `sidewalk:<side>`, `sidewalk:both` or plain `sidewalk` */
export function sidewalkValue(tags: Tags, side: Side): string | undefined {
    const specific = tags[`sidewalk:${side}`] ?? tags['sidewalk:both'];
    if (specific) return specific;
    const plain = tags.sidewalk;
    if (!plain) return undefined;
    if (plain === 'both') return 'yes';
    if (plain === 'left' || plain === 'right') return plain === side ? 'yes' : 'no';
    if (plain === 'none') return 'no';
    return plain;   // no, separate, lane, …
}

/**
 * Sets one side's `sidewalk` value and writes both sides in the side-specific scheme
 * (`sidewalk:both` when they match), replacing plain `sidewalk=*`. `undefined` removes the side.
 */
export function withSidewalk(tags: Tags, side: Side, value: string | undefined): Tags {
    const values: Record<Side, string | undefined> = {
        left: sidewalkValue(tags, 'left'),
        right: sidewalkValue(tags, 'right')
    };
    values[side] = value;
    const next = { ...tags };
    delete next.sidewalk;
    delete next['sidewalk:both'];
    delete next['sidewalk:left'];
    delete next['sidewalk:right'];
    if (values.left && values.left === values.right) {
        next['sidewalk:both'] = values.left;
    } else {
        if (values.left) next['sidewalk:left'] = values.left;
        if (values.right) next['sidewalk:right'] = values.right;
    }
    return next;
}

/** One side's cycleway value, from `cycleway:<side>`, `cycleway:both` or plain `cycleway` */
export function cyclewayValue(tags: Tags, side: Side): string | undefined {
    return tags[`cycleway:${side}`] ?? tags['cycleway:both'] ?? tags.cycleway;
}

/** Sets one side's cycleway, writing both sides in the side-specific scheme */
export function withCycleway(tags: Tags, side: Side, value: string | undefined): Tags {
    const values: Record<Side, string | undefined> = {
        left: cyclewayValue(tags, 'left'),
        right: cyclewayValue(tags, 'right')
    };
    values[side] = value;
    const next = { ...tags };
    delete next.cycleway;
    delete next['cycleway:both'];
    delete next['cycleway:left'];
    delete next['cycleway:right'];
    if (values.left && values.left === values.right) {
        next['cycleway:both'] = values.left;
    } else {
        if (values.left) next['cycleway:left'] = values.left;
        if (values.right) next['cycleway:right'] = values.right;
    }
    return next;
}


/** One side's on-street parking (`parking:<side>=lane|street_side|…`, the current parking scheme) */
export function parkingValue(tags: Tags, side: Side): string | undefined {
    return tags[`parking:${side}`] ?? tags['parking:both'];
}

/** Sets one side's parking, writing `parking:both` when both sides match */
export function withParking(tags: Tags, side: Side, value: string | undefined): Tags {
    const values: Record<Side, string | undefined> = { left: parkingValue(tags, 'left'), right: parkingValue(tags, 'right') };
    values[side] = value;
    const next = { ...tags };
    delete next['parking:both'];
    delete next['parking:left'];
    delete next['parking:right'];
    if (values.left && values.left === values.right) {
        next['parking:both'] = values.left;
    } else {
        if (values.left) next['parking:left'] = values.left;
        if (values.right) next['parking:right'] = values.right;
    }
    return next;
}
