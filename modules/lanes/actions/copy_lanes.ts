import { actionChangeTags } from '../../actions/change_tags';
import type { Action } from '../../core/history';
import type { WayId } from '../../osm';
import { laneOneway, parseLaneTagKey, laneTagKey, splitLaneValue } from '../model';

const countKeys = ['lanes', 'lanes:forward', 'lanes:backward', 'lanes:both_ways'];
const swapped = { forward: 'backward', backward: 'forward', both_ways: 'both_ways' } as const;

/** Lane keys that belong to one approach to a junction and so are not copied along a road */
const keepsOwn = (base: string) => base === 'turn' || base.startsWith('destination');

/** Whether lanes can be copied between two roads: both one-way or both two-way */
export function canCopyLanes(from: Tags, to: Tags): boolean {
    return !!laneOneway(from) === !!laneOneway(to);
}

/**
 * The lane tags of `from` as they should be written on `to`. When the two-way target is drawn the
 * other way round (`sameOrientation` false), forward and backward swap and plain lists reverse.
 * Turn and destination lanes stay with the road they were mapped on.
 */
export function copiedLaneTags(from: Tags, to: Tags, sameOrientation: boolean): Tags {
    const next: Tags = {};
    const twoWay = !laneOneway(from);
    const flip = twoWay && !sameOrientation;

    for (const [key, value] of Object.entries(to)) {
        const parsed = parseLaneTagKey(key);
        if (countKeys.includes(key) || (parsed && !keepsOwn(parsed.base))) continue;
        next[key] = value;
    }

    for (const [key, value] of Object.entries(from)) {
        if (countKeys.includes(key)) {
            const out = flip && key === 'lanes:forward' ? 'lanes:backward' : flip && key === 'lanes:backward' ? 'lanes:forward' : key;
            next[out] = value;
            continue;
        }
        const parsed = parseLaneTagKey(key);
        if (!parsed || keepsOwn(parsed.base)) continue;
        if (!flip) {
            next[key] = value;
        } else if (parsed.direction) {
            next[laneTagKey(parsed.id, swapped[parsed.direction])] = value;
        } else {
            next[key] = splitLaneValue(value).reverse().join('|');
        }
    }
    return next;
}

/** Copies one road's lanes onto the next road of the corridor, as one undo step */
export function actionCopyLanes(fromID: WayId, toID: WayId, sameOrientation: boolean): Action {
    return function(graph) {
        const from = graph.entity(fromID);
        const to = graph.entity(toID);
        return actionChangeTags(toID, copiedLaneTags(from.tags, to.tags, sameOrientation))(graph);
    };
}
