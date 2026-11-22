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

    it('draws the branches running on out of the lanes that lead into them, edge to edge', () => {
        const graph = hitchinRoad();
        const ways = Object.keys(fixture().ways).map(id => graph.entity(id as `w${number}`) as InstanceType<typeof iD.osmWay>);
        const { pieces, junctions } = roadGeometry(ways, graph);
        // no junction box: the lanes run on
        expect(junctions.find(j => j.nodeID === node)).toBeUndefined();
        const frame = metricFrame((graph.entity(node as `n${number}`) as InstanceType<typeof iD.osmNode>).loc);
        // each road's lane boundaries at the fork, in metres, from the way's left
        const at = (wayID: string) => {
            const piece = pieces.find(p => p.wayID === wayID && (p.fromNode === node || p.toNode === node))!;
            return piece.boundaries.map(b => frame.toMetres(piece.fromNode === node ? b[0] : b[b.length - 1]));
        };
        const stem = at('w1379219397');
        const near = (a: number[][], b: number[][]) => a.forEach((p, k) => expect(Math.hypot(p[0] - b[k][0], p[1] - b[k][1])).toBeLessThan(0.05));
        // the approach runs south from the fork: its boundaries from the east kerb (its southbound lane) to the west
        // kerb; the left branch starts on its lanes 1 and 2 (the west ones), the right-turn road on lanes 3 and 4
        near(at('w1255054313'), [stem[5], stem[4], stem[3]]);
        near(at('w1255054311'), [stem[3], stem[2], stem[1]]);
        // and the southbound carriageway's two lanes end on the approach's one southbound lane, as they merge into it
        const south = at('w1255054312');
        near([south[0], south[2]], [stem[0], stem[1]]);
        // the connections there are no longer than a few centimetres
        for (const link of laneLinksAt(graph, node).filter(l => l.from.wayID !== 'w1255054312')) {
            const line = laneLinkLine(link, pieces, graph)!;
            const [a, b] = [frame.toMetres(line[0]), frame.toMetres(line[line.length - 1])];
            expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(0.1);
        }
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
