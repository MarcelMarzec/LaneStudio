import { metricFrame, polylineLength } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { turningHead, turningHeadKind } from '../../../../modules/lanes/geometry/turning_head';

// near Berlin (right-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.52 * Math.PI / 180);
const origin: [number, number] = [13.40, 52.52];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);
const metres = (line: [number, number][]) => line.map(frame.toMetres);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
function graphOf(entities: Entity[]) {
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities);
}
const waysOf = (graph: ReturnType<typeof graphOf>) => Object.values(graph.base().entities).filter(e => e?.type === 'way') as Parameters<typeof roadGeometry>[0];


describe('turning heads', () => {
    // a dead end running north to a turning node at (0, 0)
    function deadEnd(nodeTags: Tags, roadTags: Tags = { highway: 'residential', lanes: '2', 'width:lanes': '3|3' }) {
        return graphOf([
            new iD.osmNode({ id: 'n1', loc: at(0, -80) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: nodeTags }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: roadTags })
        ]);
    }
    const extent = (rings: [number, number][][]) => {
        const points = rings.flat().map(frame.toMetres);
        const xs = points.map(p => p[0]);
        const ys = points.map(p => p[1]);
        return { width: Math.max(...xs) - Math.min(...xs), top: Math.max(...ys), bottom: Math.min(...ys) };
    };

    it('reads the shape from turning_circle=*, a circle when it is missing or unknown', () => {
        expect(turningHeadKind({})).toBe('circle');
        expect(turningHeadKind({ turning_circle: 'hammer' })).toBe('hammer');
        expect(turningHeadKind({ turning_circle: 'teardrop' })).toBe('circle');
    });

    it('carries the road on into a circle sized by diameter, its kerb running on from the road kerbs', () => {
        const graph = deadEnd({ highway: 'turning_circle', diameter: '20' });
        const { heads, pieces } = roadGeometry(waysOf(graph), graph);
        expect(heads).toHaveLength(1);
        const head = heads[0];
        expect(head.nodeID).toBe('n2');
        // 20 m across, reaching 10 m beyond the node
        const box = extent(head.polygons);
        expect(box.width).toBeCloseTo(20, 0);
        expect(box.top).toBeCloseTo(10, 0);

        // the road stops where the head flares out, and its kerbs end where the head's kerb starts
        const road = pieces.find(p => p.wayID === 'w1')!;
        expect(road.length).toBeLessThan(80 - 5);
        expect(head.kerbs).toHaveLength(1);
        const kerb = metres(head.kerbs[0].line);
        const ends = [kerb[0], kerb[kerb.length - 1]];
        for (const roadKerb of [road.lines[0], road.lines[road.lines.length - 1]]) {
            const end = metres(roadKerb)[roadKerb.length - 1];
            expect(Math.min(...ends.map(p => Math.hypot(p[0] - end[0], p[1] - end[1])))).toBeLessThan(0.05);
        }
        // the head's surface starts where the road's ends: they do not overlap
        const roadTop = Math.max(...metres(road.carriageway).map(p => p[1]));
        expect(box.bottom).toBeGreaterThan(roadTop - 0.05);
    });

    it('draws a hammerhead as a bar across the end, and a turning loop with its island', () => {
        const hammer = deadEnd({ highway: 'turning_circle', turning_circle: 'hammer' });
        const circle = deadEnd({ highway: 'turning_circle' });
        const hammerBox = extent(roadGeometry(waysOf(hammer), hammer).heads[0].polygons);
        const circleBox = extent(roadGeometry(waysOf(circle), circle).heads[0].polygons);
        // wider than the circle, and not as deep
        expect(hammerBox.width).toBeGreaterThan(circleBox.width);
        expect(hammerBox.top).toBeLessThan(circleBox.top);

        const loop = deadEnd({ highway: 'turning_loop' });
        expect(roadGeometry(waysOf(loop), loop).heads[0].island).toBeDefined();
    });

    it('carries a pavement round the head, and stops the road pavement where the head starts', () => {
        const graph = deadEnd({ highway: 'turning_circle' }, { highway: 'residential', lanes: '2', 'width:lanes': '3|3', sidewalk: 'both' });
        const { heads, pieces } = roadGeometry(waysOf(graph), graph);
        expect(heads[0].pavements.length).toBeGreaterThan(0);
        const road = pieces.find(p => p.wayID === 'w1')!;
        const pavementTop = Math.max(...road.roadside.flatMap(strip => metres(strip.polygon)).map(p => p[1]));
        const roadTop = Math.max(...metres(road.carriageway).map(p => p[1]));
        expect(pavementTop).toBeLessThan(roadTop + 0.05);
    });

    it('bulges a knuckle out on the outside of a bend, splitting the road there so its outer kerb can stop', () => {
        // a road running north, then east at (0, 0)
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(0, -60) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: { highway: 'turning_circle', turning_circle: 'knuckle' } }),
            new iD.osmNode({ id: 'n3', loc: at(60, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential', lanes: '2', 'width:lanes': '3|3' } })
        ]);
        const { heads, pieces } = roadGeometry(waysOf(graph), graph);
        expect(heads).toHaveLength(1);
        expect(pieces.filter(p => p.wayID === 'w1')).toHaveLength(2);
        // the bulge is to the north-west, outside the bend
        const points = heads[0].polygons.flat().map(frame.toMetres);
        expect(Math.min(...points.map(p => p[0]))).toBeLessThan(-4);
        expect(Math.max(...points.map(p => p[1]))).toBeGreaterThan(4);
        // the outer (left, west) kerb of the northbound half stops short of the bend; the inner one runs on
        const north = pieces.find(p => p.toNode === 'n2')!;
        const length = (line: [number, number][]) => polylineLength(metres(line));
        expect(length(north.lines[0])).toBeLessThan(length(north.boundaries[0]) - 2);
        expect(length(north.lines[2])).toBeCloseTo(length(north.boundaries[2]), 0);
    });

    it('turningHead: no head at a junction of three roads', () => {
        const arm = (x: number, y: number) => ({ direction: [x, y] as [number, number], left: -3, right: 3 });
        expect(turningHead({ highway: 'turning_circle' }, [arm(1, 0), arm(-1, 0), arm(0, 1)])).toBeNull();
    });
});


