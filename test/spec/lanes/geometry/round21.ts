import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { vehicleRoutes } from '../../../../modules/lanes/geometry/routing';

// Boston (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.98 * Math.PI / 180);
const origin: [number, number] = [-0.02, 52.98];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay | typeof iD.osmRelation>;
type Way = InstanceType<typeof iD.osmWay>;
type WayID = `w${number}`;

const build = (entities: Entity[]) => {
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities) as iD.Graph;
    const ways = entities.filter(e => e.type === 'way').map(e => graph.entity(e.id as WayID) as Way);
    return { graph, geometry: roadGeometry(ways, graph) };
};

/**
 * As on John Adams Way in Boston: a three-lane road east (w1, `left|through|right`) passes South Square (w3, south
 * at n0), where turning right is banned, and turns right 25 m on (w2) into South End (w5, south at n5); w4 runs on
 */
function johnAdamsWay(banned = true) {
    return build([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n5', loc: at(25, 0) }), new iD.osmNode({ id: 'n2', loc: at(125, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(0, -100) }), new iD.osmNode({ id: 'n4', loc: at(25, -100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'trunk', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through|right', name: 'John Adams Way' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n5'], tags: { highway: 'trunk', oneway: 'yes', lanes: '3', name: 'John Adams Way' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n5', 'n2'], tags: { highway: 'trunk', oneway: 'yes', lanes: '2', name: 'John Adams Way' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'residential', name: 'South Square' } }),
        new iD.osmWay({ id: 'w5', nodes: ['n5', 'n4'], tags: { highway: 'tertiary', name: 'South End' } }),
        new iD.osmNode({ id: 'n6', loc: at(0, 100) }),
        new iD.osmWay({ id: 'w6', nodes: ['n0', 'n6'], tags: { highway: 'residential', name: 'South Square' } }),
        ...(banned ? [new iD.osmRelation({
            id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' },
            members: [{ id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w3', type: 'way', role: 'to' }]
        })] : [])
    ]);
}

describe('a turn arrow for a junction past one where that turn is banned', () => {
    it('takes the right-turn lane past the banned turn to the road it is for', () => {
        const { graph } = johnAdamsWay();
        const result = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 2 }, 0, 1, 'car');
        expect(result.routes.length).toBeGreaterThan(0);
        for (const route of result.routes) expect(route.moves.map(move => move.toWayID).slice(0, 2)).toEqual(['w2', 'w5']);
    });

    it('draws its guide line on ahead, not into the banned turn', () => {
        const { geometry } = johnAdamsWay();
        // the guides from n0 that end south of the road would be the banned turn into South Square
        const south = geometry.connections.filter(c => c.kind === 'guide' && !c.inferred && c.nodeID === 'n0' &&
            frame.toMetres(c.line[c.line.length - 1])[1] < -3);
        expect(south).toHaveLength(0);
    });

    it('still turns at the first junction where the turn is allowed', () => {
        const { graph } = johnAdamsWay(false);
        const routes = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 2 }, 0, 1, 'car').routes;
        expect(routes.map(r => r.moves[0].toWayID)).toEqual(['w3']);
    });
});

describe('a turn lane added just past a junction', () => {
    /** two lanes east (w1) to a junction at n0, three on (w2, `left|through|through`), and a side road `side` */
    function added(side: 'north' | 'south') {
        const y = side === 'north' ? 100 : -100;
        return build([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(150, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, y) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'trunk', oneway: 'yes', lanes: '2', name: 'John Adams Way' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'trunk', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through|through', name: 'John Adams Way' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'tertiary', name: 'Main Ridge East' } })
        ]);
    }

    it('widens into it from the kerb, where no road joins on that side', () => {
        // the side road is on the right (south): the new left lane flares out from the left kerb
        const { geometry } = added('south');
        expect(geometry.visuals.get('w2')?.taperStart).toEqual([expect.objectContaining({ lane: 0, shift: 'left' })]);
        // the kerb runs out gradually: near the junction the road is two lanes wide, 60 m on it is three
        const piece = geometry.pieces.find(p => p.wayID === 'w2')!;
        const kerbY = (s: number) => {
            const line = piece.boundaries[0].map(p => frame.toMetres(p));
            return line.reduce((best, p) => (Math.abs(p[0] - s) < Math.abs(best[0] - s) ? p : best))[1];
        };
        expect(kerbY(60)).toBeGreaterThan(kerbY(5) + 1);
    });

    it('starts square where a road joins on that side and feeds the lane', () => {
        const { geometry } = added('north');
        expect(geometry.visuals.get('w2')?.taperStart ?? []).toEqual([]);
    });
});
