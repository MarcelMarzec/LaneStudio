import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import type { Vec2 } from '../../geo/vector';
import { metricFrame, pointAlong, polylineLength } from '../geometry/frame';
import { offsetFromWay } from '../geometry/measure';
import { builtHighway } from './roads';
import { laneDriveSide } from './drive_side';
import { laneOneway } from '../model/parse';

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
 * Whether a side of the road has a hard shoulder: `shoulder:<side>`, `shoulder:both`, or
 * `shoulder=yes/left/right/both/no`. A plain `yes` is on `oneSide` when given (a one-way road's
 * driving side), else on both sides (wiki: Key:shoulder).
 */
export function shoulderValue(tags: Tags, side: Side, oneSide: Side | null = null): 'yes' | 'no' | undefined {
    const specific = tags[`shoulder:${side}`] ?? tags['shoulder:both'];
    if (specific) return specific === 'no' ? 'no' : 'yes';
    const plain = tags.shoulder;
    if (!plain) return undefined;
    if (plain === 'no') return 'no';
    if (plain === 'both') return 'yes';
    if (plain === 'left' || plain === 'right') return plain === side ? 'yes' : 'no';
    return oneSide && oneSide !== side ? 'no' : 'yes';
}

/**
 * Whether a side of the road is drawn with a hard shoulder the tags don't mention: a motorway has one on the driving
 * side of a one-way carriageway (`oneSide`), or both sides of a two-way one (wiki: Key:active_traffic_management, Motorways
 * are presumed to have one), unless that side is tagged or a lane is the running hard shoulder (`runningShoulder`)
 */
export function assumedShoulder(tags: Tags, side: Side, oneSide: Side | null, runningShoulder: boolean): boolean {
    return builtHighway(tags) === 'motorway' && !runningShoulder && shoulderValue(tags, side, oneSide) === undefined &&
        (!oneSide || oneSide === side);
}

/** Sets one side's shoulder, written as `shoulder=left/right/both/no`; `undefined` leaves that side untagged */
export function withShoulder(tags: Tags, side: Side, value: 'yes' | 'no' | undefined, oneSide: Side | null = null): Tags {
    const values: Record<Side, 'yes' | 'no' | undefined> = {
        left: shoulderValue(tags, 'left', oneSide),
        right: shoulderValue(tags, 'right', oneSide)
    };
    values[side] = value;
    const next = { ...tags };
    for (const key of ['shoulder', 'shoulder:both', 'shoulder:left', 'shoulder:right']) delete next[key];
    const { left, right } = values;
    if (left === 'yes' && right === 'yes') next.shoulder = 'both';
    else if (left === 'yes') next.shoulder = 'left';
    else if (right === 'yes') next.shoulder = 'right';
    else if (left === 'no' && right === 'no') next.shoulder = 'no';
    else if (left === 'no' || right === 'no') next[`shoulder:${left === 'no' ? 'left' : 'right'}`] = 'no';
    return next;
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

/** The old values for a cycle lane or track against the flow of a one-way road (wiki: Key:cycleway, deprecated) */
export const oldContraflowCycleways = ['opposite_lane', 'opposite_track', 'opposite', 'opposite_share_busway'];

/**
 * The side of a one-way road its contraflow cycles keep to: the side traffic going the other way would use (the way's
 * left where traffic drives on the right and the road is one-way along the way). `null` on a two-way road.
 */
export function contraflowSide(oneway: 'forward' | 'backward' | false, driveSide: Side): Side | null {
    if (!oneway) return null;
    return (driveSide === 'right') === (oneway === 'forward') ? 'left' : 'right';
}

/**
 * One side's cycleway value, from `cycleway:<side>`, `cycleway:both` or plain `cycleway`. A plain `opposite_*` value on
 * a one-way road is one contraflow lane or track, on `contraflow`'s side only.
 */
export function cyclewayValue(tags: Tags, side: Side, contraflow: Side | null = null): string | undefined {
    const specific = tags[`cycleway:${side}`] ?? tags['cycleway:both'];
    if (specific) return specific;
    const plain = tags.cycleway;
    if (plain && contraflow && oldContraflowCycleways.includes(plain)) return side === contraflow ? plain : undefined;
    return plain;
}

/** A side's cycle lane or track width, from `cycleway:<side>:width`, `cycleway:both:width` or `cycleway:width` */
export function cyclewayWidth(tags: Tags, side: Side): number | undefined {
    const value = tags[`cycleway:${side}:width`] ?? tags['cycleway:both:width'] ?? tags['cycleway:width'];
    const m = value?.trim().match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/);
    return m ? parseFloat(m[1]) : undefined;
}

