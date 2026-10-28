/*
 * Tags for things painted on or standing at a road node: crossings, stop and give-way signs,
 * traffic signals, traffic calming and mini-roundabouts. Pure functions over tags.
 */

export const markingTypes = ['none', 'crossing', 'stop', 'give_way', 'traffic_signals', 'calming', 'mini_roundabout', 'passing_place'] as const;
export type MarkingType = typeof markingTypes[number];

/** traffic_calming=* values (wiki: Key:traffic_calming) */
export const calmingValues = [
    'hump', 'bump', 'table', 'painted_table', 'cushion', 'mini_bumps', 'rumble_strip', 'dip', 'double_dip',
    'dynamic_bump', 'chicane', 'choker', 'island', 'choked_table', 'choked_island'
] as const;
export const crossingMarkingValues = ['zebra', 'lines', 'dots', 'no'] as const;

const highwayFor: Partial<Record<MarkingType, string>> = {
    crossing: 'crossing', stop: 'stop', give_way: 'give_way',
    traffic_signals: 'traffic_signals', mini_roundabout: 'mini_roundabout', passing_place: 'passing_place'
};

const crossingKeys = ['crossing', 'crossing:markings', 'crossing:signals', 'crossing:island', 'crossing_ref'];
const directionKeys = ['direction', 'traffic_signals:direction', 'stop'];

export function markingType(tags: Tags): MarkingType {
    switch (tags.highway) {
        case 'crossing': return 'crossing';
        case 'stop': return 'stop';
        case 'give_way': return 'give_way';
        case 'traffic_signals': return 'traffic_signals';
        case 'mini_roundabout': return 'mini_roundabout';
        case 'passing_place': return 'passing_place';
    }
    if (tags.traffic_calming && tags.traffic_calming !== 'no') return 'calming';
    return 'none';
}

/** Changes what the node is, removing the keys that only belonged to the old type */
export function withMarkingType(tags: Tags, type: MarkingType): Tags {
    const next = { ...tags };
    const before = markingType(tags);
    if (before === type) return next;

    if (before === 'crossing') crossingKeys.forEach(k => delete next[k]);
    if (before === 'stop' || before === 'give_way' || before === 'traffic_signals') directionKeys.forEach(k => delete next[k]);
    if (before === 'calming') {
        delete next.traffic_calming;
        delete next.direction;
    }
    if (before === 'passing_place') delete next.passing_place;
    if (before !== 'none' && before !== 'calming') delete next.highway;

    if (type === 'calming') {
        next.traffic_calming = 'hump';
    } else if (type !== 'none') {
        next.highway = highwayFor[type]!;
    }
    if (type === 'crossing') {
        next.crossing = 'uncontrolled';
        next['crossing:markings'] = 'zebra';
    }
    return next;
}

/**
 * A passing place's side (wiki: Tag:highway=passing_place), as forward (beside traffic going along the road's drawing
 * direction), backward or both: `passing_place=left|right|both`, forward being the road's left where traffic drives
 * on the left
 */
export function passingPlaceDirection(tags: Tags, driveSide: 'left' | 'right'): 'forward' | 'backward' | 'both' {
    const side = tags.passing_place;
    if (side !== 'left' && side !== 'right') return 'both';
    return side === driveSide ? 'forward' : 'backward';
}

export function withPassingPlaceDirection(tags: Tags, direction: 'forward' | 'backward' | 'both', driveSide: 'left' | 'right'): Tags {
    const other = driveSide === 'left' ? 'right' : 'left';
    return { ...tags, passing_place: direction === 'both' ? 'both' : direction === 'forward' ? driveSide : other };
}

export interface CrossingOptions {
    markings: string;
    signals: boolean;
    island: boolean;
}

export function crossingOptions(tags: Tags): CrossingOptions {
    const signals = tags.crossing === 'traffic_signals' || tags['crossing:signals'] === 'yes';
    let markings = tags['crossing:markings'];
    if (!markings) {
        markings = tags.crossing === 'unmarked' || tags.crossing === 'no' ? 'no'
            : tags.crossing === 'traffic_signals' ? 'lines' : 'zebra';
    }
    return { markings, signals, island: tags['crossing:island'] === 'yes' };
}

/**
 * Writes a crossing in the current scheme: `crossing:markings`, `crossing:signals`, `crossing:island`,
 * and the matching `crossing=traffic_signals|uncontrolled|unmarked` that most data users read.
 */
export function withCrossing(tags: Tags, options: CrossingOptions): Tags {
    const next = { ...tags };
    next['crossing:markings'] = options.markings;
    next['crossing:signals'] = options.signals ? 'yes' : 'no';
    next.crossing = options.signals ? 'traffic_signals' : options.markings === 'no' ? 'unmarked' : 'uncontrolled';
    if (options.island) {
        next['crossing:island'] = 'yes';
    } else if (next['crossing:island']) {
        next['crossing:island'] = 'no';
    }
    return next;
}

/** `direction=forward|backward` for signs that apply to one direction of the road; `both` removes it */
export function withDirection(tags: Tags, direction: 'forward' | 'backward' | 'both'): Tags {
    const next = { ...tags };
    if (direction === 'both') delete next.direction;
    else next.direction = direction;
    return next;
}
