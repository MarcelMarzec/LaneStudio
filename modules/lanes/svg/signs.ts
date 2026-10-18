import { select as d3Select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { SignFace, SignGeometry, SignShape } from '../geometry/signs';
import { pathFor, pxPerMetre, withIdState } from './street';

type Group = d3.Selection<SVGGElement>;
type G = d3.Selection<SVGGElement>;

/*
 * Traffic signs, variable message signs, gantries and enforcement cameras on the map. Signs are
 * drawn upright at a size that grows with the zoom, on a short post from where they stand, with a
 * small wedge showing the way they face.
 */

const red = '#d0202e';
const blue = '#1d5bbf';
const black = '#1a1a1a';
const white = '#fff';

/** How big a sign is drawn, in pixels: about 14 px zoomed out, growing to 40 px zoomed right in */
export function signSize(zoom: number): number {
    return Math.max(14, Math.min(40, 14 + (zoom - 17) * 6.5));
}

/* ---------- the drawings ---------- */

type Drawing = (g: G, r: number, face: SignFace) => void;

const circle = (g: G, r: number, fill: string, stroke?: string, ring = 0) => g.append('circle')
    .attr('r', r - ring / 2).attr('fill', fill).attr('stroke', stroke ?? 'none').attr('stroke-width', ring);
const text = (g: G, value: string, size: number, fill = black, y = 0) => g.append('text')
    .attr('class', 'sign-text').attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'middle')
    .attr('font-size', size.toFixed(1)).attr('font-weight', 700).attr('fill', fill).text(value);
