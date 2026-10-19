import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

// near Skegness (left-hand traffic: roundabouts run clockwise); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;

/**
 * A clockwise two-lane ring of radius 25 m round the origin with nodes every 15°, and one road joining
 * it at 10°, leaving `off` degrees from straight out
 */
function ringWithRoad(off: number, tags: Tags) {
    const entities: Entity[] = [];
    let k = 1;
    const N = (x: number, y: number) => {
        const node = new iD.osmNode({ id: `n${k++}` as `n${number}`, loc: at(x, y) });
        entities.push(node);
        return node.id;
    };
    const r = 25;
    const angles = [...new Set([10, ...Array.from({ length: 24 }, (_, i) => i * 15)])].sort((a, b) => b - a);
    const ids = new Map(angles.map(a => [a, N(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180))]));
    const list = angles.map(a => ids.get(a)!);
    entities.push(new iD.osmWay({ id: 'w1', nodes: [...list, list[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }));
    const a = (10 + off) * Math.PI / 180;
    const start = [r * Math.cos(10 * Math.PI / 180), r * Math.sin(10 * Math.PI / 180)];
    entities.push(new iD.osmWay({ id: 'w2', nodes: [ids.get(10)!, N(start[0] + 90 * Math.cos(a), start[1] + 90 * Math.sin(a))], tags }));
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities);
    const geometry = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
    const outer = r + laneLayout(graph.entity('w1'), graph).total / 2;
    return { graph, geometry, outer, node: ids.get(10)! };
}
const radius = (loc: [number, number]) => Math.hypot(...frame.toMetres(loc));


describe('roads joining a roundabout', () => {
    for (const [name, off, tags] of [
        ['a two-lane road straight in', 0, { highway: 'primary', lanes: '2' }],
        ['a four-lane road straight in', 0, { highway: 'trunk', lanes: '4' }],
        ['a road joining 30° off straight', 30, { highway: 'primary', lanes: '2' }],
        ['a road joining 60° off straight', -60, { highway: 'primary', lanes: '2' }]
    ] as const) {
        it(`stops ${name} clear of the ring, with a curved kerb each side`, () => {
            const { geometry, outer, node } = ringWithRoad(off, tags);
            // the road's lanes start outside the ring: none of its lane edges reaches into it
            const piece = geometry.pieces.find(p => p.wayID === 'w2')!;
            for (const boundary of piece.boundaries) expect(radius(boundary[0])).toBeGreaterThan(outer - 0.05);
            // and it flares into the ring with a kerb curve on both sides
            const junction = geometry.junctions.find(j => j.nodeID === node)!;
            expect(junction.kind).toBe('flare');
            expect(junction.kerbs).toHaveLength(2);
            for (const kerb of junction.kerbs) {
                expect(kerb.line.length).toBeGreaterThan(2);
                // each kerb ends on the ring's outer edge
                const ends = [kerb.line[0], kerb.line[kerb.line.length - 1]].map(radius);
                expect(Math.min(...ends.map(r => Math.abs(r - outer)))).toBeLessThan(0.3);
            }
        });
    }

    it('leaves the ring whole: its lanes and kerbs carry on round past the road', () => {
        const { geometry } = ringWithRoad(30, { highway: 'primary', lanes: '2' });
        const ring = geometry.pieces.filter(p => p.wayID === 'w1');
        const length = ring.reduce((sum, p) => sum + p.boundaries[0].length, 0);
        expect(length).toBeGreaterThan(20);
        expect(ring.every(p => p.boundaries.every(b => b.length > 1))).toBe(true);
    });
});


