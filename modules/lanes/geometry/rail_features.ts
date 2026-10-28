import type { coreGraph } from '../../core/graph';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { add, dot, len, metricFrame, rightNormal, scale, sub, unit, type MetricFrame } from './frame';
import { railGauge, railKind } from './railway';
import { cachedLayout } from './road_geometry';
import { pathWidths } from './street';
import { surfaceGroup } from '../model/street_features';

/** One shape of a railway feature: a polygon or a line, in map coordinates */
export interface RailShape {
    key: string;
    /** the OSM feature it draws, for hover and selection */
    id: string;
    /** its kind, as the CSS class `rail-<part>` */
    part: string;
    points: Vec2[];
    closed: boolean;
}

/**
 * Railway features besides the track (wiki: Key:railway): platforms with their edges and safety lines, level
 * crossings with their barriers, lights and stop lines, crossings for people over the line, buffer stops,
 * switches, derailers, signals, stop markers, turntables and traversers. Platforms and pits are drawn under the
 * roads (`ground`); what crosses or stands on a road over it (`overRoad`); the rest beside the track (`trackside`).
 */
export interface RailFeatures {
    ground: RailShape[];
    trackside: RailShape[];
    overRoad: RailShape[];
    /** signals and level crossing light units, drawn upright like traffic signs */
    symbols: RailSymbol[];
}

/**
 * Equipment drawn as an upright symbol where it stands, the way Lane Studio draws traffic signs: a railway signal
 * (a Network Rail colour-light head, or a ground position-light shunt signal) or a level crossing's road traffic
 * light signals (two red lamps over an amber one on a black backboard with a white border)
 */
export interface RailSymbol {
    key: string;
    /** the OSM node it draws, for hover and selection */
    id: string;
    kind: 'signal' | 'shunt-signal' | 'crossing-lights' | 'crossing-saltire' | 'crossing-mwl' | 'whistle-board';
    loc: Vec2;
    /** the compass bearing its face looks towards (at the traffic or trains it is for) */
    facing: number;
    /** a signal's aspects, top to bottom, and the one shown lit */
    aspects?: ('red' | 'yellow' | 'green')[];
    lit?: 'red' | 'yellow' | 'green';
    /** the signal's identification plate (`ref`) */
    plate?: string;
    /** crossing lights at an open crossing (no barriers) carry a St Andrew's cross above them */
    cross?: boolean;
}

/**
 * How a level crossing is equipped, from its tags (wiki: Tag:railway=level_crossing):
 * - `barrier`: `crossing:barrier` (`yes` is drawn as full barriers; the older `crossing_barrier=yes` too), `no` at an
 *   open or informal crossing
 * - `lights`: road traffic light signals, from `crossing:light`, or implied by barriers that lower on their own
 * - `user`: worked by the people crossing (`crossing:activation=user`): gates they open, and miniature warning lights
 *   (red and green) rather than road traffic light signals
 * - `saltire`: a St Andrew's cross (`crossing:saltire`), at every open crossing unless tagged `no`
 * - `informal`: a crossing with no formal works (`crossing=informal`): no panels, signs or markings
 * - `surface`: the panels between the rails (`crossing:surface`)
 * - `whistle`: trains sound their horn (`crossing:whistle`), shown by whistle boards beside the line
 */
export interface LevelCrossing {
    barrier: 'full' | 'half' | 'double_half' | 'gates' | 'no';
    lights: boolean;
    user: boolean;
    saltire: boolean;
    informal: boolean;
    surface?: string;
    whistle: boolean;
}

/** A level crossing's equipment from its tags (see LevelCrossing) */
export function levelCrossingOf(tags: Tags): LevelCrossing {
    const informal = tags.crossing === 'informal';
    const tagged = tags['crossing:barrier'] ?? (tags.crossing_barrier === 'yes' ? 'yes' : undefined);
    const barrier: LevelCrossing['barrier'] = informal || tags.crossing === 'uncontrolled' ? 'no'
        : tagged === 'yes' ? 'full'
        : (['full', 'half', 'double_half', 'gates'] as const).find(b => b === tagged) ?? 'no';
    const user = tags['crossing:activation'] === 'user';
    const lights = !informal && tags['crossing:light'] !== 'no' && (tags['crossing:light'] === 'yes' ||
        tags.crossing === 'traffic_signals' || (!user && ['half', 'double_half', 'full'].includes(barrier)));
    const saltire = !informal && tags['crossing:saltire'] !== 'no' &&
        (tags['crossing:saltire'] === 'yes' || (barrier === 'no' && !user && (lights || tags.crossing === 'uncontrolled')));
    return {
        barrier, lights, user, saltire, informal,
        surface: tags['crossing:surface'],
        whistle: ['yes', 'optional', 'wayside'].includes(tags['crossing:whistle'] ?? '')
    };
}

