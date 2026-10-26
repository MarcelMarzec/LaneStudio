import { streetGeometry } from '../../../../modules/lanes/geometry/street';

// London; 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(51.5 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-0.1 + dx * mx, 51.5 + dy * m];

describe('paths over roads', () => {
    it('draws footways over the roads, and those in a tunnel or below ground under them', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, -20) }), new iD.osmNode({ id: 'n2', loc: at(0, 20) }),
            new iD.osmNode({ id: 'n3', loc: at(10, -20) }), new iD.osmNode({ id: 'n4', loc: at(10, 20) }),
            new iD.osmNode({ id: 'n5', loc: at(20, -20) }), new iD.osmNode({ id: 'n6', loc: at(20, 20) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'footway', tunnel: 'yes', layer: '-1' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n5', 'n6'], tags: { highway: 'pedestrian', layer: '-1' } })
        ];
        const graph = new iD.coreGraph(entities as any) as iD.Graph;
        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        const below = Object.fromEntries(street.paths.map(p => [p.id, p.below]));
        expect(below).toEqual({ w1: false, w2: true, w3: true });
    });
});
