/*
 * Tag rules for mapped street features that Lane Studio draws and edits beside its lanes:
 * traffic islands, painted road markings (`road_marking=*`) and street parking areas.
 */

/** A traffic island mapped as an area */
export function isTrafficIsland(tags: Tags): boolean {
    const areaHighway = tags['area:highway'];
    if (areaHighway === 'traffic_island' || areaHighway === 'island') return true;
    if (tags.highway === 'traffic_island') return true;
    // traffic_calming=island is for nodes and lines; drawn as an island only when mapped as an area
    return tags.traffic_calming === 'island' && tags.area === 'yes';
}

export type IslandSurface = 'grass' | 'paving' | 'sett' | 'asphalt' | 'concrete';

/** What an island is covered with, for its colour; untagged islands are concrete */
export function islandSurface(tags: Tags): IslandSurface {
    const surface = tags.surface ?? '';
    if (tags.landuse === 'grass' || tags.landcover === 'grass' || tags.natural === 'grassland' ||
        ['grass', 'dirt', 'earth', 'ground', 'soil', 'grass_paver'].includes(surface)) return 'grass';
    if (['paving_stones', 'paved_stones', 'bricks', 'brick', 'concrete:plates'].includes(surface)) return 'paving';
    if (['sett', 'cobblestone', 'unhewn_cobblestone', 'cobblestone:flattened', 'stone'].includes(surface)) return 'sett';
    if (surface === 'asphalt' || surface === 'chipseal' || surface === 'tarmac') return 'asphalt';
    return 'concrete';
}


/* ---------- road markings ---------- */

export const roadMarkingValues = [
    'solid_line', 'dashed_line', 'stop_line', 'give_way', 'crossing', 'restriction', 'hatched',
    'arrow', 'text', 'symbol', 'bus_stop', 'parking', 'coloured'
] as const;

export const strokeValues = ['solid', 'dashed', 'dotted', 'double_solid', 'double_dashed', 'solid_dashed', 'dashed_solid'] as const;
export const patternValues = ['crosshatch', 'hatch', 'chevron', 'dots', 'solid', 'zigzag'] as const;
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
            kind === 'dashed_line' || kind === 'give_way' ? 'dashed' :
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
        pattern: tags.pattern ?? (kind === 'restriction' || kind === 'hatched' ? 'hatch' : undefined)
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