/** The compass bearing of a direction in a metric frame (x east, y north) */
const bearing = (d: Vec2) => (Math.atan2(d[0], d[1]) * 180 / Math.PI + 360) % 360;

/**
 * A main signal's aspects, top to bottom, as on a Network Rail colour-light head: 4 aspects (yellow, green, yellow,
 * red), 3 (green, yellow, red) or 2 (green, red; a distant signal green, yellow). How many from the number of states
 * tagged (`railway:signal:main:states`), else 3.
 */
function aspectsOf(tags: Tags, distant: boolean): RailSymbol['aspects'] {
    const states = (tags[distant ? 'railway:signal:distant:states' : 'railway:signal:main:states'] ?? '').split(';').filter(Boolean).length;
    const count = Math.max(2, Math.min(4, states || (distant ? 2 : 3)));
    if (distant) return ['green', 'yellow'];
    return count === 4 ? ['yellow', 'green', 'yellow', 'red'] : count === 3 ? ['green', 'yellow', 'red'] : ['green', 'red'];
}

const locs = (way: osmWay, graph: coreGraph): Vec2[] => way.nodes.map(id => (graph.entity(id) as osmNode).loc as Vec2);

/** The direction of a way at one of its nodes (along the way), in the frame's metres */
function directionAt(way: osmWay, graph: coreGraph, nodeID: string, frame: MetricFrame): Vec2 | null {
    const i = (way.nodes as string[]).indexOf(nodeID);
    if (i < 0) return null;
    const points = locs(way, graph).map(frame.toMetres);
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const d = sub(b, a);
    return len(d) > 1e-6 ? unit(d) : null;
}

const isTrack = (entity: OsmEntity) => entity.type === 'way' && !!railKind(entity.tags) &&
    !['abandoned', 'proposed'].includes(railKind(entity.tags)!.status);

/** A rectangle centred on `c`, `along` metres in direction `d` and `across` metres across it */
function box(c: Vec2, d: Vec2, along: number, across: number): Vec2[] {
    const n = rightNormal(d);
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(scale(d, a * along / 2), scale(n, b * across / 2))));
}

/** A circle of radius `r` round `c` */
const circle = (c: Vec2, r: number, steps = 12): Vec2[] =>
    Array.from({ length: steps }, (_, k) => add(c, [r * Math.cos(2 * Math.PI * k / steps), r * Math.sin(2 * Math.PI * k / steps)]));

/** Distance from `p` to the segment `a`–`b` */
function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / Math.max(1e-9, dot(ab, ab))));
    return len(sub(p, add(a, scale(ab, t))));
}

/**
 * A platform: its surface, and along each edge that faces a track (within 3.5 m of one) the white coping at the
 * edge and the yellow safety line 0.8 m back from it. A platform mapped as a line is 3 m wide (or its `width`).
 */
function platformShapes(way: osmWay, graph: coreGraph, tracks: osmWay[], out: RailFeatures) {
    const frame = metricFrame((graph.entity(way.nodes[0]) as osmNode).loc as Vec2);
    let ring = locs(way, graph).map(frame.toMetres);
    if (way.isClosed()) {
        ring = ring.slice(0, -1);
    } else {
        const width = parseFloat(way.tags.width ?? '') || 3;
        const side = (offset: number) => ring.map((p, i) => {
            const a = ring[Math.max(0, i - 1)];
            const b = ring[Math.min(ring.length - 1, i + 1)];
            return add(p, scale(rightNormal(unit(sub(b, a))), offset));
        });
        ring = [...side(-width / 2), ...side(width / 2).reverse()];
    }
    if (ring.length < 3) return;
    out.ground.push({ key: `${way.id}-platform`, id: way.id, part: 'platform', points: ring.map(frame.toLoc), closed: true });

    const trackLines = tracks.map(track => locs(track, graph).map(frame.toMetres));
    const nearTrack = (p: Vec2) => trackLines.some(line => line.some((q, i) => i > 0 && segmentDistance(p, line[i - 1], q) < 3.5));
    // which way is inside the ring: its winding
    const area = ring.reduce((sum, p, i) => sum + (p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1]), 0);
    const inward = area > 0 ? -1 : 1;
    ring.forEach((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const edge = sub(b, a);
        if (len(edge) < 1 || !nearTrack(scale(add(a, b), 0.5))) return;
        const n = scale(rightNormal(unit(edge)), inward * 0.8);
        out.ground.push({ key: `${way.id}-coping-${i}`, id: way.id, part: 'platform-edge', points: [a, b].map(frame.toLoc), closed: false });
        out.ground.push({ key: `${way.id}-safety-${i}`, id: way.id, part: 'platform-safety', points: [add(a, n), add(b, n)].map(frame.toLoc), closed: false });
    });
}