const redRing = (g: G, r: number) => circle(g, r, white, red, r * 0.24);
const polygon = (g: G, points: [number, number][], fill: string, stroke?: string, width = 0) => g.append('path')
    .attr('d', 'M' + points.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z')
    .attr('fill', fill).attr('stroke', stroke ?? 'none').attr('stroke-width', width).attr('stroke-linejoin', 'round');
/** An arrow pointing up, rotated by `angle` degrees, `size` long */
const arrow = (g: G, size: number, fill: string, angle = 0) => {
    const s = size / 2;
    const w = size * 0.16;
    return g.append('path')
        .attr('d', `M0,${-s} L${s * 0.55},${-s * 0.2} L${w},${-s * 0.2} L${w},${s} L${-w},${s} L${-w},${-s * 0.2} L${-s * 0.55},${-s * 0.2} Z`)
        .attr('fill', fill).attr('transform', angle ? `rotate(${angle})` : null);
};
/** A bent arrow turning right (or left when `left`) */
const turnArrow = (g: G, size: number, fill: string, left = false) => {
    const s = size / 2;
    const w = size * 0.13;
    const d = `M${-w},${s} L${-w},${-s * 0.15} Q${-w},${-s * 0.45} ${s * 0.15},${-s * 0.45} L${s * 0.3},${-s * 0.45} L${s * 0.3},${-s * 0.75} L${s * 0.8},${-s * 0.3} L${s * 0.3},${s * 0.15} L${s * 0.3},${-s * 0.15} L${s * 0.15},${-s * 0.15} Q${w},${-s * 0.15} ${w},${s * 0.1} L${w},${s} Z`;
    return g.append('path').attr('d', d).attr('fill', fill).attr('transform', left ? 'scale(-1,1)' : null);
};
const prohibitionBar = (g: G, r: number) => g.append('line')
    .attr('x1', -r * 0.62).attr('y1', -r * 0.62).attr('x2', r * 0.62).attr('y2', r * 0.62)
    .attr('stroke', red).attr('stroke-width', r * 0.2);
const bicycle = (g: G, r: number, fill: string, y = 0) => {
    const b = g.append('g').attr('transform', `translate(0,${y})`).attr('fill', 'none').attr('stroke', fill).attr('stroke-width', Math.max(1, r * 0.09));
    b.append('circle').attr('cx', -r * 0.38).attr('cy', r * 0.12).attr('r', r * 0.24);
    b.append('circle').attr('cx', r * 0.38).attr('cy', r * 0.12).attr('r', r * 0.24);
    b.append('path').attr('d', `M${-r * 0.38},${r * 0.12} L${-r * 0.1},${-r * 0.25} L${r * 0.22},${-r * 0.25} L${r * 0.38},${r * 0.12} M${-r * 0.1},${-r * 0.25} L${0},${r * 0.12} L${r * 0.22},${-r * 0.25}`);
};
const person = (g: G, r: number, fill: string, x = 0, y = 0) => {
    const p = g.append('g').attr('transform', `translate(${x},${y})`);
    p.append('circle').attr('cy', -r * 0.32).attr('r', r * 0.12).attr('fill', fill);
    p.append('path').attr('d', `M0,${-r * 0.18} L0,${r * 0.15} M0,${r * 0.15} L${-r * 0.15},${r * 0.45} M0,${r * 0.15} L${r * 0.15},${r * 0.45} M${-r * 0.18},${-r * 0.05} L${r * 0.18},${-r * 0.05}`)
        .attr('stroke', fill).attr('stroke-width', Math.max(1, r * 0.09)).attr('fill', 'none');
};

const speedLimit: Drawing = (g, r, face) => {
    redRing(g, r);
    const value = face.value ?? '';
    text(g, value, r * (value.length > 2 ? 0.75 : 0.95));
};

/** Drawings of common UK signs, by TSRGD diagram number (wiki: Road signs in the United Kingdom) */
export const ukSignDrawings: Record<string, { name: string; draw: Drawing }> = {
    'GB:601.1': {
        name: 'Stop',
        draw: (g, r) => {
            const points: [number, number][] = [];
            for (let i = 0; i < 8; i++) {
                const a = (i + 0.5) / 8 * 2 * Math.PI;
                points.push([r * Math.cos(a), r * Math.sin(a)]);
            }
            polygon(g, points, red, white, r * 0.08);
            text(g, 'STOP', r * 0.5, white);
        }
    },
    'GB:602': {
        name: 'Give way',
        draw: (g, r) => {
            polygon(g, [[-r, -r * 0.75], [r, -r * 0.75], [0, r]], white, red, r * 0.2);
        }
    },
    'GB:606': { name: 'Ahead only', draw: (g, r) => { circle(g, r, blue, white, r * 0.06); arrow(g, r * 1.3, white); } },
    'GB:610': { name: 'Keep left', draw: (g, r) => { circle(g, r, blue, white, r * 0.06); arrow(g, r * 1.3, white, -135); } },
    'GB:612': { name: 'No right turn', draw: (g, r) => { redRing(g, r); turnArrow(g, r * 1.2, black); prohibitionBar(g, r); } },
    'GB:613': { name: 'No left turn', draw: (g, r) => { redRing(g, r); turnArrow(g, r * 1.2, black, true); prohibitionBar(g, r); } },
    'GB:614': {
        name: 'No U-turn',
        draw: (g, r) => {
            redRing(g, r);
            g.append('path').attr('d', `M${r * 0.25},${r * 0.45} L${r * 0.25},${-r * 0.1} A${r * 0.25},${r * 0.25} 0 0 0 ${-r * 0.25},${-r * 0.1} L${-r * 0.25},${r * 0.2}`)
                .attr('fill', 'none').attr('stroke', black).attr('stroke-width', r * 0.16);
            polygon(g, [[-r * 0.45, r * 0.15], [-r * 0.05, r * 0.15], [-r * 0.25, r * 0.45]], black);
            prohibitionBar(g, r);
        }
    },
    'GB:616': {
        name: 'No entry',
        draw: (g, r) => {
            circle(g, r, red, white, r * 0.06);
            g.append('rect').attr('x', -r * 0.65).attr('y', -r * 0.17).attr('width', r * 1.3).attr('height', r * 0.34).attr('fill', white);
        }
    },
    'GB:617': { name: 'All vehicles prohibited', draw: (g, r) => { redRing(g, r); } },
    'GB:619': {
        name: 'No motor vehicles',
        draw: (g, r) => {
            redRing(g, r);
            g.append('rect').attr('x', -r * 0.45).attr('y', -r * 0.12).attr('width', r * 0.9).attr('height', r * 0.3).attr('rx', r * 0.06).attr('fill', black);
            g.append('rect').attr('x', -r * 0.25).attr('y', -r * 0.32).attr('width', r * 0.45).attr('height', r * 0.24).attr('rx', r * 0.06).attr('fill', black);
        }
    },
    'GB:626.2': { name: 'Weight limit', draw: (g, r, face) => { redRing(g, r); text(g, face.value ? `${face.value}` : 'T', r * 0.6); } },
    'GB:629': { name: 'Width limit', draw: (g, r, face) => { redRing(g, r); text(g, face.value ?? '↔', r * 0.55); } },
    'GB:629.2': { name: 'Height limit', draw: (g, r, face) => { redRing(g, r); text(g, face.value ?? '↕', r * 0.55); } },
    'GB:632': {
        name: 'No overtaking',
        draw: (g, r) => {
            redRing(g, r);
            g.append('rect').attr('x', -r * 0.5).attr('y', -r * 0.2).attr('width', r * 0.4).attr('height', r * 0.5).attr('rx', r * 0.08).attr('fill', red);
            g.append('rect').attr('x', r * 0.1).attr('y', -r * 0.2).attr('width', r * 0.4).attr('height', r * 0.5).attr('rx', r * 0.08).attr('fill', black);
        }
    },
    'GB:652': {
        name: 'One way',
        draw: (g, r) => {
            g.append('rect').attr('x', -r).attr('y', -r * 0.55).attr('width', r * 2).attr('height', r * 1.1).attr('fill', blue).attr('stroke', white).attr('stroke-width', r * 0.06);
            arrow(g, r * 1.6, white, 90);
        }
    },
    'GB:670': { name: 'Speed limit', draw: speedLimit },
    'GB:671': {
        name: 'National speed limit',
        draw: (g, r) => {
            circle(g, r, white, black, r * 0.06);
            g.append('line').attr('x1', -r * 0.55).attr('y1', r * 0.55).attr('x2', r * 0.55).attr('y2', -r * 0.55)
                .attr('stroke', black).attr('stroke-width', r * 0.3);
        }
    },
    'GB:672': { name: 'Minimum speed', draw: (g, r, face) => { circle(g, r, blue, white, r * 0.06); text(g, face.value ?? '', r * 0.95, white); } },
    'GB:674': {
        name: '20 zone',
        draw: (g, r, face) => {
            g.append('rect').attr('x', -r * 0.85).attr('y', -r).attr('width', r * 1.7).attr('height', r * 2).attr('rx', r * 0.12).attr('fill', white).attr('stroke', black).attr('stroke-width', r * 0.06);
            const ring = g.append('g').attr('transform', `translate(0,${-r * 0.25}) scale(0.62)`);
            speedLimit(ring, r, { code: 'GB:670', value: face.value ?? '20' });
            text(g, 'ZONE', r * 0.38, black, r * 0.65);
        }
    },
    'GB:955': { name: 'Cycles only', draw: (g, r) => { circle(g, r, blue, white, r * 0.06); bicycle(g, r, white); } },
    'GB:956': {
        name: 'Shared path',
        draw: (g, r) => {
            circle(g, r, blue, white, r * 0.06);
            const top = g.append('g').attr('transform', `translate(0,${-r * 0.35}) scale(0.6)`);
            bicycle(top, r, white);
            person(g, r, white, 0, r * 0.4);
        }
    },
    'GB:957': {
        name: 'Segregated path',
        draw: (g, r) => {
            circle(g, r, blue, white, r * 0.06);
            g.append('line').attr('y1', -r).attr('y2', r).attr('stroke', white).attr('stroke-width', r * 0.08);
            const left = g.append('g').attr('transform', `translate(${-r * 0.42},0) scale(0.55)`);
            bicycle(left, r, white);
            person(g, r, white, r * 0.42, 0);
        }
    }
};

/** Plain tag values that mean one of the drawn signs */
const aliases: Record<string, string> = { stop: 'GB:601.1', give_way: 'GB:602', maxspeed: 'GB:670' };

/** The drawing for a sign, when there is one */
export function signDrawing(code: string): { name: string; draw: Drawing } | undefined {
    return ukSignDrawings[aliases[code] ?? code];
}

/** A plate with the sign's code, for signs without a drawing */
function plate(g: G, r: number, face: SignFace) {
    const label = face.code.replace(/^[A-Z]{2,3}:/, '') + (face.value ? ` ${face.value}` : '');
    const width = Math.max(2 * r, label.length * r * 0.55 + r * 0.5);
    g.append('rect').attr('x', -width / 2).attr('y', -r * 0.6).attr('width', width).attr('height', r * 1.2).attr('rx', r * 0.15)
        .attr('fill', white).attr('stroke', black).attr('stroke-width', Math.max(1, r * 0.08));
    text(g, label, r * 0.6);
}

/** Draws one sign face centred on 0,0 with radius `r` */
export function drawFace(g: G, r: number, face: SignFace) {
    const drawing = signDrawing(face.code);
    if (drawing) drawing.draw(g, r, face);
    else plate(g, r, face);
}

function messagePanel(g: G, r: number) {
    g.append('rect').attr('x', -r * 1.4).attr('y', -r * 0.7).attr('width', r * 2.8).attr('height', r * 1.4).attr('rx', r * 0.08)
        .attr('fill', '#141414').attr('stroke', '#777').attr('stroke-width', Math.max(1, r * 0.08));
    g.append('rect').attr('x', -r * 1.2).attr('y', -r * 0.5).attr('width', r * 2.4).attr('height', r * 1.0).attr('fill', 'url(#lanes-message-dots)');
}

function camera(g: G, r: number, sign: SignShape) {
    g.append('rect').attr('x', -r * 0.85).attr('y', -r * 0.55).attr('width', r * 1.7).attr('height', r * 1.1).attr('rx', r * 0.15)
        .attr('fill', '#2c2f36').attr('stroke', '#f2c400').attr('stroke-width', Math.max(1, r * 0.1));
    if (sign.camera === 'red_light') {
        g.append('circle').attr('cx', r * 0.3).attr('r', r * 0.32).attr('fill', '#e53935');
        g.append('circle').attr('cx', -r * 0.35).attr('r', r * 0.18).attr('fill', '#9ea3ad');
    } else {
        g.append('circle').attr('cx', r * 0.2).attr('r', r * 0.32).attr('fill', '#9ea3ad');
        g.append('circle').attr('cx', r * 0.2).attr('r', r * 0.15).attr('fill', '#14161a');
    }
    if (sign.camera === 'average_speed') text(g, 'AVG', r * 0.36, '#f2c400', -r * 0.85);
}


/* ---------- on the map ---------- */

/** Draws signs, message signs, cameras, gantries and enforcement sections */
export function drawSigns(group: (name: string) => Group, data: SignGeometry, projection: Projection, zoom: number) {
    const path = pathFor(projection);
    const size = signSize(zoom);
    const r = size / 2;

    // gantries: a beam across the road at its real width
    const metres = pxPerMetre(projection, data.gantries[0]?.line[0]);
    const gantries = group('gantries').selectAll<SVGPathElement, typeof data.gantries[number]>('path')
        .data(data.gantries, d => d.id);
    gantries.exit().remove();
    gantries.enter().append('path')
        .merge(gantries)
        .attr('class', function(d) { return withIdState(this, `gantry ${d.id}`); })
        .attr('d', d => path(d.line, false))
        .attr('stroke-width', Math.max(4, 1.2 * metres).toFixed(1));

    // average-speed sections: a band along the road, with a marker at each end
    const sectionShapes = data.sections.flatMap(s => [
        { key: s.key, cls: `enforcement-section ${s.relationID}`, d: path(s.line, false) },
        ...s.ends.map((end, i) => {
            const p = projection(end);
            return { key: `${s.key}-end-${i}`, cls: `enforcement-end ${s.relationID}`, d: `M${(p[0] - 5).toFixed(1)},${p[1].toFixed(1)}a5,5 0 1,0 10,0a5,5 0 1,0 -10,0` };
        })
    ]);
    const sections = group('enforcement').selectAll<SVGPathElement, typeof sectionShapes[number]>('path')
        .data(sectionShapes, d => d.key);
    sections.exit().remove();
    sections.enter().append('path')
        .merge(sections)
        .attr('class', function(d) { return withIdState(this, d.cls); })
        .attr('d', d => d.d);

    // the signs themselves, upright on a post
    const signs = group('signs').selectAll<SVGGElement, SignShape>('g.lanes-sign')
        .data(data.signs, d => d.key);
    signs.exit().remove();
    const all = signs.enter().append('g')
        .merge(signs)
        .attr('class', function(d) { return withIdState(this, `lanes-sign lanes-sign-${d.kind} ${d.nodeID}`); });

    all.each(function(d) {
        // (each sign is redrawn from scratch: there are few of them on screen)
        const root = d3Select(this);
        root.selectAll('*').remove();
        const p = projection(d.anchor);
        root.attr('transform', `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`);

        // which way it faces: a small wedge at its foot
        if (d.facing !== null) {
            const a = d.facing * Math.PI / 180;
            const dx = Math.sin(a);
            const dy = -Math.cos(a);
            const w = Math.max(4, r * 0.35);
            root.append('path').attr('class', 'sign-facing')
                .attr('d', `M${(-dy * w * 0.5).toFixed(1)},${(dx * w * 0.5).toFixed(1)} L${(dx * w * 1.4).toFixed(1)},${(dy * w * 1.4).toFixed(1)} L${(dy * w * 0.5).toFixed(1)},${(-dx * w * 0.5).toFixed(1)}Z`);
        }
        const post = d.overhead ? 0 : Math.max(6, r * 0.9);
        if (post) root.append('line').attr('class', 'sign-post').attr('y2', -post);

        // several signs on one post stack upwards
        const faces: SignFace[] = d.kind === 'sign' ? d.faces : [{ code: d.kind }];
        faces.forEach((face, i) => {
            const y = -post - r - i * (size + 2);
            const g = root.append('g').attr('class', 'sign-face').attr('transform', `translate(0,${(d.overhead ? 0 : y).toFixed(1)})`);
            if (d.kind === 'message') messagePanel(g, r);
            else if (d.kind === 'camera') camera(g, r, d);
            else drawFace(g, r, face);
        });
        // a camera's limit beside it
        if (d.kind === 'camera' && d.faces[0]?.value) {
            const g = root.append('g').attr('class', 'sign-face').attr('transform', `translate(${(r * 1.6).toFixed(1)},${(-post - r).toFixed(1)}) scale(0.7)`);
            speedLimit(g, r, d.faces[0]);
        }
    });
}
