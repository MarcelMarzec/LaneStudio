import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { osmWay } from '../../osm/way';
import { modeSelect } from '../../modes/select';
import { actionChangeLanes } from '../actions/change_lanes';
import { actionAddMarking } from '../actions/add_marking';
import { laneState } from '../core/lane_state';
import { isLaneRoad } from '../core/roads';
import { roadGeometry, type RoadPiece, type LaneMark } from '../geometry/road_geometry';
import type { LaneInfo } from '../geometry/layout';
import { t } from '../../core/localizer';
import {
    parseLanes, parseTurn, formatTurn, dividerAt, setDivider, nextDivider, setLaneValue, setLaneKind,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';
import { laneTools } from '../core/lane_tools';
import { laneLayout } from '../geometry/layout';
import { offsetFromWay } from '../geometry/measure';
import { svgLaneDefs, turnArrowSymbol } from './defs';
import { drawStreet, drawParking, drawRoadMarkings, joinPaths } from './street';
import { actionConnectLanes, connectionNode } from '../actions/connect_lanes';
import { streetGeometry } from '../geometry/street';
import { parkingGeometry } from '../geometry/parking';
import { roadMarkingGeometry } from '../geometry/road_marking';
import { isStreetParking, surfaceGroup } from '../model/street_features';
import { pointInPolygon } from '../geometry/frame';
import type { AreaShape } from '../geometry/street';
import type { osmNode } from '../../osm/node';
import type { NodeId, OsmEntity } from '../../osm';

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


/** Whether most of a road piece lies inside one of the given areas */
function insideAreas(piece: RoadPiece, areas: AreaShape[]): boolean {
    const centre = piece.centres[Math.floor(piece.centres.length / 2)] ?? [];
    const samples = [...centre, piece.middle];
    if (!samples.length) return false;
    return areas.some(area => samples.filter(p => pointInPolygon(p, area.polygon)).length >= samples.length * 0.6);
}


export function svgLanes(projection: Projection, context: iD.Context) {
    let _layer: Selection = d3_select<SVGGElement, unknown>(null!) as Selection;
    let _enabled = true;
    const state = laneState(context);
    const tools = laneTools(context);

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
            .data([
                'areas', 'roadside', 'parking', 'paths', 'carriageway', 'junctions', 'lanes', 'islands', 'dividers', 'kerbs',
                'kerb-lines', 'crossings', 'markings', 'road-markings', 'arrows', 'connectivity', 'labels', 'symbols', 'short', 'selection', 'connect-from',
                'targets', 'short-targets', 'divider-targets'
            ])
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
        const visible = context.history().intersects(map.extent())
            .filter(entity => !features.isHidden(entity, graph, entity.geometry(graph)));
        const ways = visible.filter(isLaneRoad);
        const { pieces, junctions, connections } = roadGeometry(ways, graph);
        const selected = new Set(context.selectedIDs());
        const corridor = context.mode()?.id === 'select' ? state.corridor() : new Set<string>();
        const group = groups();
        const markings = zoom >= laneZooms.markings;
        const labels = zoom >= laneZooms.labels;

        markSurface(true);

        /* footways, mapped areas and kerbs, road markings on nodes */
        const street = streetGeometry(visible, graph);
        // roads lying inside a road mapped as an area: the area is their surface, so they draw
        // no carriageway, kerbs, roadside or general lane fill of their own
        const roadAreas = street.areas.filter(a => a.kind === 'carriageway');
        const inArea = new Set<RoadPiece>(roadAreas.length ? pieces.filter(piece => insideAreas(piece, roadAreas)) : []);
        const surfaceOf = (piece: RoadPiece) => surfaceGroup((graph.hasEntity(piece.wayID) as osmWay | undefined)?.tags.surface);
        const parking = parkingGeometry(visible, graph);
        const roadMarkings = markings ? roadMarkingGeometry(visible, graph) : { lines: [], areas: [], texts: [] };
        drawStreet(group, street, projection, zoom, laneZooms);
        drawParking(group('parking'), parking, projection, markings);
        drawRoadMarkings(group('road-markings'), roadMarkings, projection, labels);


        /* roadside strips */
        const strips = pieces.filter(piece => !inArea.has(piece)).flatMap(piece => piece.roadside.map((strip, i) => ({ ...strip, key: `${pieceKey(piece)}-${i}` })));
        const stripPaths = group('roadside').selectAll<SVGPathElement, typeof strips[number]>('path')
            .data(strips, d => d.key);
        stripPaths.exit().remove();
        stripPaths.enter().append('path')
            .merge(stripPaths)
            .attr('class', d => `roadside roadside-${d.kind}` + (d.assumed ? ' assumed' : ''))
            .attr('d', d => path(d.polygon, true));


        /* carriageways */
        const carriageways = group('carriageway').selectAll<SVGPathElement, RoadPiece>('path')
            .data(pieces.filter(piece => !inArea.has(piece)), pieceKey);
        carriageways.exit().remove();
        carriageways.enter().append('path')
            .merge(carriageways)
            .attr('class', d => 'carriageway' +
                (d.layout.assumed ? ' assumed' : '') +
                (surfaceOf(d) ? ` surface-${surfaceOf(d)}` : '') +
                (selected.has(d.wayID) ? ' selected' : '') +
                (corridor.has(d.wayID) && !selected.has(d.wayID) ? ' corridor' : ''))
            .attr('d', d => path(d.carriageway, true));


        /* junction areas */
        const areas = group('junctions').selectAll<SVGPathElement, typeof junctions[number]>('path')
            .data(roadAreas.length ? junctions.filter(j => {
                const node = graph.hasEntity(j.nodeID as NodeId) as osmNode | undefined;
                return !node || !roadAreas.some(a => pointInPolygon(node.loc, a.polygon));
            }) : junctions, d => d.nodeID);
        areas.exit().remove();
        areas.enter().append('path')
            .attr('class', 'junction-area')
            .merge(areas)
            .attr('d', d => path(d.polygon, true));


        /* lane ribbons */
        const laneData = pieces.flatMap(piece => piece.layout.lanes.map((lane, i) => ({ piece, lane, i })))
            .filter(d => !(inArea.has(d.piece) && d.lane.kind === 'general'));
        const ribbons = group('lanes').selectAll<SVGPathElement, typeof laneData[number]>('path')
            .data(laneData, d => `${pieceKey(d.piece)}-${d.i}`);
        ribbons.exit().remove();
        ribbons.enter().append('path')
            .merge(ribbons)
            .attr('class', d => {
                const surface = surfaceGroup(d.lane.values['surface:lanes']) ?? surfaceOf(d.piece);
                return `lane lane-${d.lane.kind} lane-${d.lane.ref.direction}` + (surface ? ` surface-${surface}` : '');
            })
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
                    result.push({ key: key + 'l', style: `${leftStyle} double${style === 'centre' ? ' centre' : ''}`, line: path(piece.lineSides[k][0], false), piece, k });
                    result.push({ key: key + 'r', style: `${rightStyle} double${style === 'centre' ? ' centre' : ''}`, line: path(piece.lineSides[k][1], false), piece, k });
                } else {
                    result.push({ key, style, line: path(piece.lines[k], false), piece, k });
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
        const kerbData = pieces.filter(piece => !inArea.has(piece)).flatMap(piece => [
            { key: `${pieceKey(piece)}-l`, line: piece.lines[0], assumed: piece.layout.assumed },
            { key: `${pieceKey(piece)}-r`, line: piece.lines[piece.lines.length - 1], assumed: piece.layout.assumed }
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


        /* lane connections from type=connectivity relations */
        // and guide lines carrying lanes through the junction box
        joinPaths(group('connectivity'), markings ? connections : [], d => d.key,
            d => (d.kind === 'relation' ? 'connectivity-curve' : 'junction-guide') + (d.optional ? ' optional' : ''),
            d => path(d.line, false));


        /* very short roads (slivers between junctions): an outline and a marker so they can be seen and clicked */
        const shortData = !markings ? [] : pieces.filter(piece => piece.short);
        joinPaths(group('short'), shortData, pieceKey,
            d => 'short-way' + (selected.has(d.wayID) ? ' selected' : ''), d => path(d.carriageway, true));
        drawShortTargets(group('short-targets'), shortData, selected);

        /* the lane picked first with the Connect tool */
        const from = tools.tool() === 'connect' ? tools.connectFrom() : null;
        const fromData = !from ? [] : pieces.filter(piece => piece.wayID === from.wayID).flatMap(piece =>
            piece.layout.lanes.map((lane, i) => ({ lane, key: `${pieceKey(piece)}-${i}`, polygon: piece.lanes[i] }))
                .filter(x => x.lane.ref.direction === from.ref.direction && x.lane.ref.index === from.ref.index));
        joinPaths(group('connect-from'), fromData, d => d.key, () => 'lane-connect-from', d => path(d.polygon, true));


        /* selected lanes */
        const chosen = state.selected();
        const selectionData = !chosen ? [] : pieces.filter(piece => piece.wayID === chosen.wayID).flatMap(piece =>
            piece.layout.lanes
                .map((lane, i) => ({ lane, i, key: `${pieceKey(piece)}-${i}`, polygon: piece.lanes[i] }))
                .filter(d => state.isSelected(chosen.wayID, d.lane.ref)));
        const highlights = group('selection').selectAll<SVGPathElement, typeof selectionData[number]>('path')
            .data(selectionData, d => d.key);
        highlights.exit().remove();
        highlights.enter().append('path')
            .attr('class', 'lane-selected')
            .merge(highlights)
            .attr('d', d => path(d.polygon, true));


        /* click targets: lanes from the editing zoom, dividers on the selected road */
        drawTargets(group('targets'), group('divider-targets'), pieces, markings, selected);


        /* mark iD's own drawing of what is drawn here: road lines are thinned, and the
           "hide iD's lines and points" setting hides all of it (their touch targets stay clickable) */
        const drawn = new Set<string>(pieces.map(piece => piece.wayID));
        const drawnWays = new Set<string>(drawn);
        for (const p of street.paths) drawnWays.add(p.id);
        for (const a of street.areas) drawnWays.add(a.id);
        for (const k of street.kerbs) drawnWays.add(k.id);
        for (const p of parking) drawnWays.add(p.id);
        for (const l of roadMarkings.lines) drawnWays.add(l.id);
        for (const a of roadMarkings.areas) drawnWays.add(a.id);
        const drawnNodes = new Set<string>(street.markings.map(m => m.nodeID));
        for (const text of roadMarkings.texts) drawnNodes.add(text.id);
        for (const id of drawnWays) {
            const way = graph.hasEntity(id as osmWay['id']) as osmWay | undefined;
            if (way?.type === 'way') way.nodes.forEach(n => drawnNodes.add(n));
        }
        const surface = context.surface();
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm.lines path.line')
            .classed('lanes-drawn', d => !!d && drawn.has(d.id))
            .classed('lanes-drawn-feature', d => !!d && drawnWays.has(d.id));
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm.areas path')
            .classed('lanes-drawn-feature', d => !!d && drawnWays.has(d.id));
        surface.selectAll<SVGGElement, OsmEntity>('.layer-osm .vertices g.vertex, .layer-osm .points g.point')
            .classed('lanes-drawn-feature', d => !!d && drawnNodes.has(d.id))
            // street-side parking mapped as a point on a road is already shown by the road's parking strip
            .classed('lanes-redundant', d => !!d && isStreetParking(d.tags) && graph.parentWays(d).some(isLaneRoad));
    }


    interface LaneTarget {
        key: string;
        /** read by iD's select and hover behaviours, so clicking a lane selects its road */
        properties: { entity: osmWay };
        wayID: osmWay['id'];
        ref: LaneRef;
        d: string;
    }

    interface DividerTarget extends Omit<LaneTarget, 'ref'> {
        /** boundary index left to right along the way: 0 is the left kerb */
        k: number;
        /** false for the kerbs and for lines between directions, which only the Width tool uses */
        clickable: boolean;
        direction: LaneDirection;
        /** the lane on the divider's left, as seen by that direction's drivers */
        leftIndex: number;
    }


    /** Applies the Paint tool's value to one lane, as one undo step */
    function paintLane(d: LaneTarget) {
        const paint = tools.paint();
        const way = context.entity(d.wayID) as osmWay;
        const key = paint.key === 'kind' ? null : paint.key;
        if (key && parseLanes(way.tags).keys[key]?.readonly) return;
        const change = (m: LaneModel) => key
            ? setLaneValue(m, d.ref, key, key === 'turn:lanes' ? formatTurn(parseTurn(paint.value)) : paint.value)
            : setLaneKind(m, [d.ref], paint.value);
        context.perform(actionChangeLanes(d.wayID, change), t(`_lanes.annotation.${key === 'turn:lanes' ? 'turn' : key ? 'value' : 'kind'}`));
    }


    /** Connect tool: the first click picks a lane, the second a lane on a road it leads to */
    function connectLane(d: LaneTarget) {
        const from = tools.connectFrom();
        if (!from) {
            tools.setConnectFrom({ wayID: d.wayID, ref: d.ref });
            return;
        }
        const graph = context.graph();
        const fromWay = graph.entity(from.wayID) as osmWay;
        const toWay = graph.entity(d.wayID) as osmWay;
        const result = connectionNode(fromWay, from.ref, toWay, d.ref);
        if ('problem' in result) {
            if (result.problem === 'same_road') {
                tools.setConnectFrom({ wayID: d.wayID, ref: d.ref });   // pick again
                return;
            }
            // uiFlash is plain JavaScript with getter/setter overloads
            const flash = context.ui().flash as any;
            flash.iconName('#iD-icon-no').label(t(`_lanes.connect.${result.problem}`))();
            tools.setConnectFrom(null);
            return;
        }
        context.perform(actionConnectLanes(fromWay.id, from.ref, result.nodeID, toWay.id, d.ref), t('_lanes.annotation.connect'));
        tools.setConnectFrom(null);
    }


    /** Marking tool: puts a crossing, stop sign, … on the road where it was clicked, then selects it */
    function placeMarking(event: MouseEvent, d: LaneTarget) {
        const type = tools.marking();
        if (type === 'none') return;
        const loc = context.projection.invert(context.map().mouse(event));
        const { action, nodeID } = actionAddMarking(d.wayID, loc, type, context.graph());
        context.perform(action, t('_lanes.annotation.marking'));
        context.enter(modeSelect(context, [nodeID]));
    }


    /**
     * Width tool: drags a lane line or kerb sideways. The lanes either side of a line trade width;
     * a kerb widens or narrows its outer lane. All lane widths are then written to `width:lanes`.
     */
    function dragWidth(event: PointerEvent, d: DividerTarget) {
        if (tools.tool() !== 'width') return;
        event.preventDefault();
        event.stopPropagation();   // keep iD from panning the map or changing the selection
        const node = event.currentTarget as SVGPathElement;
        node.setPointerCapture(event.pointerId);

        const graph = context.graph();
        const way = graph.entity(d.wayID) as osmWay;
        const layout = laneLayout(way, graph);
        if (layout.model.keys['width:lanes']?.readonly) return;
        const widths = layout.lanes.map(lane => lane.width);
        const total = layout.total;
        const n = widths.length;
        let started = false;

        const move = (e: PointerEvent) => {
            const loc = context.projection.invert(context.map().mouse(e));
            const at = offsetFromWay(way, graph, loc);
            const shift = layout.shiftStart + (layout.shiftEnd - layout.shiftStart) * (at.total ? at.along / at.total : 0);
            const p = at.offset - shift;
            const next = [...widths];
            if (d.k === 0) {
                next[0] = widths[0] + (-2 * p - total);           // the carriageway stays centred, so the kerb moves half as far
            } else if (d.k === n) {
                next[n - 1] = widths[n - 1] + (2 * p - total);
            } else {
                const delta = p - layout.edges[d.k];
                next[d.k - 1] = widths[d.k - 1] + delta;
                next[d.k] = widths[d.k] - delta;
            }
            if (next.some(w => w < 1)) return;
            const values = next.map(w => String(Math.round(w * 10) / 10));
            const action = actionChangeLanes(d.wayID, m => layout.lanes.reduce(
                (acc, lane, i) => setLaneValue(acc, lane.ref, 'width:lanes', values[i]), m));
            const annotation = t('_lanes.annotation.width');
            if (started) {
                context.replace(action, annotation);
            } else {
                context.perform(action, annotation);
                started = true;
            }
        };
        const end = () => {
            node.removeEventListener('pointermove', move);
            node.removeEventListener('pointerup', end);
            node.removeEventListener('pointercancel', end);
        };
        node.addEventListener('pointermove', move);
        node.addEventListener('pointerup', end);
        node.addEventListener('pointercancel', end);
    }


    function drawTargets(target: Selection, dividerTarget: Selection, pieces: RoadPiece[], editable: boolean, selected: Set<string>) {
        const graph = context.graph();
        const laneTargets: LaneTarget[] = !editable ? [] : pieces.flatMap(piece => {
            const entity = graph.hasEntity(piece.wayID) as osmWay | undefined;
            if (!entity) return [];
            return piece.layout.lanes.map((lane, i) => ({
                key: `${pieceKey(piece)}-${i}`,
                properties: { entity },
                wayID: piece.wayID,
                ref: lane.ref,
                d: path(piece.lanes[i], true)
            }));
        });

        const lanes = target.selectAll<SVGPathElement, LaneTarget>('path.lane-target')
            .data(laneTargets, d => d.key);
        lanes.exit().remove();
        lanes.enter().append('path')
            .attr('class', 'lane-target')
            .on('click.lanes', (event: MouseEvent, d: LaneTarget) => {
                if (tools.tool() === 'paint') {
                    paintLane(d);
                    return;
                }
                if (tools.tool() === 'marking') {
                    placeMarking(event, d);
                    return;
                }
                if (tools.tool() === 'connect') {
                    connectLane(d);
                    return;
                }
                const ids = context.selectedIDs();
                if (event.shiftKey) {
                    // iD's select behaviour toggles the road on shift-click; lanes add to the selection instead
                    if (ids.length !== 1 || ids[0] !== d.wayID) context.enter(modeSelect(context, [d.wayID]));
                    state.toggle(d.wayID, d.ref);
                } else if (ids.length === 1 && ids[0] === d.wayID) {
                    state.select(d.wayID, [d.ref]);
                }
            })
            .merge(lanes)
            .attr('d', d => d.d);

        const widthTool = tools.tool() === 'width';
        const dividerTargets: DividerTarget[] = !editable ? [] : pieces.filter(piece => selected.has(piece.wayID)).flatMap(piece => {
            const entity = graph.hasEntity(piece.wayID) as osmWay | undefined;
            const lanesHere = piece.layout.lanes;
            if (!entity) return [];
            const result: DividerTarget[] = [];
            for (let k = 0; k <= lanesHere.length; k++) {
                const left = lanesHere[k - 1]?.ref;
                const right = lanesHere[k]?.ref;
                const clickable = !!left && !!right && left.direction === right.direction && piece.layout.markings;
                if (!clickable && !widthTool) continue;
                const direction = (left ?? right)!.direction;
                result.push({
                    key: `${pieceKey(piece)}-${k}`,
                    properties: { entity },
                    wayID: piece.wayID,
                    k,
                    clickable,
                    direction,
                    // backward lanes run against the way, so their drivers' left is the way's right
                    leftIndex: left && right ? (direction === 'backward' ? right.index : left.index) : -1,
                    d: path(piece.boundaries[k], false)
                });
            }
            return result;
        });

        // dividers sit in a group above the lanes, so they win where they overlap
        const dividers = dividerTarget.selectAll<SVGPathElement, DividerTarget>('path.divider-target')
            .data(dividerTargets, d => d.key);
        dividers.exit().remove();
        dividers.enter().append('path')
            .on('pointerdown.lanes', dragWidth)
            .on('click.lanes', (_event: MouseEvent, d: DividerTarget) => {
                if (tools.tool() !== 'select' || !d.clickable) return;
                const way = context.entity(d.wayID) as osmWay;
                if (parseLanes(way.tags).keys['change:lanes']?.readonly) return;
                context.perform(
                    actionChangeLanes(d.wayID, m => setDivider(m, d.direction, d.leftIndex, nextDivider(dividerAt(m, d.direction, d.leftIndex)))),
                    t('_lanes.annotation.change')
                );
            })
            .merge(dividers)
            .attr('class', d => 'divider-target' + (d.clickable ? '' : ' width-only'))
            .attr('d', d => d.d);
    }


    /** A marker in the middle of each short road, clickable to select it */
    function drawShortTargets(target: Selection, shortPieces: RoadPiece[], selected: Set<string>) {
        const graph = context.graph();
        const data = shortPieces.flatMap(piece => {
            const entity = graph.hasEntity(piece.wayID) as osmWay | undefined;
            if (!entity) return [];
            const p = projection(piece.middle);
            return [{ key: pieceKey(piece), properties: { entity }, wayID: piece.wayID, p }];
        });
        const markers = target.selectAll<SVGCircleElement, typeof data[number]>('circle.short-way-marker')
            .data(data, d => d.key);
        markers.exit().remove();
        markers.enter().append('circle')
            .attr('r', 7)
            .merge(markers)
            .attr('class', d => 'short-way-marker' + (selected.has(d.wayID) ? ' selected' : ''))
            .attr('cx', d => d.p[0].toFixed(1))
            .attr('cy', d => d.p[1].toFixed(1));
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
    state.on('change.layer', draw);
    state.on('corridor.layer', draw);
    tools.on('change.layer', draw);

    drawLanes.enabled = function(val?: boolean) {
        if (!arguments.length) return _enabled;
        _enabled = !!val;
        draw();
        return drawLanes;
    };

    drawLanes.redraw = draw;

    return drawLanes;
}
