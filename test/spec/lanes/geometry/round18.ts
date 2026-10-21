import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { vehicleRoutes } from '../../../../modules/lanes/geometry/routing';

// near Boston (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.98 * Math.PI / 180);
const origin: [number, number] = [-0.0175, 52.98];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
type Way = InstanceType<typeof iD.osmWay>;
type WayID = `w${number}`;

const build = (entities: Entity[]) => {
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities) as iD.Graph;
    const ways = entities.filter(e => e.type === 'way').map(e => graph.entity(e.id as WayID) as Way);
    return { graph, geometry: roadGeometry(ways, graph) };
};

/**
 * The near half of a dual carriageway crossroads, as at Spilsby Road and Freiston Road in Boston: a three-lane
 * approach from the west (w1, `left;through|through|right`) whose left lane may turn north at n0 (w3); an
 * untagged three-lane link (w2, 8 m) across the central reserve to n5, where the road ahead has two lanes (w4)
 * and the right-turn lane turns south (w5).
 */
function dualCrossroads(link: Tags = {}) {
    return build([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n5', loc: at(8, 0) }), new iD.osmNode({ id: 'n2', loc: at(108, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(0, 100) }), new iD.osmNode({ id: 'n4', loc: at(8, -100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'trunk', oneway: 'yes', lanes: '3', 'turn:lanes': 'left;through|through|right' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n5'], tags: { highway: 'trunk', oneway: 'yes', lanes: '3', ...link } }),
        new iD.osmWay({ id: 'w4', nodes: ['n5', 'n2'], tags: { highway: 'trunk', oneway: 'yes', lanes: '2' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'unclassified', oneway: 'yes' } }),
        new iD.osmWay({ id: 'w5', nodes: ['n5', 'n4'], tags: { highway: 'tertiary', oneway: 'yes' } })
    ]);
}

describe('lanes lined up by where they go', () => {
    it('carries the two lanes going ahead straight on past a short link, the right-turn lane turning off', () => {
        const { geometry } = dualCrossroads();
        const y = (wayID: string, boundary: number, end: 'first' | 'last') => {
            const piece = geometry.pieces.find(p => p.wayID === wayID)!;
            const line = piece.boundaries[boundary];
            return frame.toMetres(end === 'first' ? line[0] : line[line.length - 1])[1];
        };
        // the approach's left kerb and the line between its through lanes carry on as the road ahead's
        // (lane 0 is the left lane, on the north side going east)
        expect(y('w4', 0, 'first')).toBeCloseTo(y('w1', 0, 'last'), 0);
        expect(y('w4', 2, 'first')).toBeCloseTo(y('w1', 2, 'last'), 0);
        // the right-turn lane's guide goes on into the road to the south
        const guides = geometry.connections.filter(c => c.kind === 'guide' && c.nodeID === 'n5');
        expect(guides.some(c => frame.toMetres(c.line[c.line.length - 1])[1] < -2)).toBe(true);
    });

    it('takes a right-turn lane over the near half to the turn it is for, and only there', () => {
        const { graph } = dualCrossroads();
        const routes = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 2 }, 0, 1, 'car').routes;
        expect(routes.length).toBeGreaterThan(0);
        for (const route of routes) {
            expect(route.moves.map(move => move.toWayID).slice(0, 2)).toEqual(['w2', 'w5']);
        }
        // the lanes going ahead go ahead (the left one may also turn left), not right
        const ahead = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 1 }, 0, 1, 'car').routes;
        expect(ahead.map(r => r.moves.map(move => move.toWayID).slice(0, 2))).toEqual([['w2', 'w4']]);
        const left = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1, 'car').routes;
        expect(left.map(r => r.moves[r.moves.length - 1].toWayID).sort()).toEqual(['w3', 'w4']);
    });

    it('leaves a link with arrows of its own, or a long road, to its own arrows', () => {
        // the link's own arrows say every lane goes ahead: the right-hand lane goes ahead too
        const { graph } = dualCrossroads({ 'turn:lanes': 'through|through|through' });
        const routes = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 2 }, 0, 1, 'car').routes;
        expect(routes.some(r => r.moves.some(move => move.toWayID === 'w4'))).toBe(true);
    });
});

describe('a lane merging into the lane beside it', () => {
    /**
     * A two-way road, two lanes each way (w1), becoming one lane each way (w2) at n0: eastbound traffic gains a
     * lane at the kerb; westbound, the right-hand lane merges into the left (`through|merge_to_left`)
     */
    function merge() {
        return build([
            new iD.osmNode({ id: 'n1', loc: at(-120, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(30, 0) }),
            new iD.osmWay({ id: 'w2', nodes: ['n1', 'n0'], tags: { highway: 'trunk', lanes: '2' } }),
            new iD.osmWay({ id: 'w1', nodes: ['n0', 'n2'], tags: { highway: 'trunk', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2', 'turn:lanes:backward': 'through|merge_to_left' } })
        ]);
    }

    it('narrows from the side away from the centre line, which runs straight on', () => {
        const { geometry } = merge();
        const piece = geometry.pieces.find(p => p.wayID === 'w1')!;
        const ys = (k: number) => piece.boundaries[k].map(p => frame.toMetres(p)[1]);
        // the centre line (between the two directions) stays on the way
        for (const y of ys(2)) expect(Math.abs(y)).toBeLessThan(0.05);
        // the kerbs move out as lanes are gained, never beyond the four lanes' width, nor back and forth
        for (const k of [0, 4]) {
            const line = ys(k).map(Math.abs);
            for (let i = 1; i < line.length; i++) expect(line[i]).toBeGreaterThanOrEqual(line[i - 1] - 0.01);
            expect(Math.max(...line)).toBeLessThan(piece.layout.total / 2 + 0.05);
        }
        // the merging lane (the westbound right-hand lane, beside the centre line) is gone at the join
        expect(Math.abs(ys(3)[0])).toBeLessThan(0.05);
    });

    it('draws each point along the road once, with no doubled vertex where two tapers end together', () => {
        const { geometry } = merge();
        const piece = geometry.pieces.find(p => p.wayID === 'w1')!;
        for (const line of piece.boundaries) {
            const points = line.map(p => frame.toMetres(p));
            for (let i = 1; i < points.length; i++) {
                expect(Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])).toBeGreaterThan(0.005);
            }
            // and walking along the road, each point is further along than the one before
            for (let i = 1; i < points.length; i++) expect(points[i][0]).toBeGreaterThan(points[i - 1][0]);
        }
    });
});
