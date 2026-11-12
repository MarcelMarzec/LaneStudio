import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { LaneBox, LaneSymbol } from '../geometry/lane_symbols';
import type { MarkingSymbol } from '../geometry/road_marking';
import { turnArrowSymbol } from './defs';
import { attrChanged, joinPaths, markingColourValues, pathFor, screenPlacement } from './street';

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


/**
 * Draws pictograms mapped as road markings (see geometry/road_marking): an arrow as long as its way, one `<use>` of the
 * turn arrows per `arrow` value (overlapping into one arrow, as on lanes), at most 1.8 m wide; a cycle symbol on a node
 */
export function drawMarkingSymbols(group: Group, symbols: MarkingSymbol[], projection: Projection) {
    const items = symbols.map(d => {
        const { p, pxPerMetre, angle } = screenPlacement(projection, d.loc, d.ahead);
        // the turn arrows' box is 24 units long and 18 wide; the cycle symbol's 20 long
        const along = d.length * pxPerMetre / (d.kind === 'arrow' ? 24 : 20);
        const across = d.kind === 'arrow' ? Math.min(along, 1.8 * pxPerMetre / 18) : along;
        return { ...d, along, across, transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)})` };
    });
    const all = group.selectAll<SVGGElement, typeof items[number]>('g.road-marking-symbol').data(items, d => d.key);
    all.exit().remove();
    const merged = all.enter().append('g').merge(all)
        .each(attrChanged('class', d => `road-marking-symbol road-marking-symbol-${d.kind} ${d.id}`))
        .each(attrChanged('transform', d => d.transform))
        .style('color', d => markingColourValues[d.style.colour]);
    merged.each(function(d) {
        const uses = (d.kind === 'arrow' ? d.turns ?? [] : ['cycle']).map(turn => {
            if (turn === 'cycle') return { href: '#lanes-cycle', mirror: false };
            const symbol = turnArrowSymbol(turn);
            return symbol ? { href: `#${symbol.id}`, mirror: symbol.mirror } : null;
        }).filter((u): u is { href: string; mirror: boolean } => !!u);
        const use = d3_select(this).selectAll<SVGUseElement, typeof uses[number]>('use').data(uses);
        use.exit().remove();
        use.enter().append('use').merge(use)
            .each(attrChanged('href', u => u.href))
            .each(attrChanged('transform', u => `scale(${((u.mirror ? -1 : 1) * d.across).toFixed(3)},${d.along.toFixed(3)})`));
    });
}
