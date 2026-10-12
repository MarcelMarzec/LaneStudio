import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';
import { roadGeometry, type RoadPiece, type LaneMark } from '../geometry/road_geometry';
import type { LaneInfo } from '../geometry/layout';
import { parseTurn } from '../model';
import { svgLaneDefs, turnArrowSymbol } from './defs';

/** Zoom levels where each level of detail appears (see the plan's zoom rules) */
export const laneZooms = {
    ribbons: 17,
    markings: 18,
    labels: 19
};

type Selection = d3.Selection<SVGGElement>;


/** The line style between two neighbouring lanes, from `change:lanes` (left and right as seen along the way) */
function dividerClass(left: LaneInfo, right: LaneInfo, layoutMarkings: boolean): string {
    if (!layoutMarkings) return 'none';
    if (left.ref.direction !== right.ref.direction) return 'centre';
    if (!left.change && !right.change) return 'dashed unknown';

    // backward lanes are seen from behind their drivers, so their left and right swap
    const flipped = left.ref.direction === 'backward';
    const leftCrosses = flipped ? (left.change?.toLeft ?? true) : (left.change?.toRight ?? true);
    const rightCrosses = flipped ? (right.change?.toRight ?? true) : (right.change?.toLeft ?? true);
    if (leftCrosses && rightCrosses) return 'dashed';
    if (!leftCrosses && !rightCrosses) return 'solid';
    // the solid line sits on the side of the lane that may not cross
    return leftCrosses ? 'solid-right' : 'solid-left';
}


