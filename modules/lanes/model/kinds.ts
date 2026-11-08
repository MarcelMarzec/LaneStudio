import { laneValue, setLaneValue } from './ops';
import type { LaneModel, LaneRef } from './types';

/** Lane types and the `*:lanes` key that marks each one `designated`; general traffic sets none */
export const laneKindKeys: Record<string, string | null> = {
    general: null,
    bus: 'bus:lanes',
    psv: 'psv:lanes',
    taxi: 'taxi:lanes',
    hov: 'hov:lanes',
    bicycle: 'bicycle:lanes',
    pedestrian: 'foot:lanes',
    // a lane opened and closed by signs, like a running hard shoulder (wiki: Variable-access lanes)
    variable: 'access:lanes'
};

/** The value a lane type writes in its key: `designated`, or `variable` for a variable-access lane */
const kindValue = (kind: string) => (kind === 'variable' ? 'variable' : 'designated');

/** What a lane is for, as drawn: a lane type, or `restricted` for a lane closed to traffic with no type of its own */
export type LaneKindValue = 'general' | 'bus' | 'psv' | 'taxi' | 'hov' | 'bicycle' | 'pedestrian' | 'variable' | 'restricted';

const closed = (value: string | undefined) => value === 'no' || value === 'private';
const open = (value: string | undefined) => value === 'yes' || value === 'designated' || value === 'permissive';
// the lane types a lane can be kept for, in the order they are looked for
const reservedKinds = ['bus', 'psv', 'taxi', 'hov', 'bicycle', 'pedestrian'] as const;

/**
 * A lane's type from its `*:lanes` values (wiki: Lanes). `designated` marks a lane kept for a type of traffic; a lane
 * closed to general traffic (`access`, `motor_vehicle` or `vehicle:lanes=no`) that is open to buses, PSVs, taxis, HOVs
 * or cycles (`yes` or `designated`) is kept for them too, and `cycleway:lanes=lane` is a cycle lane. A closed lane
 * open to none of them is `restricted`. On a busway or a guided busway (`highway=busway`, `bus_guideway`) a lane with no
 * type is a bus lane.
 */
export function laneKindFromValues(values: Record<string, string>, highway?: string): LaneKindValue {
    const v = (key: string) => values[key] || undefined;
    for (const kind of reservedKinds) if (v(laneKindKeys[kind]!) === 'designated') return kind;
    if (v('cycleway:lanes') === 'lane') return 'bicycle';
    if (v('access:lanes') === 'variable') return 'variable';
    if (closed(v('access:lanes')) || closed(v('motor_vehicle:lanes')) || closed(v('vehicle:lanes'))) {
        for (const kind of reservedKinds) if (kind !== 'pedestrian' && open(v(laneKindKeys[kind]!))) return kind;
        return 'restricted';
    }
    return highway === 'busway' || highway === 'bus_guideway' ? 'bus' : 'general';
}

/** A lane's type, as the lane type field shows it (a restricted lane is general traffic with its access closed) */
export function laneKindOf(model: LaneModel, ref: LaneRef): string {
    const kind = laneKindFromValues(model.lanes[ref.direction][ref.index]?.values ?? {});
    return kind === 'restricted' ? 'general' : kind;
}

/**
 * Makes lanes a given type: `designated` in that type's key, and the other type keys cleared
 * on those lanes. Keys the road does not have are only created when needed.
 */
export function setLaneKind(model: LaneModel, refs: LaneRef[], kind: string): LaneModel {
    let next = model;
    for (const ref of refs) {
        // a lane kept for a type of traffic by closing it to the rest opens again when it becomes general traffic
        if (kind === 'general' && laneKindOf(next, ref) !== 'general') {
            for (const key of ['access:lanes', 'motor_vehicle:lanes', 'vehicle:lanes', 'cycleway:lanes']) {
                const current = laneValue(next, ref, key);
                if (next.keys[key] && !next.keys[key].readonly && (closed(current) || current === 'lane')) next = setLaneValue(next, ref, key, '');
            }
        }
        for (const [k, key] of Object.entries(laneKindKeys)) {
            if (!key || next.keys[key]?.readonly) continue;
            const current = laneValue(next, ref, key);
            // other access values (no, private…) are not a lane type: they stay
            if (k === 'variable' && kind !== 'variable' && current !== 'variable') continue;
            const want = k === kind ? kindValue(k) : '';
            if (current !== want && (want || next.keys[key])) next = setLaneValue(next, ref, key, want);
        }
    }
    return next;
}