/**
 * A level crossing (or a crossing for people over the line), laid out as in the Office of Rail and Road's typical
 * layouts: panels between and round the rails across the road (by `crossing:surface`), the rails, and on the `sides`
 * of it along the road (1 ahead, -1 behind) that are the outside of the crossing:
 * - half barriers across the lanes coming in; full barriers as two booms from the kerbs meeting in the middle
 * - gates: at a user worked crossing one gate across the road, braced, with the arc it swings through away from the
 *   line; otherwise a pair of gates with red targets
 * - the road traffic light signals on the nearside verge (miniature red and green lights at a user worked
 *   crossing), and the St Andrew's cross at an open crossing, above the lights at an automatic one
 * - a stop line across the lanes coming in where there are barriers, gates or lights, and a give way line at an
 *   open crossing without
 * - whistle boards beside the line, where trains sound their horn
 */
function crossingShapes(node: osmNode, graph: coreGraph, out: RailFeatures, sides: number[] = [1, -1]) {
    const parents = graph.parentWays(node) as osmWay[];
    const track = parents.find(isTrack);
    const road = parents.find(way => isLaneRoad(way)) ?? parents.find(way => (way.tags.highway ?? '') in pathWidths);
    if (!track || !road) return;
    const frame = metricFrame(node.loc as Vec2);
    const dt = directionAt(track, graph, node.id, frame);
    const dr = directionAt(road, graph, node.id, frame);
    if (!dt || !dr) return;
    const sin = Math.max(0.3, Math.abs(dt[0] * dr[1] - dt[1] * dr[0]));
    const isRoad = isLaneRoad(road);
    const layout = isRoad ? cachedLayout(road, graph) : null;
    const width = layout?.total ?? (parseFloat(road.tags.width ?? '') || pathWidths[road.tags.highway!] || 2);
    const gauge = railGauge(track.tags, railKind(track.tags)!.kind);
    const crossing = levelCrossingOf(node.tags);
    const c: Vec2 = [0, 0];
    const toLoc = (points: Vec2[]) => points.map(frame.toLoc);
    const push = (part: string, key: string, points: Vec2[], closed: boolean) =>
        out.overRoad.push({ key: `${node.id}-${key}`, id: node.id, part, points: toLoc(points), closed });

    // the panels: along the track as far as the road is wide, along the road as far as the track bed reaches
    // (an informal crossing has none: the road just runs over the rails)
    const u = scale(dt, (width / 2 + 0.3) / sin);
    const v = scale(dr, (gauge / 2 + 0.6) / sin);
    if (!crossing.informal) {
        // (rubber panels, the usual British kind, in their own dark grey)
        const surface = crossing.surface === 'rubber' ? 'rubber' : surfaceGroup(crossing.surface);
        push('crossing-deck' + (surface ? ` rail-crossing-deck-${surface}` : ''), 'deck',
            [add(add(c, u), v), add(sub(c, u), v), sub(sub(c, u), v), sub(add(c, u), v)], true);
    }
    const nt = rightNormal(dt);
    for (const side of [-1, 1]) {
        const o = scale(nt, side * gauge / 2);
        push('crossing-rail', `rail${side}`, [add(o, u), sub(o, u)], false);
    }
    if (crossing.whistle) whistleBoards(node, track, graph, frame, dt, gauge, out);
    if (!isRoad || node.tags.railway === 'tram_level_crossing' || crossing.informal) return;

    // barriers stand 3 m from the track's centre on each side, across the road
    const { barrier, lights } = crossing;
    const nr = rightNormal(dr);
    const driveLeft = layout!.model.driveSide === 'left';
    for (const side of sides) {
        const post = add(c, scale(dr, side * 3 / sin));
        // traffic coming in on this side heads the other way along the road: its lanes are on its left (driving on
        // the left) or right
        const inSide = scale(nr, side * (driveLeft ? 1 : -1));
        const kerbIn = add(post, scale(inSide, width / 2));
        const kerbOut = sub(post, scale(inSide, width / 2));
        const arms: [Vec2, Vec2][] = barrier === 'half' ? [[kerbIn, post]]
            : barrier === 'full' || barrier === 'double_half' ? [[kerbIn, post], [kerbOut, post]]
            : [];
        arms.forEach(([from, to], k) => boom(push, `arm${side}-${k}`, from, to));
        if (barrier === 'gates' && crossing.user) {
            // one gate across the road, hung from a post at the nearside kerb and shut against a post at the other,
            // braced corner to corner, and the quarter circle it swings through, away from the line
            const along = sub(kerbOut, kerbIn);
            const away = scale(dr, side);
            const middle = scale(add(kerbIn, kerbOut), 0.5);
            push('crossing-gate', `gate${side}`, box(middle, unit(along), width, 0.3), true);
            push('crossing-gate-brace', `gate${side}-brace`, [add(kerbIn, scale(away, 0.15)), sub(kerbOut, scale(away, 0.15))], false);
            push('crossing-gate-swing', `gate${side}-swing`, Array.from({ length: 13 }, (_, k) => {
                const a = (k / 12) * Math.PI / 2;
                return add(kerbIn, add(scale(along, Math.cos(a)), scale(away, Math.sin(a) * width)));
            }), false);
            for (const [at, k] of [[kerbIn, 'a'], [kerbOut, 'b']] as const) push('crossing-gate-post', `gate${side}-post${k}`, box(at, dr, 0.45, 0.45), true);
        } else if (barrier === 'gates') {
            // a pair of white gates meeting in the middle of the road, each with a red target
            for (const [leaf, sign] of [['a', 1], ['b', -1]] as const) {
                const middle = add(post, scale(inSide, sign * width / 4));
                push('crossing-gate', `gate${side}${leaf}`, box(middle, inSide, width / 2 - 0.2, 0.25), true);
                push('crossing-gate-target', `gate${side}${leaf}-target`, circle(middle, 0.3), true);
            }
        }
        // on the nearside verge, facing the traffic coming in (which drives towards the track, the other way to `side`)
        const verge = frame.toLoc(add(kerbIn, add(scale(inSide, 0.8), scale(dr, side * 0.6))));
        const facing = bearing(scale(dr, side));
        if (lights && crossing.user) {
            out.symbols.push({ key: `${node.id}-mwl${side}`, id: node.id, kind: 'crossing-mwl', loc: verge, facing });
        } else if (lights) {
            out.symbols.push({ key: `${node.id}-lights${side}`, id: node.id, kind: 'crossing-lights', loc: verge, facing, cross: crossing.saltire });
        } else if (crossing.saltire) {
            out.symbols.push({ key: `${node.id}-saltire${side}`, id: node.id, kind: 'crossing-saltire', loc: verge, facing });
        }
        const back = scale(dr, side * 1.8 / sin);
        const across = box(scale(add(add(kerbIn, back), add(post, back)), 0.5), inSide, width / 2, 0.3);
        if (barrier !== 'no' || lights) {
            // the white stop line across the lanes coming in, before the lights and barrier (Highway Code rule 293:
            // stop behind the white line)
            push('crossing-stop-line', `stop${side}`, across, true);
        } else if (crossing.saltire) {
            // an open crossing: give way, as at a junction (a double broken line)
            for (const offset of [0, 0.5]) {
                const at = add(add(kerbIn, back), scale(dr, side * offset));
                push('crossing-give-way-line', `giveway${side}${offset}`, [at, add(at, scale(inSide, -width / 2))], false);
            }
        }
    }
}

