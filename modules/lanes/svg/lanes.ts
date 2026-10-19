import { select as d3_select } from 'd3-selection';

import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { osmWay } from '../../osm/way';
import { modeSelect } from '../../modes/select';
import { actionChangeLanes } from '../actions/change_lanes';
import { actionAddMarking } from '../actions/add_marking';
import { actionAddSign } from '../actions/add_sign';
import { laneState } from '../core/lane_state';
import { isLaneRoad, isUnderConstruction } from '../core/roads';
import { roadGeometry, type RoadPiece, type LaneMark } from '../geometry/road_geometry';
import type { LaneInfo, ParkingLayout } from '../geometry/layout';
import { t } from '../../core/localizer';
import {
    parseLanes, parseTurn, formatTurn, dividerAt, setDivider, nextDivider, setLaneValue, setLaneKind,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';
import { laneTools } from '../core/lane_tools';
import { laneLayout } from '../geometry/layout';
import { offsetFromWay } from '../geometry/measure';
import { svgLaneDefs, turnArrowSymbol } from './defs';
import { drawStreet, drawParking, drawRoadMarkings, joinPaths, withIdState } from './street';
import { actionConnectLanes, connectionNode } from '../actions/connect_lanes';
import { streetGeometry, isCarriagewayArea } from '../geometry/street';
import { parkingGeometry } from '../geometry/parking';
import { roadMarkingGeometry } from '../geometry/road_marking';
import { isStreetParking, surfaceGroup } from '../model/street_features';
import { metricFrame, pointAlong, pointInPolygon, polylineLength } from '../geometry/frame';
import { edgeStructures, isCovered, ringEdges, type StructureShape } from '../geometry/structures';
import { signGeometry } from '../geometry/signs';
import { drawSigns } from './signs';
import { junctionLabels, placeShields, shieldRefs } from '../geometry/route_labels';
import { drawJunctionLabels, drawShields } from './route_labels';
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

/** Pieces grouped by their road, with the shapes of each, for drawing a road as one path */
function byWay(pieces: RoadPiece[], shapes: (piece: RoadPiece) => Vec2[][]): { key: string; piece: RoadPiece; polygons: Vec2[][] }[] {
    const groups = new Map<string, { key: string; piece: RoadPiece; polygons: Vec2[][] }>();
    for (const piece of pieces) {
        const group = groups.get(piece.wayID) ?? { key: piece.wayID, piece, polygons: [] };
        group.polygons.push(...shapes(piece));
        groups.set(piece.wayID, group);
    }
    return [...groups.values()];
}

/** Bay lengths along the road for each way of parking, in metres */
const bayLength = { parallel: 6, diagonal: 3, perpendicular: 2.5 };

/**
 * The markings of a parking strip: the edge of the bays next to the traffic and a line between
 * each pair of bays, slanted for diagonal parking
 */
export function parkingBays(key: string, polygon: Vec2[], parking: ParkingLayout): { key: string; edge: Vec2[]; dividers: Vec2[][] } {
    const [inner, outer] = ringEdges(polygon);
    const frame = metricFrame(inner[0]);
    const a = inner.map(frame.toMetres);
    const b = outer.map(frame.toMetres);
    const lengthA = polylineLength(a);
    const lengthB = polylineLength(b);
    const dividers: Vec2[][] = [];
    const step = bayLength[parking.orientation];
    // diagonal bays lean back against the traffic beside them, at about 60°
    const width = a.length && b.length ? Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) : 0;
    const lean = parking.orientation === 'diagonal' ? width * 0.58 : 0;
    for (let s = step; s < lengthA - step / 2; s += step) {
        const t = lengthA ? (s + lean) / lengthA : 0;
        if (t > 1) break;
        dividers.push([pointAlong(a, s).point, pointAlong(b, t * lengthB).point].map(frame.toLoc));
    }
    return { key, edge: inner, dividers };
}


