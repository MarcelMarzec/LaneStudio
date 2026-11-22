import type { coreGraph } from '../../core/graph';
import type { NodeId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { builtHighway, isLaneRoad, sidewalkExpectedHighways } from '../core/roads';
import { assumedShoulder, busValue, contraflowSide, cyclewayValue, cyclewayWidth, shoulderValue, type Side } from '../core/roadside';
import { laneKindFromValues, type LaneKindValue } from '../model/kinds';
import { markingColour, surfaceGroup, type MarkingColour, type SurfaceGroup } from '../model/street_features';
import { kerbMarking, parkingUse, parkingValue, type KerbMarking, type ParkingUse } from '../model/parking';
import {
    parseLanes, laneRefsInWayOrder, parseChange,
    type LaneChange, type LaneModel, type LaneRef
} from '../model';

/** What a lane is for, which decides its colour and pattern */
export type LaneKind = LaneKindValue;

export interface LaneInfo {
    ref: LaneRef;
    /** metres */
    width: number;
    kind: LaneKind;
    turn: string;
    change?: LaneChange;
    values: Record<string, string>;
    /** lane keys whose value this lane takes from the road's plain key, having none of its own */
    inherited?: string[];
}

export type RoadsideKind = 'shoulder' | 'sidewalk' | 'sidewalk_unknown' | 'sidewalk_lane' | 'cycle_lane' | 'cycle_buffer' | 'cycle_track'
    | 'parking' | 'bus_lane' | 'bus_bay';

/** A cycle lane or track's details (wiki: Key:cycleway) */
export interface CycleDetail {
    /** `cycleway:<side>:lane`: a solid line others may not cross (`exclusive`) or a dashed one (`advisory`) */
    lane?: 'exclusive' | 'advisory';
    /** which way its cycles go along the way: with it, against it, or both (`cycleway:<side>:oneway=no`) */
    travel: 'forward' | 'backward' | 'both';
    /** `cycleway:<side>:separation`: what keeps it apart from the lanes (bollards, a kerb, planters…) */
    separation?: string;
    /** `cycleway:<side>:surface:colour`, when it is coloured */
    colour?: MarkingColour;
}

export interface RoadsideStrip {
    kind: RoadsideKind;
    /** metres */
    width: number;
    /** true when the width is a default rather than tagged */
    assumed: boolean;
    /** parking: how cars stand, and whether they stand on the road or on the pavement */
    parking?: ParkingLayout;
    /** cycle lanes and tracks */
    cycle?: CycleDetail;
    /** pavements: their surface (`sidewalk:<side>:surface`) and the kerb between them and the road (`sidewalk:<side>:kerb`) */
    surface?: SurfaceGroup;
    kerb?: string;
}

export interface ParkingLayout {
    orientation: 'parallel' | 'diagonal' | 'perpendicular';
    /**
     * `lane`, `half_on_kerb` and `yes` (parking, nothing more said) on the carriageway, `street_side` in a layby,
     * `shoulder` on the road's shoulder, `on_kerb` on the pavement
     */
    position: 'lane' | 'street_side' | 'half_on_kerb' | 'on_kerb' | 'shoulder' | 'yes';
    /** `back_in`: diagonal bays lean the other way (wiki: Street parking § Special rules on parking direction) */
    direction?: 'back_in' | 'head_in';
    /** bay lines are painted, unless `markings=no` */
    markings: boolean;
    /** how many bays the strip holds (`capacity`), when tagged */
    capacity?: number;
    /** what the bays are kept for: loading, charging, disabled drivers or permit holders */
    use?: ParkingUse;
    /** the parking's own `surface` */
    surface?: string;
}

export interface LaneLayout {
    model: LaneModel;
    /** lanes left to right looking along the way */
    lanes: LaneInfo[];
    /** carriageway width in metres */
    total: number;
    /** true when the lane count or any width comes from defaults rather than tags */
    assumed: boolean;
    /** false for `lane_markings=no`: lanes exist but have no painted lines */
    markings: boolean;
    /** lane boundary offsets from the way line in metres (right positive), before placement */
    edges: number[];
    /** placement shift at the way's first and last node (the way line moves this far right of the carriageway's reference) */
    shiftStart: number;
    shiftEnd: number;
    /** strips outside the carriageway, kerb outwards, per side of the way */
    roadside: { left: RoadsideStrip[]; right: RoadsideStrip[] };
    /** yellow or red lines along the kerb where parking is restricted, per side of the way */
    kerbMarkings: { left?: KerbMarking; right?: KerbMarking };
    /** lanes widening or narrowing along the way (`width:lanes:start`, `width:lanes:end`): each lane's width at each end */
    widthsAlong?: { start: number[]; end: number[] };
}


/** Reads a width like `3.5`, `3.5 m` or `12'6"` into metres */
export function parseWidth(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const v = value.trim();
    let m = v.match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/);
    if (m) return parseFloat(m[1]);
    m = v.match(/^(\d+)'(?:\s*(\d+(?:\.\d+)?)")?$/);
    if (m) return parseInt(m[1], 10) * 0.3048 + (m[2] ? parseFloat(m[2]) * 0.0254 : 0);
    return undefined;
}


/**
 * Lane widths in metres for lanes with no width tagged, from UK practice: 3.65 m lanes on motorways and
 * dual carriageways and a 7.3 m single carriageway (DMRB CD 127), narrowing on local roads to a 5.5 m
 * residential street and a 4.8 m living street (Manual for Streets). iD's own line widths, used to draw
 * its lines, are 0.3–1.4 m a lane wider.
 */
export const defaultLaneWidths: Record<string, number> = {
    motorway: 3.65, motorway_link: 3.65,
    trunk: 3.65, trunk_link: 3.65,
    primary: 3.65, primary_link: 3.5,
    secondary: 3.5, secondary_link: 3.5,
    tertiary: 3.25, tertiary_link: 3.25,
    unclassified: 3.25, road: 3.25, busway: 3.25, bus_guideway: 3.25, escape: 4.5,
    residential: 2.75, service: 2.75,
    living_street: 2.4
};

/** Per-lane width for a road with none tagged: the UK defaults above, else iD's own highway defaults */
function defaultLaneWidth(way: osmWay): number {
    // a road being built is as wide as the road it will be
    const highway = builtHighway(way.tags);
    if (highway && defaultLaneWidths[highway]) return defaultLaneWidths[highway];
    const implied = way.impliedLineWidthMeters();
    if (!implied) return 3;
    const counted = parseInt(way.tags.lanes ?? '', 10) || (way.isOneWay() ? 1 : 2);
    return implied / counted;
}


/** The shift that puts the way line on the lane edge a `placement` value names, or undefined */
function placementShift(value: string | undefined, direction: LaneRef['direction'], lanes: LaneInfo[], edges: number[]): number | undefined {
    const m = value?.match(/^(left_of|right_of|middle_of):(\d+)$/);
    if (!m) return undefined;
    const k = lanes.findIndex(l => l.ref.direction === direction && l.ref.index === parseInt(m[2], 10) - 1);
    if (k === -1) return undefined;
    const left = edges[k];
    const right = edges[k + 1];
    // backward drivers look the other way, so their left is the way's right
    const [near, far] = direction === 'backward' ? [right, left] : [left, right];
    const pos = m[1] === 'left_of' ? near : m[1] === 'right_of' ? far : (left + right) / 2;
    return -pos;
}


function sideValue(tags: Tags, key: string, side: 'left' | 'right'): string | undefined {
    const specific = tags[`${key}:${side}`] ?? tags[`${key}:both`];
    if (specific) return specific;
    const plain = tags[key];
    if (!plain) return undefined;
    if (plain === 'both') return 'yes';
    if (plain === 'left' || plain === 'right') return plain === side ? 'yes' : 'no';
    if (plain === 'none') return 'no';
    return plain;
}

/** Which way traffic beside a side of the way goes along it: the side's own traffic on a two-way road, the road's on a one-way one */
function sideTravel(side: Side, driveSide: Side, oneway: LaneLayout['model']['oneway']): 'forward' | 'backward' {
    if (oneway) return oneway;
    // where traffic keeps right, traffic going along the way is on its right
    return (side === 'right') === (driveSide === 'right') ? 'forward' : 'backward';
}

/** A side's cycle lane or track details, from `cycleway:<side>:*` (or `cycleway:both:*`, `cycleway:*`) */
function cycleDetail(tags: Tags, side: Side, value: string, travel: 'forward' | 'backward', contraflow: Side | null): CycleDetail {
    const get = (key: string) => tags[`cycleway:${side}:${key}`] ?? tags[`cycleway:both:${key}`] ?? tags[`cycleway:${key}`];
    const lane = get('lane');
    const oneway = get('oneway');
    const against = travel === 'forward' ? 'backward' : 'forward';
    const colour = get('surface:colour');
    return {
        lane: lane === 'exclusive' || lane === 'advisory' ? lane : undefined,
        // an old contraflow value runs against the road; `cycleway:<side>:oneway` says it outright
        travel: oneway === '-1' ? 'backward' : oneway === 'yes' ? 'forward' : oneway === 'no' ? 'both'
            : (value.startsWith('opposite') && side === contraflow) ? against : travel,
        separation: get('separation') ?? get('separation:left') ?? get('separation:right'),
        colour: colour ? markingColour({ colour }) : undefined
    };
}

function roadsideStrips(tags: Tags, side: Side, shoulderSide: Side | null, runningShoulder: boolean, contraflow: Side | null,
    driveSide: Side, oneway: LaneLayout['model']['oneway'], busLanes: boolean): RoadsideStrip[] {
    const strips: RoadsideStrip[] = [];

    // a hard shoulder runs right beside the carriageway (wiki: Key:shoulder)
    if (shoulderValue(tags, side, shoulderSide) === 'yes' || assumedShoulder(tags, side, shoulderSide, runningShoulder)) {
        const width = parseWidth(tags[`shoulder:${side}:width`] ?? tags['shoulder:both:width'] ?? tags['shoulder:width']);
        strips.push({ kind: 'shoulder', width: width ?? 2.5, assumed: width === undefined });
    }

    // a cycle lane is painted on the carriageway (wiki: Key:cycleway); `opposite_lane` is an old way of tagging a
    // contraflow lane on a one-way road, on the side its cycles keep to
    // a bus lane tagged in the old way (`busway:<side>=lane`, wiki: Key:busway), when the lanes have none of their own
    const bus = busValue(tags, side, shoulderSide, contraflow);
    if (!busLanes && (bus === 'lane' || bus === 'opposite_lane')) strips.push({ kind: 'bus_lane', width: 3, assumed: true });

    const cycleway = cyclewayValue(tags, side, contraflow);
    const cycleWidth = cyclewayWidth(tags, side);
    const travel = sideTravel(side, driveSide, oneway);
    if (cycleway === 'lane' || cycleway === 'opposite_lane') {
        // a painted buffer between the lanes and the cycle lane (`cycleway:<side>:buffer`: yes, or its width)
        const buffer = tags[`cycleway:${side}:buffer`] ?? tags['cycleway:both:buffer'];
        const bufferWidth = buffer === 'yes' ? 0.5 : parseWidth(buffer);
        if (bufferWidth) strips.push({ kind: 'cycle_buffer', width: bufferWidth, assumed: buffer === 'yes' });
        strips.push({ kind: 'cycle_lane', width: cycleWidth ?? 1.5, assumed: cycleWidth === undefined, cycle: cycleDetail(tags, side, cycleway, travel, contraflow) });
    }

    // on-street parking sits between the carriageway (or its cycle lane) and the kerb (wiki: Street parking)
    const parking = parkingValue(tags, side);
    const tagged = parkingValue(tags, side, 'orientation');
    const orientation = tagged === 'perpendicular' || tagged === 'diagonal' ? tagged : 'parallel';
    const taggedWidth = parseWidth(parkingValue(tags, side, 'width'));
    const parkingWidth = taggedWidth ?? (orientation === 'perpendicular' ? 5 : orientation === 'diagonal' ? 4.5 : 2.2);
    const direction = parkingValue(tags, side, 'direction');
    const capacity = parseInt(parkingValue(tags, side, 'capacity') ?? '', 10);
    const details = (position: ParkingLayout['position']): ParkingLayout => ({
        orientation, position,
        direction: direction === 'back_in' || direction === 'head_in' ? direction : undefined,
        markings: parkingValue(tags, side, 'markings') !== 'no',
        capacity: capacity > 0 ? capacity : undefined,
        use: parkingUse(tags, side),
        surface: parkingValue(tags, side, 'surface')
    });
    if (parking === 'lane' || parking === 'street_side' || parking === 'half_on_kerb' || parking === 'shoulder' || parking === 'yes') {
        // half on the kerb: half the car on the carriageway (the other half stands on the pavement)
        const width = parking === 'half_on_kerb' && taggedWidth === undefined ? parkingWidth / 2 : parkingWidth;
        strips.push({ kind: 'parking', width, assumed: taggedWidth === undefined, parking: details(parking) });
    }

    // a pedestrian lane painted on the road (`sidewalk=lane`)
    const sidewalk = sideValue(tags, 'sidewalk', side);
    const sidewalkWidth = parseWidth(tags[`sidewalk:${side}:width`] ?? tags['sidewalk:both:width'] ?? tags['sidewalk:width']);
    if (sidewalk === 'lane') strips.push({ kind: 'sidewalk_lane', width: sidewalkWidth ?? 1.5, assumed: sidewalkWidth === undefined });

    // a bus bay (`bus_bay=left|right|both`, on the stretch of road beside it): a layby the kerb goes round
    if (tags.bus_bay === side || tags.bus_bay === 'both') strips.push({ kind: 'bus_bay', width: 3, assumed: true });

    if (cycleway === 'track' || cycleway === 'opposite_track') {
        strips.push({ kind: 'cycle_track', width: cycleWidth ?? 2, assumed: cycleWidth === undefined, cycle: cycleDetail(tags, side, cycleway, travel, contraflow) });
    }
    // parking on the pavement: beyond the kerb, before the walking space
    if (parking === 'on_kerb') {
        strips.push({ kind: 'parking', width: parkingWidth, assumed: taggedWidth === undefined, parking: details('on_kerb') });
    }

    const width = sidewalkWidth;
    if (sidewalk === 'yes') {
        const sidewalkTag = (key: string) => tags[`sidewalk:${side}:${key}`] ?? tags[`sidewalk:both:${key}`] ?? tags[`sidewalk:${key}`];
        strips.push({
            kind: 'sidewalk', width: width ?? 2, assumed: width === undefined,
            surface: surfaceGroup(sidewalkTag('surface')), kerb: sidewalkTag('kerb')
        });
    } else if (sidewalk === undefined && sidewalkExpectedHighways.has(builtHighway(tags) ?? '')) {
        strips.push({ kind: 'sidewalk_unknown', width: 1.5, assumed: true });
    }
    return strips;
}


/** Lane keys whose blank slots take the road's plain key, and the plain key (wiki: Lanes, Key:turn, Key:destination) */
const roadDefaults: [string, string][] = [['turn:lanes', 'turn'], ['destination:lanes', 'destination'], ['destination:ref:lanes', 'destination:ref']];

/**
 * Fills a lane's blank slots from the road (a blank value takes the plain key's, wiki: Lanes): `turn:forward` or `turn`
 * for every lane, `destination:forward` (or plain `destination` on a one-way road, where the wiki puts it) for its
 * direction. Only the drawing's copy of the values is filled, never the tags. Returns the keys it filled.
 */
function fillFromRoad(values: Record<string, string>, tags: Tags, direction: LaneRef['direction'], oneway: boolean): string[] {
    const filled: string[] = [];
    for (const [laneKey, plain] of roadDefaults) {
        if (values[laneKey]) continue;
        const value = tags[`${plain}:${direction}`] ?? (oneway || plain === 'turn' ? tags[plain] : undefined);
        if (!value) continue;
        values[laneKey] = value;
        filled.push(laneKey);
    }
    return filled;
}

/** The narrowest lane a tagged `width` is shared out into once the strips on the road are taken off */
const minimumLaneWidth = 2;

/**
 * Whether a roadside strip is on the carriageway, inside the kerbs `width` is measured between: a cycle lane, a
 * pedestrian lane, and parking on the road (half of it, for half on the kerb). A hard shoulder has its own
 * `shoulder:width`, and bays beside the road, a cycle track and parking on the pavement are beyond the kerb.
 */
export function stripOnCarriageway(strip: RoadsideStrip): boolean {
    if (['cycle_lane', 'cycle_buffer', 'sidewalk_lane', 'bus_lane'].includes(strip.kind)) return true;
    if (strip.kind !== 'parking' || !strip.parking) return false;
    return ['lane', 'yes', 'half_on_kerb'].includes(strip.parking.position);
}


/** The road way that continues `way` at `nodeID`, preferring the same name and highway class */
function continuation(way: osmWay, nodeID: NodeId, graph: coreGraph): osmWay | undefined {
    const node = graph.hasEntity(nodeID);
    if (!node) return undefined;
    const candidates = graph.parentWays(node)
        .filter(w => w.id !== way.id && isLaneRoad(w) && (w.first() === nodeID || w.last() === nodeID)) as osmWay[];
    const score = (w: osmWay) => (w.tags.name === way.tags.name ? 2 : 0) + (w.tags.highway === way.tags.highway ? 1 : 0);
    return candidates.sort((a, b) => score(b) - score(a))[0];
}


/** Works out a road's lanes, widths, placement and roadside, in metres */
export function laneLayout(way: osmWay, graph: coreGraph, depth = 0): LaneLayout {
    const tags = way.tags;
    const model = parseLanes(tags, { driveSide: laneDriveSide(way, graph) });
    const refs = laneRefsInWayOrder(model);
    const count = refs.length;

    // a plain shoulder=yes on a one-way road is on the side traffic keeps to (the left in the UK)
    const driveSide = laneDriveSide(way, graph);
    const shoulderSide: Side | null = model.oneway === 'forward' ? driveSide : model.oneway === 'backward' ? (driveSide === 'left' ? 'right' : 'left') : null;
    const contraflow = contraflowSide(model.oneway, driveSide);

    const kinds = refs.map(ref => laneKindFromValues(model.lanes[ref.direction][ref.index].values, builtHighway(tags)));
    const runningShoulder = kinds.includes('variable');
    const busLanes = kinds.some(kind => kind === 'bus' || kind === 'psv');
    const roadside = {
        left: roadsideStrips(tags, 'left', shoulderSide, runningShoulder, contraflow, driveSide, model.oneway, busLanes),
        right: roadsideStrips(tags, 'right', shoulderSide, runningShoulder, contraflow, driveSide, model.oneway, busLanes)
    };

    // `width` is the carriageway from kerb to kerb, cycle lanes and parking on the road included (wiki: Key:width), so
    // what is left for the lanes is the width less those; lanes with no `width:lanes` share what the others leave
    const kerbToKerb = parseWidth(tags.width) ?? parseWidth(tags['width:carriageway']) ?? parseWidth(tags.est_width);
    const taggedWidths = refs.map(ref => parseWidth(model.lanes[ref.direction][ref.index].values['width:lanes']));
    let perLane = defaultLaneWidth(way);
    if (kerbToKerb !== undefined) {
        const onRoad = [...roadside.left, ...roadside.right].reduce((sum, strip) => sum + (stripOnCarriageway(strip) ? strip.width : 0), 0);
        const untagged = taggedWidths.filter(w => w === undefined).length;
        const left = kerbToKerb - onRoad - taggedWidths.reduce<number>((sum, w) => sum + (w ?? 0), 0);
        // (a width too narrow for its lanes and strips is shared out as tagged, as it was before strips were counted)
        perLane = untagged && left / untagged >= minimumLaneWidth ? left / untagged : kerbToKerb / count;
    }
    let assumed = model.countSource !== 'tagged';

    const lanes: LaneInfo[] = refs.map((ref, i) => {
        const values = model.lanes[ref.direction][ref.index].values;
        const inherited = fillFromRoad(values, tags, ref.direction, !!model.oneway);
        const tagged = taggedWidths[i];
        if (tagged === undefined && kerbToKerb === undefined) assumed = true;
        return {
            ref,
            width: tagged ?? perLane,
            kind: kinds[i],
            turn: values['turn:lanes'] ?? '',
            change: parseChange(values['change:lanes'] ?? ''),
            values,
            ...(inherited.length ? { inherited } : {})
        };
    });

    // lanes changing width along the way, from `width:lanes:start` to `width:lanes:end` (else their width)
    const startWidths = lanes.map(lane => parseWidth(lane.values['width:lanes:start']) ?? lane.width);
    const endWidths = lanes.map(lane => parseWidth(lane.values['width:lanes:end']) ?? lane.width);
    const changing = lanes.some((lane, i) => Math.abs(startWidths[i] - lane.width) > 0.01 || Math.abs(endWidths[i] - lane.width) > 0.01);

    const total = lanes.reduce((sum, l) => sum + l.width, 0);
    const edges = [-total / 2];
    for (const lane of lanes) edges.push(edges[edges.length - 1] + lane.width);

    // placement: where the way line sits on the carriageway
    const placementKey = model.oneway ? 'placement' : 'placement:forward';
    const placementDirection = model.oneway || 'forward';
    const direct = (value: string | undefined) =>
        placementShift(value, placementDirection, lanes, edges) ??
        (!model.oneway ? placementShift(tags['placement:backward'], 'backward', lanes, edges) : undefined);

    const value = tags[placementKey] ?? tags.placement;
    let shiftStart = direct(tags['placement:start']) ?? direct(value) ?? 0;
    let shiftEnd = direct(tags['placement:end']) ?? direct(value) ?? 0;

    if (value === 'transition' && depth === 0) {
        // a transition joins the placements of the roads either side
        const before = continuation(way, way.first(), graph);
        const after = continuation(way, way.last(), graph);
        if (before) {
            const l = laneLayout(before, graph, 1);
            shiftStart = before.last() === way.first() ? l.shiftEnd : -l.shiftStart;
        }
        if (after) {
            const l = laneLayout(after, graph, 1);
            shiftEnd = after.first() === way.last() ? l.shiftStart : -l.shiftEnd;
        }
    }

    return {
        model,
        lanes,
        total,
        assumed,
        markings: tags.lane_markings !== 'no',
        edges,
        shiftStart,
        shiftEnd,
        roadside,
        kerbMarkings: { left: kerbMarking(tags, 'left'), right: kerbMarking(tags, 'right') },
        ...(changing ? { widthsAlong: { start: startWidths, end: endWidths } } : {})
    };
}
