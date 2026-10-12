import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { StreetGeometry, SymbolShape } from '../geometry/street';
import type { ParkingShape } from '../geometry/parking';
import type { RoadMarkings } from '../geometry/road_marking';
import type { MarkingColour, StrokeStyle } from '../model/street_features';

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
        d => `street-area street-area-${d.kind}` + (d.surface ? ` surface-${d.surface}` : ''), d => path(d.polygon, true));

    joinPaths(group('islands'), street.areas.filter(a => a.kind === 'island'), d => d.id,
        d => `street-area street-area-island surface-${d.surface ?? 'concrete'}`, d => path(d.polygon, true));

    // paths by kind, surface and use; segregated foot and cycle paths get a line down the middle
    const sidePaths = street.paths.filter(p => p.kind !== 'crossing');
    const pathShapes = sidePaths.flatMap(p => [
        {
            key: p.id, d: path(p.polygon, true),
            cls: `street-path street-path-${p.kind}` + (p.assumed ? ' assumed' : '') +
                (p.surface ? ` surface-${p.surface}` : '') + (p.use ? ` use-${p.use}` : '')
        },
        ...(p.footHalf ? [{ key: `${p.id}-foot`, cls: 'street-path-foot-half', d: path(p.footHalf, true) }] : []),
        ...(p.divider && markings ? [{ key: `${p.id}-divider`, cls: 'street-path-divider', d: path(p.divider, false) }] : [])
    ]);
    joinPaths(group('paths'), pathShapes, d => d.key, d => d.cls, d => d.d);

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


/* ---------- street parking ---------- */

/** Street parking areas as road surface, their laybys and their bays */
export function drawParking(group: Group, parking: ParkingShape[], projection: Projection, markings: boolean) {
    const path = pathFor(projection);
    const shapes = parking.flatMap(p => [
        ...(p.connector ? [{ key: `${p.id}-c`, cls: 'street-parking-connector', d: path(p.connector, true) }] : []),
        { key: p.id, cls: 'street-parking', d: path(p.polygon, true) },
        ...(!markings ? [] : p.bays.map((bay, i) => ({ key: `${p.id}-b${i}`, cls: 'street-parking-bay', d: path(bay, false) })))
    ]);
    joinPaths(group, shapes, d => d.key, d => d.cls, d => d.d);
}


/* ---------- road markings ---------- */

export const markingColourValues: Record<MarkingColour, string> = {
    white: '#f4f4f4', yellow: '#f6c700', red: '#d6342c', blue: '#2f6fd6', green: '#3a9a4a', orange: '#f08a24'
};

/** Dash and gap lengths in metres for a line style, unless `dasharray=*` says otherwise */
const defaultDash: Record<StrokeStyle, number[] | null> = { solid: null, dashed: [3, 6], dotted: [0.6, 0.6] };

/**
 * Draws `road_marking=*` features at their real width: lines in their stroke style, areas with
 * their pattern, and painted text.
 */
export function drawRoadMarkings(group: Group, data: RoadMarkings, projection: Projection, showText: boolean) {
    const path = pathFor(projection);
    // metres to pixels where the markings are (the scale barely changes across the view)
    const sample = data.lines[0]?.line[0] ?? data.areas[0]?.polygon[0] ?? data.texts[0]?.loc;
    let pxPerMetre = 1;
    if (sample) {
        const a = projection(sample);
        const b = projection([sample[0], sample[1] + 1 / 111320]);
        pxPerMetre = Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const px = (metres: number) => Math.max(1, metres * pxPerMetre).toFixed(1);

    const areas = group.selectAll<SVGPathElement, typeof data.areas[number]>('path.road-marking-area')
        .data(data.areas, d => d.key);
    areas.exit().remove();
    areas.enter().append('path')
        .attr('class', 'road-marking-area')
        .merge(areas)
        .attr('d', d => path(d.polygon, true))
        .attr('stroke', d => markingColourValues[d.style.colour])
        .attr('stroke-width', d => px(d.style.width))
        .attr('fill', d => {
            const pattern = d.style.pattern;
            if (!pattern || pattern === 'solid' || pattern === 'filled') return markingColourValues[d.style.colour];
            const known = ['crosshatch', 'hatch', 'chevron', 'dots', 'zigzag'];
            return `url(#lanes-pattern-${known.includes(pattern) ? pattern : 'hatch'}-${d.style.colour})`;
        })
        .attr('fill-opacity', d => (!d.style.pattern || d.style.pattern === 'solid' || d.style.pattern === 'filled' ? 0.45 : 1));

    const lines = group.selectAll<SVGPathElement, typeof data.lines[number]>('path.road-marking-line')
        .data(data.lines, d => d.key);
    lines.exit().remove();
    lines.enter().append('path')
        .attr('class', 'road-marking-line')
        .attr('fill', 'none')
        .merge(lines)
        .attr('d', d => path(d.line, false))
        .attr('stroke', d => markingColourValues[d.style.colour])
        .attr('stroke-width', d => px(d.style.width))
        .attr('stroke-dasharray', d => {
            const dash = d.stroke === 'solid' ? null : (d.style.dash ?? defaultDash[d.stroke]);
            return dash ? dash.map(px).join(',') : null;
        });

    const texts = group.selectAll<SVGTextElement, typeof data.texts[number]>('text.road-marking-text')
        .data(showText ? data.texts : [], d => d.key);
    texts.exit().remove();
    texts.enter().append('text')
        .attr('class', 'road-marking-text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .merge(texts)
        .text(d => d.text)
        .attr('fill', d => markingColourValues[d.style.colour])
        .attr('font-size', () => px(1.6))
        .attr('transform', d => {
            const { p, angle } = screenPlacement(projection, d.loc, d.ahead);
            return `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)})`;
        });
}