describe('carriageway areas and offsets', () => {
    it('gives a carriageway area to the road inside it, leaving the main road it joins alone', () => {
        // a service road north from a main road, its area reaching over the main road's edge
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }), new iD.osmNode({ id: 'n4', loc: at(2, 60) }),
            new iD.osmNode({ id: 'n101', loc: at(-4, 2) }), new iD.osmNode({ id: 'n102', loc: at(-3, 60) }),
            new iD.osmNode({ id: 'n103', loc: at(9, 60) }), new iD.osmNode({ id: 'n104', loc: at(8, 2) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n4'], tags: { highway: 'service' } }),
            new iD.osmWay({ id: 'w9', nodes: ['n101', 'n102', 'n103', 'n104', 'n101'], tags: { 'area:highway': 'service' } })
        ]);
        const area = graph.entity('w9');
        const { areaRoads, visuals, junctions, pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph, [area]);
        expect(areaRoads.get('w9')).toBe('w2');
        // the main road is not fitted to it, and nothing breaks its kerbs or adds a box
        expect(visuals.get('w1')?.fit).toBeUndefined();
        expect(junctions).toHaveLength(0);
        const main = pieces.filter(p => p.wayID === 'w1');
        for (const piece of main) {
            for (const k of [0, piece.lines.length - 1]) {
                expect(polylineLength(metres(piece.lines[k]))).toBeCloseTo(polylineLength(metres(piece.boundaries[k])), 1);
            }
        }
    });

    it('does not fit a road to an area lying off to one side of it', () => {
        // a 7 m road with a carriageway area centred 6 m north of it
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-60, 0) }), new iD.osmNode({ id: 'n2', loc: at(60, 0) }),
            new iD.osmNode({ id: 'n101', loc: at(-60, 2) }), new iD.osmNode({ id: 'n102', loc: at(60, 2) }),
            new iD.osmNode({ id: 'n103', loc: at(60, 10) }), new iD.osmNode({ id: 'n104', loc: at(-60, 10) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', lanes: '2', 'width:lanes': '3.5|3.5' } }),
            new iD.osmWay({ id: 'w9', nodes: ['n101', 'n102', 'n103', 'n104', 'n101'], tags: { 'area:highway': 'primary' } })
        ]);
        const { visuals } = roadGeometry([graph.entity('w1')], graph, [graph.entity('w9')]);
        expect(visuals.get('w1')?.fit).toBeUndefined();
    });

    it('puts the box corners where a shifted road actually ends', () => {
        // a one-way road drops a lane 30 m before joining a main road: the short two-lane way between is
        // shifted to line up at one end and not the other, so its edges change along it
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }), new iD.osmNode({ id: 'n4', loc: at(0, -30) }),
            new iD.osmNode({ id: 'n5', loc: at(0, -120) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n5', 'n4'], tags: { highway: 'secondary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|left|right' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n4', 'n2'], tags: { highway: 'secondary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|right' } })
        ]);
        const { junctions, pieces, visuals } = roadGeometry(waysOf(graph), graph);
        expect(visuals.get('w3')?.start).not.toBe(0);
        const corners = junctions[0].polygons.flat().map(frame.toMetres);
        const side = pieces.find(p => p.wayID === 'w3')!;
        const end = (line: [number, number][]) => frame.toMetres(line[line.length - 1]);
        for (const kerb of [side.boundaries[0], side.boundaries[side.boundaries.length - 1]]) {
            const p = end(kerb);
            expect(Math.min(...corners.map(c => Math.hypot(c[0] - p[0], c[1] - p[1])))).toBeLessThan(0.05);
        }
    });

    it('needs no box where two roads just join', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 20) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } })
        ]);
        expect(roadGeometry([graph.entity('w1'), graph.entity('w2')], graph).junctions).toHaveLength(0);
    });

    it('keeps the box of a slip road leaving a one-way road off the through lanes', () => {
        // a three-lane one-way road east; a slip road leaves to the north-east, two lanes carry on
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-150, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(150, 0) }), new iD.osmNode({ id: 'n4', loc: at(140, 40) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'motorway', oneway: 'yes', lanes: '3', 'width:lanes': '3.5|3.5|3.5', 'turn:lanes': 'slight_left|through|through' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'motorway', oneway: 'yes', lanes: '2', 'width:lanes': '3.5|3.5' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n2', 'n4'], tags: { highway: 'motorway_link', oneway: 'yes', lanes: '1', 'width:lanes': '3.5' } })
        ]);
        const { junctions, pieces } = roadGeometry(waysOf(graph), graph);
        const through = pieces.find(p => p.wayID === 'w2')!;
        // the through road's left (north) edge where it starts
        const edge = frame.toMetres(through.boundaries[0][0])[1];
        expect(junctions).toHaveLength(1);
        for (const junction of junctions) {
            for (const p of junction.polygons.flat().map(frame.toMetres)) expect(p[1]).toBeGreaterThan(edge - 0.05);
        }
    });

    it('puts the arrow of a lane that merges away just before its taper starts', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-150, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(150, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'through|through|merge_to_left' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } })
        ]);
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const before = pieces.find(p => p.wayID === 'w1')!;
        const merge = before.arrows.filter(a => a.lane === 2).map(a => frame.toMetres(a.loc)[0]);
        expect(merge.length).toBeGreaterThan(0);
        // the taper is the last 25 m, so the arrow is more than 25 m before the join
        expect(Math.max(...merge)).toBeLessThan(-25);
        // the other lanes keep theirs close to the join
        expect(Math.max(...before.arrows.filter(a => a.lane === 0).map(a => frame.toMetres(a.loc)[0]))).toBeGreaterThan(-12);
    });
});


