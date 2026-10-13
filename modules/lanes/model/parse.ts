import { parseLaneTagKey, splitLaneValue } from './keys';
import { laneRefsInWayOrder } from './order';
import {
    laneDirections,
    type DriveSide, type Lane, type LaneDirection, type LaneIssue, type LaneKey,
    type LaneModel, type LaneOneway
} from './types';
import { builtHighway } from '../core/roads';

export interface ParseLanesOptions {
    /** from `countryCoder.driveSide(loc)`; defaults to right-hand traffic */
    driveSide?: DriveSide;
}

type Variant = LaneDirection | 'all';

interface KeyGroup {
    conditional: boolean;
    variants: Partial<Record<Variant, { tagKey: string; slots: string[] }>>;
}

// Two-way roads where the wiki's default is a single lane shared by both directions
const sharedSingleLaneHighways = new Set(['service', 'track']);


/** The direction(s) lanes run in, following iD's oneway rules (`oneway=*`, roundabouts, motorways) */
export function laneOneway(tags: Tags): LaneOneway {
    const oneway = tags.oneway;
    if (oneway === 'no') return false;
    if (oneway === '-1' || oneway === 'reverse') return 'backward';
    if (oneway === 'yes' || oneway === 'true' || oneway === '1' ||
        oneway === 'alternating' || oneway === 'reversible') return 'forward';
    if (tags.junction === 'roundabout' || tags.junction === 'circular') return 'forward';
    if (builtHighway(tags) === 'motorway') return 'forward';
    return false;
}


function parseCount(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    return /^\d+$/.test(value.trim()) ? parseInt(value, 10) : NaN;
}


function groupLaneKeys(tags: Tags): Map<string, KeyGroup> {
    const groups = new Map<string, KeyGroup>();
    for (const [tagKey, value] of Object.entries(tags)) {
        if (value === undefined) continue;
        const parsed = parseLaneTagKey(tagKey);
        if (!parsed) continue;
        let group = groups.get(parsed.id);
        if (!group) {
            group = { conditional: parsed.conditional, variants: {} };
            groups.set(parsed.id, group);
        }
        group.variants[parsed.direction ?? 'all'] = { tagKey, slots: splitLaneValue(value) };
    }
    return groups;
}


function maxSlots(groups: Map<string, KeyGroup>, variant: Variant): number | undefined {
    let max: number | undefined;
    for (const group of groups.values()) {
        if (group.conditional) continue;
        const v = group.variants[variant];
        if (v) max = Math.max(max ?? 0, v.slots.length);
    }
    return max;
}


/** Works out how many lanes each direction has, and how sure we are */
function laneCounts(tags: Tags, oneway: LaneOneway, groups: Map<string, KeyGroup>, issues: LaneIssue[]) {
    const counts: Record<LaneDirection, number> = { forward: 0, backward: 0, both_ways: 0 };
    let source: LaneModel['countSource'] = 'tagged';

    let total = parseCount(tags.lanes);
    // lanes=0 is not a lane count: roads without markings use lane_markings=no instead
    if (total === 0) total = NaN;
    if (Number.isNaN(total)) {
        issues.push({ code: 'invalid_lane_count', key: 'lanes' });
        total = undefined;
    }

    if (oneway) {
        let n = total;
        if (n === undefined) {
            n = maxSlots(groups, 'all') ?? maxSlots(groups, oneway);
            source = n === undefined ? 'assumed' : 'inferred';
        }
        counts[oneway] = n ?? 1;
        return { counts, source };
    }

    let forward = parseCount(tags['lanes:forward']);
    let backward = parseCount(tags['lanes:backward']);
    let both = parseCount(tags['lanes:both_ways']);
    for (const [key, n] of [['lanes:forward', forward], ['lanes:backward', backward], ['lanes:both_ways', both]] as const) {
        if (Number.isNaN(n)) issues.push({ code: 'invalid_lane_count', key });
    }
    if (Number.isNaN(forward)) forward = undefined;
    if (Number.isNaN(backward)) backward = undefined;
    if (Number.isNaN(both)) both = undefined;

    // fall back to the value counts of directional keys
    if (forward === undefined && backward === undefined && both === undefined && total === undefined) {
        const f = maxSlots(groups, 'forward');
        const b = maxSlots(groups, 'backward');
        const bw = maxSlots(groups, 'both_ways');
        const all = maxSlots(groups, 'all');
        if (f !== undefined || b !== undefined) {
            forward = f ?? 0;
            backward = b ?? 0;
            both = bw ?? 0;
            source = 'inferred';
        } else if (all !== undefined) {
            total = all;
            source = 'inferred';
        }
    }
    both = both ?? 0;

    if (forward === undefined || backward === undefined) {
        if (total !== undefined) {
            const known = (forward ?? 0) + (backward ?? 0) + both;
            if (forward !== undefined || backward !== undefined) {
                // one direction is tagged: the other gets the rest
                const rest = Math.max(0, total - known);
                if (forward === undefined) forward = rest;
                else backward = rest;
            } else {
                const f = maxSlots(groups, 'forward');
                const b = maxSlots(groups, 'backward');
                const rest = Math.max(0, total - both);
                if (f !== undefined && f <= rest) {
                    forward = f;
                    backward = rest - f;
                } else if (b !== undefined && b <= rest) {
                    backward = b;
                    forward = rest - b;
                } else if (total === 1 && both === 0) {
                    // a single lane shared by both directions
                    forward = 0;
                    backward = 0;
                    both = 1;
                } else {
                    forward = Math.ceil(rest / 2);
                    backward = Math.floor(rest / 2);
                    if (rest % 2 === 1) issues.push({ code: 'ambiguous_direction_counts', key: 'lanes' });
                }
                if (source === 'tagged') source = 'inferred';
            }
        } else {
            // nothing tagged at all: the wiki's defaults, for display only
            source = 'assumed';
            if (forward === undefined && backward === undefined && sharedSingleLaneHighways.has(builtHighway(tags) ?? '')) {
                forward = 0;
                backward = 0;
                both = 1;
            } else {
                forward = forward ?? 1;
                backward = backward ?? 1;
            }
        }
    }

    forward = forward ?? 0;
    backward = backward ?? 0;
    if (total !== undefined && total !== forward + backward + both) {
        issues.push({ code: 'direction_counts_mismatch', key: 'lanes', expected: total, actual: forward + backward + both });
    }

    counts.forward = forward;
    counts.backward = backward;
    counts.both_ways = both;
    return { counts, source };
}


