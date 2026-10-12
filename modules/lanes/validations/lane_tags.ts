import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { validationIssue, validationIssueFix } from '../../core/validation';
import type { CreateValidator, Validator } from '../../core/validation/models';
import type { OsmEntity } from '../../osm';
import { utilDisplayLabel } from '../../util/utilDisplayLabel';
import { laneRoadHighways } from '../core/roads';
import { parseLanes, parseLaneTagKey, splitLaneValue, turnValues, laneOneway } from '../model';

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

/**
 * Lane tagging problems on roads, anywhere on the map (not only in the Lanes section):
 * value counts that do not match the lanes, counts that do not add up, unknown turn values,
 * deprecated values, `hov=lane`, and `destination` without a direction on two-way roads.
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

    const validation: Validator = function checkLaneTags(entity) {
        if (entity.type !== 'way' || !laneRoadHighways.has(entity.tags.highway ?? '')) return [];
        const tags = entity.tags;
        const issues: validationIssue[] = [];
        const model = parseLanes(tags);

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

        return issues;
    };

    validation.type = type;
    return validation;
};
