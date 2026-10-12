import { laneKeyBase } from './keys';
import { laneCount } from './order';
import { laneDirections, type Lane, type LaneDirection, type LaneKey, type LaneModel, type LaneRef } from './types';

// All operations are pure: they return a new model and leave the input unchanged.


function cloneModel(model: LaneModel): LaneModel {
    const lanes = {} as LaneModel['lanes'];
    for (const direction of laneDirections) {
        lanes[direction] = model.lanes[direction].map(lane => ({ values: { ...lane.values } }));
    }
    const keys: LaneModel['keys'] = {};
    for (const [id, key] of Object.entries(model.keys)) {
        keys[id] = { ...key, tagKeys: { ...key.tagKeys } };
    }
    return {
        ...model,
        lanes,
        keys,
        issues: model.issues.map(issue => ({ ...issue })),
        touchedKeys: [...model.touchedKeys]
    };
}


function writableKeys(model: LaneModel): LaneKey[] {
    return Object.values(model.keys).filter(key => !key.readonly);
}


/** The lanes that share one tag for `key`: a direction's lanes, or all lanes for a combined key */
function lanesSharingTag(model: LaneModel, key: LaneKey, direction: LaneDirection): Lane[] {
    if (key.style === 'combined') return laneDirections.flatMap(d => model.lanes[d]);
    return model.lanes[direction];
}


/**
 * The value for a slot that has no value of its own.
 * Turn lanes use `none` unless the key already uses empty slots; every other key uses an
 * empty slot, which means "same as the road's own tag" (e.g. `maxspeed`).
 */
function fillerFor(key: LaneKey, lanes: Lane[]): string {
    if (laneKeyBase(key.id) !== 'turn') return '';
    const values = lanes.map(lane => lane.values[key.id]).filter(v => v !== undefined);
    const usesEmpty = values.includes('') && !values.includes('none');
    return usesEmpty ? '' : 'none';
}


/** Gives every lane that shares a tag a slot, once any one of them has a value for that key */
function fillSlots(model: LaneModel, direction: LaneDirection) {
    for (const key of writableKeys(model)) {
        const lanes = lanesSharingTag(model, key, direction);
        const present = lanes.filter(lane => lane.values[key.id] !== undefined);
        if (!present.length || present.length === lanes.length) continue;
        const filler = fillerFor(key, present);
        for (const lane of lanes) {
            if (lane.values[key.id] === undefined) lane.values[key.id] = filler;
        }
    }
}


function touchKeys(model: LaneModel, ids: string[]) {
    for (const id of ids) {
        if (!model.touchedKeys.includes(id)) model.touchedKeys.push(id);
    }
}


/** After a lane count change: every writable key gains or loses the slot; read-only keys are flagged */
function afterCountChange(model: LaneModel) {
    model.countsTouched = true;
    model.countSource = 'tagged';
    touchKeys(model, writableKeys(model).map(key => key.id));
    for (const key of Object.values(model.keys)) {
        if (!key.readonly) continue;
        if (model.issues.some(issue => issue.code === 'key_not_updated' && issue.key === key.id)) continue;
        model.issues.push({ code: 'key_not_updated', key: key.id });
    }
}


function checkDirection(model: LaneModel, direction: LaneDirection) {
    if (model.oneway && direction !== model.oneway) {
        throw new Error(`A one-way road only has ${model.oneway} lanes`);
    }
}


/**
 * Adds a lane in `direction` at `index` (0 = the driver's leftmost lane; default: after the last lane).
 * Every lane key on the road gains a slot for it.
 */
export function insertLane(model: LaneModel, direction: LaneDirection, index?: number): LaneModel {
    checkDirection(model, direction);
    const next = cloneModel(model);
    const lanes = next.lanes[direction];
    const at = Math.max(0, Math.min(index ?? lanes.length, lanes.length));

    const lane: Lane = { values: {} };
    for (const key of writableKeys(next)) {
        const sharing = lanesSharingTag(next, key, direction);
        const present = sharing.filter(l => l.values[key.id] !== undefined);
        if (present.length) lane.values[key.id] = fillerFor(key, present);
    }
    lanes.splice(at, 0, lane);

    afterCountChange(next);
    return next;
}


/** Removes a lane; every lane key on the road loses its slot. The last lane cannot be removed. */
export function removeLane(model: LaneModel, ref: LaneRef): LaneModel {
    if (laneCount(model) <= 1) throw new Error('A road needs at least one lane');
    if (!model.lanes[ref.direction][ref.index]) throw new Error('No such lane');
    const next = cloneModel(model);
    next.lanes[ref.direction].splice(ref.index, 1);
    afterCountChange(next);
    return next;
}


/**
 * Moves a lane, keeping its values: to another direction (two-way roads only),
 * or to another position within its own direction (`toIndex`, 0 = the driver's leftmost)
 */
export function moveLane(model: LaneModel, ref: LaneRef, toDirection: LaneDirection, toIndex?: number): LaneModel {
    if (model.oneway && toDirection !== ref.direction) throw new Error('Lanes on a one-way road cannot change direction');
    const lane = model.lanes[ref.direction][ref.index];
    if (!lane) throw new Error('No such lane');

    const next = cloneModel(model);
    const [moved] = next.lanes[ref.direction].splice(ref.index, 1);
    const target = next.lanes[toDirection];
    const at = Math.max(0, Math.min(toIndex ?? target.length, target.length));
    target.splice(at, 0, moved);

    fillSlots(next, toDirection);
    afterCountChange(next);
    return next;
}


/** Sets one key's value on one or more lanes, creating the key if the road does not have it yet */
export function setLaneValue(model: LaneModel, refs: LaneRef | LaneRef[], keyId: string, value: string): LaneModel {
    const list = Array.isArray(refs) ? refs : [refs];
    const existing = model.keys[keyId];
    if (existing?.readonly) throw new Error(`${keyId} is kept as tagged and cannot be edited lane by lane`);

    const next = cloneModel(model);
    if (!existing) {
        next.keys[keyId] = { id: keyId, style: next.oneway ? 'oneway' : 'directional', readonly: false, tagKeys: {} };
    }

    const directions = new Set<LaneDirection>();
    for (const ref of list) {
        const lane = next.lanes[ref.direction][ref.index];
        if (!lane) throw new Error('No such lane');
        lane.values[keyId] = value;
        directions.add(ref.direction);
    }
    for (const direction of directions) fillSlots(next, direction);

    touchKeys(next, [keyId]);
    return next;
}


/** Reads one key's value on a lane; `''` for an empty slot or a key the road does not have */
export function laneValue(model: LaneModel, ref: LaneRef, keyId: string): string {
    return model.lanes[ref.direction][ref.index]?.values[keyId] ?? '';
}