describe('entries and exits of a big roundabout (Exhall Interchange)', () => {
    // a 4-lane ring split at its joins, with a 3-lane entry joining and a 2-lane exit leaving at a shallow angle
    function interchange(ringTags: Tags) {
        const nodes = [
            new iD.osmNode({ id: 'n1', loc: at(-110, -60) }), new iD.osmNode({ id: 'n2', loc: at(-80, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(-60, 50) }), new iD.osmNode({ id: 'n4', loc: at(-20, 90) }),
            new iD.osmNode({ id: 'n5', loc: at(-140, -100) }), new iD.osmNode({ id: 'n6', loc: at(-100, -40) }),
            new iD.osmNode({ id: 'n7', loc: at(-110, 100) }), new iD.osmNode({ id: 'n8', loc: at(-170, 170) })
        ];
        const ways = [
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', lanes: '4', ...ringTags } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', lanes: '4', ...ringTags } }),
            new iD.osmWay({ id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'primary', lanes: '4', ...ringTags } }),
            new iD.osmWay({ id: 'w4', nodes: ['n5', 'n6', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w5', nodes: ['n3', 'n7', 'n8'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph([...nodes, ...ways]);
        return roadGeometry(ways, graph).visuals;
    }

    it('keeps entries and exits on their way lines round a roundabout', () => {
        const visuals = interchange({ junction: 'roundabout' });
        for (const id of ['w4', 'w5']) {
            const visual = visuals.get(id);
            expect(Math.abs(visual?.start ?? 0)).toBeLessThan(0.05);
            expect(Math.abs(visual?.end ?? 0)).toBeLessThan(0.05);
        }
    });

    it('keeps a two-lane road leaving a motorway with no exit lane marked on its way line', () => {
        const nodes = [
            new iD.osmNode({ id: 'n1', loc: at(-300, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(300, 0) }), new iD.osmNode({ id: 'n4', loc: at(100, 12) }),
            new iD.osmNode({ id: 'n5', loc: at(200, 40) })
        ];
        const ways = [
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'motorway', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'motorway', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n2', 'n4', 'n5'], tags: { highway: 'motorway_link', oneway: 'yes', lanes: '2' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph([...nodes, ...ways]);
        expect(Math.abs(roadGeometry(ways, graph).visuals.get('w3')?.start ?? 0)).toBeLessThan(0.05);
    });
});


describe('roundabout edge line and lane connections', () => {
    const lengthOf = (line: [number, number][]) => line.slice(1).reduce((sum, p, i) => sum + Math.hypot(...frame.toMetres(p).map((v, k) => v - frame.toMetres(line[i])[k]) as [number, number]), 0);

    it('carries the ring edge line across entries and exits, but not across an exit leaving at a shallow angle', () => {
        // the ring's outer edge is its left (clockwise, keep left): boundary 0 of its pieces
        const outerPainted = (off: number, oneway: string) => {
            const { geometry } = ringWithRoad(off, { highway: 'primary', lanes: '2', oneway });
            return geometry.pieces.filter(p => p.wayID === 'w1').reduce((sum, p) => sum + lengthOf(p.lines[0]) - lengthOf(p.boundaries[0]), 0);
        };
        // w2 runs out from the ring: oneway=yes is an exit, oneway=-1 an entry; -65° leaves 25° off the ring's direction
        expect(outerPainted(-65, '-1')).toBeCloseTo(0, 1);
        expect(outerPainted(0, 'yes')).toBeCloseTo(0, 1);
        expect(outerPainted(-65, 'yes')).toBeLessThan(-5);
    });

    it('records which roads a lane connection joins', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }), new iD.osmNode({ id: 'n4', loc: at(-80, 40) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n4', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '1' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'connectivity', connectivity: '1:1' }, members: [
                { id: 'w3', type: 'way', role: 'from' }, { id: 'n2', type: 'node', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }
            ] })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const geometry = roadGeometry([graph.entity('w1'), graph.entity('w2'), graph.entity('w3')], graph);
        const connections = geometry.connections.filter(c => c.kind === 'relation');
        expect(connections).toHaveLength(1);
        expect(connections[0].ways).toEqual(['w3', 'w2']);
    });
});
