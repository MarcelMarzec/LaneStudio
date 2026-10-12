import { parallelWays, isSidewalkWay, isKerbWay, sidewalkValue, withSidewalk, withCycleway } from '../../../../modules/lanes/core/roadside';

const m = 1 / 111320;
const mx = m / Math.cos(52.52 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [13.40 + dx * mx, 52.52 + dy * m];

describe('roadside', () => {
    function graph() {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(100, 0) }),
            new iD.osmNode({ id: 'n11', loc: at(-5, 8) }), new iD.osmNode({ id: 'n12', loc: at(105, 8) }),
            new iD.osmNode({ id: 'n13', loc: at(10, -5) }), new iD.osmNode({ id: 'n14', loc: at(90, -5) }),
            new iD.osmNode({ id: 'n15', loc: at(10, 4) }), new iD.osmNode({ id: 'n16', loc: at(90, 4) }),
            new iD.osmNode({ id: 'n17', loc: at(50, -20) }), new iD.osmNode({ id: 'n18', loc: at(50, 20) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n11', 'n12'], tags: { highway: 'footway', footway: 'sidewalk' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n13', 'n14'], tags: { barrier: 'kerb' } }),
            new iD.osmWay({ id: 'w4', nodes: ['n15', 'n16'], tags: { barrier: 'kerb' } }),
            new iD.osmWay({ id: 'w5', nodes: ['n17', 'n18'], tags: { highway: 'footway', footway: 'crossing' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        return { g: new iD.coreGraph(entities), entities };
    }

    it('finds separately mapped pavements and kerbs on each side, but not crossing ways', () => {
        const { g, entities } = graph();
        const road = g.entity('w1');
        const walks = parallelWays(road, g, entities, isSidewalkWay);
        expect(walks.left.map(p => p.way.id)).toEqual(['w2']);
        expect(walks.left[0].offset).toBeCloseTo(-8, 0);
        expect(walks.right).toEqual([]);

        const kerbs = parallelWays(road, g, entities, isKerbWay, 1, 15);
        expect(kerbs.right[0].offset - kerbs.left[0].offset).toBeCloseTo(9, 0);
    });

    it('writes pavements per side and merges matching sides', () => {
        expect(sidewalkValue({ sidewalk: 'left' }, 'right')).toBe('no');
        expect(withSidewalk({ sidewalk: 'both' }, 'left', 'separate')).toEqual({ 'sidewalk:left': 'separate', 'sidewalk:right': 'yes' });
        expect(withSidewalk({ 'sidewalk:left': 'no' }, 'right', 'no')).toEqual({ 'sidewalk:both': 'no' });
        expect(withSidewalk({ 'sidewalk:right': 'yes' }, 'right', undefined)).toEqual({});
        expect(withCycleway({ cycleway: 'lane' }, 'left', 'track')).toEqual({ 'cycleway:left': 'track', 'cycleway:right': 'lane' });
    });
});
