import { vertexImportance } from '../../../../modules/lanes/svg/vertices';

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
const graphOf = (entities: Entity[]) => {
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities) as iD.Graph;
};
const node = (id: `n${number}`, x: number, y: number, tags: Tags = {}) => new iD.osmNode({ id, loc: [x * 0.0001, y * 0.0001], tags });

describe('vertices drawn without selecting their way', () => {
    // a field (n1-n4) with a hedge along its south and east edges (n1-n2-n3), a road ending on its west corner
    const graph = graphOf([
        node('n1', 0, 0), node('n2', 1, 0), node('n3', 1, 1), node('n4', 0, 1), node('n5', 0.5, 0),
        node('n6', -1, 0), node('n7', 1, 0.5, { barrier: 'gate' }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n5', 'n2', 'n7', 'n3', 'n4', 'n1'], tags: { landuse: 'meadow' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n5', 'n2', 'n7', 'n3'], tags: { barrier: 'hedge' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n6', 'n1'], tags: { highway: 'track' } })
    ]);
    const drawn = (id: string, zoom = 19) => vertexImportance(graph.entity(id as `n${number}`) as iD.OsmNode, graph, zoom);

    it('leaves out the nodes a hedge shares with the field it runs along', () => {
        expect(drawn('n2')).toBe(false);
    });

    it('draws where ways end or meet, and tagged nodes', () => {
        expect(drawn('n5')).toBe(true);   // the hedge starts
        expect(drawn('n3')).toBe(true);   // the hedge ends
        expect(drawn('n1')).toBe(true);   // the track ends on the field's corner
        expect(drawn('n7')).toBe(true);   // a gate
    });

    it('draws the ends of fences, hedges and field edges only close in, but roads always', () => {
        expect(drawn('n5', 17)).toBe(false);
        expect(drawn('n1', 17)).toBe(true);
        expect(drawn('n7', 17)).toBe(true);
    });
});
