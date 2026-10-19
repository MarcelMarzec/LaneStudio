import { metricFrame, pointInPolygon } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry, _test } from '../../../../modules/lanes/geometry/road_geometry';

// near Skegness (left-hand traffic: roundabouts run clockwise); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);
const metres = (loc: [number, number]) => frame.toMetres(loc);
const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;

/**
 * A clockwise ring of radius 40 m round the origin, split where a road `w3` joins it at 10° (`off` degrees from
 * straight out): `w1` runs up to the join with `before` lanes, `w2` on from it with `after` lanes
 */
function splitRing(before: number, after: number, off: number, tags: Tags) {
    const entities: Entity[] = [];
    let k = 1;
    const N = (x: number, y: number) => {
        const node = new iD.osmNode({ id: `n${k++}` as `n${number}`, loc: at(x, y) });
        entities.push(node);
        return node.id;
    };
    const r = 40;
    const angles = [...new Set([10, ...Array.from({ length: 24 }, (_, i) => i * 15)])].sort((a, b) => b - a);
    const ids = new Map(angles.map(a => [a, N(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180))]));
    const list = angles.map(a => ids.get(a)!);
    const split = list.indexOf(ids.get(10)!);
    entities.push(new iD.osmWay({ id: 'w1', nodes: list.slice(0, split + 1), tags: { highway: 'primary', junction: 'roundabout', lanes: String(before) } }));
    entities.push(new iD.osmWay({ id: 'w2', nodes: [...list.slice(split), list[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: String(after) } }));
    const a = (10 + off) * Math.PI / 180;
    const start = [r * Math.cos(10 * Math.PI / 180), r * Math.sin(10 * Math.PI / 180)];
    entities.push(new iD.osmWay({ id: 'w3', nodes: [ids.get(10)!, N(start[0] + 90 * Math.cos(a), start[1] + 90 * Math.sin(a))], tags }));
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities);
    const geometry = roadGeometry((['w1', 'w2', 'w3'] as const).map(id => graph.entity(id) as InstanceType<typeof iD.osmWay>), graph);
    const node = ids.get(10)!;
    const nodeAt = metres(graph.entity(node).loc);
    // the pieces of the ring either side of the join: w1's ends there, w2's starts there
    const up = geometry.pieces.find(p => p.wayID === 'w1' && distance(metres(p.boundaries[0][p.boundaries[0].length - 1]), nodeAt) < 30)!;
    const down = geometry.pieces.find(p => p.wayID === 'w2' && distance(metres(p.boundaries[0][0]), nodeAt) < 30)!;
    const junction = geometry.junctions.find(j => j.nodeID === node)!;
    const guides = geometry.connections.filter(c => c.nodeID === node && c.kind === 'guide');
    return { geometry, up, down, junction, guides };
}


describe('a roundabout exit leaving at a shallow angle', () => {
    // three lanes round the ring, its outer lane running on into a one-lane exit 25° off the ring's direction
    const exit = () => splitRing(3, 2, -65, { highway: 'primary', lanes: '1', oneway: 'yes' });

    it('carries the ring\'s outer kerb on to the end of its road, and sweeps it from there into the exit\'s kerb', () => {
        const { up, junction } = exit();
        // the ring's outer edge is its left (clockwise, keep left): boundary 0
        const corner = metres(up.boundaries[0][up.boundaries[0].length - 1]);
        const kerb = up.lines[0];
        expect(distance(metres(kerb[kerb.length - 1]), corner)).toBeLessThan(0.05);
        // the junction's kerb starts where the ring's stops: no dent between them
        const ends = junction.kerbs.flatMap(k => [k.line[0], k.line[k.line.length - 1]]).map(metres);
        expect(Math.min(...ends.map(p => distance(p, corner)))).toBeLessThan(0.05);
    });

    it('fills the step where the wider half of the ring meets the narrower one', () => {
        const { up, down, junction } = exit();
        // just beyond the wider half's end, between its outer edge carried on and the narrower half's
        const corner = metres(up.boundaries[0][up.boundaries[0].length - 1]);
        const narrower = metres(down.boundaries[0][0]);
        const p: [number, number] = [corner[0] * 0.85 + narrower[0] * 0.15, corner[1] * 0.85 + narrower[1] * 0.15];
        const step = up.boundaries[0].length > 1 ? metres(up.boundaries[0][up.boundaries[0].length - 2]) : corner;
        // nudged a little on in the direction of travel, off the line the two halves are cut on
        const travel = [corner[0] - step[0], corner[1] - step[1]];
        const t = 0.3 / Math.hypot(travel[0], travel[1]);
        const point: [number, number] = [p[0] + travel[0] * t, p[1] + travel[1] * t];
        const polygons = junction.polygons.map(polygon => polygon.map(metres));
        expect(polygons.some(polygon => pointInPolygon(point, polygon))).toBe(true);
    });
});


describe('guide lines onto a roundabout', () => {
    it('sweep round into the ring from a road meeting it square on', () => {
        const { down, guides } = splitRing(2, 3, 0, { highway: 'primary', lanes: '2', oneway: '-1' });
        expect(guides.length).toBeGreaterThan(0);
        const starts = down.boundaries.map(b => metres(b[0]));
        // to where the road's mouth meets the ring, a few metres on round it
        for (const guide of guides) {
            const end = metres(guide.line[guide.line.length - 1]);
            expect(Math.min(...starts.map(s => distance(s, end)))).toBeGreaterThan(2);
        }
    });

    it('meet the ring\'s lane lines where they start, for a road joining at a shallow angle (a spiral)', () => {
        // 65° off straight out, back against the ring's direction: joining 25° off it
        const { down, guides } = splitRing(2, 3, 65, { highway: 'primary', lanes: '2', oneway: '-1' });
        expect(guides.length).toBeGreaterThan(0);
        const starts = down.boundaries.map(b => metres(b[0]));
        for (const guide of guides) {
            const end = metres(guide.line[guide.line.length - 1]);
            expect(Math.min(...starts.map(s => distance(s, end)))).toBeLessThan(0.6);
        }
    });
});


describe('road surface under connected lanes', () => {
    it('adds only what nothing else covers, and leaves out slivers', () => {
        const lane: [number, number][] = [[0, 0], [10, 0], [10, 4], [0, 4]];
        const box: [number, number][] = [[-1, -1], [6, -1], [6, 5], [-1, 5]];
        const rest = _test.uncovered([lane], [box]);
        expect(rest).toHaveLength(1);
        const xs = rest[0].map(p => p[0]);
        expect(Math.min(...xs)).toBeCloseTo(6, 3);
        expect(Math.max(...xs)).toBeCloseTo(10, 3);
        // a strip 0.1 m wide left over is not road worth drawing
        expect(_test.uncovered([lane], [[[-1, -1], [9.9, -1], [9.9, 5], [-1, 5]]])).toHaveLength(0);
        expect(_test.uncovered([lane], [lane])).toHaveLength(0);
    });
});
