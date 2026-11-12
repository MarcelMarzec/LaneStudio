import fs from 'node:fs';
import { isLaneRoad } from '../../../../modules/lanes/core/roads';
import { metricFrame, polylineLength } from '../../../../modules/lanes/geometry/frame';
import { edgesAt, isLanePartArea, roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { roadMarkingGeometry } from '../../../../modules/lanes/geometry/road_marking';
import { vehicleRoutes } from '../../../../modules/lanes/geometry/routing';
import { isCarriagewayArea } from '../../../../modules/lanes/geometry/street';
import { isTrafficIsland } from '../../../../modules/lanes/model/street_features';

type Fixture = {
    nodes: Record<string, { loc: [number, number]; tags: Tags }>;
    ways: Record<string, { nodes: string[]; tags: Tags }>;
    relations: Record<string, { tags: Tags; members: { id: string; type: string; role: string }[] }>;
};

/**
 * Holdingham Roundabout, Sleaford (A15/A17/B1518): a large clockwise ring of six ways with hatching mapped round its
 * middle, chevrons round the splitter islands mapped as multipolygons (the islands their holes), and a hatched area
 * between Lincoln Road's two carriageways, gathered as the lanes layer gathers them
 */
function holdingham() {
    const data = JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/holdingham_roundabout.json', 'utf8')) as Fixture;
    const entities: any[] = [
        ...Object.entries(data.nodes).map(([id, n]) => new iD.osmNode({ id: id as `n${number}`, loc: n.loc, tags: n.tags })),
        ...Object.entries(data.ways).map(([id, w]) => new iD.osmWay({ id: id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags })),
        ...Object.entries(data.relations).map(([id, r]) => new iD.osmRelation({ id: id as `r${number}`, tags: r.tags, members: r.members as never }))
    ];
    const graph = new iD.coreGraph(entities) as any;
    const all = entities.map(e => graph.entity(e.id));
    const ways = all.filter(isLaneRoad);
    const partAreas = all.filter((e: any) => isLanePartArea(e.tags) && (e.type === 'way' ? e.isClosed() : e.tags.type === 'multipolygon'));
    const islands = all.filter((e: any) => e.type === 'way' && e.isClosed() && isTrafficIsland(e.tags));
    const geometry = roadGeometry(ways, graph, all.filter(isCarriagewayArea), islands, partAreas);
    /** A road's drawn edges at its start and end */
    const ends = (id: string) => {
        const way = graph.entity(id);
        const frame = metricFrame(graph.entity(way.first()).loc);
        const total = polylineLength(way.nodes.map((n: string) => frame.toMetres(graph.entity(n).loc)));
        const layout = geometry.pieces.find(p => p.wayID === id)!.layout;
        const visual = geometry.visuals.get(id) ?? { start: 0, end: 0, taperStart: [], taperEnd: [] };
        return { start: edgesAt(layout, visual, 0, total), end: edgesAt(layout, visual, total, total), layout, total };
    };
    return { graph, all, ways, partAreas, geometry, ends };
}

const ring = ['w1226788820', 'w1226788821', 'w1226788822', 'w1226788825', 'w1226788826', 'w1226788827'];

describe('Holdingham Roundabout: lanes beside painted areas', () => {
    it('keeps the ring on its line beside the hatching round its middle and the chevrons outside it', () => {
        const { geometry } = holdingham();
        for (const id of ring) {
            // (a hatched area between its lanes would still part them; none is mapped here)
            expect(geometry.visuals.get(id)?.parts ?? []).toHaveLength(0);
        }
    });

    it('lines each ring way up with the next where they meet, with no step in its kerbs', () => {
        const { ends } = holdingham();
        for (let i = 0; i < ring.length; i++) {
            const a = ends(ring[i]);
            const b = ends(ring[(i + 1) % ring.length]);
            // the left (outer) kerb carries on; lanes are added or dropped on the inside
            expect(Math.abs(a.end[0] - b.start[0])).toBeLessThan(0.05);
        }
    });

    it('leaves the roads joining the ring unmoved by the hatching across the ring from them', () => {
        const { geometry } = holdingham();
        // the A15 and A17 entries ran into the hatching round the ring's middle in their last few metres
        for (const id of ['w4543597', 'w77342869', 'w23423616', 'w77020344']) {
            const way = geometry.pieces.find(p => p.wayID === id)!;
            for (const part of geometry.visuals.get(id)?.parts ?? []) {
                const last = part.moves[part.moves.length - 1];
                expect(last[0] < way.length - 1 || Math.abs(last[1]) < 0.01).toBe(true);
            }
        }
    });

    it('parts lanes round chevrons mapped as a multipolygon, easing to nothing at the junctions either end', () => {
        const { geometry, ends } = holdingham();
        // the A15 entry beside the chevrons round the splitter island (r20109532) moves away from them
        const parts = geometry.visuals.get('w4543597')?.parts ?? [];
        expect(parts.length).toBeGreaterThan(0);
        expect(Math.max(...parts.flatMap(p => p.moves.map(m => m[1])))).toBeGreaterThan(1);
        // yet meets the Sleaford Bypass where it splits, and the ring, on its own line
        const entry = ends('w4543597');
        entry.start.forEach((e, k) => expect(e).toBeCloseTo(entry.layout.edges[k], 1));
        entry.end.forEach((e, k) => expect(e).toBeCloseTo(entry.layout.edges[k], 1));
    });

    it('moves the lanes once where two painted areas overlap (an outline tagged as well as its multipolygon)', () => {
        const { geometry, ends } = holdingham();
        // w1468088167 is tagged as hatching and is also the outer ring of the chevrons r20109535: Lincoln Road's
        // single lane sees the same area twice, and moves as it would for one
        const parts = geometry.visuals.get('w167096364')?.parts ?? [];
        expect(parts).toHaveLength(2);
        const { layout, total } = ends('w167096364');
        const visual = geometry.visuals.get('w167096364')!;
        const once = { ...visual, parts: [parts[0]] };
        for (let s = 0; s <= total; s += 5) {
            const both = edgesAt(layout, visual, s, total);
            edgesAt(layout, once, s, total).forEach((e, k) => expect(both[k]).toBeCloseTo(e, 3));
        }
    });

    it('draws chevrons mapped as a multipolygon, with the traffic island as a hole', () => {
        const { all, graph } = holdingham();
        const markings = roadMarkingGeometry(all, graph);
        const area = markings.areas.find(a => a.id === 'r20109532');
        expect(area).toBeDefined();
        expect(area!.rings).toHaveLength(1);
        expect(area!.stripes?.length).toBeGreaterThan(5);
    });
});


describe('Holdingham Roundabout: routes from each entry lane', () => {
    /** The exits a lane leaves the ring by, as `exit number:way` */
    const exitsFrom = (graph: any, wayID: string, lane: number) => {
        const way = graph.entity(wayID);
        const routes = vehicleRoutes(graph, wayID as `w${number}`, { direction: 'forward', index: lane }, 0, way.nodes.length - 1).routes;
        return [...new Set(routes.map(route => route.moves.find(m => m.ring === 'exit')).filter(Boolean).map(m => `${m!.exit}:${m!.toWayID}`))].sort();
    };
    // the exits, clockwise from each entry, by their roads
    const lincolnNorth = 'w149949452', a17 = 'w4277109', b1518 = 'w167096364', a15South = 'w213561588', newark = 'w213561589';

    it.each([
        // entry, lane: the exits its `destination:lanes` name (the left lane takes the first exit; the exits between are
        // shared in order across the lanes marked straight on; the offside lane takes the last before going back)
        ['Newark Road (A17)', 'w23423616', [[`1:${lincolnNorth}`, `2:${a17}`], [`2:${a17}`, `3:${b1518}`], [`3:${b1518}`, `4:${a15South}`]]],
        ['Sleaford Bypass (A15)', 'w4543597', [[`1:${newark}`], [`2:${lincolnNorth}`], [`3:${a17}`, `4:${b1518}`]]],
        ['Sleaford Bypass (A17)', 'w77342869', [[`1:${b1518}`], [`2:${a15South}`], [`3:${newark}`, `4:${lincolnNorth}`]]],
        ['Lincoln Road (B1518)', 'w77020344', [[`1:${a15South}`], [`2:${newark}`], [`3:${lincolnNorth}`, `4:${a17}`]]],
        ['Lincoln Road (A15)', 'w213561590', [[`1:${a17}`], [`2:${b1518}`], [`3:${a15South}`, `4:${newark}`]]]
    ] as [string, string, string[][]][])('%s: each lane round to the exits it is signed for', (_, wayID, lanes) => {
        const { graph } = holdingham();
        lanes.forEach((expected, lane) => expect(exitsFrom(graph, wayID, lane), `lane ${lane}`).toEqual([...expected].sort()));
    });

    it('goes on round from the ring\'s inner lanes, and leaves from its outer lane, by the ring\'s own arrows', () => {
        // w1226788825 (through|right|right) ends where Lincoln Road (A15) leaves, almost straight ahead, the ring
        // bending only slightly right: its arrows name the way out and the way on round in order, not by their angles
        const { graph } = holdingham();
        const way = graph.entity('w1226788825');
        const firstMoves = (lane: number) => [...new Set(vehicleRoutes(graph, 'w1226788825', { direction: 'forward', index: lane }, 0, way.nodes.length - 1)
            .routes.map(route => route.moves[0].toWayID))].sort();
        expect(firstMoves(0)).toEqual(['w149949452']);
        expect(firstMoves(1)).toEqual(['w1226788826']);
        expect(firstMoves(2)).toEqual(['w1226788826']);
    });

    it('shows no route that only goes round the ring until it runs out of length', () => {
        const { graph } = holdingham();
        for (const wayID of ['w23423616', 'w4543597', 'w77342869', 'w77020344', 'w213561590']) {
            const way = graph.entity(wayID);
            for (let lane = 0; lane < 3; lane++) {
                for (const route of vehicleRoutes(graph, wayID as `w${number}`, { direction: 'forward', index: lane }, 0, way.nodes.length - 1).routes) {
                    expect(route.moves.some(m => m.ring === 'exit'), `${wayID} lane ${lane}`).toBe(true);
                }
            }
        }
    });
});
