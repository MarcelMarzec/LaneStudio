import { laneValue, setLaneValue } from './ops';
import type { LaneDirection, LaneModel } from './types';

/** `turn` values from the wiki (Key:turn), in the order the turn picker shows them */
export const turnValues = [
    'sharp_left', 'left', 'slight_left', 'through', 'slight_right', 'right', 'sharp_right',
    'reverse', 'merge_to_left', 'merge_to_right', 'none'
] as const;

export type TurnValue = typeof turnValues[number];

/** `left;through` -> `['left', 'through']`; empty and `none` give `[]` */
export function parseTurn(slot: string): string[] {
    return slot.split(';').map(v => v.trim()).filter(v => v && v !== 'none');
}

/** Joins turn values in the picker's order (unknown values keep their place at the end); `[]` -> `none` */
export function formatTurn(values: string[]): string {
    const unique = [...new Set(values.filter(v => v && v !== 'none'))];
    if (!unique.length) return 'none';
    const rank = (v: string) => {
        const i = (turnValues as readonly string[]).indexOf(v);
        return i === -1 ? turnValues.length : i;
    };
    return unique.sort((a, b) => rank(a) - rank(b)).join(';');
}

/** Turns one value on or off in a slot, e.g. toggling `through` on `left` gives `left;through` */
export function toggleTurn(slot: string, value: string): string {
    const values = parseTurn(slot);
    return formatTurn(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
}


/** Whether a lane's driver may change to the lane on their left and on their right */
export interface LaneChange {
    toLeft: boolean;
    toRight: boolean;
}

/** Reads a `change:lanes` slot; `undefined` for an empty slot (unknown) */
export function parseChange(slot: string): LaneChange | undefined {
    switch (slot.trim()) {
        case 'yes': return { toLeft: true, toRight: true };
        case 'no': return { toLeft: false, toRight: false };
        case 'not_left': return { toLeft: false, toRight: true };
        case 'not_right': return { toLeft: true, toRight: false };
        // deprecated synonyms
        case 'only_left': return { toLeft: true, toRight: false };
        case 'only_right': return { toLeft: false, toRight: true };
        default: return undefined;
    }
}

export function formatChange(change: LaneChange): string {
    if (change.toLeft && change.toRight) return 'yes';
    if (!change.toLeft && !change.toRight) return 'no';
    return change.toLeft ? 'not_right' : 'not_left';
}


/** The marking between lane `leftIndex` and the next lane to its right, in one direction */
export interface Divider {
    /** may the left lane's traffic move right across it */
    leftToRight: boolean;
    /** may the right lane's traffic move left across it */
    rightToLeft: boolean;
}

/** Reads a divider from `change:lanes`; `undefined` when neither lane says anything */
export function dividerAt(model: LaneModel, direction: LaneDirection, leftIndex: number): Divider | undefined {
    const left = parseChange(laneValue(model, { direction, index: leftIndex }, 'change:lanes'));
    const right = parseChange(laneValue(model, { direction, index: leftIndex + 1 }, 'change:lanes'));
    if (!left && !right) return undefined;
    return {
        leftToRight: left ? left.toRight : true,
        rightToLeft: right ? right.toLeft : true
    };
}

/** Sets a divider by updating `change:lanes` on the lanes either side of it */
export function setDivider(model: LaneModel, direction: LaneDirection, leftIndex: number, divider: Divider): LaneModel {
    const leftRef = { direction, index: leftIndex };
    const rightRef = { direction, index: leftIndex + 1 };
    if (!model.lanes[direction][leftIndex + 1]) throw new Error('No lane to the right of this divider');

    const left = parseChange(laneValue(model, leftRef, 'change:lanes')) ?? { toLeft: true, toRight: true };
    const right = parseChange(laneValue(model, rightRef, 'change:lanes')) ?? { toLeft: true, toRight: true };

    let next = setLaneValue(model, leftRef, 'change:lanes', formatChange({ ...left, toRight: divider.leftToRight }));
    next = setLaneValue(next, rightRef, 'change:lanes', formatChange({ ...right, toLeft: divider.rightToLeft }));
    return next;
}

/** The order a divider cycles through when clicked: dashed, solid, then one-way either way */
export function nextDivider(divider: Divider | undefined): Divider {
    const d = divider ?? { leftToRight: true, rightToLeft: true };
    if (d.leftToRight && d.rightToLeft) return { leftToRight: false, rightToLeft: false };
    if (!d.leftToRight && !d.rightToLeft) return { leftToRight: true, rightToLeft: false };
    if (d.leftToRight && !d.rightToLeft) return { leftToRight: false, rightToLeft: true };
    return { leftToRight: true, rightToLeft: true };
}
