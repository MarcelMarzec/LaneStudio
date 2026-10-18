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

/** A lane's type, read from the same keys `setLaneKind` writes */
export function laneKindOf(model: LaneModel, ref: LaneRef): string {
    for (const [kind, key] of Object.entries(laneKindKeys)) {
        if (key && laneValue(model, ref, key) === kindValue(kind)) return kind;
    }
    return 'general';
}

/**
 * Makes lanes a given type: `designated` in that type's key, and the other type keys cleared
 * on those lanes. Keys the road does not have are only created when needed.
 */
export function setLaneKind(model: LaneModel, refs: LaneRef[], kind: string): LaneModel {
    let next = model;
    for (const ref of refs) {
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
