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
