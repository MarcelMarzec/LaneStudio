import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { TrackShape } from '../geometry/railway';
import type { RailFeatures, RailShape, RailSymbol } from '../geometry/rail_features';
import { signSize } from './signs';
import { attrChanged, joinPaths, pathFor, pxPerMetre, withIdState } from './street';

type Group = d3.Selection<SVGGElement>;

/** A track's classes: its kind, status, and its way's id (so it lights up with the way when hovered or selected) */
const trackClass = (track: TrackShape, part: string) =>
    `rail-${part} rail-${track.kind} rail-${track.status} ${track.id}` +
    (track.covered ? ' lanes-covered' : '') + (track.status === 'construction' ? ' lanes-construction' : '');

/**
 * Railways, Underground and tram lines: ballast, sleepers and rails under the roads (a road crossing a railway
 * covers it), and the rails of tram lines set in the road over the road's lanes.
 */
export function drawRailways(group: (name: string) => Group, tracks: TrackShape[], projection: Projection) {
    const path = pathFor(projection);
    const many = (lines: Vec2[][], closed: boolean) => lines.map(line => path(line, closed)).join('');
    // rails are drawn at the width of their foot (150 mm), never thinner than a hairline
    const ppm = pxPerMetre(projection, tracks[0]?.rails[0]?.[0]);
    const railWidth = Math.min(4, Math.max(1, 0.15 * ppm)).toFixed(2);

    joinPaths(group('rail-beds'), tracks.filter(t => t.bed), t => t.id, t => trackClass(t, 'bed'), t => path(t.bed!, true));
    joinPaths(group('rail-sleepers'), tracks.filter(t => t.sleepers.length), t => t.id, t => trackClass(t, 'sleepers'), t => many(t.sleepers, true));

    for (const [name, list] of [['rails', tracks.filter(t => !t.embedded)], ['tram-rails', tracks.filter(t => t.embedded)]] as const) {
        const shapes = list.flatMap(t => [
            { key: t.id, cls: trackClass(t, 'rails'), d: many(t.rails, false) },
            ...(t.conductors.length ? [{ key: `${t.id}-conductor`, cls: trackClass(t, 'conductor'), d: many(t.conductors, false) }] : [])
        ]);
        joinPaths(group(name), shapes, s => s.key, s => s.cls, s => s.d);
        group(name).selectAll('path').each(attrChanged('stroke-width', railWidth));
    }
}


/**
 * Railway features besides the track: platforms, pits and track equipment beside the track (under the roads),
 * and level crossings over the road they cross
 */
export function drawRailFeatures(group: (name: string) => Group, features: RailFeatures, projection: Projection, zoom: number) {
    const path = pathFor(projection);
    const cls = (shape: RailShape) => `rail-${shape.part} ${shape.id}`;
    joinPaths(group('rail-ground'), features.ground, s => s.key, cls, s => path(s.points, s.closed));
    joinPaths(group('rail-trackside'), features.trackside, s => s.key, cls, s => path(s.points, s.closed));
    joinPaths(group('rail-over-road'), features.overRoad, s => s.key, cls, s => path(s.points, s.closed));
    drawRailSymbols(group('rail-symbols'), features.symbols, projection, zoom);
}

const lampColours = { red: '#ff2b1c', yellow: '#ffc21a', green: '#1fd36b' };

/**
 * Signals and level crossing light units, drawn upright where they stand on a post, at the size traffic signs are
 * drawn (see signs.ts), with a small wedge at the foot showing which way they face:
 * - a main signal: a Network Rail colour-light head (black, its backplate edged white) with its aspects in a
 *   column, red lit (a distant signal: yellow), over its white identification plate
 * - a shunt signal: a ground position-light signal, a red and a white lamp side by side
 * - a level crossing's road traffic light signals: two red lamps either side of an amber one on a black backboard
 *   edged white, over a "STOP when lights show" plate, at an open crossing under a St Andrew's cross
 */
