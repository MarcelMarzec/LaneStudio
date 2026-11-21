import type { Vec2 } from '../../geo/vector';
import { laneConnectivity, sameSpot } from '../core/lane_connectivity';
import {
    laneEndAt, laneLinkLine, laneLinksAt, linkTargets, spotOf, type LaneLink, type LaneSpot
} from '../geometry/connectivity';
import type { RoadPiece } from '../geometry/road_geometry';
import { connectivityLane, sameLaneRef } from '../model';
import { attrChanged } from './street';

type Group = d3.Selection<SVGGElement>;

/** Every lane connection from the lanes arriving at the ends of the roads drawn, with the line each is drawn with */
export function connectionsInView(pieces: RoadPiece[], graph: iD.Graph): { link: LaneLink; line: Vec2[] | null }[] {
    const cached = viewCache.get(pieces);
    if (cached && cached.graph === graph) return cached.links;
    const nodes = new Set<string>();
    for (const piece of pieces) {
        nodes.add(piece.fromNode);
        nodes.add(piece.toNode);
    }
    const seen = new Set<string>();
    const links: { link: LaneLink; line: Vec2[] | null }[] = [];
    for (const nodeID of nodes) {
        for (const link of laneLinksAt(graph, nodeID)) {
            if (seen.has(link.key)) continue;
            seen.add(link.key);
            links.push({ link, line: laneLinkLine(link, pieces, graph) });
        }
    }
    viewCache.set(pieces, { graph, links });
    return links;
}
const viewCache = new WeakMap<RoadPiece[], { graph: iD.Graph; links: { link: LaneLink; line: Vec2[] | null }[] }>();

/** Whether a connection leads from the lane `spot` (the stretch it is on arriving at the connection's junction) */
export function linkFrom(link: LaneLink, spot: LaneSpot): boolean {
    if (link.from.wayID !== spot.wayID || !sameLaneRef(link.from.ref, spot.ref)) return false;
    return spot.ref.direction === 'both_ways' ? link.nodeID === spot.to || link.nodeID === spot.from : link.nodeID === spot.to;
}

/** Whether a connection leads into the lane `spot` (the stretch it is on leaving the connection's junction) */
export function linkInto(link: LaneLink, spot: LaneSpot): boolean {
    if (link.to.wayID !== spot.wayID || !sameLaneRef(link.to.ref, spot.ref)) return false;
    return spot.ref.direction === 'both_ways' ? link.toNodeID === spot.from || link.toNodeID === spot.to : link.toNodeID === spot.from;
}

/** The connection from one lane into another, if there is one */
export function linkBetween(links: LaneLink[], from: LaneSpot, to: LaneSpot): LaneLink | undefined {
    return links.find(l => linkFrom(l, from) && linkInto(l, to));
}

const pieceOf = (pieces: RoadPiece[], spot: LaneSpot) => pieces.find(piece => piece.wayID === spot.wayID &&
    piece.layout.lanes.some(l => sameLaneRef(l.ref, spot.ref)) && sameSpot(spotOf(piece, spot.ref), spot));

/** A lane's shape on the map, for the stretch `spot` */
function laneShape(pieces: RoadPiece[], spot: LaneSpot): Vec2[] | null {
    const piece = pieceOf(pieces, spot);
    if (!piece) return null;
    return piece.lanes[piece.layout.lanes.findIndex(l => sameLaneRef(l.ref, spot.ref))] ?? null;
}

function arrowhead(line: Vec2[], size: number): string {
    if (line.length < 2) return '';
    const tip = line[line.length - 1];
    const before = line[line.length - 2];
    const l = Math.hypot(tip[0] - before[0], tip[1] - before[1]) || 1;
    const d: Vec2 = [(tip[0] - before[0]) / l, (tip[1] - before[1]) / l];
    const n: Vec2 = [-d[1], d[0]];
    const base: Vec2 = [tip[0] - d[0] * size, tip[1] - d[1] * size];
    const w = size * 0.5;
    return `M${tip[0].toFixed(1)},${tip[1].toFixed(1)}L${(base[0] + n[0] * w).toFixed(1)},${(base[1] + n[1] * w).toFixed(1)}` +
        `L${(base[0] - n[0] * w).toFixed(1)},${(base[1] - n[1] * w).toFixed(1)}Z`;
}

/**
 * Where a lane's number goes: a little way back along the lane from where it arrives (`back`), or on into it from
 * where it starts, so the numbers at a junction stand apart
 */
function numberAt(end: { point: Vec2; along: Vec2 }, project: (loc: Vec2) => Vec2, back: boolean): Vec2 {
    const p = project(end.point);
    const q = project([end.point[0] + end.along[0], end.point[1] + end.along[1]]);
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const k = (back ? -14 : 14) / l;
    return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
}

