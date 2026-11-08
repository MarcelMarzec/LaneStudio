import { select as d3_select } from 'd3-selection';

import { geoExtent } from '../../geo/extent';
import { geoSphericalDistance } from '../../geo/geo';
import type { Vec2 } from '../../geo/vector';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
import { t } from '../../core/localizer';
import { utilKeybinding } from '../../util';
import { offsetFromWay } from '../geometry/measure';
import type { LaneRef } from '../model';
import { measurePanel } from '../ui/measure_panel';
import { laneRouting } from './lane_routing';
import { isDrag } from './mode_routing';
import { isLaneRoad } from './roads';

/** A distance measured on the map, and the road (and lane) it was measured across, to set a width from */
export interface Measurement {
    a: Vec2;
    b: Vec2;
    metres: number;
    /** the road nearest the middle of the line, the side of it the middle is on, and the lane under the middle */
    road?: { wayID: string; side: 'left' | 'right'; lane?: LaneRef };
}

/** The road nearest a point (within 30 m), the side of it the point is on, and the lane drawn there */
export function roadAt(context: iD.Context, loc: Vec2): Measurement['road'] {
    const graph = context.graph();
    const extent = new geoExtent(loc).padByMeters(30);
    const roads = context.history().intersects(extent).filter(isLaneRoad) as osmWay[];
    let best: { way: osmWay; offset: number } | undefined;
    for (const way of roads) {
        const at = offsetFromWay(way, graph, loc);
        if (at.along < 0 || at.along > at.total) continue;
        if (!best || Math.abs(at.offset) < Math.abs(best.offset)) best = { way, offset: at.offset };
    }
    if (!best || Math.abs(best.offset) > 30) return undefined;
    const point = context.projection(loc) as [number, number];
    const lane = laneRouting(context).laneAt(point, best.way.id);
    return { wayID: best.way.id, side: best.offset < 0 ? 'left' : 'right', lane: lane?.kind === 'lane' ? lane.ref : undefined };
}

/**
 * The Measure tool: click two points on the map to measure the distance between them, over the imagery, then set it
 * as a width of the road it crosses (the road, a lane, a pavement, a cycle lane or parking) from the panel. Esc lets go
 * of the measurement, then leaves.
 */
export function modeLaneMeasure(context: iD.Context) {
    const keybinding = utilKeybinding('lanes-measure');
    const panel = measurePanel(context);
    let points: Vec2[] = [];
    let pointer: Vec2 | null = null;
    let measured: Measurement | null = null;

    const layer = () => {
        let g = context.surface().select<SVGGElement>('g.lanes-measure');
        if (g.empty()) g = context.surface().append('g').attr('class', 'lanes-measure');
        return g;
    };

    function draw() {
        const g = layer();
        const ends = points.length === 1 && pointer ? [points[0], pointer] : points;
        const projected = ends.map(loc => context.projection(loc) as [number, number]);
        const line = g.selectAll<SVGPathElement, number>('path.lanes-measure-line').data(projected.length === 2 ? [0] : []);
        line.exit().remove();
        line.enter().append('path').attr('class', 'lanes-measure-line').merge(line)
            .attr('d', `M${projected.map(p => p.join(',')).join('L')}`);
        const dots = g.selectAll<SVGCircleElement, [number, number]>('circle').data(projected);
        dots.exit().remove();
        dots.enter().append('circle').attr('class', 'lanes-measure-end').attr('r', 4).merge(dots)
            .attr('cx', d => d[0]).attr('cy', d => d[1]);
        // the distance, above the middle of the line
        const label = g.selectAll<SVGTextElement, { metres: number; x: number; y: number }>('text').data(projected.length === 2 ? [{
            metres: geoSphericalDistance(ends[0], ends[1]),
            x: (projected[0][0] + projected[1][0]) / 2,
            y: (projected[0][1] + projected[1][1]) / 2 - 10
        }] : []);
        label.exit().remove();
        label.enter().append('text').attr('class', 'lanes-measure-label').attr('text-anchor', 'middle').merge(label)
            .attr('x', d => d.x)
            .attr('y', d => d.y)
            .text(d => t('_lanes.measure.metres', { m: d.metres.toFixed(2) }));
    }

    function click(event: MouseEvent) {
        const loc = context.projection.invert(context.map().mouse(event)) as Vec2;
        if (points.length !== 1) {
            // a first point, or a new measurement after a finished one
            points = [loc];
            measured = null;
        } else {
            points = [points[0], loc];
            const middle: Vec2 = [(points[0][0] + loc[0]) / 2, (points[0][1] + loc[1]) / 2];
            measured = { a: points[0], b: loc, metres: geoSphericalDistance(points[0], loc), road: roadAt(context, middle) };
        }
        panel.update(measured, points.length);
        draw();
    }

    const mode = {
        id: 'lanes-measure',
        button: 'lanes-measure',
        title: t.append('_lanes.measure.title'),
        description: t.append('_lanes.toolbar.measure.tooltip'),
        enter() {
            keybinding.on('⎋', () => {
                if (points.length) {
                    points = [];
                    measured = null;
                    panel.update(null, 0);
                    draw();
                } else {
                    context.enter(modeBrowse(context) as any);
                }
            }, true);
            d3_select(document).call(keybinding);
            let down: [number, number] | null = null;
            context.surface()
                .classed('lanes-measuring', true)
                .on('pointerdown.lanes-measure', (event: PointerEvent) => { down = [event.clientX, event.clientY]; })
                .on('pointermove.lanes-measure', (event: PointerEvent) => {
                    if (points.length !== 1) return;
                    pointer = context.projection.invert(context.map().mouse(event)) as Vec2;
                    draw();
                })
                .on('click.lanes-measure', (event: MouseEvent) => {
                    if (!isDrag(down, [event.clientX, event.clientY])) click(event);
                });
            context.map().on('drawn.lanes-measure', draw);
            panel.show();
            panel.update(null, 0);
        },
        exit() {
            d3_select(document).call(keybinding.unbind);
            context.surface()
                .classed('lanes-measuring', false)
                .on('pointerdown.lanes-measure', null)
                .on('pointermove.lanes-measure', null)
                .on('click.lanes-measure', null);
            context.map().on('drawn.lanes-measure', null);
            context.surface().selectAll('g.lanes-measure').remove();
            panel.hide();
            points = [];
            measured = null;
        },
        selectedIDs: () => [] as string[]
    };
    return mode;
}
