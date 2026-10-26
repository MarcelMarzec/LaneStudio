import type { Vec2 } from '../../geo/vector';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { laneRouting, routeColours, routesFor, type RoutingFocus } from '../core/lane_routing';
import { pointAlong, pointInPolygon, polylineLength } from '../geometry/frame';
import type { LaneRun, Route } from '../geometry/routing';
import { junctionRules, type RoadPiece } from '../geometry/road_geometry';
import type { LaneRef } from '../model';
import { attrChanged } from './street';

type Group = d3.Selection<SVGGElement>;

const sameRef = (a: LaneRef, b: LaneRef) => a.direction === b.direction && a.index === b.index;

/** The node indexes a piece of road runs between */
function pieceSpan(piece: RoadPiece, way: osmWay): [number, number] {
    const nodes = way.nodes as string[];
    const start = piece.atWayStart ? 0 : nodes.indexOf(piece.fromNode);
    const end = piece.atWayEnd ? nodes.length - 1 : nodes.indexOf(piece.toNode, start + 1);
    return [start, end];
}

/** A lane's centre line from the drawn pieces of a way between two nodes, in the way's direction; null when not drawn */
function laneCentre(pieces: RoadPiece[], way: osmWay, from: number, to: number, ref: LaneRef): Vec2[] | null {
    const [lo, hi] = from < to ? [from, to] : [to, from];
    const points: Vec2[] = [];
    for (const piece of pieces) {
        const [start, end] = pieceSpan(piece, way);
        if (start < lo || end > hi || start < 0 || end < 0) continue;
        const k = piece.layout.lanes.findIndex(l => sameRef(l.ref, ref));
        if (k < 0) return null;
        points.push(...piece.centres[k]);
    }
    return points.length > 1 ? points : null;
}

/** How far a point is from a line, both on screen */
function distanceTo(line: Vec2[], p: Vec2): number {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
        const [a, b] = [line[i - 1], line[i]];
        const d: Vec2 = [b[0] - a[0], b[1] - a[1]];
        const l2 = d[0] * d[0] + d[1] * d[1] || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2));
        best = Math.min(best, Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1]));
    }
    return best;
}

/**
 * The lane drawn at a point on screen: the lane whose shape holds it, else the lane whose centre line passes
 * within `tolerance` pixels; or, given a way, its lane nearest the point (over the way's line where its lanes are not
 * drawn, as in a junction's mouth). Found from the drawn pieces, so whatever is drawn on top of a lane does not hide it.
 */
export function laneUnder(pieces: RoadPiece[], graph: iD.Graph, project: (loc: Vec2) => Vec2, point: Vec2, tolerance = 8,
    wayID?: string): RoutingFocus | null {
    let near: { piece: RoadPiece; k: number; d: number } | null = null;
    let hit: { piece: RoadPiece; k: number } | null = null;
    for (const piece of pieces) {
        if (wayID && piece.wayID !== wayID) continue;
        for (let k = 0; k < piece.lanes.length && !hit; k++) {
            const shape = piece.lanes[k].map(project);
            if (pointInPolygon(point, shape)) {
                hit = { piece, k };
                break;
            }
            const d = distanceTo(piece.centres[k].map(project), point);
            if (d <= tolerance && (!near || d < near.d)) near = { piece, k, d };
        }
        if (hit) break;
    }
    const found = hit ?? near;
    if (!found) return null;
    const way = graph.hasEntity(found.piece.wayID) as osmWay | undefined;
    if (!way) return null;
    const [start, end] = pieceSpan(found.piece, way);
    const ref = found.piece.layout.lanes[found.k].ref;
    return {
        kind: 'lane', wayID: found.piece.wayID, ref,
        from: ref.direction === 'backward' ? end : start, to: ref.direction === 'backward' ? start : end
    };
}

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * A run's line on screen: along the lane driven into, moving over to the lane left by (a lane change) in its
 * middle stretch; along the road's own line where its lanes are not drawn.
 */
