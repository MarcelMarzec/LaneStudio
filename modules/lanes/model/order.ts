import type { LaneModel, LaneRef, Lane } from './types';

/**
 * Lists the model's lanes from left to right as seen looking along the way's drawing direction.
 *
 * Each direction lists its own lanes left to right from its own driver's view, so:
 *  - in right-hand traffic, backward lanes sit left of the centre and forward lanes right of it;
 *  - in left-hand traffic, forward lanes sit left and backward lanes right;
 *  - backward lanes appear in reverse, because their drivers look the other way.
 * `both_ways` lanes are listed in the way's direction and sit in the middle.
 *
 * This is also the order of a plain `*:lanes` key on a two-way road (the "combined" style).
 */
export function laneRefsInWayOrder(model: LaneModel): LaneRef[] {
    const refs = (direction: LaneRef['direction']) =>
        model.lanes[direction].map((_, index) => ({ direction, index }));

    const forward = refs('forward');
    const backward = refs('backward').reverse();
    const both = refs('both_ways');

    if (model.oneway === 'forward') return forward;
    if (model.oneway === 'backward') return backward;

    return model.driveSide === 'left'
        ? [...forward, ...both, ...backward]
        : [...backward, ...both, ...forward];
}

export function laneAt(model: LaneModel, ref: LaneRef): Lane | undefined {
    return model.lanes[ref.direction][ref.index];
}

export function laneCount(model: LaneModel): number {
    return model.lanes.forward.length + model.lanes.backward.length + model.lanes.both_ways.length;
}

export function sameLaneRef(a: LaneRef | null | undefined, b: LaneRef | null | undefined): boolean {
    return !!a && !!b && a.direction === b.direction && a.index === b.index;
}