/** The side of a one-way road its contraflow cycles keep to, or `null` on a two-way road */
export function roadContraflowSide(road: osmWay, graph: coreGraph): Side | null {
    return contraflowSide(laneOneway(road.tags), laneDriveSide(road, graph));
}

/**
 * One side's bus lane in the old scheme (`busway:<side>`, `busway:both`, or plain `busway` on both sides of a two-way
 * road, on the nearside `oneSide` of a one-way road, its contraflow side for `opposite_lane`; wiki: Key:busway). Not on
 * a busway, where `busway=*` says what kind of busway it is.
 */
export function busValue(tags: Tags, side: Side, oneSide: Side | null, contraflow: Side | null): string | undefined {
    if (builtHighway(tags) === 'busway') return undefined;
    const specific = tags[`busway:${side}`] ?? tags['busway:both'];
    if (specific) return specific;
    const plain = tags.busway;
    if (!plain) return undefined;
    if (plain === 'opposite_lane') return contraflow === side ? plain : undefined;
    return !oneSide || oneSide === side ? plain : undefined;
}

/** Whether a road still uses the old `opposite_*` cycleway values */
export function hasOldCycleways(tags: Tags): boolean {
    return ['cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right'].some(key => oldContraflowCycleways.includes(tags[key] ?? ''));
}

/**
 * Rewrites the old `opposite_*` cycleway values in the current scheme: a contraflow lane or track becomes
 * `cycleway:<side>=lane|track` with `cycleway:<side>:oneway=-1`, `opposite_share_busway` `share_busway`, and every one
 * of them (`opposite` alone, with no lane) says cycles may ride both ways, `oneway:bicycle=no`
 */
export function upgradeOldCycleways(tags: Tags, contraflow: Side | null): Tags {
    const next = { ...tags };
    const current = (key: string) => oldContraflowCycleways.includes(tags[key] ?? '');
    const renamed: Record<string, string | undefined> = {
        opposite_lane: 'lane', opposite_track: 'track', opposite_share_busway: 'share_busway', opposite: undefined
    };
    let changed = false;
    const sides: Side[] = [];
    for (const side of ['left', 'right'] as const) {
        const value = cyclewayValue(tags, side, contraflow);
        if (value && oldContraflowCycleways.includes(value)) {
            sides.push(side);
            const to = renamed[value];
            if (to) {
                next[`cycleway:${side}`] = to;
                next[`cycleway:${side}:oneway`] = '-1';
            } else {
                next[`cycleway:${side}`] = 'no';
            }
            changed = true;
        }
    }
    if (!changed) return tags;
    // the old values the sides were read from go; what the other side had stays on that side
    for (const key of ['cycleway', 'cycleway:both']) {
        if (!tags[key]) continue;
        const value = tags[key]!;
        delete next[key];
        if (!current(key)) {
            for (const side of ['left', 'right'] as const) if (!sides.includes(side) && !tags[`cycleway:${side}`]) next[`cycleway:${side}`] = value;
        }
    }
    if (tags.oneway && tags.oneway !== 'no') next['oneway:bicycle'] = 'no';
    return next;
}

/** Sets one side's cycleway, writing both sides in the side-specific scheme */
export function withCycleway(tags: Tags, side: Side, value: string | undefined, contraflow: Side | null = null): Tags {
    const values: Record<Side, string | undefined> = {
        left: cyclewayValue(tags, 'left', contraflow),
        right: cyclewayValue(tags, 'right', contraflow)
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
