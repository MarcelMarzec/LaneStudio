import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { osmWay } from '../../osm/way';
import { mphOf, type SpeedPick } from '../ui/speed_roundels';

/** How a lane's speed limit is coloured: a limit in mph, a limit no roundel shows, or none tagged */
export type SpeedClass = number | 'other' | 'missing';

export interface LaneSpeed {
    /** the Speed Limit tool is in use */
    active(): boolean;
    setActive(active: boolean): void;
    /** the limit clicking a road applies, if one is picked */
    picked(): SpeedPick | null;
    setPicked(pick: SpeedPick | null): void;
    on(type: `change${string}`, listener: (() => void) | null): LaneSpeed;
}

/** The limits coloured on the map, in mph; any other limit is coloured as "other" */
export const colouredLimits = [10, 20, 30, 40, 50, 60, 70];

/**
 * How a lane is coloured: its own limit (`maxspeed:lanes`) if it has one, else its road's (`maxspeed`), in mph;
 * a road with no limit is missing one
 */
export function speedClassOf(laneValue: string | undefined, road: osmWay): SpeedClass {
    const value = laneValue || road.tags.maxspeed;
    if (!value) return 'missing';
    const mph = mphOf(value);
    return mph !== null && colouredLimits.includes(mph) ? mph : 'other';
}

const speedByContext = new WeakMap<iD.Context, LaneSpeed>();

/** The Speed Limit tool's state, one per iD context */
export function laneSpeed(context: iD.Context): LaneSpeed {
    const existing = speedByContext.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    let _active = false;
    let _picked: SpeedPick | null = null;
    const changed = () => dispatch.call('change', speed);

    const speed: LaneSpeed = {
        active: () => _active,
        setActive(active) {
            if (_active === active) return;
            _active = active;
            context.container().classed('lanes-speed', active);
            changed();
        },
        picked: () => _picked,
        setPicked(pick) {
            _picked = pick;
            changed();
        },
        on(type, listener) {
            dispatch.on(type as 'change', listener as () => void);
            return speed;
        }
    };
    speedByContext.set(context, speed);
    return speed;
}
