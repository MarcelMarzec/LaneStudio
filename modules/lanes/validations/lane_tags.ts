import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { validationIssue, validationIssueFix } from '../../core/validation';
import type { CreateValidator, Validator } from '../../core/validation/models';
import type { OsmEntity } from '../../osm';
import { services } from '../../services';
import { utilDisplayLabel } from '../../util/utilDisplayLabel';
import type { coreGraph } from '../../core/graph';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { busValue, contraflowSide, hasOldCycleways, upgradeOldCycleways } from '../core/roadside';
import { laneRoadHighways } from '../core/roads';
import { parseWidth } from '../geometry/layout';
import { laneKindFromValues, setLaneKind, upgradeOldBusway } from '../model/kinds';
import {
    parseLanes, parseLaneTagKey, splitLaneValue, turnValues, laneOneway, laneRefsInWayOrder, parseTurn, serialiseLanes,
    type LaneDirection, type LaneModel
} from '../model';

/** Unambiguous misspellings of `turn` values */
const turnSynonyms: Record<string, string> = {
    straight: 'through', straight_on: 'through', ahead: 'through',
    u_turn: 'reverse', uturn: 'reverse', 'u-turn': 'reverse',
    slightleft: 'slight_left', slightright: 'slight_right', sharpleft: 'sharp_left', sharpright: 'sharp_right'
};

/** Deprecated `change` values and their replacements */
const changeReplacements: Record<string, string> = { only_left: 'not_right', only_right: 'not_left' };

const knownTurns = new Set<string>(turnValues);

/** Rewrites every slot of every key with base `base` through `fix` */
function fixSlots(tags: Tags, base: string, fix: (slot: string) => string): Tags {
    const next = { ...tags };
    for (const [key, value] of Object.entries(tags)) {
        const parsed = parseLaneTagKey(key);
        if (!parsed || parsed.base !== base || parsed.conditional) continue;
        next[key] = splitLaneValue(value).map(fix).join('|');
    }
    return next;
}

/** Turn values that point off the road (a lane with only these, at a road's dead end, turns into nothing) */
const turning = (value: string) => !['through', 'none', 'merge_to_left', 'merge_to_right', 'slide_left', 'slide_right'].includes(value);

/** The lane roads other than `way` that end at a node, and which of their directions leaves it */
function roadsEndingAt(way: osmWay, nodeID: string, graph: coreGraph): { way: osmWay; leaving: LaneDirection }[] {
    return (graph.parentWays(graph.entity(nodeID as never)) as osmWay[])
        .filter(w => w.id !== way.id && laneRoadHighways.has(w.tags.highway ?? '') && (w.first() === nodeID || w.last() === nodeID))
        .map(w => ({ way: w, leaving: w.first() === nodeID ? 'forward' : 'backward' }));
}

/**
 * Lanes whose turn arrows lead nowhere: a lane turning off (not ahead or merging) at an end of the road that no other
 * road or path joins. Returns the directions with such lanes.
 */
export function turnsToNowhere(way: osmWay, model: LaneModel, graph: coreGraph): LaneDirection[] {
    if (way.isClosed()) return [];
    const out: LaneDirection[] = [];
    for (const direction of ['forward', 'backward'] as const) {
        const lanes = model.lanes[direction];
        if (!lanes.some(lane => parseTurn(lane.values['turn:lanes'] ?? '').some(turning))) continue;
        const end = direction === 'forward' ? way.last() : way.first();
        const others = graph.parentWays(graph.entity(end as never)).filter(w => w.id !== way.id && !!w.tags.highway);
        if (!others.length) out.push(direction);
    }
    return out;
}

/**
 * Lanes marked as merging (`merge_to_left`, `merge_to_right`) where the road they lead on to has as many lanes and none
 * merging: the lane never ends. Only where exactly one road carries on. Returns the directions with such lanes.
 */
export function mergesThatNeverEnd(way: osmWay, model: LaneModel, graph: coreGraph): LaneDirection[] {
    if (model.countSource !== 'tagged') return [];
    const out: LaneDirection[] = [];
    for (const direction of ['forward', 'backward'] as const) {
        const lanes = model.lanes[direction];
        const merges = (values: string) => parseTurn(values).some(v => v === 'merge_to_left' || v === 'merge_to_right');
        if (!lanes.some(lane => merges(lane.values['turn:lanes'] ?? ''))) continue;
        const next = roadsEndingAt(way, direction === 'forward' ? way.last() : way.first(), graph);
        if (next.length !== 1) continue;
        const after = parseLanes(next[0].way.tags);
        if (after.countSource !== 'tagged') continue;
        const onward = after.lanes[after.oneway || next[0].leaving];
        if (onward.length >= lanes.length && !onward.some(lane => merges(lane.values['turn:lanes'] ?? ''))) out.push(direction);
    }
    return out;
}