function runLine(run: LaneRun, graph: iD.Graph, piecesByWay: Map<string, RoadPiece[]>, project: (loc: Vec2) => Vec2): Vec2[] {
    const way = graph.entity(run.wayID) as osmWay;
    const pieces = piecesByWay.get(run.wayID) ?? [];
    const forward = run.from <= run.to;
    const orient = (line: Vec2[]) => (forward ? line : line.slice().reverse()).map(project);
    const enter = laneCentre(pieces, way, run.from, run.to, run.enter);
    if (!enter) {
        const [lo, hi] = forward ? [run.from, run.to] : [run.to, run.from];
        return orient(way.nodes.slice(lo, hi + 1).map(id => (graph.entity(id) as osmNode).loc));
    }
    const a = orient(enter);
    const leaveLine = sameRef(run.enter, run.leave) ? null : laneCentre(pieces, way, run.from, run.to, run.leave);
    if (!leaveLine) return a;
    const b = orient(leaveLine);
    const [la, lb] = [polylineLength(a), polylineLength(b)];
    const count = Math.max(8, a.length * 2);
    return Array.from({ length: count + 1 }, (_, i) => {
        const f = i / count;
        const p = pointAlong(a, f * la).point;
        const q = pointAlong(b, f * lb).point;
        const w = smooth((f - 0.25) / 0.5);
        return [p[0] + (q[0] - p[0]) * w, p[1] + (q[1] - p[1]) * w] as Vec2;
    });
}

const direction = (line: Vec2[], atEnd: boolean): Vec2 => {
    const [p, q] = atEnd ? [line[line.length - 2], line[line.length - 1]] : [line[0], line[1]];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
};

/** A whole route on screen: its runs, joined through each junction by a curve from lane to lane */
function routeLine(route: Route, graph: iD.Graph, piecesByWay: Map<string, RoadPiece[]>, project: (loc: Vec2) => Vec2): Vec2[] {
    const out: Vec2[] = [];
    for (const run of route.runs) {
        const line = runLine(run, graph, piecesByWay, project);
        if (line.length < 2) continue;
        if (out.length >= 2) {
            const join = junctionRules.curve(
                { point: out[out.length - 1], tangent: direction(out, true) },
                { point: line[0], tangent: direction(line, false) });
            out.push(...join.slice(1, -1));
        }
        out.push(...line);
    }
    return out;
}

const pathOf = (line: Vec2[]) => line.length < 2 ? '' : 'M' + line.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L');

/** An arrowhead at the end of a line, `size` pixels long */
function arrowhead(line: Vec2[], size: number): string {
    if (line.length < 2) return '';
    const tip = line[line.length - 1];
    const d = direction(line, true);
    const n: Vec2 = [-d[1], d[0]];
    const base: Vec2 = [tip[0] - d[0] * size, tip[1] - d[1] * size];
    const w = size * 0.55;
    return `M${tip[0].toFixed(1)},${tip[1].toFixed(1)}L${(base[0] + n[0] * w).toFixed(1)},${(base[1] + n[1] * w).toFixed(1)}` +
        `L${(base[0] - n[0] * w).toFixed(1)},${(base[1] - n[1] * w).toFixed(1)}Z`;
}

interface Shape {
    key: string;
    cls: string;
    d: string;
    colour?: string;
    title?: string;
}

/**
 * The Routing tool's drawing: the routes from the lane under the pointer (or pinned) in their colours, numbered
 * at their ends as in the panel, the lanes leading into it dashed, ways the vehicle may not take as red stubs;
 * or the paths someone walking can reach, dotted, with the crossings they use.
 */
