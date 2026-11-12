/*
 * Tag rules for mapped street features that Lane Studio draws and edits beside its lanes:
 * traffic islands, painted road markings (`road_marking=*`) and street parking areas.
 */

import type { LaneDirection } from './types';

/** A traffic island mapped as an area */
export function isTrafficIsland(tags: Tags): boolean {
    const areaHighway = tags['area:highway'];
    if (areaHighway === 'traffic_island' || areaHighway === 'island') return true;
    if (tags.highway === 'traffic_island') return true;
    // traffic_calming=island is for nodes and lines; drawn as an island only when mapped as an area
    return tags.traffic_calming === 'island' && tags.area === 'yes';
}

/** Surfaces grouped by how they look from above */
export type SurfaceGroup = 'asphalt' | 'concrete' | 'paving' | 'sett' | 'gravel' | 'unpaved' | 'grass' | 'wood' | 'metal';

/** How a `surface=*` value looks, or undefined when it is not tagged or not known */
export function surfaceGroup(value: string | undefined): SurfaceGroup | undefined {
    if (!value) return undefined;
    if (['asphalt', 'chipseal', 'tarmac', 'paved', 'rubber', 'tartan'].includes(value)) return 'asphalt';
    if (value === 'concrete' || value === 'concrete:lanes' || value === 'cement') return 'concrete';
    if (['paving_stones', 'paved_stones', 'bricks', 'brick', 'concrete:plates', 'paving_stones:lanes'].includes(value)) return 'paving';
    if (['sett', 'cobblestone', 'unhewn_cobblestone', 'cobblestone:flattened', 'stone'].includes(value)) return 'sett';
    if (['gravel', 'fine_gravel', 'compacted', 'pebblestone', 'rock', 'shells'].includes(value)) return 'gravel';
    if (['dirt', 'earth', 'ground', 'mud', 'sand', 'soil', 'unpaved', 'woodchips', 'clay'].includes(value)) return 'unpaved';
    if (value === 'grass' || value === 'grass_paver' || value === 'artificial_turf') return 'grass';
    if (value === 'wood') return 'wood';
    if (value === 'metal' || value === 'metal_grid') return 'metal';
    return undefined;
}

export type IslandSurface = SurfaceGroup;

/** What an island is covered with, for its colour; untagged islands are concrete */
export function islandSurface(tags: Tags): IslandSurface {
    if (tags.landuse === 'grass' || tags.landcover === 'grass' || tags.natural === 'grassland') return 'grass';
    return surfaceGroup(tags.surface) ?? 'concrete';
}


/* ---------- road markings ---------- */

/**
 * `road_marking=*` values, as the wiki documents them (Key:road_marking). Others are still read (`box_junction`, legacy
 * values: see `markingKind`) but not offered
 */
export const roadMarkingValues = [
    'lane_divider', 'edge_line', 'stop_line', 'crossing_edge', 'restriction', 'crossing', 'arrow', 'text', 'symbol', 'traffic_sign'
] as const;

export const strokeValues = ['solid', 'dashed', 'double_solid', 'double_dashed', 'sharks_teeth', 'zigzag', 'dotted', 'solid_dashed', 'dashed_solid'] as const;
/** `arrow=*` values of a painted arrow (the values of `turn=*`) */
export const arrowValues = ['left', 'through', 'right', 'through;right', 'left;through', 'left;right', 'merge_to_left', 'merge_to_right',
    'reverse', 'slight_left', 'slight_right', 'no_right_turn', 'no_left_turn', 'no_u_turn', 'no_straight_on'] as const;
/** `symbol=*` values of a painted symbol: the wiki's generic terms (Key:symbol) */
export const symbolValues = ['bicycle', 'pedestrian', 'hov', 'airport', 'wheelchair', 'motorway'] as const;
/** `reason=*` values of a restriction area: why it is painted */
export const restrictionReasons = ['junction', 'bus_stop', 'driveway', 'emergency'] as const;
/** `pattern=*` values of a painted area (wiki: Key:road_marking; `hatch` is read as `stripes`) */
export const patternValues = ['stripes', 'crosshatch', 'x', 'chevron', 'zigzag', 'chessboard', 'solid', 'none', 'dots'] as const;
export const markingColours = ['white', 'yellow', 'red', 'blue', 'green', 'orange'] as const;
export type MarkingColour = typeof markingColours[number];

export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface RoadMarkingStyle {
    /** one style per painted line: one entry for a single line, two (left, right) for a double line */
    lines: StrokeStyle[];
    colour: MarkingColour;
    /** line width in metres */
    width: number;
    /** dash and gap lengths in metres, from `dasharray=*` */
    dash?: number[];
    /** fill pattern for an area */
    pattern?: string;
}

const singleStroke = (value: string | undefined): StrokeStyle | undefined => {
    if (value === 'solid' || value === 'continuous') return 'solid';
    if (value === 'dashed' || value === 'dash' || value === 'broken') return 'dashed';
    if (value === 'dotted' || value === 'dots') return 'dotted';
    return undefined;
};