export function svgLanes(projection: Projection, context: iD.Context) {
    let _layer: Selection = d3_select<SVGGElement, unknown>(null!) as Selection;
    let _enabled = true;

    const path = (locs: Vec2[], closed: boolean) => {
        if (locs.length < 2) return '';
        return 'M' + locs.map(loc => {
            const p = projection(loc);
            return p[0].toFixed(1) + ',' + p[1].toFixed(1);
        }).join('L') + (closed ? 'Z' : '');
    };

    const pieceKey = (piece: RoadPiece) => `${piece.wayID}-${piece.index}`;


    // the map surface does not exist yet during iD's first layer draw
    function markSurface(visible: boolean) {
        const surface = context.surface();
        if (surface) surface.classed('lanes-visible', visible);
    }

    function clear() {
        _layer.selectAll('g.lanes-group > *').remove();
        markSurface(false);
    }


    function groups() {
        _layer.selectAll('g.lanes-group')
            .data(['roadside', 'carriageway', 'junctions', 'lanes', 'dividers', 'kerbs', 'arrows', 'labels'])
            .enter()
            .append('g')
            .attr('class', (d: string) => `lanes-group lanes-${d}`);
        return (name: string) => _layer.select<SVGGElement>(`g.lanes-${name}`);
    }


    function draw() {
        _layer = host();
        if (_layer.empty()) return;
        const map = context.map();
        const zoom = map.zoom() as number;
        if (!_enabled || zoom < laneZooms.ribbons || !map.editableDataEnabled()) {
            clear();
            return;
        }

        const graph = context.graph();
        const features = context.features();
        const ways = (context.history().intersects(map.extent()) as osmWay[])
            .filter(entity => isLaneRoad(entity) && !features.isHidden(entity, graph, 'line'));
        const { pieces, junctions } = roadGeometry(ways, graph);
        const selected = new Set(context.selectedIDs());
        const group = groups();
        const markings = zoom >= laneZooms.markings;
        const labels = zoom >= laneZooms.labels;

        markSurface(true);


        /* roadside strips */
        const strips = pieces.flatMap(piece => piece.roadside.map((strip, i) => ({ ...strip, key: `${pieceKey(piece)}-${i}` })));
        const stripPaths = group('roadside').selectAll<SVGPathElement, typeof strips[number]>('path')
            .data(strips, d => d.key);
        stripPaths.exit().remove();
        stripPaths.enter().append('path')
            .merge(stripPaths)
            .attr('class', d => `roadside roadside-${d.kind}` + (d.assumed ? ' assumed' : ''))
            .attr('d', d => path(d.polygon, true));


        /* carriageways */
        const carriageways = group('carriageway').selectAll<SVGPathElement, RoadPiece>('path')
            .data(pieces, pieceKey);
        carriageways.exit().remove();
        carriageways.enter().append('path')
            .merge(carriageways)
            .attr('class', d => 'carriageway' +
                (d.layout.assumed ? ' assumed' : '') +
                (selected.has(d.wayID) ? ' selected' : ''))
            .attr('d', d => path(d.carriageway, true));


        /* junction areas */
        const areas = group('junctions').selectAll<SVGPathElement, typeof junctions[number]>('path')
            .data(junctions, d => d.nodeID);
        areas.exit().remove();
        areas.enter().append('path')
            .attr('class', 'junction-area')
            .merge(areas)
            .attr('d', d => path(d.polygon, true));


        /* lane ribbons */
        const laneData = pieces.flatMap(piece => piece.layout.lanes.map((lane, i) => ({ piece, lane, i })));
        const ribbons = group('lanes').selectAll<SVGPathElement, typeof laneData[number]>('path')
            .data(laneData, d => `${pieceKey(d.piece)}-${d.i}`);
        ribbons.exit().remove();
        ribbons.enter().append('path')
            .merge(ribbons)
            .attr('class', d => `lane lane-${d.lane.kind} lane-${d.lane.ref.direction}`)
            .attr('d', d => path(d.piece.lanes[d.i], true));


        /* dividers between lanes, from change:lanes */
        const dividerData = !markings ? [] : pieces.flatMap(piece => {
            const lanes = piece.layout.lanes;
            const result: { key: string; style: string; line: string; piece: RoadPiece; k: number }[] = [];
            for (let k = 1; k < lanes.length; k++) {
                const style = dividerClass(lanes[k - 1], lanes[k], piece.layout.markings);
                if (style === 'none') continue;
                const key = `${pieceKey(piece)}-${k}`;
                // a double marking: one line either side of the boundary
                if (style === 'centre' || style.startsWith('solid-')) {
                    const leftStyle = style === 'centre' || style === 'solid-left' ? 'solid' : 'dashed';
                    const rightStyle = style === 'centre' || style === 'solid-right' ? 'solid' : 'dashed';
                    result.push({ key: key + 'l', style: `${leftStyle} double${style === 'centre' ? ' centre' : ''}`, line: path(piece.dividerSides[k][0], false), piece, k });
                    result.push({ key: key + 'r', style: `${rightStyle} double${style === 'centre' ? ' centre' : ''}`, line: path(piece.dividerSides[k][1], false), piece, k });
                } else {
                    result.push({ key, style, line: path(piece.boundaries[k], false), piece, k });
                }
            }
            return result;
        });
        const dividers = group('dividers').selectAll<SVGPathElement, typeof dividerData[number]>('path')
            .data(dividerData, d => d.key);
        dividers.exit().remove();
        dividers.enter().append('path')
            .merge(dividers)
            .attr('class', d => `divider ${d.style}`)
            .attr('d', d => d.line);


        /* kerbs */
        const kerbData = pieces.flatMap(piece => [
            { key: `${pieceKey(piece)}-l`, line: piece.boundaries[0], assumed: piece.layout.assumed },
            { key: `${pieceKey(piece)}-r`, line: piece.boundaries[piece.boundaries.length - 1], assumed: piece.layout.assumed }
        ]);
        const kerbs = group('kerbs').selectAll<SVGPathElement, typeof kerbData[number]>('path')
            .data(kerbData, d => d.key);
        kerbs.exit().remove();
        kerbs.enter().append('path')
            .merge(kerbs)
            .attr('class', d => 'kerb' + (d.assumed ? ' assumed' : ''))
            .attr('d', d => path(d.line, false));


        /* turn arrows */
        const screenMark = (mark: LaneMark) => {
            const p = projection(mark.loc);
            const q = projection(mark.ahead);
            const pxPerMetre = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const angle = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
            return { p, pxPerMetre, angle };
        };
        const arrowData = !markings ? [] : pieces.flatMap(piece => piece.arrows.flatMap((mark, m) => {
            const lane = piece.layout.lanes[mark.lane];
            const { p, pxPerMetre, angle } = screenMark(mark);
            // arrows are drawn in a 24 unit tall box pointing up; size them to the lane
            const k = Math.min(lane.width * 1.4, 5) * pxPerMetre / 24;
            return parseTurn(lane.turn).map(value => {
                const symbol = turnArrowSymbol(value);
                return {
                    key: `${pieceKey(piece)}-${m}-${value}`,
                    href: symbol ? `#${symbol.id}` : '',
                    transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)}) scale(${(symbol?.mirror ? -k : k).toFixed(3)},${k.toFixed(3)})`
                };
            }).filter(d => d.href);
        }));
        const arrows = group('arrows').selectAll<SVGUseElement, typeof arrowData[number]>('use')
            .data(arrowData, d => d.key);
        arrows.exit().remove();
        arrows.enter().append('use')
            .attr('class', 'turn-arrow')
            .merge(arrows)
            .attr('href', d => d.href)
            .attr('transform', d => d.transform);


        /* labels: destination and speed */
        const labelData = !labels ? [] : pieces.flatMap(piece => piece.labels.map(mark => {
            const lane = piece.layout.lanes[mark.lane];
            const text = [
                lane.values['destination:ref:lanes'],
                lane.values['destination:lanes']?.split(';')[0],
                lane.values['maxspeed:lanes']
            ].filter(Boolean).join(' · ');
            const { p, pxPerMetre, angle } = screenMark(mark);
            // keep text upright: read along the lane, never upside down
            let rotation = angle;
            if (rotation > 90) rotation -= 180;
            if (rotation < -90) rotation += 180;
            return {
                key: `${pieceKey(piece)}-${mark.lane}`,
                text,
                size: Math.max(9, Math.min(13, lane.width * pxPerMetre * 0.4)),
                transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${rotation.toFixed(1)})`
            };
        }).filter(d => d.text));
        const texts = group('labels').selectAll<SVGTextElement, typeof labelData[number]>('text')
            .data(labelData, d => d.key);
        texts.exit().remove();
        texts.enter().append('text')
            .attr('class', 'lane-label')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .merge(texts)
            .attr('font-size', d => d.size.toFixed(1))
            .attr('transform', d => d.transform)
            .text(d => d.text);


        /* thin iD's own strokes for roads whose lanes are drawn */
        const drawn = new Set<string>(pieces.map(piece => piece.wayID));
        context.surface().selectAll<SVGPathElement, { id: string }>('.layer-osm.lines path.line')
            .classed('lanes-drawn', d => !!d && drawn.has(d.id));
    }


    /**
     * Lanes are drawn as the first child of iD's own `osm` data layer, so they sit under iD's ways,
     * nodes and touch targets and fade with it. (iD binds its layer groups by position,
     * so a layer group of our own cannot be moved below the others.)
     */
    function host(): Selection {
        const surface = context.surface();
        if (!surface) return d3_select<SVGGElement, unknown>(null!) as Selection;
        const osm = surface.select<SVGGElement>('.data-layer.osm');
        if (osm.empty()) return osm as Selection;
        let g = osm.select<SVGGElement>(':scope > g.lanes-layer');
        if (g.empty()) {
            g = osm.insert<SVGGElement>('g', ':first-child').attr('class', 'lanes-layer');
            g.append('defs').attr('class', 'lanes-defs').call(svgLaneDefs);
        }
        return g as Selection;
    }


    // the registered layer only triggers a draw; its own group stays empty
    function drawLanes() {
        draw();
    }

    // iD redraws edited features without redrawing layers, so follow every map draw
    context.map().on('drawn.lanes', draw);

    drawLanes.enabled = function(val?: boolean) {
        if (!arguments.length) return _enabled;
        _enabled = !!val;
        draw();
        return drawLanes;
    };

    drawLanes.redraw = draw;

    return drawLanes;
}
