import fs from 'node:fs';
import { roadGeometry, splitAt, junctionRules } from '../../../../modules/lanes/geometry/road_geometry';
import { laneLinksAt, laneLinkLine } from '../../../../modules/lanes/geometry/connectivity';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { vehicleRoutes } from '../../../../modules/lanes/geometry/routing';

type Fixture = {
    nodes: Record<string, { loc: [number, number]; tags: Tags }>;
    ways: Record<string, { nodes: string[]; tags: Tags }>;
    relations?: Record<string, { tags: Tags; members: { id: string; type: string; role: string }[] }>;
};

/** Hitchin Road, Luton (OpenStreetMap data of November 2026), with the turn restrictions whose members are all there */
const fixture = () => JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/luton_hitchin_road.json', 'utf8')) as Fixture;

function hitchinRoad() {
    const data = fixture();
    const has = (id: string) => !!data.nodes[id] || !!data.ways[id];
    return new iD.coreGraph([
        ...Object.entries(data.nodes).map(([id, n]) => new iD.osmNode({ id: id as `n${number}`, loc: n.loc, tags: n.tags })),
        ...Object.entries(data.ways).map(([id, w]) => new iD.osmWay({ id: id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags })),
        ...Object.entries(data.relations ?? {}).filter(([, r]) => r.members.every(m => has(m.id)))
            .map(([id, r]) => new iD.osmRelation({ id: id as `r${number}`, tags: r.tags, members: r.members as never }))
    ]);
}

const pairs = (graph: iD.Graph, nodeID: string) => laneLinksAt(graph, nodeID)
    .map(l => `${l.from.wayID}:${l.from.ref.index + 1}>${l.to.wayID}:${l.to.ref.index + 1}`).sort();

describe('a road dividing into one-way roads (a fork)', () => {
    // n11701954021: Hitchin Road (w1379219397, four lanes north, through|through|right|right) divides into a road
    // carrying on (w1255054313, turn=through) and one for the right turn at the lights ahead (w1255054311, turn=right),
    // where its southbound carriageway (w1255054312, two lanes) joins its one lane south
    const node = 'n11701954021';

    it('leads each lane into the branch its arrows are for, and the joining road into the lane it becomes', () => {
        expect(pairs(hitchinRoad(), node)).toEqual([
            'w1255054312:1>w1379219397:1', 'w1255054312:2>w1379219397:1',
            'w1379219397:1>w1255054313:1', 'w1379219397:2>w1255054313:2',
            'w1379219397:3>w1255054311:1', 'w1379219397:4>w1255054311:2'
        ]);
    });

    it('routes the left two lanes straight on, and the right two to the right turn', () => {
        const graph = hitchinRoad();
        const firstWays = (lane: number) => [...new Set(vehicleRoutes(graph, 'w1379219397', { direction: 'backward', index: lane }, 2, 0)
            .routes.map(r => r.moves[0]?.toWayID))];
        expect(firstWays(0)).toEqual(['w1255054313']);
        expect(firstWays(1)).toEqual(['w1255054313']);
        expect(firstWays(2)).toEqual(['w1255054311']);
        expect(firstWays(3)).toEqual(['w1255054311']);
    });

    it('draws the branches carrying on from the lanes that lead into them, unbroken', () => {
        const graph = hitchinRoad();
        const ways = Object.keys(fixture().ways).map(id => graph.entity(id as `w${number}`) as InstanceType<typeof iD.osmWay>);
        const { pieces, junctions, visuals, gores } = roadGeometry(ways, graph);
        expect(junctions.find(j => j.nodeID === node)?.kind).toBe('flare');
        // its width (width=24, no width:lanes) is not shared out over its five lanes: they are as wide as the lanes they
        // lead into, and the rest is a hatched gore between the through lanes and the right-turn lanes, carrying on
        // between the two branches
        const gore = visuals.get('w1379219397')?.gore;
        expect(gore?.widths.every(w => Math.abs(w - 3.65) < 0.01)).toBe(true);
        expect(gore?.gaps).toHaveLength(1);
        expect(gore!.gaps[0].width).toBeCloseTo(24 - 5 * 3.65, 1);
        expect(gores).toHaveLength(1);
        const frame = metricFrame((graph.entity(node as `n${number}`) as InstanceType<typeof iD.osmNode>).loc);
        const gaps = new Map<string, number>();
        for (const link of laneLinksAt(graph, node)) {
            const line = laneLinkLine(link, pieces, graph)!;
            const [a, b] = [frame.toMetres(line[0]), frame.toMetres(line[line.length - 1])];
            const key = `${link.from.wayID} > ${link.to.wayID}:${link.to.ref.index}`;
            gaps.set(key, Math.min(gaps.get(key) ?? Infinity, Math.hypot(b[0] - a[0], b[1] - a[1])));
        }
        // each lane starts within a couple of metres of where the lane before it ends (they were up to 12 m apart);
        // of the joining road's two lanes, the one carrying on (the other merges into it)
        for (const [key, gap] of gaps) expect(gap, key).toBeLessThan(2.5);
    });
});

describe('forks of made-up roads', () => {
    // in Texas (right-hand traffic): a two-way road north to n0, dividing into two one-way roads, a third coming back
    const m = 1 / 111320;
    const at = (dx: number, dy: number): [number, number] => [-97.74 + dx * m / Math.cos(30.27 * Math.PI / 180), 30.27 + dy * m];
    const fork = (stemTags: Tags, leftTags: Tags = {}, rightTags: Tags = {}) => new iD.coreGraph([
        new iD.osmNode({ id: 'n1', loc: at(0, -100) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(-50, 100) }), new iD.osmNode({ id: 'n3', loc: at(10, 100) }), new iD.osmNode({ id: 'n4', loc: at(60, 80) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', lanes: '5', 'lanes:forward': '4', 'lanes:backward': '1', ...stemTags } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', ...leftTags } }),
        new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', ...rightTags } }),
        new iD.osmWay({ id: 'w4', nodes: ['n4', 'n0'], tags: { highway: 'primary', oneway: 'yes', lanes: '1' } })
    ]);

    it('is a fork: the stem and three one-way branches within 50° of straight on', () => {
        const graph = fork({});
        const split = splitAt(junctionRules.armsAt(graph.entity('n0'), graph));
        expect(split?.stem.way.id).toBe('w1');
        expect(split?.branches.map(b => b.way.id).sort()).toEqual(['w2', 'w3', 'w4']);
    });

    it('shares the lanes out left to right with no arrows to go by', () => {
        expect(pairs(fork({}), 'n0').filter(p => p.startsWith('w1'))).toEqual(['w1:1>w2:1', 'w1:2>w2:2', 'w1:3>w3:1', 'w1:4>w3:2']);
    });

    it('follows the branches\' own arrows over the order', () => {
        // the left branch is for a right turn ahead, the right one carries on: the arrows say so, whatever the order
        const graph = fork({ 'turn:lanes:forward': 'right|right|through|through' }, { turn: 'right' }, { turn: 'through' });
        expect(pairs(graph, 'n0').filter(p => p.startsWith('w1'))).toEqual(['w1:1>w2:1', 'w1:2>w2:2', 'w1:3>w3:1', 'w1:4>w3:2']);
        const swapped = fork({ 'turn:lanes:forward': 'through|through|right|right' }, { turn: 'right' }, { turn: 'through' });
        expect(pairs(swapped, 'n0').filter(p => p.startsWith('w1'))).toEqual(['w1:1>w3:1', 'w1:2>w3:2', 'w1:3>w2:1', 'w1:4>w2:2']);
    });
});
