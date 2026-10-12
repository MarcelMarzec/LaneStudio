import { laneKeyBase, laneTagKey } from './keys';
import { laneRefsInWayOrder } from './order';
import { laneDirections, type LaneKey, type LaneModel } from './types';


function isEmptyList(id: string, slots: (string | undefined)[]): boolean {
    const isTurn = laneKeyBase(id) === 'turn';
    return slots.every(slot => slot === undefined || slot === '' || (isTurn && slot === 'none'));
}


function writeCounts(model: LaneModel, original: Tags, tags: Tags) {
    const f = model.lanes.forward.length;
    const b = model.lanes.backward.length;
    const bw = model.lanes.both_ways.length;
    tags.lanes = String(f + b + bw);
    if (model.oneway) return;

    const sharedSingleLane = f === 0 && b === 0 && bw === 1;
    const writeDirections = 'lanes:forward' in original || 'lanes:backward' in original ||
        f !== b || (bw > 0 && !sharedSingleLane);
    if (writeDirections) {
        tags['lanes:forward'] = String(f);
        tags['lanes:backward'] = String(b);
    }

    if (bw > 0 && (!sharedSingleLane || 'lanes:both_ways' in original)) {
        tags['lanes:both_ways'] = String(bw);
    } else if (bw === 0) {
        delete tags['lanes:both_ways'];
    }
}


function writeKey(model: LaneModel, key: LaneKey, tags: Tags) {
    for (const tagKey of Object.values(key.tagKeys)) {
        if (tagKey) delete tags[tagKey];
    }

    const put = (tagKey: string, slots: (string | undefined)[]) => {
        if (isEmptyList(key.id, slots)) return;
        tags[tagKey] = slots.map(slot => slot ?? '').join('|');
    };

    if (key.style === 'oneway' && model.oneway) {
        const direction = model.oneway;
        put(key.tagKeys.all ?? key.tagKeys[direction] ?? key.id,
            model.lanes[direction].map(lane => lane.values[key.id]));

    } else if (key.style === 'combined') {
        put(key.tagKeys.all ?? key.id,
            laneRefsInWayOrder(model).map(ref => model.lanes[ref.direction][ref.index].values[key.id]));

    } else {
        for (const direction of laneDirections) {
            const lanes = model.lanes[direction];
            if (!lanes.length) continue;
            put(key.tagKeys[direction] ?? laneTagKey(key.id, direction),
                lanes.map(lane => lane.values[key.id]));
        }
    }
}


/**
 * Writes a lane model back to tags, changing as little as possible:
 * only keys touched since parsing are rewritten, read-only keys are never changed,
 * and every other tag is copied as it was.
 */
export function serialiseLanes(model: LaneModel, originalTags: Tags): Tags {
    const tags = { ...originalTags };
    if (model.countsTouched) writeCounts(model, originalTags, tags);

    const touched = new Set(model.touchedKeys);
    for (const key of Object.values(model.keys)) {
        if (key.readonly || !touched.has(key.id)) continue;
        writeKey(model, key, tags);
    }
    return tags;
}
