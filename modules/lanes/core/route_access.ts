import { routingProfiles, type RoutingProfile } from '../geometry/routing';
import { accessChain, accessClass, accessConditional, type AccessClass } from '../model/access';

/*
 * The Routing tool's colouring of the roads by who may use them (wiki: Key:access): each lane in the colour of the access
 * the vehicle picked has there, from its most specific key tagged (the lane's `hgv:lanes`, then the road's
 * `hgv:forward`, `hgv`, then `motor_vehicle`, `vehicle`, `access`, down the wiki's hierarchy). A lane of a type the vehicle
 * may not drive in (a bus lane, for a car) is closed to it; a road with none of its keys tagged keeps its own surface.
 */

/** The colours in the key, in order: open, preferred, discouraged, to a destination only, with permission only, closed */
export const accessClasses: AccessClass[] = ['yes', 'designated', 'discouraged', 'destination', 'permission', 'sidepath', 'dismount', 'no', 'unknown'];

/** The values each colour stands for, as the key lists them */
export const accessClassValues: Record<AccessClass, string[]> = {
    yes: ['yes', 'permissive'],
    designated: ['designated'],
    discouraged: ['discouraged', 'no_turnaround'],
    destination: ['destination', 'delivery', 'customers'],
    permission: ['private', 'permit', 'agricultural', 'forestry', 'military'],
    sidepath: ['use_sidepath'],
    dismount: ['dismount'],
    no: ['no'],
    unknown: ['unknown']
};

export interface LaneAccess {
    cls: AccessClass;
    /** the value and the key it came from (`hgv=no`, `motor_vehicle:forward=destination`, `bus:lanes=designated`) */
    value: string;
    key: string;
    /** from a key above the vehicle's own (`motor_vehicle`, `access`), not one for it */
    inherited: boolean;
    /** a conditional restriction changes it at times or for some vehicles (`hgv:conditional`) */
    conditional: boolean;
}

/**
 * The access a vehicle has in one lane of a road (or on the road, without a lane): its tags, the lane's own `*:lanes`
 * values and type, and which way the lane runs; null where nothing says
 */
export function laneAccess(tags: Tags, profileID: RoutingProfile, lane?: { values: Record<string, string>; kind: string; direction: string }):
    LaneAccess | null {
    const profile = routingProfiles[profileID];
    const direction = lane?.direction === 'forward' || lane?.direction === 'backward' ? lane.direction : undefined;
    const conditional = !!accessConditional(tags, profile.mode, direction);
    const chain = accessChain(profile.mode);
    const found = (key: string, raw: string | undefined, mode: string): LaneAccess | null => {
        const value = raw?.split(';')[0].trim();
        if (!value || value === 'none') return null;
        return { cls: accessClass(value)!, value, key, inherited: mode !== profile.mode, conditional };
    };
    // the lane's own values first (`bus:lanes`, `access:lanes`), most specific mode first
    for (const key of chain) {
        const own = found(`${key}:lanes`, lane?.values[`${key}:lanes`], key);
        if (own) return own;
    }
    // a lane kept for other traffic (a bus lane, for a car)
    if (lane && lane.kind !== 'general' && !profile.kinds.has(lane.kind)) {
        return { cls: 'no', value: lane.kind, key: 'lane', inherited: false, conditional };
    }
    // then the road's: its direction's key before its own (`hgv:forward`, `hgv`, `motor_vehicle:forward`…)
    for (const key of chain) {
        for (const tagged of direction ? [`${key}:${direction}`, key] : [key]) {
            const road = found(tagged, tags[tagged], key);
            if (road) return road;
        }
    }
    // only a conditional restriction: open otherwise, as nothing else says
    return conditional ? { cls: 'yes', value: '', key: '', inherited: true, conditional } : null;
}

/** A shape's classes on the map for an access: its colour, faded where inherited, outlined where conditional */
export function accessClassNames(access: LaneAccess | null): string {
    if (!access) return '';
    return ` access-${access.cls}` + (access.inherited ? ' access-inherited' : '') + (access.conditional ? ' access-conditional' : '');
}
