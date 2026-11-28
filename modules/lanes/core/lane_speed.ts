import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { osmWay } from '../../osm/way';
import { highwayRank } from '../geometry/road_geometry';
import { speedUnitAt } from './speed_unit';
import { isUkSpeedType, roadMaxspeed, speedIn, speedTypeOf, type SpeedPick, type SpeedUnit } from '../model/speed_limits';

/**
 * How a lane's speed limit is coloured: one of seven colours (named by the limits in mph they show: 10 to 70), a limit
 * none of them shows, or none tagged. In km/h the colours are bands: 20 or less, 30, 40–50, 60–70, 80–90, 100–110, 120
 * or more.
 */
export type SpeedClass = number | 'other' | 'missing';

/** How a limit set by its UK type is patterned over its colour: the national limit, a motorway, a 20 zone, a restricted road */
export type SpeedTypeKind = 'national' | 'motorway' | 'zone' | 'restricted';

/** The colour classes that can carry a pattern (see `lanes-speed-<kind>-<class>` in svg/defs.ts) */
export const speedPatternClasses = ['10', '20', '30', '40', '50', '60', '70', 'other'];

/**
 * The pattern a lane's speed limit gets in the Speed Limit tool: its own UK limit type (`maxspeed:type:lanes`), or,
 * with no limit of its own (`maxspeed:lanes`), its road's
 */
export function speedTypeKind(laneValue: string | undefined, road: osmWay, laneType?: string): SpeedTypeKind | null {
    if (laneValue && !laneType) return null;
    const type = laneValue ? speedTypeOf({ 'maxspeed:type': laneType! }) : speedTypeOf(road.tags);
    if (!type) return null;
    const name = type.split(':')[1];
    if (isUkSpeedType(type)) {
        return type === 'GB:motorway' ? 'motorway' : type === 'GB:zone20' ? 'zone' : type === 'GB:nsl_restricted' ? 'restricted' : 'national';
    }
    // other countries' types: a motorway's, a zone's, or the default limit for the kind of road or area
    return name.includes('motorway') ? 'motorway' : name.startsWith('zone') ? 'zone' : 'national';
}

/** What the Speed Limit tool shows and sets: the speed limit (`maxspeed`) or the minimum speed (`minspeed`) */
export type SpeedMeasure = 'maxspeed' | 'minspeed';

export interface LaneSpeed {
    /** the Speed Limit tool is in use */
    active(): boolean;
    setActive(active: boolean): void;
    /** whether the tool shows and sets the speed limit or the minimum speed */
    measure(): SpeedMeasure;
    setMeasure(measure: SpeedMeasure): void;
    /** the limit clicking a road applies, if one is picked */
    picked(): SpeedPick | null;
    setPicked(pick: SpeedPick | null): void;
    /** the unit the tool shows and sets limits in: the setting's, or the one used where the map is */
    unit(): SpeedUnit;
    on(type: `change${string}`, listener: (() => void) | null): LaneSpeed;
}

/** The colours on the map, by the limits in mph they show; any other limit is coloured as "other" */
export const colouredLimits = [10, 20, 30, 40, 50, 60, 70];

/** The highest limit in km/h each colour shows (its band), from 20 or less to 120 or more */
const kmhBands = [20, 30, 50, 70, 90, 110, Infinity];

/** The colour a limit gets in a unit: in mph, one of the UK's limits; in km/h, its band */
export function speedClassFor(value: string, unit: SpeedUnit): SpeedClass {
    if (value === 'walk') return colouredLimits[0];
    const n = speedIn(value, unit);
    if (n === null) return 'other';
    if (unit === 'mph') return colouredLimits.includes(n) ? n : 'other';
    return colouredLimits[kmhBands.findIndex(top => n <= top)];
}

/** What a colour shows in a unit, for the key: `30 mph`, or a band of limits in km/h (`40–50 km/h`) */
export function speedClassRange(cls: number, unit: SpeedUnit): { from?: number; to?: number } {
    if (unit === 'mph') return { from: cls, to: cls };
    const i = colouredLimits.indexOf(cls);
    const to = kmhBands[i];
    const from = i > 0 ? kmhBands[i - 1] + 10 : undefined;
    return { from, to: to === Infinity ? undefined : to };
}

/**
 * A road's limit for traffic going one way: `maxspeed:forward` or `maxspeed:backward` where the limit differs by direction
 * (wiki: Key:maxspeed), else the road's own; with no direction, the road's own or else either direction's
 */
export function roadSpeedFor(tags: Tags, measure: SpeedMeasure, direction?: 'forward' | 'backward' | 'both_ways'): string | undefined {
    const own = measure === 'maxspeed' ? roadMaxspeed(tags) : tags.minspeed;
    if (direction === 'forward' || direction === 'backward') return tags[`${measure}:${direction}`] ?? own;
    return own ?? tags[`${measure}:forward`] ?? tags[`${measure}:backward`];
}

/**
 * How a lane is coloured: its own limit (`maxspeed:lanes`) if it has one, else its road's (`maxspeed`, or the limit
 * its `maxspeed:type` sets, or its direction's `maxspeed:forward` or `maxspeed:backward`), in mph; a road with no limit is missing one. For minimum speeds, the lane's
 * `minspeed:lanes` or its road's `minspeed`.
 */
export function speedClassOf(laneValue: string | undefined, road: osmWay, measure: SpeedMeasure = 'maxspeed',
    direction?: 'forward' | 'backward' | 'both_ways', unit: SpeedUnit = 'mph'): SpeedClass {
    const value = laneValue || roadSpeedFor(road.tags, measure, direction);
    if (!value) return 'missing';
    return speedClassFor(value, unit);
}

/**
 * How a junction is coloured: its roads' limit where they all agree, else the main road's (the most major road
 * meeting there), so a side road without a limit doesn't paint a main road's junction red
 */
export function junctionSpeedClass(roads: osmWay[], measure: SpeedMeasure = 'maxspeed', unit: SpeedUnit = 'mph'): SpeedClass | null {
    if (!roads.length) return null;
    const classes = roads.map(road => speedClassOf(undefined, road, measure, undefined, unit));
    if (classes.every(cls => cls === classes[0])) return classes[0];
    const rank = (road: osmWay) => highwayRank[road.tags.highway ?? ''] ?? 0;
    const main = roads.reduce((best, road, i) => (rank(road) > rank(roads[best]) ? i : best), 0);
    return classes[main];
}

const speedByContext = new WeakMap<iD.Context, LaneSpeed>();

/** The Speed Limit tool's state, one per iD context */
export function laneSpeed(context: iD.Context): LaneSpeed {
    const existing = speedByContext.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    let _active = false;
    let _picked: SpeedPick | null = null;
    let _measure: SpeedMeasure = 'maxspeed';
    const changed = () => dispatch.call('change', speed);

    const speed: LaneSpeed = {
        active: () => _active,
        setActive(active) {
            if (_active === active) return;
            _active = active;
            context.container().classed('lanes-speed', active);
            changed();
        },
        measure: () => _measure,
        setMeasure(measure) {
            if (_measure === measure) return;
            _measure = measure;
            // a pick is a limit of one measure: a speed limit is not a minimum speed
            _picked = null;
            changed();
        },
        picked: () => _picked,
        unit: () => speedUnitAt(context.map().center() as [number, number]),
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