/** The line style between two neighbouring lanes, from `change:lanes` (left and right as seen along the way) */
function dividerClass(left: LaneInfo, right: LaneInfo, layoutMarkings: boolean): string {
    if (!layoutMarkings) return 'none';
    if (left.ref.direction !== right.ref.direction) return 'centre';
    // a variable-access lane (a running hard shoulder) is kept apart by a solid line
    if ((left.kind === 'variable') !== (right.kind === 'variable')) return 'solid';
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
    if (centre.length < 2) return false;
    // evenly along the road, so a long road that only passes through an area keeps its own surface
    const lengths = centre.slice(1).map((p, i) => Math.hypot(p[0] - centre[i][0], p[1] - centre[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    const samples: Vec2[] = [];
    for (let k = 0; k < 20; k++) {
        let d = total * (k + 0.5) / 20;
        let i = 0;
        while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++];
        const f = lengths[i] ? d / lengths[i] : 0;
        samples.push([centre[i][0] + (centre[i + 1][0] - centre[i][0]) * f, centre[i][1] + (centre[i + 1][1] - centre[i][1]) * f]);
    }
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
        hideIdLabels([]);
        markSurface(false);
    }

    /**
     * Hides iD's own labels that Lane Studio draws itself: a road numbered only by its ref (now in
     * shields) and a motorway junction's name (now beside its number). iD redraws its labels on every
     * map move, so they are hidden by a style sheet keyed on the entity ids in their classes.
     */
    function hideIdLabels(ids: string[]) {
        const container = context.container().node() as HTMLElement | null;
        if (!container) return;
        let style = container.querySelector<HTMLStyleElement>('style.lanes-hidden-labels');
        if (!style) {
            style = document.createElement('style');
            style.className = 'lanes-hidden-labels';
            container.appendChild(style);
        }
        const css = ids.length ? ids.map(id => `.ideditor.lane-studio .layer-osm.labels text.${id}`).join(',\n') + ' { display: none; }' : '';
        if (style.textContent !== css) style.textContent = css;
    }


    function groups() {
        _layer.selectAll('g.lanes-group')
            .data([
                'areas', 'roadside', 'parking-bays', 'parking', 'paths', 'carriageway', 'lanes', 'works', 'junctions', 'heads', 'node-surfaces', 'islands', 'dividers', 'kerbs',
                'kerb-lines', 'structures', 'barriers', 'crossings', 'markings', 'road-markings', 'arrows', 'connectivity', 'enforcement', 'labels', 'symbols', 'gantries', 'signs',
                'shields', 'junction-labels', 'short', 'selection', 'connect-from',
                'area-targets', 'targets', 'node-targets', 'short-targets', 'divider-targets'
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
        const carriagewayAreas = visible.filter(isCarriagewayArea) as osmWay[];
        const { visuals, pieces, innerPieces, junctions, connections, heads, areaRoads } = roadGeometry(ways, graph, carriagewayAreas);
        // short links inside a junction cluster are drawn only as lane guide lines (still clickable)
        const shown = pieces.filter(piece => !innerPieces.has(piece));
        const selected = new Set(context.selectedIDs());
        const corridor = context.mode()?.id === 'select' ? state.corridor() : new Set<string>();
        const group = groups();
        const markings = zoom >= laneZooms.markings;
        const labels = zoom >= laneZooms.labels;

        markSurface(true);

        /* footways, mapped areas and kerbs, road markings on nodes */
        const street = streetGeometry(visible, graph, visuals);
        // roads lying inside their own road mapped as an area: the area is their surface, so they draw
        // no carriageway, kerbs, roadside or general lane fill of their own (a road it only touches is left alone)
        const roadAreas = street.areas.filter(a => a.kind === 'carriageway');
        const inArea = new Set<RoadPiece>(roadAreas.length ? pieces.filter(piece =>
            insideAreas(piece, roadAreas.filter(area => areaRoads.get(area.id) === piece.wayID))) : []);
        const surfaceOf = (piece: RoadPiece) => surfaceGroup((graph.hasEntity(piece.wayID) as osmWay | undefined)?.tags.surface);
        const tagsOf = (id: string): Tags => (graph.hasEntity(id as osmWay['id']) as osmWay | undefined)?.tags ?? {};
        // roads and paths in a tunnel or under a roof are drawn faded
        const coveredTag = (id: string) => isCovered(tagsOf(id)) ? ' lanes-covered' : '';
        // roads being built are drawn as they will be, faded and striped, without markings
        const building = (piece: RoadPiece) => isUnderConstruction(tagsOf(piece.wayID));
        const marked = shown.filter(piece => !building(piece));
        const parking = parkingGeometry(visible, graph);
        const roadMarkings = markings ? roadMarkingGeometry(visible, graph) : { lines: [], areas: [], texts: [] };
        drawStreet(group, street, projection, zoom, laneZooms, areaRoads);
        drawParking(group('parking'), parking, projection, markings);
        drawRoadMarkings(group('road-markings'), roadMarkings, projection, labels);

        /* traffic signs, message signs, gantries, enforcement cameras */
        // (each sign carries its node for iD's select and hover behaviours)
        const signData = markings ? signGeometry(visible, graph) : { signs: [], gantries: [], sections: [] };
        const signs = signData.signs.map(sign => ({ ...sign, properties: { entity: graph.entity(sign.nodeID as NodeId) } }));
        drawSigns(group, { ...signData, signs }, projection, zoom);

        /* road numbers and motorway junctions */
        const junctionData = junctionLabels(visible, graph).map(label => ({ ...label, properties: { entity: graph.entity(label.nodeID as NodeId) } }));
        drawJunctionLabels(group('junction-labels'), junctionData, projection, zoom);
        const dimensions = map.dimensions();
        drawShields(group('shields'), placeShields(ways, graph, projection, { width: dimensions[0], height: dimensions[1] }), zoom);
        hideIdLabels([
            ...ways.filter(way => !way.tags.name && shieldRefs(way.tags).length).map(way => way.id),
            ...junctionData.map(label => label.nodeID)
        ]);


        /* roadside strips */
        // (short roads inside a merged junction keep their pavements)
        const strips = [
            ...pieces.filter(piece => !inArea.has(piece)).flatMap(piece => piece.roadside.map((strip, i) => ({ ...strip, key: `${pieceKey(piece)}-${i}`, wayID: piece.wayID }))),
            // pavements carried round turning heads
            ...heads.flatMap(head => head.pavements.map((polygon, i) => ({ key: `${head.nodeID}-pavement-${i}`, kind: 'sidewalk', assumed: false, polygon, wayID: '', parking: undefined as ParkingLayout | undefined })))
        ];
        const stripPaths = group('roadside').selectAll<SVGPathElement, typeof strips[number]>('path')
            .data(strips, d => d.key);
        stripPaths.exit().remove();
        stripPaths.enter().append('path')
            .merge(stripPaths)
            .attr('class', d => `roadside roadside-${d.kind}` + (d.assumed ? ' assumed' : '') + (d.wayID ? coveredTag(d.wayID) : '') +
                (d.parking ? ` parking-${d.parking.position}` : '') +
                (d.kind === 'shoulder' && state.shoulder()?.wayID === d.wayID && state.shoulder()?.side === (d as { side?: string }).side ? ' selected' : '') +
                (d.wayID && isUnderConstruction(tagsOf(d.wayID)) ? ' lanes-construction' : ''))
            .attr('d', d => path(d.polygon, true));

        // parking bays: a dashed line along the edge of the bays, and a line between each pair of bays
        const bayData = !markings ? [] : strips.flatMap(strip => {
            if (!strip.parking) return [];
            const bays = parkingBays(strip.key, strip.polygon, strip.parking);
            return [
                { key: `${strip.key}-edge`, cls: 'parking-edge', d: path(bays.edge, false) },
                { key: `${strip.key}-bays`, cls: 'parking-bay', d: bays.dividers.map(line => path(line, false)).join('') }
            ];
        });
        const bays = group('parking-bays').selectAll<SVGPathElement, typeof bayData[number]>('path')
            .data(bayData, d => d.key);
        bays.exit().remove();
        bays.enter().append('path')
            .merge(bays)
            .attr('class', d => d.cls)
            .attr('d', d => d.d);


        /* carriageways */
        // all pieces of a road in one path: separate shapes leave a faint seam where they meet
        // (round a roundabout, at every road that joins it)
        const carriagewayData = byWay(shown.filter(piece => !inArea.has(piece)), piece => [piece.carriageway]);
        const carriageways = group('carriageway').selectAll<SVGPathElement, typeof carriagewayData[number]>('path')
            .data(carriagewayData, d => d.key);
        carriageways.exit().remove();
        carriageways.enter().append('path')
            .merge(carriageways)
            // the way id as a class: iD's hover and select behaviours highlight everything with it
            .attr('class', function(d) {
                const piece = d.piece;
                return withIdState(this, `carriageway ${piece.wayID}` + coveredTag(piece.wayID) + (building(piece) ? ' lanes-construction' : '') +
                    (piece.layout.assumed ? ' assumed' : '') +
                    (surfaceOf(piece) ? ` surface-${surfaceOf(piece)}` : '') +
                    (selected.has(piece.wayID) ? ' selected' : '') +
                    (corridor.has(piece.wayID) && !selected.has(piece.wayID) ? ' corridor' : ''));
            })
            .attr('d', d => d.polygons.map(polygon => path(polygon, true)).join(''));


        /* junction areas (not inside a road mapped as an area, which is their surface) */
        const shownJunctions = roadAreas.length ? junctions.filter(j => {
            const node = graph.hasEntity(j.nodeID as NodeId) as osmNode | undefined;
            return !node || !roadAreas.some(a => pointInPolygon(node.loc, a.polygon));
        }) : junctions;
        const areas = group('junctions').selectAll<SVGPathElement, typeof junctions[number]>('path')
            .data(shownJunctions, d => d.nodeID);
        areas.exit().remove();
        areas.enter().append('path')
            .merge(areas)
            .attr('class', d => 'junction-area' + (d.kind === 'flare' ? ' junction-flare' : ''))
            .attr('d', d => d.polygons.map(polygon => path(polygon, true)).join(''));


        /* turning circles, loops and hammerheads: road surface carried on from the road's end */
        const headShapes = heads.flatMap(head => [
            { key: head.nodeID, cls: `turning-head ${head.nodeID}`, d: head.polygons.map(ring => path(ring, true)).join('') },
            ...(head.island ? [{ key: `${head.nodeID}-island`, cls: 'marking marking-turning_loop_island', d: path(head.island, true) }] : [])
        ]);
        joinPaths(group('heads'), headShapes, d => d.key, d => d.cls, d => d.d);


        /* lane ribbons */
        // (each lane of a road in one path, as for carriageways)
        const laneClass = (piece: RoadPiece, lane: LaneInfo) => {
            const surface = surfaceGroup(lane.values['surface:lanes']) ?? surfaceOf(piece);
            return `lane lane-${lane.kind} lane-${lane.ref.direction}` + (surface ? ` surface-${surface}` : '') + coveredTag(piece.wayID) +
                (building(piece) ? ' lanes-construction' : '');
        };
        const laneShapes = new Map<string, { key: string; cls: string; polygons: Vec2[][] }>();
        for (const piece of shown) {
            piece.layout.lanes.forEach((lane, i) => {
                if (inArea.has(piece) && lane.kind === 'general') return;
                const cls = laneClass(piece, lane);
                const key = `${piece.wayID}-${i}-${cls}`;
                const shape = laneShapes.get(key) ?? { key, cls, polygons: [] };
                shape.polygons.push(piece.lanes[i]);
                laneShapes.set(key, shape);
            });
        }
        const ribbons = group('lanes').selectAll<SVGPathElement, { key: string; cls: string; polygons: Vec2[][] }>('path')
            .data([...laneShapes.values()], d => d.key);
        ribbons.exit().remove();
        ribbons.enter().append('path')
            .merge(ribbons)
            .attr('class', d => d.cls)
            .attr('d', d => d.polygons.map(polygon => path(polygon, true)).join(''));


        /* roads and paths being built: work stripes over them */
        const works = [
            ...shown.filter(building).map(piece => ({ key: pieceKey(piece), d: path(piece.carriageway, true) })),
            ...street.paths.filter(p => p.construction).map(p => ({ key: p.id, d: path(p.polygon, true) }))
        ];
        joinPaths(group('works'), works, d => d.key, () => 'works', d => d.d);


        /* dividers between lanes, from change:lanes */
        const dividerData = !markings ? [] : marked.flatMap(piece => {
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
        // (the short roads inside a merged junction keep their kerbs where no side road joins)
        const kerbData = [
            ...pieces.filter(piece => !inArea.has(piece)).flatMap(piece => (['left', 'right'] as const).flatMap(side => {
                const key = `${pieceKey(piece)}-${side === 'left' ? 'l' : 'r'}`;
                const edge = piece.lines[side === 'left' ? 0 : piece.lines.length - 1];
                const strips = piece.roadside.filter(strip => strip.side === side);
                // a hard shoulder and parking on the road are inside the kerb: it runs beyond the last of them
                // (with a cycle lane in between), and a hard shoulder gets a solid white line at the lanes' edge
                const onRoad = (strip: typeof strips[number]) => strip.kind === 'shoulder' || strip.kind === 'cycle_lane' ||
                    (strip.kind === 'parking' && strip.parking?.position !== 'on_kerb');
                let inside = 0;
                while (inside < strips.length && onRoad(strips[inside])) inside++;
                const moved = strips.slice(0, inside).some(strip => strip.kind !== 'cycle_lane');
                const kerb = moved ? ringEdges(strips[inside - 1].polygon)[1] : edge;
                return [
                    { key, line: kerb, assumed: piece.layout.assumed, construction: building(piece), shoulder: false },
                    ...(strips[0]?.kind === 'shoulder' ? [{ key: `${key}-edge`, line: edge, assumed: false, construction: false, shoulder: true }] : [])
                ];
            })),
            // junction corners between neighbouring roads
            ...shownJunctions.flatMap(j => j.kerbs.map((kerb, i) => ({ key: `${j.nodeID}-kerb-${i}`, line: kerb.line, assumed: kerb.assumed }))),
            // round turning heads, from one kerb of the road to the other
            ...heads.flatMap(h => h.kerbs.map((kerb, i) => ({ key: `${h.nodeID}-head-kerb-${i}`, line: kerb.line, assumed: kerb.assumed })))
        ];
        const kerbs = group('kerbs').selectAll<SVGPathElement, typeof kerbData[number]>('path')
            .data(kerbData, d => d.key);
        kerbs.exit().remove();
        kerbs.enter().append('path')
            .merge(kerbs)
            .attr('class', d => ('shoulder' in d && d.shoulder ? 'shoulder-edge' : 'kerb') + (d.assumed ? ' assumed' : '') +
                ('construction' in d && d.construction ? ' construction' : ''))
            .attr('d', d => path(d.line, false));


        /* structures: bridge parapets, tunnel walls, cutting and embankment slopes, fords */
        const structures: StructureShape[] = [
            ...shown.filter(piece => !inArea.has(piece)).flatMap(piece => {
                const tags = tagsOf(piece.wayID);
                const outer = (side: 'left' | 'right') => {
                    const strips = piece.roadside.filter(strip => strip.side === side);
                    return strips.length ? ringEdges(strips[strips.length - 1].polygon)[1] : piece.boundaries[side === 'left' ? 0 : piece.boundaries.length - 1];
                };
                return edgeStructures(pieceKey(piece), piece.wayID, tags, outer('left'), outer('right'), piece.carriageway);
            }),
            ...street.paths.filter(p => p.kind !== 'crossing').flatMap(p => {
                const [left, right] = ringEdges(p.polygon);
                return edgeStructures(p.id, p.id, tagsOf(p.id), left, right, p.polygon);
            })
        ];
        joinPaths(group('structures'), structures, d => d.key,
            d => `structure structure-${d.kind}` + (d.variant ? ` ${d.variant}` : ''), d => path(d.points, d.closed));
        group('paths').selectAll<SVGPathElement, { key: string }>('path.street-path')
            .classed('lanes-covered', d => !!d && isCovered(tagsOf(d.key)));


        /* turn arrows */
        const screenMark = (mark: LaneMark) => {
            const p = projection(mark.loc);
            const q = projection(mark.ahead);
            const pxPerMetre = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const angle = Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI;
            return { p, pxPerMetre, angle };
        };
        const arrowData = !markings ? [] : marked.flatMap(piece => piece.arrows.flatMap((mark, m) => {
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
        // one-way roads: small direction arrows, about 2 m long (turn arrows are up to 5 m)
        const travelData = !markings ? [] : marked.flatMap(piece => piece.travel.map((mark, m) => {
            const lane = piece.layout.lanes[mark.lane];
            const { p, pxPerMetre, angle } = screenMark(mark);
            const k = Math.min(lane.width * 0.55, 2) * pxPerMetre / 20;
            return {
                key: `${pieceKey(piece)}-t${m}`,
                href: '#lanes-arrow-travel',
                transform: `translate(${p[0].toFixed(1)},${p[1].toFixed(1)}) rotate(${(angle + 90).toFixed(1)}) scale(${k.toFixed(3)})`
            };
        }));
        arrowData.push(...travelData);
        const arrows = group('arrows').selectAll<SVGUseElement, typeof arrowData[number]>('use')
            .data(arrowData, d => d.key);
        arrows.exit().remove();
        arrows.enter().append('use')
            .merge(arrows)
            .attr('class', d => (d.href === '#lanes-arrow-travel' ? 'travel-arrow' : 'turn-arrow'))
            .attr('href', d => d.href)
            .attr('transform', d => d.transform);


        /* labels: destination and speed */
        const labelData = !labels ? [] : shown.flatMap(piece => piece.labels.map(mark => {
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
        // a short road inside a merged junction: its lane edges carry on through the box as guide lines
        const innerGuides = [...innerPieces].flatMap(piece => piece.boundaries.slice(1, -1).map((line, i) => ({
            key: `${pieceKey(piece)}-inner-${i}`, nodeID: piece.fromNode, kind: 'guide' as const, optional: false, line
        })));
        // and where a road's lane lines stop at a junction box, they carry on through it as guide lines
        const lengthOf = (line: Vec2[]) => line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);
        // (not into a turning head: there the lane lines simply end)
        const headNodes = new Set(heads.map(h => h.nodeID));
        const guidedPieces = shown.filter(piece => !headNodes.has(piece.fromNode) && !headNodes.has(piece.toNode));
        const stoppedGuides = guidedPieces.flatMap(piece => piece.boundaries.slice(1, -1).flatMap((line, i) => {
            const painted = piece.lines[i + 1];
            if (painted.length && lengthOf(painted) > lengthOf(line) * 0.98) return [];
            return [{ key: `${pieceKey(piece)}-through-${i}`, nodeID: piece.fromNode, kind: 'guide' as const, optional: false, line }];
        }));
        // lanes connected by a connectivity relation are guided through the junction like any others; the
        // blue editing line over them shows only while connecting lanes or with one of their roads selected
        const editing = tools.tool() === 'connect';
        const connectionLines = connections.flatMap(c => {
            if (c.kind !== 'relation') return [c];
            const guide = { ...c, key: `${c.key}-guide`, kind: 'guide' as const };
            const shown = editing || (c.ways ?? []).some(id => selected.has(id as osmWay['id']));
            return shown ? [guide, c] : [guide];
        });
        joinPaths(group('connectivity'), markings ? [...connectionLines, ...innerGuides, ...stoppedGuides] : [], d => d.key,
            d => (d.kind === 'relation' ? 'connectivity-curve' : 'junction-guide') + (d.optional ? ' optional' : ''),
            d => path(d.line, false));


        /* very short roads (slivers between junctions): an outline and a marker so they can be seen and clicked */
        // (not the links inside a merged junction: they are drawn as guide lines, and stay clickable)
        const shortData = !markings ? [] : pieces.filter(piece => piece.short && !innerPieces.has(piece));
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


        /* click targets: lanes and shoulders wherever lanes are drawn, dividers of the selected road from the editing zoom */
        drawTargets(group('targets'), group('divider-targets'), pieces, markings, selected);
        // mini-roundabouts and turning heads select their node
        drawEntityTargets(group('node-targets'), [
            ...street.surfaces.map(surface => ({ key: surface.key, entityID: surface.nodeID, d: path(surface.points, true) })),
            ...heads.map(head => ({ key: head.nodeID, entityID: head.nodeID, d: head.polygons.map(ring => path(ring, true)).join('') }))
        ]);
        // a road's carriageway area selects the road (under the lanes, so roads crossing it stay clickable)
        drawEntityTargets(group('area-targets'), roadAreas.filter(area => areaRoads.has(area.id))
            .map(area => ({ key: area.id, entityID: areaRoads.get(area.id)!, d: path(area.polygon, true) })));


        /* mark iD's own drawing of what is drawn here: road lines are thinned, and the
           "hide iD's lines and points" setting hides all of it (their touch targets stay clickable) */
        const drawn = new Set<string>(pieces.map(piece => piece.wayID));
        const drawnWays = new Set<string>(drawn);
        for (const p of street.paths) drawnWays.add(p.id);
        for (const a of street.areas) drawnWays.add(a.id);
        for (const k of street.kerbs) drawnWays.add(k.id);
        for (const b of street.barriers) drawnWays.add(b.id);
        for (const p of parking) drawnWays.add(p.id);
        for (const l of roadMarkings.lines) drawnWays.add(l.id);
        for (const a of roadMarkings.areas) drawnWays.add(a.id);
        const drawnNodes = new Set<string>([...street.markings, ...street.surfaces, ...signData.signs, ...junctionData].map(m => m.nodeID));
        for (const gantry of signData.gantries) drawnWays.add(gantry.id);
        for (const text of roadMarkings.texts) drawnNodes.add(text.id);
        for (const id of drawnWays) {
            const way = graph.hasEntity(id as osmWay['id']) as osmWay | undefined;
            if (way?.type === 'way') way.nodes.forEach(n => drawnNodes.add(n));
        }
        const surface = context.surface();
        // (iD draws lines below ground, like tunnels and cuttings, in its `covered` group rather than `lines`)
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm path.line')
            .classed('lanes-drawn', d => !!d && drawn.has(d.id))
            .classed('lanes-drawn-feature', d => !!d && drawnWays.has(d.id));
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm.areas path')
            .classed('lanes-drawn-feature', d => !!d && drawnWays.has(d.id));
        surface.selectAll<SVGGElement, OsmEntity>('.layer-osm .vertices g.vertex, .layer-osm .points g.point')
            .classed('lanes-drawn-feature', d => !!d && drawnNodes.has(d.id))
            // street-side parking mapped as a point on a road is already shown by the road's parking strip
            .classed('lanes-redundant', d => !!d && isStreetParking(d.tags) && graph.parentWays(d).some(isLaneRoad));
        // iD's one-way markers on the way line are replaced by arrows on the lanes themselves
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm .onewaygroup path')
            .classed('lanes-drawn-oneway', d => !!d && drawn.has(d.id));
        // and iD's cutting and embankment triangles by the slopes drawn beside them
        surface.selectAll<SVGPathElement, { id: string }>('.layer-osm .sidedgroup path')
            .classed('lanes-drawn-oneway', d => !!d && drawnWays.has(d.id));
    }


    interface ShoulderTarget {
        key: string;
        /** read by iD's select and hover behaviours, so clicking a shoulder selects its road */
        properties: { entity: osmWay };
        wayID: osmWay['id'];
        side: 'left' | 'right';
        d: string;
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


    /** Sign tool: puts a sign or camera beside the road, facing the traffic of the clicked lane, then selects it */
    function placeSign(event: MouseEvent, d: LaneTarget) {
        const loc = context.projection.invert(context.map().mouse(event));
        const travel = d.ref.direction === 'backward' ? 'backward' : 'forward';
        const { action, nodeID } = actionAddSign(d.wayID, loc, travel, tools.sign(), context.graph());
        context.perform(action, t('_lanes.annotation.sign'));
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
        const laneTargets: LaneTarget[] = pieces.flatMap(piece => {
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
                if (tools.tool() === 'sign') {
                    placeSign(event, d);
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

        // hard shoulders: a click selects the road and opens the shoulder in the sidebar
        const shoulderTargets: ShoulderTarget[] = pieces.flatMap(piece => {
            const entity = graph.hasEntity(piece.wayID) as osmWay | undefined;
            if (!entity) return [];
            return piece.roadside.filter(strip => strip.kind === 'shoulder').map(strip => ({
                key: `${pieceKey(piece)}-shoulder-${strip.side}`,
                properties: { entity },
                wayID: piece.wayID,
                side: strip.side,
                d: path(strip.polygon, true)
            }));
        });
        const shoulders = target.selectAll<SVGPathElement, ShoulderTarget>('path.shoulder-target')
            .data(shoulderTargets, d => d.key);
        shoulders.exit().remove();
        shoulders.enter().append('path')
            .attr('class', 'shoulder-target')
            .on('click.lanes', (_event: MouseEvent, d: ShoulderTarget) => {
                if (tools.tool() !== 'select') return;
                const ids = context.selectedIDs();
                if (ids.length !== 1 || ids[0] !== d.wayID) context.enter(modeSelect(context, [d.wayID]));
                state.selectShoulder(d.wayID, d.side);
            })
            .merge(shoulders)
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


    /**
     * Click targets that select a feature: mini-roundabout and turning head surfaces select their node,
     * a road's carriageway area its road (iD's select and hover behaviours read `properties.entity`)
     */
    function drawEntityTargets(target: Selection, shapes: { key: string; entityID: string; d: string }[]) {
        const graph = context.graph();
        const data = shapes.flatMap(shape => {
            const entity = graph.hasEntity(shape.entityID as NodeId);
            return entity ? [{ key: shape.key, properties: { entity }, d: shape.d }] : [];
        });
        const targets = target.selectAll<SVGPathElement, typeof data[number]>('path.entity-target')
            .data(data, d => d.key);
        targets.exit().remove();
        targets.enter().append('path')
            .attr('class', 'entity-target')
            .merge(targets)
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
