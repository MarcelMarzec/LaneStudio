import fs from 'node:fs';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry, type RoadPiece } from '../../../../modules/lanes/geometry/road_geometry';

/*
 * Lanes flowing on where roads meet end to end with lanes of different widths (the join run), and where a road divides
 * into one-way roads (the fork run): checked on made-up roads of many shapes, and on Hitchin Road, Luton.
 */

type V = [number, number];
const m = 1 / 111320;

/** Roads drawn from nodes at (x, y) metres around a point, east and north; `lat` sets the drive side by country */
function place(lon: number, lat: number) {
    const mx = m / Math.cos(lat * Math.PI / 180);
    const at = (x: number, y: number): V => [lon + x * mx, lat + y * m];
    const node = (id: string, x: number, y: number) => new iD.osmNode({ id: id as `n${number}`, loc: at(x, y) });
    const way = (id: string, nodes: string[], tags: Tags) => new iD.osmWay({ id: id as `w${number}`, nodes: nodes as `n${number}`[], tags });
    const draw = (entities: (InstanceType<typeof iD.osmNode> | InstanceType<typeof iD.osmWay>)[]) => {
        const graph = new iD.coreGraph(entities);
        const ways = entities.filter(e => e.type === 'way') as InstanceType<typeof iD.osmWay>[];
        return { graph, geometry: roadGeometry(ways, graph), frame: metricFrame(at(0, 0)) };
    };
    return { node, way, draw };
}
// right-hand traffic (Texas) and left-hand traffic (Leicestershire)
const texas = place(-97.74, 30.27);
const england = place(-1.2, 52.6);

type Drawn = ReturnType<typeof texas.draw>;

/** A road's lane boundaries where it ends at a node, in metres, and the far sides of any V there */
function endsAt(drawn: Drawn, wayID: string, nodeID: string) {
    const piece = drawn.geometry.pieces.find(p => p.wayID === wayID && (p.fromNode === nodeID || p.toNode === nodeID))!;
    const atStart = piece.fromNode === nodeID;
    const end = (line: V[]) => drawn.frame.toMetres(atStart ? line[0] : line[line.length - 1]);
    // (the far sides of Vs; and the other road's lines closing into a lane or opening out of one)
    const runs = piece.runLines ?? [];
    return { piece, boundaries: piece.boundaries.map(end), vs: runs.filter(r => r.area).map(r => end(r.line)),
        lines: runs.filter(r => !r.area).map(r => end(r.line)), atStart };
}

const near = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;

/**
 * Where `narrow` runs on out of `wide` at a node: each of its lane boundaries (and each V's far side) starts on one
 * of the wide road's, its kerbs on the wide road's kerbs, so nothing steps
 */
function expectFlowsOn(drawn: Drawn, narrow: string, wide: string, nodeID: string, interior = true) {
    const n = endsAt(drawn, narrow, nodeID);
    const w = endsAt(drawn, wide, nodeID);
    for (const p of interior ? [...n.boundaries, ...n.vs, ...n.lines] : []) {
        expect(w.boundaries.some(q => near(p, q)), `${narrow} boundary at ${p.map(x => x.toFixed(2))} meets ${wide}`).toBe(true);
    }
    const kerbs = (ends: V[]) => [ends[0], ends[ends.length - 1]];
    for (const kerb of kerbs(n.boundaries)) expect(kerbs(w.boundaries).some(q => near(kerb, q)), `${narrow} kerb meets ${wide}'s`).toBe(true);
}

/** Past its run, a road's lanes are its own again: its boundaries at its other end are its layout's */
function expectOwnLanesBeyond(drawn: Drawn, wayID: string) {
    const piece = drawn.geometry.pieces.find(p => p.wayID === wayID)!;
    const layout = laneLayout(drawn.graph.entity(wayID as `w${number}`) as InstanceType<typeof iD.osmWay>, drawn.graph);
    const run = drawn.geometry.visuals.get(wayID)?.runs?.[0];
    expect(run, `${wayID} runs on out of the other road`).toBeDefined();
    // (the end away from the run, far enough along)
    const line = (k: number) => (run!.atStart ? piece.boundaries[k][piece.boundaries[k].length - 1] : piece.boundaries[k][0]);
    const widths = layout.edges.slice(1).map((e, k) => e - layout.edges[k]);
    const drawnWidths = piece.boundaries.slice(1).map((_, k) => {
        const [a, b] = [drawn.frame.toMetres(line(k)), drawn.frame.toMetres(line(k + 1))];
        return Math.hypot(a[0] - b[0], a[1] - b[1]);
    });
    drawnWidths.forEach((w, k) => expect(w).toBeCloseTo(widths[k], 1));
}

