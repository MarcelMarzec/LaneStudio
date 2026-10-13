import { metricFrame, polylineLength } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { edgeStructures, slopeSides, isCovered, ringEdges } from '../../../../modules/lanes/geometry/structures';
import { asBuilt, builtHighway, isLaneRoad, isUnderConstruction } from '../../../../modules/lanes/core/roads';

// near Skegness (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);
const metres = (line: [number, number][]) => line.map(frame.toMetres);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
function graphOf(entities: Entity[]) {
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities);
}
const waysOf = (graph: ReturnType<typeof graphOf>) => Object.values(graph.base().entities).filter(e => e?.type === 'way') as Parameters<typeof roadGeometry>[0];

/** Whether any two non-neighbouring edges of a ring cross */
function selfIntersects(ring: [number, number][]): boolean {
    const n = ring.length;
    const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            const [a, b, c, d] = [ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]];
            if (cross(a, b, c) * cross(a, b, d) < -1e-9 && cross(c, d, a) * cross(c, d, b) < -1e-9) return true;
        }
    }
    return false;
}


describe('junction boxes from testing screenshots', () => {
    it('keeps the box whole where a dual carriageway carries straight on into a two-way road', () => {
        // the southbound carriageway runs straight into the single road; the northbound one leaves at an angle
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(-60, -60) }),
            new iD.osmNode({ id: 'n3', loc: at(-2, 12) }), new iD.osmNode({ id: 'n4', loc: at(30, 90) }),
            new iD.osmNode({ id: 'n5', loc: at(70, 70) }),
            new iD.osmWay({ id: 'w1', nodes: ['n2', 'n1'], tags: { highway: 'residential', lanes: '2', name: 'Drive' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n1', 'n3', 'n4'], tags: { highway: 'residential', oneway: 'yes', lanes: '1', name: 'Drive' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n5', 'n1'], tags: { highway: 'residential', oneway: 'yes', lanes: '1', name: 'Drive' } })
        ]);
        const { junctions } = roadGeometry(waysOf(graph), graph);
        expect(junctions).toHaveLength(1);
        expect(junctions[0].kind).toBe('junction');
        const ring = metres(junctions[0].polygons[0]);
        expect(selfIntersects(ring)).toBe(false);
        // no corner of the box is pinched onto the node
        const nearNode = ring.filter(p => Math.hypot(p[0], p[1]) < 0.5);
        expect(nearNode).toHaveLength(0);
    });

    it('runs the box back along the main road to a side road joining at a shallow angle, and stops the kerb there', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-120, 15) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(120, -15) }), new iD.osmNode({ id: 'n4', loc: at(-120, -25) }),
            new iD.osmNode({ id: 'n5', loc: at(-50, -12) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', lanes: '2', name: 'Main Road' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n4', 'n5', 'n2'], tags: { highway: 'secondary', lanes: '2', name: 'Side Road' } })
        ]);
        const { junctions, pieces } = roadGeometry(waysOf(graph), graph);
        const side = pieces.find(p => p.wayID === 'w2')!;
        // the side road's end corners
        const corners = [side.boundaries[0], side.boundaries[side.boundaries.length - 1]].map(b => frame.toMetres(b[b.length - 1]));
        const westmost = Math.min(...corners.map(p => p[0]));
        // the box reaches as far west as the side road's end
        const box = metres(junctions[0].polygons[0]);
        expect(Math.min(...box.map(p => p[0]))).toBeLessThan(westmost + 0.5);
        expect(selfIntersects(box)).toBe(false);
        // the main road's near (south, right-hand) kerb stops there; its far kerb runs on
        const west = pieces.find(p => p.wayID === 'w1' && p.toNode === 'n2')!;
        const length = (line: [number, number][]) => polylineLength(metres(line));
        const near = west.lines[west.lines.length - 1];
        expect(frame.toMetres(near[near.length - 1])[0]).toBeLessThan(westmost + 1);
        expect(length(west.lines[0])).toBeCloseTo(length(west.boundaries[0]), 0);
    });

    it('draws the mouths of a roundabout as flares, outside the ring, for entries meeting it almost tangentially', () => {
        const R = 35;
        const count = 24;
        const entities: Entity[] = [];
        const ids: `n${number}`[] = [];
        for (let i = 0; i < count; i++) {
            const a = -i / count * 2 * Math.PI;
            const id = `n${100 + i}` as const;
            ids.push(id);
            entities.push(new iD.osmNode({ id, loc: at(R * Math.cos(a), R * Math.sin(a)) }));
        }
        const ringNode = (i: number) => ids[(i + count) % count];
        entities.push(
            new iD.osmWay({ id: 'w1', nodes: [...ids, ids[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: '2', oneway: 'yes' } }),
            // an entry sliding onto the ring nearly along it at 45°, and an exit leaving the same way at -45°
            new iD.osmNode({ id: 'n1', loc: at(0, 110) }), new iD.osmNode({ id: 'n2', loc: at(11.5, 46) }),
            new iD.osmWay({ id: 'w2', nodes: ['n1', 'n2', ringNode(-3)], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } }),
            new iD.osmNode({ id: 'n3', loc: at(11.5, -46) }), new iD.osmNode({ id: 'n4', loc: at(0, -110) }),
            new iD.osmWay({ id: 'w3', nodes: [ringNode(3), 'n3', 'n4'], tags: { highway: 'primary', oneway: 'yes', lanes: '1' } })
        );
        const graph = graphOf(entities);
        const { junctions, pieces } = roadGeometry(waysOf(graph), graph);
        expect(junctions.length).toBeGreaterThan(0);
        // the ring's outer edge: half its width outside its centre line
        const ringPiece = pieces.find(p => p.wayID === 'w1')!;
        const half = Math.abs(frame.toMetres(ringPiece.boundaries[0][0])[0] - frame.toMetres(ringPiece.boundaries[ringPiece.boundaries.length - 1][0])[0]) / 2;
        for (const junction of junctions) {
            expect(junction.kind).toBe('flare');
            for (const p of junction.polygons.flat().map(frame.toMetres)) expect(Math.hypot(p[0], p[1])).toBeGreaterThan(R + half - 0.6);
        }
    });
});


