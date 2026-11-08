import type { Vec2 } from '../../geo/vector';
import { add, metricFrame, pointAlong, polylineLength, scale } from './frame';
import { ringEdges } from './structures';
import type { RoadPiece } from './road_geometry';
import { cyclewayValue, roadContraflowSide, type Side } from '../core/roadside';

/*
 * Symbols painted along lanes and roadside strips, as on British roads (TSRGD): a cycle symbol in cycle lanes and
 * tracks, pointing the way their cycles go (both ways on a two-way track); cycle symbols with chevrons in the lane a
 * shared lane is marked in (`cycleway:<side>=shared_lane`), and in the bus lane cycles share (`share_busway`); BUS LANE
 * in bus lanes and a BUS STOP box in bus bays, in the UK.
 */

export type LaneSymbolKind = 'cycle' | 'sharrow' | 'bus_lane_text' | 'bus_stop_text';

export interface LaneSymbol {
    key: string;
    kind: LaneSymbolKind;
    loc: Vec2;
    /** a point a metre on, the way the symbol faces */
    ahead: Vec2;
    /** metres across */
    size: number;
    /** the way it was drawn for, so it lights up with it */
    wayID: string;
}

export interface LaneBox {
    key: string;
    /** a closed outline: the yellow box a bus stop clearway is marked with */
    points: Vec2[];
    wayID: string;
}

/** Where symbols go along a centre line: `first` metres in, then every `spacing` metres, leaving `first` at the end */
function along(centre: Vec2[], first: number, spacing: number): { loc: Vec2; direction: Vec2 }[] {
    if (centre.length < 2) return [];
    const frame = metricFrame(centre[0]);
    const points = centre.map(frame.toMetres);
    const length = polylineLength(points);
    // (no spacing: once, in the middle)
    if (length < first * 2 || !Number.isFinite(spacing)) return length > 6 ? [at(length / 2)] : [];
    const out = [];
    for (let s = first; s <= length - first; s += spacing) out.push(at(s));
    return out;

    function at(s: number) {
        const p = pointAlong(points, s);
        return { loc: frame.toLoc(p.point), direction: p.direction, frame, point: p.point };
    }
}

/** The line down the middle of a strip or lane polygon built from two edges */
function middle(polygon: Vec2[]): Vec2[] {
    const [a, b] = ringEdges(polygon);
    const n = Math.min(a.length, b.length);
    return Array.from({ length: n }, (_, i) => [(a[i][0] + b[i][0]) / 2, (a[i][1] + b[i][1]) / 2] as Vec2);
}

/** One symbol facing `travel` along the way (`backward`: against it) at a point of a centre line */
function placed(centre: Vec2[], first: number, spacing: number, travel: 'forward' | 'backward') {
    return along(centre, first, spacing).map(({ loc, direction }) => {
        const frame = metricFrame(loc);
        const facing = travel === 'forward' ? direction : scale(direction, -1);
        return { loc, ahead: frame.toLoc(add([0, 0], facing)) };
    });
}

