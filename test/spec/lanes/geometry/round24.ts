import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

// Leicester (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-1.208 + dx * mx, 52.63 + dy * m];
const frame = metricFrame(at(0, 0));

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay | typeof iD.osmRelation>;

function geometryOf(entities: Entity[]) {
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities) as iD.Graph;
    const roads = entities.filter(e => e.type === 'way').map(e => graph.entity(e.id));
    return roadGeometry(roads as any, graph);
}

describe('a two-way road dividing round an island', () => {
    // as at Oak Spinney Park, Ratby Lane: a two-way road north to n0, then a one-way road away north-west and one
    // (or a two-way service road) back from the north-east
    const fork = (otherTags: Tags) => geometryOf([
        new iD.osmNode({ id: 'n1', loc: at(0, -60) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(-12, 50) }), new iD.osmNode({ id: 'n3', loc: at(12, 50) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'service' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'service', oneway: 'yes' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n3', 'n0'], tags: { highway: 'service', ...otherTags } })
    ]);

    it('is drawn as the road widening, not a junction box', () => {
        for (const other of [{ oneway: 'yes' }, {}] as Tags[]) {
            const junction = fork(other).junctions.find(j => j.nodeID === 'n0')!;
            expect(junction.kind).toBe('flare');
            // the stem runs up to the node: the surface reaches back no further than it
            const ys = junction.polygons[0].map(p => frame.toMetres(p)[1]);
            expect(Math.min(...ys)).toBeGreaterThan(-0.5);
            // and its kerbs carry on along the two outer edges
            expect(junction.kerbs).toHaveLength(2);
        }
    });

    it('leaves a fork of two-way roads as a junction', () => {
        const junction = fork({}).junctions.find(j => j.nodeID === 'n0');
        const twoWay = geometryOf([
            new iD.osmNode({ id: 'n1', loc: at(0, -60) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(-12, 50) }), new iD.osmNode({ id: 'n3', loc: at(12, 50) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'service' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'service' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n3', 'n0'], tags: { highway: 'service' } })
        ]).junctions.find(j => j.nodeID === 'n0');
        expect(junction?.kind).toBe('flare');
        expect(twoWay?.kind).toBe('junction');
    });
});

describe('guide lines with no turn arrows', () => {
    // a crossroads: the main road east–west, side roads north and south, nothing tagged with turn lanes
    const crossroads = (restricted: boolean) => geometryOf([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(100, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }), new iD.osmNode({ id: 'n4', loc: at(0, -100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0', 'n2'], tags: { highway: 'primary', lanes: '2' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n3', 'n0'], tags: { highway: 'residential', oneway: 'yes' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n0', 'n4'], tags: { highway: 'residential' } }),
        ...(restricted ? [new iD.osmRelation({ id: 'r1', tags: { type: 'restriction', restriction: 'no_right_turn' }, members: [
            { id: 'w3', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w1', type: 'way', role: 'to' }
        ] })] : [])
    ]);
    // where the side road's guides lead: west (a right turn from the north, driving on the left), east or south
    const from = (restricted: boolean) => new Set(crossroads(restricted).connections
        .filter(c => c.kind === 'guide' && c.inferred && c.key.includes('-g-w3:'))
        .map(c => {
            const [x, y] = frame.toMetres(c.line[c.line.length - 1]);
            return Math.abs(y) > Math.abs(x) ? 'south' : x < 0 ? 'west' : 'east';
        }));

    it('guides a side road\'s lane into every road it can turn into', () => {
        expect(from(false)).toEqual(new Set(['east', 'west', 'south']));
    });

    it('leaves out the turns a restriction bans', () => {
        const ends = from(true);
        expect(ends.has('south')).toBe(true);
        expect(ends.size).toBeLessThan(3);
    });
});