/**
 * Whistle boards on the approach to a crossing where trains sound their horn: on the left of the line, as in
 * Britain, 40 m before the crossing in each direction, facing the trains
 */
function whistleBoards(node: osmNode, track: osmWay, graph: coreGraph, frame: MetricFrame, dt: Vec2, gauge: number, out: RailFeatures) {
    for (const way of [1, -1]) {
        const travel = scale(dt, way);
        const at = add(scale(travel, -40), scale(rightNormal(travel), -(gauge / 2 + 1.6)));
        out.symbols.push({ key: `${node.id}-whistle${way}`, id: node.id, kind: 'whistle-board', loc: frame.toLoc(at), facing: bearing(scale(travel, -1)) });
    }
}

/**
 * A barrier boom from its pivot to its tip, as on British level crossings: red and white bands half a metre long,
 * narrowing towards the tip, red lamps along the top, and the barrier machine at the pivot
 */
function boom(push: (part: string, key: string, points: Vec2[], closed: boolean) => void, key: string, pivot: Vec2, tip: Vec2) {
    const d = unit(sub(tip, pivot));
    const n = rightNormal(d);
    const length = len(sub(tip, pivot));
    const bands = Math.max(1, Math.round(length / 0.5));
    const half = (k: number) => 0.18 - 0.08 * (k / bands);
    for (let k = 0; k < bands; k++) {
        const a = add(pivot, scale(d, k * length / bands));
        const b = add(pivot, scale(d, (k + 1) * length / bands));
        push(k % 2 ? 'crossing-boom-white' : 'crossing-boom-red', `${key}-band${k}`,
            [add(a, scale(n, half(k))), add(b, scale(n, half(k + 1))), sub(b, scale(n, half(k + 1))), sub(a, scale(n, half(k)))], true);
    }
    for (const at of [0.35, 0.65, 0.95]) push('crossing-boom-lamp', `${key}-lamp${at}`, circle(add(pivot, scale(d, at * length)), 0.1, 8), true);
    push('crossing-pedestal', `${key}-pedestal`, box(pivot, d, 0.7, 0.7), true);
}