describe('roundabouts', () => {
    function roundabout() {
        const R = 25;
        const ids: `n${number}`[] = [];
        const entities: Entity[] = [];
        for (let i = 0; i < 12; i++) {
            const a = -i / 12 * 2 * Math.PI;
            const id = `n${200 + i}` as const;
            ids.push(id);
            entities.push(new iD.osmNode({ id, loc: at(R * Math.cos(a), R * Math.sin(a)) }));
        }
        entities.push(
            new iD.osmWay({ id: 'w1', nodes: [...ids, ids[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }),
            new iD.osmNode({ id: 'n1', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w2', nodes: ['n200', 'n1'], tags: { highway: 'secondary', lanes: '2' } }),
            new iD.osmNode({ id: 'n2', loc: at(0, -100) }),
            new iD.osmWay({ id: 'w3', nodes: ['n203', 'n2'], tags: { highway: 'secondary', lanes: '2' } }),
            new iD.osmNode({ id: 'n3', loc: at(10, -100) }),
            new iD.osmWay({ id: 'w4', nodes: ['n202', 'n3'], tags: { highway: 'secondary', oneway: 'yes', lanes: '1' } })
        );
        return graphOf(entities);
    }

    it('runs the ring kerbs all the way round, across the mouths of its roads', () => {
        const graph = roundabout();
        const { pieces } = roadGeometry(waysOf(graph), graph);
        for (const piece of pieces.filter(p => p.wayID === 'w1')) {
            for (const k of [0, piece.lines.length - 1]) {
                expect(polylineLength(metres(piece.lines[k]))).toBeCloseTo(polylineLength(metres(piece.boundaries[k])), 1);
            }
        }
    });

    it('keeps the junction boxes outside the ring, and does not merge junctions along it', () => {
        const graph = roundabout();
        const { junctions, innerPieces } = roadGeometry(waysOf(graph), graph);
        // the nodes at 60° and 90° are 13 m apart along the ring, but stay two junctions
        expect(junctions.map(j => j.nodeID).sort()).toEqual(['n200', 'n202', 'n203']);
        expect(innerPieces.size).toBe(0);
        // no box reaches more than a little way inside the ring's outer edge (25 m + half its width)
        for (const junction of junctions) {
            for (const p of junction.polygons.flat().map(frame.toMetres)) expect(Math.hypot(p[0], p[1])).toBeGreaterThan(25);
        }
    });
});