describe('roads meeting end to end with lanes of different widths', () => {
    it('flares the kerbs of a two-way road widening, with the same lanes', () => {
        const { node, way, draw } = texas;
        const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100, 0),
            way('w1', ['n1', 'n0'], { highway: 'primary', lanes: '2', width: '7' }),
            way('w2', ['n0', 'n2'], { highway: 'primary', lanes: '2', width: '11' })]);
        expectFlowsOn(drawn, 'w1', 'w2', 'n0');
        expectOwnLanesBeyond(drawn, 'w1');
    });

    it('opens a new lane from nothing where a one-way road gains a lane and widens', () => {
        const { node, way, draw } = texas;
        const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100, 0),
            way('w1', ['n1', 'n0'], { highway: 'primary', oneway: 'yes', lanes: '2', width: '6' }),
            way('w2', ['n0', 'n2'], { highway: 'primary', oneway: 'yes', lanes: '3', width: '13' })]);
        // the narrower road takes the wider one's kerbs; its two lanes span the three, the new lane's line closing
        // into its kerb rather than starting from nothing at the join
        expectFlowsOn(drawn, 'w1', 'w2', 'n0');
        expect(endsAt(drawn, 'w1', 'n0').lines).toHaveLength(1);
        expectOwnLanesBeyond(drawn, 'w1');
    });

    it('closes a lane of the wider road in a V, filled as lane, where lanes change direction', () => {
        // left-hand traffic, as Hitchin Road, Luton: eastbound one lane and westbound two on a narrow road, then
        // eastbound two (through and right) and westbound one on an 18 m road. Eastbound, the right-turn lane begins:
        // going west, it ends in a V; westbound, a second lane opens at the kerb
        const { node, way, draw } = england;
        const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100, 0),
            way('w1', ['n1', 'n0'], { highway: 'primary', lanes: '3', 'lanes:forward': '1', 'lanes:backward': '2' }),
            way('w2', ['n0', 'n2'], { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', 'turn:lanes:forward': 'through|right', width: '18' })]);
        expectFlowsOn(drawn, 'w1', 'w2', 'n0');
        const { piece } = endsAt(drawn, 'w1', 'n0');
        expect(piece.runLines?.length).toBe(1);
        // no diagonal across a lane changing direction: the lane ends in the V instead
        expect(drawn.geometry.swaps).toHaveLength(0);
        expectOwnLanesBeyond(drawn, 'w1');
    });

    it('funnels two lanes into one where a wider road\'s lanes merge into a narrower road\'s', () => {
        const { node, way, draw } = england;
        const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100, 0),
            way('w1', ['n1', 'n0'], { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', width: '18' }),
            way('w2', ['n0', 'n2'], { highway: 'primary', lanes: '3', 'lanes:forward': '1', 'lanes:backward': '2' })]);
        // (the narrower road's two westbound lanes each take half the wider road's one at the join)
        expectFlowsOn(drawn, 'w2', 'w1', 'n0', false);
        expectOwnLanesBeyond(drawn, 'w2');
    });

    it('works head to head, tail to tail, and round a bend', () => {
        const { node, way, draw } = texas;
        for (const [first, second] of [[['n1', 'n0'], ['n2', 'n0']], [['n0', 'n1'], ['n0', 'n2']], [['n0', 'n1'], ['n2', 'n0']]]) {
            for (const bend of [0, 25]) {
                const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100 * Math.cos(bend * Math.PI / 180), 100 * Math.sin(bend * Math.PI / 180)),
                    way('w1', first, { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', width: '9' }),
                    way('w2', second, { highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2', width: '17' })]);
                expectFlowsOn(drawn, 'w1', 'w2', 'n0');
                expectOwnLanesBeyond(drawn, 'w1');
            }
        }
    });

    it('leaves lanes of the same width to taper as before', () => {
        // a lane dropped at the same lane width: the dropped lane tapers away on the wider road, nothing runs
        const { node, way, draw } = texas;
        const drawn = draw([node('n1', -100, 0), node('n0', 0, 0), node('n2', 100, 0),
            way('w1', ['n1', 'n0'], { highway: 'primary', oneway: 'yes', lanes: '3' }),
            way('w2', ['n0', 'n2'], { highway: 'primary', oneway: 'yes', lanes: '2' })]);
        expect(drawn.geometry.visuals.get('w1')?.runs).toBeUndefined();
        expect(drawn.geometry.visuals.get('w2')?.runs).toBeUndefined();
        expect(drawn.geometry.visuals.get('w1')?.taperEnd.length).toBe(1);
    });
});

describe('a road dividing into one-way roads, made up', () => {
    /** The branch lanes start on the stem's: every boundary of each lined-up branch at the fork is one of the stem's */
    function expectBranchesOnStem(drawn: Drawn, stem: string, branches: string[], nodeID: string) {
        const s = endsAt(drawn, stem, nodeID);
        for (const id of branches) {
            for (const p of endsAt(drawn, id, nodeID).boundaries) {
                expect(s.boundaries.some(q => near(p, q)), `${id} boundary at ${p.map(x => x.toFixed(2))} on the stem's`).toBe(true);
            }
        }
        // no junction box
        expect(drawn.geometry.junctions.find(j => j.nodeID === nodeID)).toBeUndefined();
    }

    it('splits a road in two at shallow and wider angles, either side of traffic', () => {
        for (const { draw, node, way } of [texas, england]) {
            for (const [left, right] of [[20, 10], [40, 5], [10, 35]]) {
                const rad = (d: number) => d * Math.PI / 180;
                const drawn = draw([
                    node('n1', 0, -100), node('n0', 0, 0),
                    node('n2', -100 * Math.sin(rad(left)), 100 * Math.cos(rad(left))),
                    node('n3', 100 * Math.sin(rad(right)), 100 * Math.cos(rad(right))),
                    node('n4', 100 * Math.sin(rad(right + 12)), 100 * Math.cos(rad(right + 12))),
                    way('w1', ['n1', 'n0'], { highway: 'primary', lanes: '4', 'lanes:forward': '3', 'lanes:backward': '1', width: '16' }),
                    way('w2', ['n0', 'n2'], { highway: 'primary', oneway: 'yes', lanes: '2' }),
                    way('w3', ['n0', 'n3'], { highway: 'primary', oneway: 'yes', lanes: '1' }),
                    way('w4', ['n4', 'n0'], { highway: 'primary', oneway: 'yes', lanes: '1' })
                ]);
                expectBranchesOnStem(drawn, 'w1', ['w2', 'w3', 'w4'], 'n0');
            }
        }
    });

    it('works with the stem drawn either way, and arrows choosing the branches', () => {
        const { draw, node, way } = england;
        for (const stemNodes of [['n1', 'n0'], ['n0', 'n1']]) {
            const backward = stemNodes[0] === 'n0';
            const drawn = draw([
                node('n1', 0, -100), node('n0', 0, 0), node('n2', -40, 90), node('n3', 30, 95), node('n4', 70, 70),
                way('w1', stemNodes, {
                    highway: 'trunk', lanes: '5', [`lanes:${backward ? 'backward' : 'forward'}`]: '4', [`lanes:${backward ? 'forward' : 'backward'}`]: '1',
                    [`turn:lanes:${backward ? 'backward' : 'forward'}`]: 'right|right|through|through'
                }),
                way('w2', ['n0', 'n2'], { highway: 'trunk', oneway: 'yes', lanes: '2', turn: 'right' }),
                way('w3', ['n0', 'n3'], { highway: 'trunk', oneway: 'yes', lanes: '2', turn: 'through' }),
                way('w4', ['n4', 'n0'], { highway: 'trunk', oneway: 'yes', lanes: '1' })
            ]);
            expectBranchesOnStem(drawn, 'w1', ['w2', 'w3', 'w4'], 'n0');
        }
    });
});

describe('Hitchin Road, Luton', () => {
    const data = JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/luton_hitchin_road.json', 'utf8')) as {
        nodes: Record<string, { loc: V; tags: Tags }>; ways: Record<string, { nodes: string[]; tags: Tags }>;
    };
    const graph = new iD.coreGraph([
        ...Object.entries(data.nodes).map(([id, n]) => new iD.osmNode({ id: id as `n${number}`, loc: n.loc, tags: n.tags })),
        ...Object.entries(data.ways).map(([id, w]) => new iD.osmWay({ id: id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags }))
    ]);
    const ways = Object.keys(data.ways).map(id => graph.entity(id as `w${number}`) as InstanceType<typeof iD.osmWay>);
    const drawn: Drawn = { graph, geometry: roadGeometry(ways, graph), frame: metricFrame(data.nodes.n12771314901.loc) };

    it('runs w1379219396 (18 m) out of the 24 m road\'s lanes, its through and right lanes each spanning two', () => {
        expectFlowsOn(drawn, 'w1379219396', 'w1379219397', 'n12771314901');
        // no lane ends there: the `through|right` lanes widen into `through|through|right|right`, the line between
        // each pair opening out of the middle of the lane they come from
        const ends = endsAt(drawn, 'w1379219396', 'n12771314901');
        expect(ends.vs).toHaveLength(0);
        expect(ends.lines).toHaveLength(2);
    });

    it('runs the narrower road south out of it, its right-turn lane closing in a V', () => {
        expectFlowsOn(drawn, 'w1255054314', 'w1379219396', 'n12771312200');
        expect(endsAt(drawn, 'w1255054314', 'n12771312200').vs).toHaveLength(1);
        expect(drawn.geometry.swaps.filter(s => s.key.startsWith('n12771312200'))).toHaveLength(0);
    });
});

export type { RoadPiece };
