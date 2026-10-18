import { select as d3Select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { JunctionLabel, ShieldPlacement, ShieldStyle } from '../geometry/route_labels';
import { withIdState } from './street';

type Group = d3.Selection<SVGGElement>;

/*
 * Road number shields and motorway junction numbers, drawn upright in screen space like iD's labels.
 */

const shieldColours: Record<ShieldStyle, { fill: string; text: string; stroke: string }> = {
    motorway: { fill: '#1d5bbf', text: '#fff', stroke: '#fff' },
    primary: { fill: '#00703c', text: '#ffd200', stroke: '#fff' },
    other: { fill: '#fff', text: '#111', stroke: '#111' }
};

/** Shields at their placements, several numbers side by side */
export function drawShields(group: Group, placements: ShieldPlacement[], zoom: number) {
    const height = Math.max(15, Math.min(22, 15 + (zoom - 17) * 2.5));
    const shields = group.selectAll<SVGGElement, ShieldPlacement>('g.road-shield')
        .data(placements, d => d.key);
    shields.exit().remove();
    shields.enter().append('g')
        .attr('class', 'road-shield')
        .merge(shields)
        .attr('transform', d => `translate(${d.point[0].toFixed(1)},${d.point[1].toFixed(1)})`)
        .each(function(d) {
            const root = d3Select(this);
            const drawn = JSON.stringify([height, d.refs]);
            const node = this as SVGGElement & { __shieldDrawn?: string };
            if (node.__shieldDrawn === drawn) return;
            node.__shieldDrawn = drawn;
            root.selectAll('*').remove();

            const widths = d.refs.map(r => Math.max(height * 1.6, r.text.length * height * 0.55 + height * 0.6));
            const total = widths.reduce((a, b) => a + b, 0) + (d.refs.length - 1) * 3;
            let x = -total / 2;
            d.refs.forEach((ref, i) => {
                const colours = shieldColours[ref.style];
                root.append('rect').attr('class', `shield-plate shield-${ref.style}`)
                    .attr('x', x.toFixed(1)).attr('y', (-height / 2).toFixed(1))
                    .attr('width', widths[i].toFixed(1)).attr('height', height.toFixed(1))
                    .attr('rx', (height * 0.18).toFixed(1))
                    .attr('fill', colours.fill).attr('stroke', colours.stroke).attr('stroke-width', 1.2);
                root.append('text').attr('class', 'shield-text')
                    .attr('x', (x + widths[i] / 2).toFixed(1)).attr('dy', '0.35em')
                    .attr('text-anchor', 'middle').attr('font-size', (height * 0.68).toFixed(1))
                    .attr('fill', colours.text)
                    .text(ref.text);
                x += widths[i] + 3;
            });
        });
}

/** Junction numbers in a black box, as on UK signs, with the junction's name beside them */
export function drawJunctionLabels(group: Group, labels: (JunctionLabel & { properties: unknown })[], projection: Projection, zoom: number) {
    const height = Math.max(15, Math.min(24, 15 + (zoom - 17) * 3));
    const items = group.selectAll<SVGGElement, JunctionLabel>('g.junction-label')
        .data(labels, d => d.nodeID);
    items.exit().remove();
    items.enter().append('g')
        .merge(items)
        .attr('class', function(d) { return withIdState(this, `junction-label ${d.nodeID}`); })
        .attr('transform', d => {
            const p = projection(d.anchor);
            return `translate(${p[0].toFixed(1)},${p[1].toFixed(1)})`;
        })
        .each(function(d) {
            const root = d3Select(this);
            const drawn = JSON.stringify([height, d.ref, d.name]);
            const node = this as SVGGElement & { __junctionDrawn?: string };
            if (node.__junctionDrawn === drawn) return;
            node.__junctionDrawn = drawn;
            root.selectAll('*').remove();

            let x = -height / 2;
            if (d.ref) {
                const width = Math.max(height, d.ref.length * height * 0.6 + height * 0.4);
                x = -width / 2;
                root.append('rect').attr('class', 'junction-box')
                    .attr('x', x.toFixed(1)).attr('y', (-height / 2).toFixed(1))
                    .attr('width', width.toFixed(1)).attr('height', height.toFixed(1)).attr('rx', 1.5);
                root.append('text').attr('class', 'junction-number')
                    .attr('dy', '0.35em').attr('text-anchor', 'middle').attr('font-size', (height * 0.72).toFixed(1))
                    .text(d.ref);
                x += width;
            }
            if (d.name) {
                root.append('text').attr('class', 'junction-name')
                    .attr('x', (x + 4).toFixed(1)).attr('dy', '0.35em').attr('font-size', (height * 0.62).toFixed(1))
                    .text(d.name);
            }
            // the whole label takes clicks, selecting the junction node
            const box = (this as SVGGElement).getBBox();
            root.insert('rect', ':first-child').attr('class', 'junction-hit')
                .attr('x', (box.x - 2).toFixed(1)).attr('y', (box.y - 2).toFixed(1))
                .attr('width', (box.width + 4).toFixed(1)).attr('height', (box.height + 4).toFixed(1));
        });
}
