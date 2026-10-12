import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { StreetGeometry, SymbolShape } from '../geometry/street';

type Group = d3.Selection<SVGGElement>;

/** Draws `data` as `<path>`s in `group`, keyed, with a class and path data per item */
export function joinPaths<T>(group: Group, data: T[], key: (d: T) => string, className: (d: T) => string, d: (d: T) => string) {
    const paths = group.selectAll<SVGPathElement, T>('path').data(data, key);
    paths.exit().remove();
    paths.enter().append('path')
        .merge(paths)
        .attr('class', className)
        .attr('d', d);
}

/** Projects lon/lat points into an SVG path */
export function pathFor(projection: Projection) {
    return (locs: Vec2[], closed: boolean) => {
        if (locs.length < 2) return '';
        return 'M' + locs.map(loc => {
            const p = projection(loc);
            return p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }).join('L') + (closed ? 'Z' : '');
    };
}

/** Screen position, scale and heading of a symbol placed in metres */
export function screenPlacement(projection: Projection, loc: Vec2, ahead: Vec2) {
    const p = projection(loc);
    const q = projection(ahead);
    return {
        p,
        pxPerMetre: Math.hypot(q[0] - p[0], q[1] - p[1]),
        angle: Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI
    };
}


/**
 * Draws footways, mapped areas, kerbs and road markings.
 * `group(name)` returns the layer's group for that name; groups are stacked by the lanes layer.
 */
export function drawStreet(
    group: (name: string) => Group,
    street: StreetGeometry,
    projection: Projection,
    zoom: number,
    zooms: { markings: number; labels: number }
) {
    const path = pathFor(projection);
    const markings = zoom >= zooms.markings;
    const symbols = zoom >= zooms.labels;

    joinPaths(group('areas'), street.areas.filter(a => a.kind !== 'island'), d => d.id,
        d => `street-area street-area-${d.kind}`, d => path(d.polygon, true));

    joinPaths(group('islands'), street.areas.filter(a => a.kind === 'island'), d => d.id,
        () => 'street-area street-area-island', d => path(d.polygon, true));

    const sidePaths = street.paths.filter(p => p.kind !== 'crossing');
    joinPaths(group('paths'), sidePaths, d => d.id,
        d => `street-path street-path-${d.kind}` + (d.assumed ? ' assumed' : ''), d => path(d.polygon, true));

    // crossings sit on top of the road they cross
    const crossings = street.paths.filter(p => p.kind === 'crossing');
    const crossingShapes = crossings.flatMap(c => [
        { key: c.id, cls: `street-path street-path-crossing markings-${c.markings}` + (c.assumed ? ' assumed' : ''), d: path(c.polygon, true) },
        ...(!markings ? [] : c.marks.map((m, i) => ({
            key: `${c.id}-m${i}`,
            cls: c.markings === 'zebra' ? 'marking marking-zebra_bar' : `marking marking-crossing_line ${c.markings}`,
            d: path(m, c.markings === 'zebra')
        })))
    ]);
    joinPaths(group('crossings'), crossingShapes, d => d.key, d => d.cls, d => d.d);

    joinPaths(group('kerb-lines'), street.kerbs, d => d.id,
        d => `street-kerb kerb-${d.kerb}`, d => path(d.line, false));

    // node markings, with the bands under the bars and lines
    const order = ['crossing', 'calming', 'mini_roundabout', 'island', 'kerb_node', 'zebra_bar', 'crossing_line', 'stop_line', 'give_way_line', 'signal_line'];
    const nodeShapes = !markings ? [] : [...street.markings].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    joinPaths(group('markings'), nodeShapes, d => d.key,
        d => `marking marking-${d.kind}` + (d.variant ? ` ${d.variant}` : ''), d => path(d.points, d.closed));

    drawSymbols(group('symbols'), symbols ? street.symbols : [], projection);
}


function drawSymbols(group: Group, data: SymbolShape[], projection: Projection) {
    const items = data.map(d => {
        const { p, pxPerMetre, angle } = screenPlacement(projection, d.loc, d.ahead);
        // painted road text and signs read upright for the approaching driver
        const k = d.size * pxPerMetre;
        return { ...d, transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)})`, k };
    });

    const symbols = group.selectAll<SVGGElement, typeof items[number]>('g.street-symbol')
        .data(items, d => d.key);
    symbols.exit().remove();
    const enter = symbols.enter().append('g')
        .attr('class', d => `street-symbol symbol-${d.kind}`);
    enter.filter(d => d.kind === 'stop_text').append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .text('STOP');
    enter.filter(d => d.kind !== 'stop_text').append('use');

    const all = enter.merge(symbols)
        .attr('transform', d => d.transform);
    all.select('text')
        .attr('font-size', d => (d.k * 0.55).toFixed(1));
    all.select('use')
        .attr('href', d => (d.kind === 'signals' ? '#lanes-signals' : '#lanes-giveway'))
        .attr('transform', d => `scale(${(d.k / 20).toFixed(3)})`);
}