export function drawRailSymbols(group: Group, symbols: RailSymbol[], projection: Projection, zoom: number) {
    const size = signSize(zoom);
    const items = group.selectAll<SVGGElement, RailSymbol>('g.rail-symbol').data(symbols, d => d.key);
    items.exit().remove();
    items.enter().append('g')
        .merge(items)
        .each(attrChanged('class', function(d) { return withIdState(this, `rail-symbol rail-symbol-${d.kind} ${d.id}`); }))
        .each(function(d) {
            const root = d3_select(this);
            const p = projection(d.loc);
            root.each(attrChanged('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`));
            const drawn = JSON.stringify([size, d.kind, d.facing, d.aspects, d.lit, d.plate, d.cross]);
            const node = this as SVGGElement & { __drawn?: string };
            if (node.__drawn === drawn) return;
            node.__drawn = drawn;
            root.selectAll('*').remove();
            const rect = (x: number, y: number, w: number, h: number, cls: string, r = 0) => root.append('rect')
                .attr('class', cls).attr('x', x.toFixed(1)).attr('y', y.toFixed(1)).attr('width', w.toFixed(1)).attr('height', h.toFixed(1))
                .attr('rx', r.toFixed(1));
            const lamp = (x: number, y: number, r: number, fill: string, cls = 'rail-lamp') => root.append('circle')
                .attr('class', cls).attr('cx', x.toFixed(1)).attr('cy', y.toFixed(1)).attr('r', r.toFixed(1)).attr('fill', fill);

            // which way it faces: a wedge at its foot
            const a = d.facing * Math.PI / 180;
            const [dx, dy] = [Math.sin(a), -Math.cos(a)];
            const w = Math.max(4, size * 0.18);
            root.append('path').attr('class', 'rail-symbol-facing')
                .attr('d', `M${(-dy * w * 0.5).toFixed(1)},${(dx * w * 0.5).toFixed(1)} L${(dx * w * 1.4).toFixed(1)},${(dy * w * 1.4).toFixed(1)} L${(dy * w * 0.5).toFixed(1)},${(-dx * w * 0.5).toFixed(1)}Z`);

            const post = Math.max(6, size * 0.45);
            root.append('line').attr('class', 'rail-symbol-post').attr('y2', (-post).toFixed(1));
            let top = -post;

            if (d.plate && d.kind !== 'crossing-lights') {
                // a signal's identification plate: black letters on white, under its head
                const plateH = Math.max(7, size * 0.28);
                const plateW = Math.max(size * 0.8, d.plate.length * plateH * 0.62);
                rect(-plateW / 2, top - plateH, plateW, plateH, 'rail-signal-plate', 1);
                root.append('text').attr('class', 'rail-signal-plate-text').attr('text-anchor', 'middle')
                    .attr('y', (top - plateH * 0.25).toFixed(1)).style('font-size', `${(plateH * 0.75).toFixed(1)}px`).text(d.plate);
                top -= plateH + 1;
            }
            if (d.kind === 'signal') {
                const aspects = d.aspects ?? ['green', 'yellow', 'red'];
                const width = size * 0.5;
                const r = width * 0.3;
                const height = aspects.length * r * 2.4 + r * 0.6;
                rect(-width / 2, top - height, width, height, 'rail-signal-head', width * 0.3);
                aspects.forEach((colour, i) => {
                    const lit = colour === d.lit && aspects.indexOf(colour) === i ||
                        // of two yellows (a four-aspect head), the lower one shows a single yellow
                        (colour === d.lit && d.lit === 'yellow' && i === aspects.lastIndexOf('yellow'));
                    lamp(0, top - height + r * 1.5 + i * r * 2.4, r, lit ? lampColours[colour] : '#2e2e2e', lit ? 'rail-lamp lit' : 'rail-lamp');
                });
            } else if (d.kind === 'shunt-signal') {
                // a ground signal: a black housing with a red and a white lamp side by side (danger)
                const width = size * 0.6;
                const height = size * 0.38;
                rect(-width / 2, top - height, width, height, 'rail-signal-head', height * 0.25);
                lamp(-width * 0.22, top - height / 2, height * 0.26, lampColours.red, 'rail-lamp lit');
                lamp(width * 0.22, top - height / 2, height * 0.26, '#f4f4f4', 'rail-lamp lit');
            } else {
                // the road traffic light signals at a level crossing, over their plate
                const width = size * 1.1;
                const height = size * 0.62;
                if (size >= 24) {
                    // the plate is wider than the backboard, as its words need
                    const plateW = width * 1.5;
                    const plateH = size * 0.42;
                    rect(-plateW / 2, top - plateH, plateW, plateH, 'rail-crossing-plate', 1);
                    for (const [line, text] of [[0, 'STOP'], [1, 'when lights show']] as const) {
                        root.append('text').attr('class', 'rail-crossing-plate-text').attr('text-anchor', 'middle')
                            .attr('y', (top - plateH + plateH * (line ? 0.86 : 0.44)).toFixed(1))
                            .style('font-size', `${(plateH * (line ? 0.27 : 0.36)).toFixed(1)}px`).text(text);
                    }
                    top -= plateH + 1;
                }
                rect(-width / 2, top - height, width, height, 'rail-crossing-backboard', height * 0.18);
                const r = height * 0.22;
                lamp(-width * 0.3, top - height * 0.62, r, lampColours.red, 'rail-lamp lit');
                lamp(width * 0.3, top - height * 0.62, r, lampColours.red, 'rail-lamp lit');
                lamp(0, top - height * 0.3, r * 0.8, '#ffb000', 'rail-lamp amber');
                top -= height + 2;
                if (d.cross) {
                    // a St Andrew's cross: white arms edged red
                    const c = width * 0.45;
                    const arms = `M${-c},${top - 2 * c} L${c},${top} M${c},${top - 2 * c} L${-c},${top}`;
                    root.append('path').attr('class', 'rail-cross-edge').attr('d', arms).attr('stroke-width', (c * 0.42).toFixed(1));
                    root.append('path').attr('class', 'rail-cross').attr('d', arms).attr('stroke-width', (c * 0.26).toFixed(1));
                }
            }
        });
}
