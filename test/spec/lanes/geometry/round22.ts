import { pointInPolygon } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

// Leicester (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-1.208 + dx * mx, 52.63 + dy * m];

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
type Way = InstanceType<typeof iD.osmWay>;
type WayID = `w${number}`;

/**
 * Two junctions 20 m apart on a one-way road (as at Ratby Lane and Wembley Road, Leicester): a side road north at n0,
 * one south at n5, joined by a two-lane link (w2), with a traffic island (w9) beside the link when `island`
 */
function channelised(island: boolean) {
    const entities: Entity[] = [
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n5', loc: at(20, 0) }), new iD.osmNode({ id: 'n2', loc: at(120, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(0, 100) }), new iD.osmNode({ id: 'n4', loc: at(20, -100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'secondary', oneway: 'yes', lanes: '2' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n5'], tags: { highway: 'secondary', oneway: 'yes', lanes: '2' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n5', 'n2'], tags: { highway: 'secondary', oneway: 'yes', lanes: '2' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n0', 'n3'], tags: { highway: 'tertiary' } }),
        new iD.osmWay({ id: 'w5', nodes: ['n5', 'n4'], tags: { highway: 'tertiary' } })
    ];
    const islands: Way[] = [];
    if (island) {
        const corners = [[4, 6], [16, 6], [16, 10], [4, 10]].map(([x, y], i) => new iD.osmNode({ id: `n${20 + i}` as `n${number}`, loc: at(x, y) }));
        entities.push(...corners, new iD.osmWay({ id: 'w9', nodes: [...corners.map(c => c.id), corners[0].id], tags: { 'area:highway': 'traffic_island' } }));
    }
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities) as iD.Graph;
    const roads = ['w1', 'w2', 'w3', 'w4', 'w5'].map(id => graph.entity(id as WayID) as Way);
    if (island) islands.push(graph.entity('w9') as Way);
    return roadGeometry(roads, graph, [], islands);
}

describe('a junction holding traffic islands', () => {
    it('draws the links between the islands as whole lanes, and leaves the islands out of the junction', () => {
        const geometry = channelised(true);
        // the link is inside one merged junction, and drawn whole over it
        expect([...geometry.innerPieces].map(p => p.wayID)).toContain('w2');
        const link = geometry.channelled.find(p => p.wayID === 'w2');
        expect(link).toBeDefined();
        expect(link!.length).toBeCloseTo(20, 0);
        expect(link!.lanes).toHaveLength(2);
        // the island is a hole in the junction's surface
        const middle = at(10, 8);
        for (const junction of geometry.junctions) {
            for (const polygon of junction.polygons) expect(pointInPolygon(middle, polygon)).toBe(false);
        }
    });

    it('leaves a junction with no islands as one box, its links drawn as guide lines', () => {
        const geometry = channelised(false);
        expect([...geometry.innerPieces].map(p => p.wayID)).toContain('w2');
        expect(geometry.channelled).toHaveLength(0);
    });
});