/** The colour of a marking, from `colour=*` (named or #hex close to one), white by default */
export function markingColour(tags: Tags): MarkingColour {
    const colour = (tags.colour ?? tags.color ?? '').toLowerCase();
    if ((markingColours as readonly string[]).includes(colour)) return colour as MarkingColour;
    if (/^#?(ff[cd]|ffff00|ffd|fc0|fd0|ffcc|ffd7)/.test(colour)) return 'yellow';
    if (/^#?(f00|ff0000|e00|c00)/.test(colour)) return 'red';
    return 'white';
}

/**
 * Whether traffic may not overtake in a direction (wiki: Key:overtaking): `overtaking:forward|backward` where tagged,
 * else `overtaking=no`, or `overtaking=forward|backward` for the other direction. A lane used both ways is only
 * barred by `overtaking=no`
 */
export function overtakingBanned(tags: Tags, direction: LaneDirection): boolean {
    if (direction === 'both_ways') return tags.overtaking === 'no';
    const own = tags[`overtaking:${direction}`];
    if (own) return own === 'no';
    return tags.overtaking === 'no' || tags.overtaking === (direction === 'forward' ? 'backward' : 'forward');
}

/**
 * The centre line between the two directions, from who may overtake across it: dashed, a double white line solid on
 * the side of forward or backward traffic (which may not cross it), or double solid lines (neither may)
 */
export type CentreLine = 'dashed' | 'no_forward' | 'no_backward' | 'no_both';
export const centreLines: readonly CentreLine[] = ['dashed', 'no_forward', 'no_backward', 'no_both'];

export function centreLine(tags: Tags): CentreLine {
    const forward = overtakingBanned(tags, 'forward');
    const backward = overtakingBanned(tags, 'backward');
    return forward && backward ? 'no_both' : forward ? 'no_forward' : backward ? 'no_backward' : 'dashed';
}

/**
 * Tags a centre line: `overtaking=yes` or `overtaking=no` when both directions are the same, else
 * `overtaking:forward=no` or `overtaking:backward=no` for the one that may not overtake (wiki: Key:overtaking)
 */
export function withCentreLine(tags: Tags, line: CentreLine): Tags {
    const next = { ...tags };
    for (const key of ['overtaking', 'overtaking:forward', 'overtaking:backward', 'overtaking:both_ways']) delete next[key];
    if (line === 'dashed') next.overtaking = 'yes';
    else if (line === 'no_both') next.overtaking = 'no';
    else next[`overtaking:${line === 'no_forward' ? 'forward' : 'backward'}`] = 'no';
    return next;
}

/** Lets traffic in one direction overtake across the centre line, or not, keeping the other direction as it is */
export function withOvertaking(tags: Tags, direction: 'forward' | 'backward', banned: boolean): Tags {
    const forward = direction === 'forward' ? banned : overtakingBanned(tags, 'forward');
    const backward = direction === 'backward' ? banned : overtakingBanned(tags, 'backward');
    return withCentreLine(tags, forward && backward ? 'no_both' : forward ? 'no_forward' : backward ? 'no_backward' : 'dashed');
}


/** How a road marking is painted, from `road_marking`, `stroke`, `stroke:left|right`, `colour`, `width`, `dasharray` and `pattern` */
export function roadMarkingStyle(tags: Tags): RoadMarkingStyle {
    const kind = tags.road_marking ?? '';
    const stroke = tags.stroke ?? '';
    let lines: StrokeStyle[];

    const left = singleStroke(tags['stroke:left']);
    const right = singleStroke(tags['stroke:right']);
    if (left || right) {
        lines = [left ?? 'solid', right ?? 'solid'];
    } else if (stroke.startsWith('double')) {
        const each = singleStroke(stroke.replace(/^double_?/, '')) ?? 'solid';
        lines = [each, each];
    } else if (/^(solid|dashed|dotted)_(solid|dashed|dotted)$/.test(stroke)) {
        const [a, b] = stroke.split('_');
        lines = [singleStroke(a)!, singleStroke(b)!];
    } else {
        const single = singleStroke(stroke) ?? (
            kind === 'dashed_line' || kind === 'give_way' || kind === 'dash' ? 'dashed' :
            'solid');
        lines = [single];
    }

    const tagged = parseFloat(tags.width ?? '');
    const thick = kind === 'stop_line' || kind === 'solid_stop_line' || kind === 'give_way';
    const width = Number.isFinite(tagged) && tagged > 0 && tagged < 3 ? tagged : thick ? 0.3 : 0.15;

    const dash = (tags.dasharray ?? '').split(/[,; ]+/).map(Number).filter(n => Number.isFinite(n) && n > 0);
    return {
        lines,
        colour: markingColour(tags),
        width,
        dash: dash.length >= 2 ? dash : undefined,
        pattern: tags.pattern ?? (kind === 'gore_chevron' ? 'chevron' : kind === 'restriction' || kind === 'hatched' ? 'hatch' : undefined)
    };
}


/* ---------- street parking ---------- */

/** `parking=*` values for parking beside or on the carriageway */
export const streetParkingValues = ['street_side', 'lane', 'layby', 'on_kerb', 'half_on_kerb'] as const;

/** A parking area on or beside the street, which Lane Studio joins to the road */
export function isStreetParking(tags: Tags): boolean {
    return tags.amenity === 'parking' && (streetParkingValues as readonly string[]).includes(tags.parking ?? '');
}

/** Parking that is part of the carriageway, so it needs no connection to it */
export const parkingOnCarriageway = (tags: Tags) => tags.parking === 'lane';