export function laneSymbols(pieces: RoadPiece[], tagsOf: (id: string) => Tags, graph: iD.Graph, uk: (loc: Vec2) => boolean): { symbols: LaneSymbol[]; boxes: LaneBox[] } {
    const symbols: LaneSymbol[] = [];
    const boxes: LaneBox[] = [];
    for (const piece of pieces) {
        const key = `${piece.wayID}-${piece.index}`;
        const tags = tagsOf(piece.wayID);
        const inUk = uk(piece.middle);

        // cycle lanes and tracks: a cycle symbol pointing the way the cycles go
        piece.roadside.forEach((strip, i) => {
            if ((strip.kind === 'cycle_lane' || strip.kind === 'cycle_track') && strip.cycle) {
                const centre = middle(strip.polygon);
                const ways: ('forward' | 'backward')[] = strip.cycle.travel === 'both' ? ['forward', 'backward'] : [strip.cycle.travel];
                ways.forEach((travel, w) => placed(centre, 10 + w * 6, 40, travel).forEach((p, k) => symbols.push({
                    key: `${key}-cycle-${i}-${w}-${k}`, kind: 'cycle', size: Math.min(1.8, centreWidth(strip.polygon) * 1.4), wayID: piece.wayID, ...p
                })));
            }
            // a bus bay: the yellow BUS STOP box (diagram 1025.1) along it, in the UK
            if (strip.kind === 'bus_bay' && inUk) {
                const [a, b] = ringEdges(strip.polygon);
                const inset = (line: Vec2[], other: Vec2[]) => line.map((p, j) => [p[0] + (other[j][0] - p[0]) * 0.12, p[1] + (other[j][1] - p[1]) * 0.12] as Vec2);
                const n = Math.min(a.length, b.length);
                boxes.push({ key: `${key}-bay-${i}`, wayID: piece.wayID, points: [...inset(a.slice(0, n), b), ...inset(b.slice(0, n), a).reverse()] });
                const centre = middle(strip.polygon);
                const travel = travelOfSide(strip.side, piece);
                placed(centre, 10, Infinity, travel).forEach((p, k) => symbols.push({
                    key: `${key}-busstop-${i}-${k}`, kind: 'bus_stop_text', size: 2.6, wayID: piece.wayID, ...p
                }));
            }
        });

        // bus lanes: BUS LANE, in the UK (not on a busway, which is all for buses)
        if (inUk && tags.highway !== 'busway' && tags.highway !== 'bus_guideway') {
            piece.layout.lanes.forEach((lane, i) => {
                if (lane.kind !== 'bus' && lane.kind !== 'psv') return;
                const travel = lane.ref.direction === 'backward' ? 'backward' : 'forward';
                placed(piece.centres[i], 15, 60, travel).forEach((p, k) => symbols.push({
                    key: `${key}-buslane-${i}-${k}`, kind: 'bus_lane_text', size: Math.min(lane.width * 0.85, 3), wayID: piece.wayID, ...p
                }));
            });
        }

        // shared lanes: cycle symbols with chevrons in the outer lane on that side, and a cycle symbol in a bus lane
        // cycles share
        const contraflow = roadContraflowSide(graph.entity(piece.wayID), graph);
        for (const side of ['left', 'right'] as const) {
            const value = cyclewayValue(tags, side, contraflow);
            if (value !== 'shared_lane' && value !== 'share_busway') continue;
            const lanes = piece.layout.lanes.map((lane, i) => ({ lane, i }));
            const outer = side === 'left' ? lanes[0] : lanes[lanes.length - 1];
            const busLane = lanes.filter(l => l.lane.kind === 'bus' || l.lane.kind === 'psv');
            // (a bus lane tagged the old way is a strip beside the lanes)
            const busStrip = value === 'share_busway' ? piece.roadside.find(strip => strip.side === side && strip.kind === 'bus_lane') : undefined;
            if (busStrip) {
                placed(middle(busStrip.polygon), 25, 40, travelOfSide(side, piece)).forEach((p, k) => symbols.push({
                    key: `${key}-shared-${side}-${k}`, kind: 'cycle', size: 1.8, wayID: piece.wayID, ...p
                }));
                continue;
            }
            const target = value === 'share_busway' ? (side === 'left' ? busLane[0] : busLane[busLane.length - 1]) ?? outer : outer;
            if (!target) continue;
            const travel = target.lane.ref.direction === 'backward' ? 'backward' : 'forward';
            placed(piece.centres[target.i], value === 'share_busway' ? 25 : 12, 40, travel).forEach((p, k) => symbols.push({
                key: `${key}-shared-${side}-${k}`, kind: value === 'shared_lane' ? 'sharrow' : 'cycle',
                size: Math.min(target.lane.width * 0.6, 1.8), wayID: piece.wayID, ...p
            }));
        }
    }
    return { symbols, boxes };
}

/** About how wide a strip built from two edges is, in metres */
function centreWidth(polygon: Vec2[]): number {
    const [a, b] = ringEdges(polygon);
    if (!a.length || !b.length) return 1.5;
    const frame = metricFrame(a[0]);
    const p = frame.toMetres(a[0]);
    const q = frame.toMetres(b[0]);
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/** Which way the traffic beside a side of a road piece goes along the way */
function travelOfSide(side: Side, piece: RoadPiece): 'forward' | 'backward' {
    const lanes = piece.layout.lanes;
    const nearest = side === 'left' ? lanes[0] : lanes[lanes.length - 1];
    return nearest?.ref.direction === 'backward' ? 'backward' : 'forward';
}