/**
 * Reads a way's tags into a lane model.
 * Every `*:lanes` key is kept, including ones Lane Studio has no special UI for,
 * so that `serialiseLanes(parseLanes(tags), tags)` gives back exactly `tags`.
 */
export function parseLanes(tags: Tags, options: ParseLanesOptions = {}): LaneModel {
    const oneway = laneOneway(tags);
    const issues: LaneIssue[] = [];
    const groups = groupLaneKeys(tags);
    const { counts, source } = laneCounts(tags, oneway, groups, issues);

    const lanes = {} as Record<LaneDirection, Lane[]>;
    for (const direction of laneDirections) {
        lanes[direction] = Array.from({ length: counts[direction] }, () => ({ values: {} }));
    }

    const model: LaneModel = {
        oneway,
        driveSide: options.driveSide ?? 'right',
        lanes,
        keys: {},
        countSource: source,
        issues,
        touchedKeys: [],
        countsTouched: false
    };

    for (const [id, group] of groups) {
        const tagKeys: LaneKey['tagKeys'] = {};
        for (const [variant, v] of Object.entries(group.variants)) {
            tagKeys[variant as Variant] = v!.tagKey;
        }
        const variants = group.variants;
        const hasDirectional = laneDirections.some(d => variants[d]);
        const key: LaneKey = {
            id,
            style: oneway ? 'oneway' : (hasDirectional ? 'directional' : 'combined'),
            readonly: group.conditional,
            tagKeys
        };
        model.keys[id] = key;
        if (key.readonly) continue;

        if (oneway) {
            const v = variants.all ?? variants[oneway];
            const others = laneDirections.filter(d => d !== oneway && variants[d]);
            if (!v || (variants.all && variants[oneway]) || others.length) {
                issues.push({ code: 'mixed_key_styles', key: id });
                key.readonly = true;
                continue;
            }
            if (v.slots.length !== counts[oneway]) {
                issues.push({ code: 'count_mismatch', key: id, direction: oneway, expected: counts[oneway], actual: v.slots.length });
                key.readonly = true;
                continue;
            }
            lanes[oneway].forEach((lane, i) => lane.values[id] = v.slots[i]);

        } else if (hasDirectional) {
            if (variants.all) {
                issues.push({ code: 'mixed_key_styles', key: id });
                key.readonly = true;
                continue;
            }
            const mismatched = laneDirections.filter(d => variants[d] && variants[d]!.slots.length !== counts[d]);
            if (mismatched.length) {
                for (const d of mismatched) {
                    issues.push({ code: 'count_mismatch', key: id, direction: d, expected: counts[d], actual: variants[d]!.slots.length });
                }
                key.readonly = true;
                continue;
            }
            for (const d of laneDirections) {
                const v = variants[d];
                if (v) lanes[d].forEach((lane, i) => lane.values[id] = v.slots[i]);
            }

        } else {
            const v = variants.all!;
            const refs = laneRefsInWayOrder(model);
            if (v.slots.length !== refs.length) {
                issues.push({ code: 'count_mismatch', key: id, expected: refs.length, actual: v.slots.length });
                key.readonly = true;
                continue;
            }
            refs.forEach((ref, i) => lanes[ref.direction][ref.index].values[id] = v.slots[i]);
        }
    }

    return model;
}