const pathOf = (points: Vec2[], closed = false) => points.length < 2 ? ''
    : 'M' + points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + (closed ? 'Z' : '');

/**
 * The Connectivity tool's drawing: every lane connection as a line with an arrowhead, those Lane Studio works out in
 * one colour and those a relation declares in another, dashed where a lane change is needed; where two roads simply
 * join with as many lanes, only the lane in focus's. The lane picked (or under the pointer) is outlined, its
 * connections stand out, and, once picked, the lanes it can lead into are outlined (filled where it already does),
 * each numbered as the `connectivity` tag counts it.
 */
export function drawConnectivity(group: Group, context: iD.Context, pieces: RoadPiece[], project: (loc: Vec2) => Vec2) {
    const state = laneConnectivity(context);
    const graph = context.graph();
    const shapes: { key: string; cls: string; d: string }[] = [];
    const labels: { key: string; at: Vec2; text: string; cls: string }[] = [];

    if (state.active()) {
        const all = connectionsInView(pieces, graph);
        const picked = state.picked();
        const focus = picked ?? state.hovered();
        const ofFocus = (link: LaneLink) => !!focus && linkFrom(link, focus);

        // the lines, the focus lane's last so they are on top
        const shown = all.filter(({ link, line }) => line && (link.declared ? state.showDeclared() : state.showDefault()) &&
            (!link.plain || ofFocus(link)));
        shown.sort((a, b) => Number(ofFocus(a.link)) - Number(ofFocus(b.link)) || Number(a.link.declared) - Number(b.link.declared));
        for (const { link, line } of shown) {
            const points = line!.map(project);
            const cls = `${link.declared ? 'declared' : 'default'}${link.optional ? ' optional' : ''}` +
                (focus ? (ofFocus(link) ? ' focus' : ' dim') : '');
            shapes.push({ key: `casing-${link.key}`, cls: `lane-link-casing ${cls}`, d: pathOf(points) });
            shapes.push({ key: `line-${link.key}`, cls: `lane-link ${cls}`, d: pathOf(points) });
            shapes.push({ key: `head-${link.key}`, cls: `lane-link-head ${cls}`, d: arrowhead(points, ofFocus(link) ? 9 : 7) });
        }

        if (focus) {
            const shape = laneShape(pieces, focus);
            if (shape) shapes.push({ key: 'focus', cls: picked ? 'lane-link-picked' : 'lane-link-hovered', d: pathOf(shape.map(project), true) });
            // the focus lane's number where it arrives at each junction
            for (const nodeID of focus.ref.direction === 'both_ways' ? [focus.to, focus.from] : [focus.to]) {
                const end = laneEndAt(pieces, focus, nodeID, true);
                if (end) labels.push({ key: `from-${nodeID}`, at: numberAt(end, project, true), text: connectivityLane(focus.ref), cls: 'from' });
            }
        }

        if (picked) {
            const links = all.map(x => x.link);
            for (const target of linkTargets(pieces, graph, picked)) {
                const shape = laneShape(pieces, target);
                if (!shape) continue;
                const link = linkBetween(links, picked, target);
                const cls = link ? `connected ${link.declared ? 'declared' : 'default'}${link.optional ? ' optional' : ''}` : 'open';
                const key = `${target.wayID}-${target.from}-${target.to}-${connectivityLane(target.ref)}`;
                shapes.push({ key: `target-${key}`, cls: `lane-link-target ${cls}`, d: pathOf(shape.map(project), true) });
                const start = laneEndAt(pieces, target, link?.toNodeID ?? target.nodeID, false);
                if (start) labels.push({ key: `to-${key}`, at: numberAt(start, project, false), text: connectivityLane(target.ref), cls: link ? 'to connected' : 'to' });
            }
        }
    }

    // lines below, numbers above
    const layer = (name: string) => {
        let g = group.select<SVGGElement>(`g.lane-links-${name}`);
        if (g.empty()) g = group.append('g').attr('class', `lane-links-${name}`);
        return g;
    };
    const lines = layer('lines');
    const numbers = layer('numbers');
    const paths = lines.selectAll<SVGPathElement, typeof shapes[number]>('path').data(shapes, d => d.key);
    paths.exit().remove();
    paths.enter().append('path').merge(paths)
        .each(attrChanged('class', d => d.cls))
        .each(attrChanged('d', d => d.d))
        .order();
    const texts = numbers.selectAll<SVGTextElement, typeof labels[number]>('text').data(labels, d => d.key);
    texts.exit().remove();
    texts.enter().append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').merge(texts)
        .each(attrChanged('class', d => `lane-link-number ${d.cls}`))
        .each(attrChanged('x', d => d.at[0].toFixed(1)))
        .each(attrChanged('y', d => d.at[1].toFixed(1)))
        .text(d => d.text);
}