export function drawRoutes(group: Group, context: iD.Context, pieces: RoadPiece[], project: (loc: Vec2) => Vec2) {
    const routing = laneRouting(context);
    const graph = context.graph();
    const found = routing.active() ? routesFor(graph, routing.focus(), routing.profile()) : null;
    const shapes: Shape[] = [];
    const labels: { key: string; at: Vec2; text: string; colour: string }[] = [];

    if (found?.kind === 'lane') {
        const piecesByWay = new Map<string, RoadPiece[]>();
        for (const piece of pieces) piecesByWay.set(piece.wayID, [...(piecesByWay.get(piece.wayID) ?? []), piece]);
        for (const list of piecesByWay.values()) list.sort((a, b) => a.index - b.index);

        const { result } = found;
        const lines = result.routes.map(route => routeLine(route, graph, piecesByWay, project));
        // the lanes leading in, dashed, ending where the lane starts
        result.incoming.forEach((route, i) => {
            const line = runLine(route.runs[0], graph, piecesByWay, project);
            const start = lines[0]?.[0];
            if (start && line.length >= 2) {
                const join = junctionRules.curve({ point: line[line.length - 1], tangent: direction(line, true) },
                    { point: start, tangent: lines[0].length > 1 ? direction(lines[0], false) : direction(line, true) });
                line.push(...join.slice(1));
            }
            shapes.push({ key: `in-${i}`, cls: 'route-incoming', d: pathOf(line) });
        });
        // each route under its colour, the last drawn first so route 1 is on top where they share a road
        for (let i = lines.length - 1; i >= 0; i--) {
            const colour = routeColours[i % routeColours.length];
            shapes.push({ key: `casing-${i}`, cls: 'route-casing', d: pathOf(lines[i]) });
            shapes.push({ key: `route-${i}`, cls: 'route-line', d: pathOf(lines[i]), colour });
            shapes.push({ key: `head-${i}`, cls: 'route-head', d: arrowhead(lines[i], 11), colour });
            const end = lines[i][lines[i].length - 1];
            if (end) labels.push({ key: `n-${i}`, at: end, text: String(i + 1), colour });
        }
        // the lane itself
        const start = result.routes[0] ? runLine(result.routes[0].runs[0], graph, piecesByWay, project) : [];
        shapes.push({ key: 'start', cls: 'route-start', d: pathOf(start) });
        result.blocked.forEach((b, i) => {
            const stub = [project(b.at), project(b.toward)];
            shapes.push({ key: `blocked-${i}`, cls: 'route-blocked', d: pathOf(stub), title: b.reason.replace(/_/g, ' ') });
            const end = stub[1];
            shapes.push({
                key: `blocked-end-${i}`, cls: 'route-blocked-end', title: b.reason.replace(/_/g, ' '),
                d: `M${(end[0] - 6).toFixed(1)},${end[1].toFixed(1)}a6,6 0 1,0 12,0a6,6 0 1,0 -12,0M${(end[0] - 3.5).toFixed(1)},${end[1].toFixed(1)}h7`
            });
        });
    } else if (found?.kind === 'walk') {
        const { result } = found;
        result.segments.forEach((segment, i) => {
            const line = segment.points.map(project);
            shapes.push({ key: `walk-casing-${i}`, cls: 'walk-casing', d: pathOf(line) });
            shapes.push({ key: `walk-${i}`, cls: i === 0 ? 'walk-start' : 'walk-line', d: pathOf(line) });
        });
        result.crossings.forEach((loc, i) => {
            const p = project(loc);
            shapes.push({ key: `crossing-${i}`, cls: 'walk-crossing', d: `M${(p[0] - 5).toFixed(1)},${p[1].toFixed(1)}a5,5 0 1,0 10,0a5,5 0 1,0 -10,0` });
        });
    }

    const paths = group.selectAll<SVGPathElement, Shape>('path').data(shapes, d => d.key);
    paths.exit().remove();
    const entered = paths.enter().append('path');
    entered.append('title');
    entered.merge(paths)
        .each(attrChanged('class', d => `route ${d.cls}`))
        .each(attrChanged('d', d => d.d))
        .style('stroke', d => (d.colour && d.cls === 'route-line' ? d.colour : null))
        .style('fill', d => (d.colour && d.cls === 'route-head' ? d.colour : null))
        .order()
        .select('title').text(d => d.title ?? '');

    const badges = group.selectAll<SVGGElement, typeof labels[number]>('g.route-number').data(labels, d => d.key);
    badges.exit().remove();
    const badge = badges.enter().append('g').each(attrChanged('class', 'route-number'));
    badge.append('circle').each(attrChanged('r', 9));
    badge.append('text').attr('dy', '0.35em').attr('text-anchor', 'middle');
    badge.merge(badges)
        .each(attrChanged('transform', d => `translate(${d.at[0].toFixed(1)},${(d.at[1] - 16).toFixed(1)})`))
        .call(g => g.select('circle').style('fill', d => d.colour))
        .call(g => g.select('text').text(d => d.text));
}