describe('structures', () => {
    const edge = (y: number): [number, number][] => [at(-20, y), at(20, y)];
    const surface = [...edge(3), ...edge(-3).reverse()];

    it('reads which sides a cutting or embankment covers', () => {
        expect(slopeSides('yes')).toEqual({ left: true, right: true });
        expect(slopeSides('both')).toEqual({ left: true, right: true });
        expect(slopeSides('left')).toEqual({ left: true, right: false });
        expect(slopeSides('right')).toEqual({ left: false, right: true });
        expect(slopeSides('no')).toBeNull();
        expect(slopeSides(undefined)).toBeNull();
    });

    it('draws parapets for a bridge, walls for a tunnel and water for a ford, and fades covered ways', () => {
        const kinds = (tags: Tags) => edgeStructures('k', 'w1', tags, edge(3), edge(-3), surface).map(s => s.kind);
        expect(kinds({ bridge: 'yes' })).toEqual(['parapet', 'parapet']);
        expect(kinds({ bridge: 'viaduct' })).toEqual(['parapet', 'parapet']);
        expect(kinds({ tunnel: 'yes' })).toEqual(['tunnel', 'tunnel']);
        expect(kinds({ ford: 'yes' })).toEqual(['ford']);
        expect(kinds({ bridge: 'no', tunnel: 'no' })).toEqual([]);
        expect(isCovered({ tunnel: 'building_passage' })).toBe(true);
        expect(isCovered({ covered: 'yes' })).toBe(true);
        expect(isCovered({ bridge: 'yes' })).toBe(false);
    });

    it('puts slope wedges only on the tagged side, falling the right way', () => {
        // a way running east: its left edge is the north one
        const embankment = edgeStructures('k', 'w1', { embankment: 'left' }, edge(3), edge(-3), surface);
        expect(embankment.length).toBeGreaterThan(5);
        for (const wedge of embankment) {
            const ys = metres(wedge.points).map(p => p[1]);
            expect(Math.min(...ys)).toBeGreaterThan(2.9);
            // an embankment falls away from the road: the point of the wedge is outside
            expect(frame.toMetres(wedge.points[1])[1]).toBeGreaterThan(4);
        }
        const cutting = edgeStructures('k', 'w1', { cutting: 'right' }, edge(3), edge(-3), surface);
        for (const wedge of cutting) {
            const ys = metres(wedge.points).map(p => p[1]);
            expect(Math.max(...ys)).toBeLessThan(-2.9);
            // a cutting falls towards the road: the point of the wedge is on the road's edge
            expect(frame.toMetres(wedge.points[1])[1]).toBeCloseTo(-3, 1);
        }
    });

    it('splits a strip or path outline back into its two edges', () => {
        const [left, right] = ringEdges(surface);
        expect(left).toEqual(edge(3));
        expect(right).toEqual(edge(-3));
    });

    it('draws a ford node on a road as water across it', async () => {
        const { streetGeometry } = await import('../../../../modules/lanes/geometry/street');
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-50, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: { ford: 'yes' } }),
            new iD.osmNode({ id: 'n3', loc: at(50, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential', lanes: '2' } })
        ];
        const graph = graphOf(entities);
        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        expect(street.markings.filter(mark => mark.kind === 'ford')).toHaveLength(1);
    });
});


describe('under construction', () => {
    it('reads the type a way will be from highway=construction or the construction: prefix', () => {
        expect(builtHighway({ highway: 'construction', construction: 'primary' })).toBe('primary');
        expect(builtHighway({ highway: 'construction', construction: 'yes' })).toBeUndefined();
        expect(builtHighway({ 'construction:highway': 'residential' })).toBe('residential');
        expect(builtHighway({ highway: 'tertiary' })).toBe('tertiary');
        expect(isUnderConstruction({ highway: 'construction', construction: 'footway' })).toBe(true);
        expect(isUnderConstruction({ 'construction:highway': 'residential' })).toBe(true);
        expect(isUnderConstruction({ highway: 'primary' })).toBe(false);
        expect(asBuilt({ highway: 'construction', construction: 'cycleway' }).highway).toBe('cycleway');
    });

    it('lays out a road being built as the road it will be', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 90) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'construction', construction: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1' } }),
            new iD.osmNode({ id: 'n3', loc: at(10, 0) }), new iD.osmNode({ id: 'n4', loc: at(10, 90) }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'construction' } })
        ]);
        expect(isLaneRoad(graph.entity('w1'))).toBe(true);
        // no type yet: not drawn as a road
        expect(isLaneRoad(graph.entity('w2'))).toBe(false);
        const { pieces } = roadGeometry([graph.entity('w1')], graph);
        expect(pieces[0].layout.lanes).toHaveLength(3);
    });

    it('draws a path being built as the path it will be', async () => {
        const { streetGeometry } = await import('../../../../modules/lanes/geometry/street');
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-50, 0) }), new iD.osmNode({ id: 'n2', loc: at(50, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'construction', construction: 'cycleway' } })
        ];
        const graph = graphOf(entities);
        const path = streetGeometry(entities.map(e => graph.entity(e.id)), graph).paths.find(p => p.id === 'w1')!;
        expect(path.kind).toBe('cycleway');
        expect(path.construction).toBe(true);
    });
});