/** Buffer stops, switches, derailers, signals and stop markers on a track, and their place beside it */
function equipmentShapes(node: osmNode, graph: coreGraph, out: RailFeatures) {
    const track = (graph.parentWays(node) as osmWay[]).find(isTrack);
    if (!track) return;
    const frame = metricFrame(node.loc as Vec2);
    const d = directionAt(track, graph, node.id, frame);
    if (!d) return;
    const gauge = railGauge(track.tags, railKind(track.tags)!.kind);
    const n = rightNormal(d);
    const c: Vec2 = [0, 0];
    const kind = node.tags.railway;
    const push = (part: string, key: string, points: Vec2[], closed = true) =>
        out.trackside.push({ key: `${node.id}-${key}`, id: node.id, part, points: points.map(frame.toLoc), closed });

    if (kind === 'buffer_stop') {
        // across the track at its end, standing just beyond the last of the rails
        const i = track.nodes.indexOf(node.id);
        const outward = i === 0 ? scale(d, -1) : d;
        push('buffer-stop', 'block', box(add(c, scale(outward, 0.4)), outward, 0.8, gauge + 1), true);
    } else if (kind === 'derail') {
        push('derail', 'block', box(add(c, scale(n, gauge / 2)), d, 0.6, 0.35), true);
    } else if (kind === 'switch') {
        // the point motor beside the track, and the tie bar across the rails
        push('switch-motor', 'motor', box(add(c, scale(n, gauge / 2 + 1)), d, 1.4, 0.6), true);
        push('switch-bar', 'bar', [add(c, scale(n, -gauge / 2)), add(c, scale(n, gauge / 2 + 0.7))], false);
    } else if (kind === 'signal' || kind === 'stop') {
        // beside the track on the side it is tagged (signals on the left of the line in Britain), facing the trains
        const position = node.tags['railway:signal:position'] ?? 'left';
        const backward = (node.tags['railway:signal:direction'] ?? node.tags.direction) === 'backward';
        const travel = backward ? scale(d, -1) : d;
        const sideways = position === 'right' ? rightNormal(travel) : scale(rightNormal(travel), -1);
        const overhead = position === 'overhead' || position === 'bridge';
        const at = overhead ? c : add(c, scale(sideways, gauge / 2 + 1.6));
        if (kind === 'signal') {
            const tags = node.tags;
            const main = !!tags['railway:signal:main'];
            const distant = !main && !!tags['railway:signal:distant'];
            const shunt = !main && !distant && !!(tags['railway:signal:shunting'] ?? tags['railway:signal:minor']);
            if (!overhead) push('signal-post', 'post', [add(c, scale(sideways, gauge / 2 + 0.9)), at], false);
            // its face looks back along the line at the trains coming towards it
            out.symbols.push({
                key: `${node.id}-signal`, id: node.id, kind: shunt ? 'shunt-signal' : 'signal', loc: frame.toLoc(at),
                facing: bearing(scale(travel, -1)), plate: tags.ref ?? tags['railway:signal:main:ref'],
                ...(shunt ? {} : { aspects: aspectsOf(tags, distant), lit: distant ? 'yellow' : 'red' })
            });
        } else {
            push('stop-board', 'board', box(at, travel, 0.4, 1.2), true);
        }
    }
}

