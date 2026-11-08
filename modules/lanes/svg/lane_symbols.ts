import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { LaneBox, LaneSymbol } from '../geometry/lane_symbols';
import { attrChanged, joinPaths, pathFor, screenPlacement } from './street';

type Group = d3.Selection<SVGGElement>;

const texts: Partial<Record<LaneSymbol['kind'], string[]>> = {
    bus_lane_text: ['BUS', 'LANE'],
    bus_stop_text: ['BUS', 'STOP']
};

/**
 * Draws symbols painted along lanes and strips (see geometry/lane_symbols): cycle symbols and sharrows as `<use>`
 * copies of their symbols, words as two lines of text read by the driver coming towards them (the first word furthest
 * away, as painted), and the yellow box of a bus stop clearway
 */
export function drawLaneSymbols(group: Group, boxGroup: Group, symbols: LaneSymbol[], boxes: LaneBox[], projection: Projection) {
    const path = pathFor(projection);
    joinPaths(boxGroup, boxes, d => d.key, d => `lane-box bus-stop-box ${d.wayID}`, d => path(d.points, true));

    const items = symbols.map(d => {
        const { p, pxPerMetre, angle } = screenPlacement(projection, d.loc, d.ahead);
        return { ...d, k: d.size * pxPerMetre, transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)})` };
    });
    const all = group.selectAll<SVGGElement, typeof items[number]>('g.lane-symbol').data(items, d => d.key);
    all.exit().remove();
    const enter = all.enter().append('g').each(attrChanged('class', d => `lane-symbol lane-symbol-${d.kind}`));
    enter.filter(d => !texts[d.kind]).append('use');
    enter.filter(d => !!texts[d.kind]).each(function(d) {
        const g = d3_select(this);
        for (const [i, word] of texts[d.kind]!.entries()) {
            g.append('text').attr('class', `lane-word lane-word-${i}`).attr('text-anchor', 'middle').attr('dominant-baseline', 'central').text(word);
        }
    });
    const merged = enter.merge(all).each(attrChanged('transform', d => d.transform));
    merged.select('use')
        .each(attrChanged('href', d => (d.kind === 'sharrow' ? '#lanes-sharrow' : '#lanes-cycle')))
        .each(attrChanged('transform', d => `scale(${(d.k / 20).toFixed(3)})`));
    // the words stand one behind the other along the lane, upright for the driver, tall and narrow as painted
    merged.selectAll<SVGTextElement, unknown>('text.lane-word')
        .attr('font-size', function() { return (d3_select<SVGGElement, typeof items[number]>(this.parentNode as SVGGElement).datum().k * 0.34).toFixed(1); })
        .attr('transform', function() {
            const d = d3_select<SVGGElement, typeof items[number]>(this.parentNode as SVGGElement).datum();
            const i = (this as SVGTextElement).classList.contains('lane-word-0') ? -1 : 1;
            return `translate(0,${(i * d.k * 0.32).toFixed(1)}) scale(1,1.6)`;
        });
}
