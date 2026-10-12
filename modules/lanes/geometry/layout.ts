import type { coreGraph } from '../../core/graph';
import type { NodeId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { isLaneRoad, sidewalkExpectedHighways } from '../core/roads';
import {
    parseLanes, laneRefsInWayOrder, parseChange,
    type LaneChange, type LaneModel, type LaneRef
} from '../model';

/** What a lane is for, which decides its colour and pattern */
export type LaneKind = 'general' | 'bus' | 'psv' | 'taxi' | 'hov' | 'bicycle' | 'pedestrian' | 'restricted';

export interface LaneInfo {
    ref: LaneRef;
    /** metres */
    width: number;
    kind: LaneKind;
    turn: string;
    change?: LaneChange;
    values: Record<string, string>;
}

export type RoadsideKind = 'sidewalk' | 'sidewalk_unknown' | 'cycle_lane' | 'cycle_track' | 'parking';

export interface RoadsideStrip {
    kind: RoadsideKind;
    /** metres */
    width: number;
    /** true when the width is a default rather than tagged */
    assumed: boolean;
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


function laneKind(values: Record<string, string>): LaneKind {
    const v = (key: string) => values[key] ?? '';
    const reserved = (key: string) => v(key) === 'designated';
    if (reserved('bus:lanes')) return 'bus';
    if (reserved('psv:lanes')) return 'psv';
    if (reserved('taxi:lanes')) return 'taxi';
    if (reserved('hov:lanes')) return 'hov';
    if (reserved('bicycle:lanes')) return 'bicycle';
    if (reserved('foot:lanes')) return 'pedestrian';
    if (['no', 'private'].includes(v('access:lanes')) || ['no', 'private'].includes(v('motor_vehicle:lanes')) ||
        ['no', 'private'].includes(v('vehicle:lanes'))) return 'restricted';
    return 'general';
}


/** Per-lane width from iD's own highway defaults (`osmWay.impliedLineWidthMeters`) */
function defaultLaneWidth(way: osmWay): number {
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

function roadsideStrips(tags: Tags, side: 'left' | 'right'): RoadsideStrip[] {
    const strips: RoadsideStrip[] = [];

    const cycleway = sideValue(tags, 'cycleway', side);
    if (cycleway === 'lane' || cycleway === 'opposite_lane') {
        strips.push({ kind: 'cycle_lane', width: 1.5, assumed: true });
    }

    // on-street parking sits between the carriageway (or its cycle lane) and the kerb
    const parking = tags[`parking:${side}`] ?? tags['parking:both'];
    if (parking === 'lane' || parking === 'street_side' || parking === 'half_on_kerb') {
        const orientation = tags[`parking:${side}:orientation`] ?? tags['parking:both:orientation'];
        const width = orientation === 'perpendicular' ? 5 : orientation === 'diagonal' ? 4.5 : 2.2;
        strips.push({ kind: 'parking', width: parking === 'half_on_kerb' ? width / 2 : width, assumed: true });
    }

    if (cycleway === 'track' || cycleway === 'opposite_track') {
        strips.push({ kind: 'cycle_track', width: 2, assumed: true });
    }

    const sidewalk = sideValue(tags, 'sidewalk', side);
    const width = parseWidth(tags[`sidewalk:${side}:width`] ?? tags['sidewalk:both:width'] ?? tags['sidewalk:width']);
    if (sidewalk === 'yes') {
        strips.push({ kind: 'sidewalk', width: width ?? 2, assumed: width === undefined });
    } else if (sidewalk === undefined && sidewalkExpectedHighways.has(tags.highway ?? '')) {
        strips.push({ kind: 'sidewalk_unknown', width: 1.5, assumed: true });
    }
    return strips;
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

    const fallback = parseWidth(tags.width);
    const perLane = fallback !== undefined ? fallback / count : defaultLaneWidth(way);
    let assumed = model.countSource !== 'tagged';

    const lanes: LaneInfo[] = refs.map(ref => {
        const values = model.lanes[ref.direction][ref.index].values;
        const tagged = parseWidth(values['width:lanes']);
        if (tagged === undefined && fallback === undefined) assumed = true;
        return {
            ref,
            width: tagged ?? perLane,
            kind: laneKind(values),
            turn: values['turn:lanes'] ?? '',
            change: parseChange(values['change:lanes'] ?? ''),
            values
        };
    });

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
        roadside: { left: roadsideStrips(tags, 'left'), right: roadsideStrips(tags, 'right') }
    };
}