/** A turntable's pit with its bridge across, or a traverser's pit */
function pitShapes(way: osmWay, graph: coreGraph, out: RailFeatures) {
    if (!way.isClosed()) return;
    const frame = metricFrame((graph.entity(way.nodes[0]) as osmNode).loc as Vec2);
    const ring = locs(way, graph).slice(0, -1).map(frame.toMetres);
    if (ring.length < 3) return;
    out.ground.push({ key: `${way.id}-pit`, id: way.id, part: `${way.tags.railway}-pit`, points: ring.map(frame.toLoc), closed: true });
    if (way.tags.railway !== 'turntable') return;
    const centre = scale(ring.reduce((sum, p) => add(sum, p), [0, 0] as Vec2), 1 / ring.length);
    const radius = Math.max(...ring.map(p => len(sub(p, centre))));
    const d = unit(sub(ring[0], centre));
    out.ground.push({ key: `${way.id}-bridge`, id: way.id, part: 'turntable-bridge', points: box(centre, d, radius * 2, 3).map(frame.toLoc), closed: true });
    for (const side of [-1, 1]) {
        const o = scale(rightNormal(d), side * 1.435 / 2);
        out.ground.push({
            key: `${way.id}-bridge-rail${side}`, id: way.id, part: 'turntable-rail',
            points: [add(centre, add(o, scale(d, radius))), add(centre, sub(o, scale(d, radius)))].map(frame.toLoc), closed: false
        });
    }
}

/** The railway features among `entities` (see RailFeatures) */
export function railFeatures(entities: OsmEntity[], graph: coreGraph): RailFeatures {
    const out: RailFeatures = { ground: [], trackside: [], overRoad: [], symbols: [] };
    const tracks = entities.filter(isTrack) as osmWay[];
    // a road crossing several tracks has a level crossing node on each: their barriers stand outside them all
    const crossingSides = new Map<string, number[]>();
    const byRoad = new Map<string, { node: osmNode; along: number }[]>();
    for (const entity of entities) {
        if (entity.type !== 'node' || entity.tags.railway !== 'level_crossing') continue;
        const node = entity as osmNode;
        const road = (graph.parentWays(node) as osmWay[]).find(way => isLaneRoad(way));
        if (!road) continue;
        const i = (road.nodes as string[]).indexOf(node.id);
        const first = (graph.entity(road.nodes[0]) as osmNode).loc as Vec2;
        // how far along the road it is (straight-line steps are enough to put neighbours in order)
        const points = locs(road, graph).map(metricFrame(first).toMetres);
        let along = 0;
        for (let k = 1; k <= i; k++) along += len(sub(points[k], points[k - 1]));
        byRoad.set(road.id, [...(byRoad.get(road.id) ?? []), { node, along }]);
    }
    for (const list of byRoad.values()) {
        list.sort((a, b) => a.along - b.along);
        let group: typeof list = [];
        const close = () => group.forEach((item, k) => crossingSides.set(item.node.id,
            group.length === 1 ? [1, -1] : k === 0 ? [-1] : k === group.length - 1 ? [1] : []));
        for (const item of list) {
            if (group.length && item.along - group[group.length - 1].along > 12) {
                close();
                group = [];
            }
            group.push(item);
        }
        close();
    }
    for (const entity of entities) {
        const railway = entity.tags.railway;
        if (!railway) continue;
        if (entity.type === 'way') {
            const way = entity as osmWay;
            if (railway === 'platform' || entity.tags.public_transport === 'platform' && railway) platformShapes(way, graph, tracks, out);
            else if (railway === 'turntable' || railway === 'traverser') pitShapes(way, graph, out);
        } else if (entity.type === 'node') {
            const node = entity as osmNode;
            if (['level_crossing', 'crossing', 'tram_level_crossing'].includes(railway)) crossingShapes(node, graph, out, crossingSides.get(node.id));
            else if (['buffer_stop', 'derail', 'switch', 'signal', 'stop'].includes(railway)) equipmentShapes(node, graph, out);
        }
    }
    return out;
}