/** How many lanes `lanes:bus` or `lanes:psv` (or their `:forward`, `:backward`) says, against how many are marked */
export function unmarkedBusLanes(tags: Tags, model: LaneModel): { key: string; kind: 'bus' | 'psv'; direction?: LaneDirection; missing: number }[] {
    const out = [];
    for (const kind of ['bus', 'psv'] as const) {
        for (const direction of [undefined, 'forward', 'backward'] as const) {
            const key = `lanes:${kind}${direction ? `:${direction}` : ''}`;
            const n = parseInt(tags[key] ?? '', 10);
            if (!(n > 0)) continue;
            const refs = laneRefsInWayOrder(model).filter(ref => !direction || ref.direction === direction);
            const marked = refs.filter(ref => ['bus', 'psv'].includes(laneKindFromValues(model.lanes[ref.direction][ref.index].values))).length;
            if (marked < n) out.push({ key, kind, direction: direction ?? (model.oneway || undefined), missing: n - marked });
        }
    }
    return out;
}

/** Marks the kerb-side lanes of a direction as bus (or PSV) lanes until `missing` more are marked */
function markKerbsideLanes(model: LaneModel, direction: LaneDirection, kind: 'bus' | 'psv', missing: number): LaneModel {
    let next = model;
    const lanes = next.lanes[direction].map((_, index) => index);
    // a lane's index counts from the driver's left: the kerb side is the start where traffic keeps left
    const order = next.driveSide === 'left' ? lanes : lanes.reverse();
    let left = missing;
    for (const index of order) {
        if (left <= 0) break;
        if (['bus', 'psv'].includes(laneKindFromValues(next.lanes[direction][index].values))) continue;
        next = setLaneKind(next, [{ direction, index }], kind);
        left--;
    }
    return next;
}

/**
 * Lane tagging problems on roads, anywhere on the map (not only in the Lanes section):
 * value counts that do not match the lanes, counts that do not add up, unknown turn values,
 * deprecated values, `hov=lane`, `destination` without a direction on two-way roads, a `width` narrower than its
 * lanes, bus lanes counted (`lanes:bus`) but not marked, the old `opposite_*` cycleway and `busway=lane` values, turn
 * arrows at a dead end and merging lanes that never end.
 * One-click fixes are only offered where the right answer is certain.
 */
export const validationLaneTags: CreateValidator = () => {
    const type = 'lane_tags';

    const issue = (entity: OsmEntity, subtype: string, params: Record<string, string | number>, fix?: () => Tags, hash?: string) =>
        new validationIssue({
            type,
            subtype,
            severity: 'warning',
            message: (context) => {
                const current = context.hasEntity(entity.id);
                return current
                    ? t.append(`_lanes.validation.${subtype}`, { feature: utilDisplayLabel(current, context.graph()), ...params })
                    : '';
            },
            reference: (selection) => {
                selection.selectAll('.issue-reference').data([0]).enter()
                    .append('div').attr('class', 'issue-reference')
                    .call(t.append(`_lanes.validation.${subtype}_reference`, { default: '' }));
            },
            entityIds: [entity.id],
            hash,
            dynamicFixes: () => !fix ? [] : [new validationIssueFix({
                icon: 'iD-icon-apply',
                title: t.append(`_lanes.validation.fix_${subtype}`, params),
                onClick: (context) => {
                    const current = context.hasEntity(entity.id);
                    if (!current) return;
                    context.perform(actionChangeTags(entity.id, fix()), t(`_lanes.validation.fix_${subtype}`, params));
                }
            })]
        });

    const validation: Validator = function checkLaneTags(entity, graph) {
        if (entity.type !== 'way' || !laneRoadHighways.has(entity.tags.highway ?? '')) return [];
        const tags = entity.tags;
        const issues: validationIssue[] = [];
        const way = entity as osmWay;
        const driveSide = graph && way.nodes.every(id => graph.hasEntity(id)) ? laneDriveSide(way, graph) : 'right';
        const model = parseLanes(tags, { driveSide });

        for (const problem of model.issues) {
            if (problem.code === 'key_not_updated') continue;
            if (problem.code === 'invalid_lane_count' && tags[problem.key ?? ''] === '0') {
                issues.push(issue(entity, 'zero_lanes', {}, () => {
                    const next: Tags = { ...tags, lane_markings: 'no' };
                    delete next.lanes;
                    return next;
                }));
                continue;
            }
            issues.push(issue(entity, problem.code, {
                key: problem.key ?? '', expected: problem.expected ?? '', actual: problem.actual ?? ''
            }, undefined, `${problem.key}:${problem.direction ?? ''}`));
        }

        // turn values the wiki does not know
        const turnSlots = Object.entries(tags)
            .filter(([key]) => parseLaneTagKey(key)?.base === 'turn' && !parseLaneTagKey(key)?.conditional)
            .flatMap(([, value]) => splitLaneValue(value).flatMap(slot => slot.split(';').map(v => v.trim())).filter(Boolean));
        const unknown = [...new Set(turnSlots.filter(v => !knownTurns.has(v)))];
        for (const value of unknown) {
            const replacement = turnSynonyms[value];
            issues.push(issue(entity, 'unknown_turn', { value, replacement: replacement ?? '' },
                replacement ? () => fixSlots(tags, 'turn', slot => slot.split(';').map(v => (v.trim() === value ? replacement : v)).join(';')) : undefined,
                value));
        }

        // deprecated change values
        const changeSlots = Object.entries(tags)
            .filter(([key]) => parseLaneTagKey(key)?.base === 'change')
            .flatMap(([, value]) => splitLaneValue(value));
        for (const value of [...new Set(changeSlots.filter(v => v in changeReplacements))]) {
            issues.push(issue(entity, 'deprecated_change', { value, replacement: changeReplacements[value] },
                () => fixSlots(tags, 'change', slot => changeReplacements[slot] ?? slot), value));
        }

        if (tags.hov === 'lane') {
            issues.push(issue(entity, 'hov_lane', {}));
        }

        if (tags.destination && !laneOneway(tags)) {
            issues.push(issue(entity, 'destination_twoway', {}));
        }

        // a width narrower than the lane widths tagged add up to (width is kerb to kerb, wiki: Key:width)
        const width = parseWidth(tags.width);
        const laneWidths = laneRefsInWayOrder(model).map(ref => parseWidth(model.lanes[ref.direction][ref.index].values['width:lanes']));
        const sum = laneWidths.reduce<number>((total, w) => total + (w ?? 0), 0);
        if (width !== undefined && laneWidths.length && laneWidths.every(w => w !== undefined) && sum > width + 0.05) {
            issues.push(issue(entity, 'width_too_narrow', { width: String(width), lanes: String(Math.round(sum * 100) / 100) }));
        }

        // bus lanes counted (lanes:bus) but not marked on any lane: the kerb-side lanes are marked, where the direction is known
        for (const problem of unmarkedBusLanes(tags, model)) {
            const { direction, kind, missing } = problem;
            issues.push(issue(entity, 'lanes_bus_unmarked', { key: problem.key, n: missing },
                direction ? () => serialiseLanes(markKerbsideLanes(model, direction, kind, missing), tags) : undefined, problem.key));
        }

        // old cycleway and busway values, with their upgrade
        if (hasOldCycleways(tags)) {
            issues.push(issue(entity, 'old_cycleway', {}, () => upgradeOldCycleways(tags, contraflowSide(laneOneway(tags), driveSide))));
        }
        const oldBus = (['left', 'right'] as const).filter(side => busValue(tags, side,
            model.oneway ? (model.oneway === 'forward' ? driveSide : driveSide === 'left' ? 'right' : 'left') : null,
            contraflowSide(model.oneway, driveSide)) === 'lane');
        if (oldBus.length && model.countSource !== 'assumed') {
            issues.push(issue(entity, 'old_busway', {}, () => {
                const next = serialiseLanes(upgradeOldBusway(model, oldBus), tags);
                for (const key of ['busway', 'busway:both', 'busway:left', 'busway:right']) delete next[key];
                return next;
            }));
        } else if (oldBus.length) {
            issues.push(issue(entity, 'old_busway', {}));
        }

        // turn arrows into nothing, and merging lanes that never end: they need the roads around, so only where the map
        // data at both ends is loaded (as iD's own checks of where roads lead)
        const osm = services.osm;
        const loaded = graph && way.nodes.every(id => graph.hasEntity(id)) && !!osm &&
            [way.first(), way.last()].every(id => osm.isDataLoaded((graph.entity(id) as { loc: [number, number] }).loc));
        if (loaded) {
            for (const direction of turnsToNowhere(way, model, graph)) issues.push(issue(entity, 'turn_dead_end', {}, undefined, `turn:${direction}`));
            for (const direction of mergesThatNeverEnd(way, model, graph)) issues.push(issue(entity, 'merge_never_ends', {}, undefined, `merge:${direction}`));
        }

        return issues;
    };

    validation.type = type;
    return validation;
};
