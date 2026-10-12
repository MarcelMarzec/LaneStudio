import { offsetPolyline, metricFrame, polylineLength } from '../../../../modules/lanes/geometry/frame';
import { laneLayout, parseWidth } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry, visualShift, _test } from '../../../../modules/lanes/geometry/road_geometry';

// a T-junction near Berlin (right-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.52 * Math.PI / 180);
const origin: [number, number] = [13.40, 52.52];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];

function tJunction(mainTags: Tags = { highway: 'primary', lanes: '4' }) {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
        new iD.osmNode({ id: 'n4', loc: at(0, 100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: mainTags }),
        new iD.osmWay({ id: 'w2', nodes: ['n2', 'n4'], tags: { highway: 'residential', lanes: '2', width: '6' } })
    ];
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities);
}


describe('offsetPolyline', () => {
    it('offsets a straight line to the right', () => {
        expect(offsetPolyline([[0, 0], [10, 0]], [2, 2])).toEqual([[0, -2], [10, -2]]);
    });

    it('keeps the distance at a right-angle corner with a mitre join', () => {
        const [, corner] = offsetPolyline([[0, 0], [10, 0], [10, 10]], [-1, -1, -1]);
        expect(corner[0]).toBeCloseTo(9);
        expect(corner[1]).toBeCloseTo(1);
    });

    it('caps the mitre at sharp bends', () => {
        const [, corner] = offsetPolyline([[0, 0], [10, 0], [0, 0.5]], [1, 1, 1]);
        expect(Math.hypot(corner[0] - 10, corner[1])).toBeLessThanOrEqual(2.0001);
    });
});


describe('metricFrame', () => {
    it('round-trips and measures metres', () => {
        const frame = metricFrame(origin);
        const p = frame.toMetres(at(100, 50));
        expect(p[0]).toBeCloseTo(100, 0);
        expect(p[1]).toBeCloseTo(50, 0);
        const back = frame.toLoc(p);
        expect(back[0]).toBeCloseTo(at(100, 50)[0], 9);
    });
});


describe('laneLayout', () => {
    it('parses widths', () => {
        expect(parseWidth('3.5')).toBe(3.5);
        expect(parseWidth('3.5 m')).toBe(3.5);
        expect(parseWidth('12\'')).toBeCloseTo(3.66, 2);
        expect(parseWidth('wide')).toBeUndefined();
    });

    it('uses width:lanes, then width, then iD defaults', () => {
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3.5|3' });
        const layout = laneLayout(graph.entity('w1'), graph);
        expect(layout.lanes.map(l => l.width)).toEqual([3.5, 3]);
        expect(layout.total).toBeCloseTo(6.5);
        expect(layout.edges[0]).toBeCloseTo(-3.25);

        const byWidth = laneLayout(graph.entity('w2'), graph);
        expect(byWidth.lanes.map(l => l.width)).toEqual([3, 3]);

        const assumed = tJunction({ highway: 'residential' });
        const layout2 = laneLayout(assumed.entity('w1'), assumed);
        expect(layout2.assumed).toBe(true);
        expect(layout2.lanes[0].width).toBe(3.5);
    });

    it('shifts the carriageway for placement', () => {
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3', placement: 'right_of:1' });
        const layout = laneLayout(graph.entity('w1'), graph);
        // the way runs along the right edge of lane 1, i.e. the boundary between the lanes
        expect(layout.edges[1] + layout.shiftStart).toBeCloseTo(0);
    });

    it('marks lane kinds and roadside', () => {
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'bus:lanes': '|designated', sidewalk: 'right', 'cycleway:left': 'track' });
        const layout = laneLayout(graph.entity('w1'), graph);
        expect(layout.lanes.map(l => l.kind)).toEqual(['general', 'bus']);
        expect(layout.roadside.right.map(s => s.kind)).toEqual(['sidewalk']);
        expect(layout.roadside.left.map(s => s.kind)).toEqual(['cycle_track']);
    });
});


describe('roadGeometry', () => {
    it('splits a road at a junction; the main road runs through and the side road stops at its kerb', () => {
        const graph = tJunction();
        const { pieces, junctions } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const main = pieces.filter(p => p.wayID === 'w1');
        expect(main).toHaveLength(2);
        for (const piece of main) {
            expect(piece.length).toBeCloseTo(100, 0);
            expect(piece.lanes).toHaveLength(4);
            expect(piece.boundaries).toHaveLength(5);
        }
        // the 4-lane main road is about 14 m wide, so the side road is pulled back by about 7 m
        const side = pieces.find(p => p.wayID === 'w2')!;
        expect(side.length).toBeLessThan(95);
        expect(side.length).toBeGreaterThan(90);
        expect(junctions.map(j => j.nodeID)).toEqual(['n2']);
    });

    it('reuses cached pieces until something changes', () => {
        const graph = tJunction();
        const ways = [graph.entity('w1'), graph.entity('w2')];
        const first = roadGeometry(ways, graph).pieces;
        const second = roadGeometry(ways, graph).pieces;
        expect(second[0]).toBe(first[0]);

        // a wider main road pulls the side road further back
        const sideBefore = first.find(p => p.wayID === 'w2')!;
        const edited = graph.replace(graph.entity('w1').update({ tags: { highway: 'primary', lanes: '6' } }));
        const third = roadGeometry([edited.entity('w1'), edited.entity('w2')], edited).pieces;
        expect(third[0]).not.toBe(first[0]);
        const sideAfter = third.find(p => p.wayID === 'w2')!;
        expect(sideAfter).not.toBe(sideBefore);
        expect(polylineLength([[0, 0], [0, sideAfter.length]])).toBeLessThan(sideBefore.length - 2);
    });

    it('puts turn arrows on the approach to the junction', () => {
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|through' });
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const last = pieces.find(p => p.wayID === 'w1' && p.atWayEnd)!;
        const first = pieces.find(p => p.wayID === 'w1' && p.atWayStart)!;
        expect(last.arrows.length).toBeGreaterThan(0);
        expect(first.arrows).toHaveLength(0);
    });
});


describe('roadGeometry at joins and junctions', () => {
    const { throughPair, zipLanes } = _test;

    // a one-way road of 3 lanes continuing as 2 (a lane dropped at the kerb), east-west
    function laneDrop(fromTags: Tags, toTags: Tags) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: fromTags }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: toTags })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        return new iD.coreGraph(entities);
    }
    const frame = metricFrame(origin);
    const y = (loc: [number, number]) => frame.toMetres(loc)[1];

    it('lines up the lanes that carry on where a lane is dropped, and tapers the dropped lane', () => {
        const graph = laneDrop(
            { highway: 'primary', oneway: 'yes', lanes: '3', 'width:lanes': '3|3|3' },
            { highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3' });
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const before = pieces.find(p => p.wayID === 'w1')!;
        const after = pieces.find(p => p.wayID === 'w2')!;
        // right-hand traffic drops the right (kerb) lane: the two left lanes line up across the join
        const end = (line: [number, number][]) => line[line.length - 1];
        expect(y(after.boundaries[0][0])).toBeCloseTo(y(end(before.boundaries[0])), 1);
        expect(y(after.boundaries[1][0])).toBeCloseTo(y(end(before.boundaries[1])), 1);
        // the dropped lane narrows to nothing at the join, and is full width well before it
        expect(y(end(before.boundaries[3]))).toBeCloseTo(y(end(before.boundaries[2])), 1);
        expect(Math.abs(y(before.boundaries[3][0]) - y(before.boundaries[2][0]))).toBeCloseTo(3, 1);
    });

    it('ends the lane marked to merge, keeping the through lane straight on', () => {
        // left-hand traffic (as in the UK): the right lane merges left into the through lane
        const uk = (dx: number, dy: number): [number, number] => [-0.1 + dx * mx, 53.1 + dy * m];
        const entities = [
            new iD.osmNode({ id: 'n1', loc: uk(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: uk(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: uk(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3', 'turn:lanes': 'through|merge_to_left' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '1', width: '3' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const ukFrame = metricFrame(uk(0, 0));
        const yUk = (loc: [number, number]) => ukFrame.toMetres(loc)[1];
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const before = pieces.find(p => p.wayID === 'w1')!;
        const after = pieces.find(p => p.wayID === 'w2')!;
        const end = (line: [number, number][]) => line[line.length - 1];
        // the single lane ahead lines up with the left (through) lane, 1.5 m left (north) of the way
        expect(yUk(after.centres[0][0])).toBeCloseTo(yUk(end(before.centres[0])), 1);
        expect(yUk(after.centres[0][0])).toBeCloseTo(1.5, 1);
        // the merging right lane tapers away to nothing at the join
        expect(yUk(end(before.boundaries[2]))).toBeCloseTo(yUk(end(before.boundaries[1])), 1);
    });

    it('does not move a road that has placement tags', () => {
        const graph = laneDrop(
            { highway: 'primary', oneway: 'yes', lanes: '3', 'width:lanes': '3|3|3' },
            { highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3', placement: 'middle_of:1' });
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const after = pieces.find(p => p.wayID === 'w2')!;
        expect(y(after.centres[0][0])).toBeCloseTo(0, 1);   // lane 1 stays centred on the way
    });

    it('picks the main road through a junction', () => {
        const arms = (specs: [string, number, Tags][]) => specs.map(([id, angle, tags]) => ({
            way: { id, tags }, direction: [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)]
        })) as any;
        // the side road is straighter on with one arm, but the named primary road wins
        expect(throughPair(arms([
            ['a', 0, { highway: 'primary', name: 'High Street' }],
            ['b', 90, { highway: 'residential' }],
            ['c', 175, { highway: 'primary', name: 'High Street' }]
        ]))).toEqual([0, 2]);
        // two roundabout arms always pair, even round a bend
        expect(throughPair(arms([
            ['r1', 0, { highway: 'primary', junction: 'roundabout' }],
            ['x', 110, { highway: 'primary' }],
            ['r2', 120, { highway: 'primary', junction: 'roundabout' }]
        ]))).toEqual([0, 2]);
        expect(throughPair(arms([['a', 0, { highway: 'service' }], ['b', 90, { highway: 'service' }]]))).toBeNull();
    });

    it('pairs lanes one to one, extra lanes merging into the outermost', () => {
        expect(zipLanes([0, 1], 2, true).map(p => [p.from, p.to])).toEqual([[0, 0], [1, 1]]);
        expect(zipLanes([1, 2], 3, false).map(p => [p.from, p.to])).toEqual([[2, 2], [1, 1]]);
        const merging = zipLanes([0, 1, 2], 2, true);
        expect(merging.map(p => [p.from, p.to, !!p.merges])).toEqual([[0, 0, false], [1, 1, false], [2, 1, true]]);
    });

    it('draws guide lines through a junction from turn lanes', () => {
        // one-way main road west to east with a left-turn lane into the side road to the north
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|through' });
        const { connections } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const guides = connections.filter(c => c.kind === 'guide');
        // the left lane turns into the side road, guided along both its edges (3.5 m apart where it
        // starts); the through lane carries straight on (no gap to draw)
        expect(guides).toHaveLength(2);
        for (const guide of guides) {
            expect(guide.key).toContain('w2');
            const line = guide.line.map(frame.toMetres);
            expect(line[line.length - 1][1]).toBeGreaterThan(3);
        }
        const starts = guides.map(g => frame.toMetres(g.line[0]));
        expect(Math.hypot(starts[0][0] - starts[1][0], starts[0][1] - starts[1][1])).toBeGreaterThan(2.5);
    });

    it('starts a slip road where the lane leading into it ends', () => {
        // right-hand traffic: the right lane of three peels off to the north-east
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmNode({ id: 'n4', loc: at(80, -50) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3', 'width:lanes': '3|3|3', 'turn:lanes': 'through|through|slight_right' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n2', 'n4'], tags: { highway: 'primary_link', oneway: 'yes', lanes: '1', 'width:lanes': '3' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2'), graph.entity('w3')], graph);
        // the through road lines up with the two left lanes: 1.5 m to the left of the way
        const through = pieces.find(p => p.wayID === 'w2')!;
        expect(y(through.boundaries[1][0])).toBeCloseTo(1.5, 1);
        // the slip road is shifted right, towards the lane that leads into it
        const slip = pieces.find(p => p.wayID === 'w3')!;
        const startCentre = frame.toMetres(slip.centres[0][0]);
        const d = Math.hypot(80, 50);
        const right = [-50 / d, -80 / d];   // right of the slip road's direction (80, -50)
        const offset = startCentre[0] * right[0] + startCentre[1] * right[1];
        expect(offset).toBeGreaterThan(2);
        expect(offset).toBeLessThan(4);
    });

    it('stops the main road kerb where a side road joins, but not the far kerb', () => {
        const graph = tJunction({ highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3|3' });
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const before = pieces.find(p => p.wayID === 'w1' && p.atWayStart)!;
        const length = (line: [number, number][]) => polylineLength(line.map(frame.toMetres));
        // the side road joins on the left (north) of the eastbound road
        expect(length(before.lines[0])).toBeLessThan(length(before.boundaries[0]) - 2);
        expect(length(before.lines[2])).toBeCloseTo(length(before.boundaries[2]), 1);
        // the line between the lanes stops at the junction box too
        expect(length(before.lines[1])).toBeLessThan(length(before.boundaries[1]) - 2);
    });

    it('merges junctions joined by a short road into one box, and does not draw the link as a road', () => {
        // a dual carriageway (two one-way ways) becomes a two-way road 10 m before a crossroads
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-4, 120) }), new iD.osmNode({ id: 'n2', loc: at(0, 10) }),
            new iD.osmNode({ id: 'n3', loc: at(4, 120) }), new iD.osmNode({ id: 'n4', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n5', loc: at(0, -100) }), new iD.osmNode({ id: 'n6', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n7', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'secondary', oneway: 'yes', name: 'Morningside Drive' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'secondary', oneway: 'yes', name: 'Morningside Drive' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n2', 'n4', 'n5'], tags: { highway: 'secondary', lanes: '2', name: 'Morningside Drive' } }),
            new iD.osmWay({ id: 'w4', nodes: ['n6', 'n4', 'n7'], tags: { highway: 'tertiary', lanes: '2' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const { pieces, innerPieces, junctions } = roadGeometry(['w1', 'w2', 'w3', 'w4'].map(id => graph.entity(id as 'w1')), graph);
        expect(junctions.map(j => j.nodeID)).toEqual(['cluster-n2-n4']);
        const link = pieces.find(p => p.wayID === 'w3' && p.fromNode === 'n2')!;
        expect(innerPieces.has(link)).toBe(true);
        expect(pieces.filter(p => innerPieces.has(p))).toHaveLength(1);
        // at the fork neither carriageway runs through: both stop short of the split node
        const fork = pieces.find(p => p.wayID === 'w1')!;
        const frame = metricFrame(origin);
        const end = frame.toMetres(fork.centres[0][fork.centres[0].length - 1]);
        expect(end[1]).toBeGreaterThan(12);
    });

    it('flags very short roads and keeps arrows on short approach pieces', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-50, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(6, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|right' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const { pieces } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const short = pieces.find(p => p.wayID === 'w2')!;
        expect(short.short).toBe(true);
        expect(pieces.find(p => p.wayID === 'w1')!.short).toBe(false);
        expect(short.arrows).toHaveLength(2);
    });
});


describe('drawing shifts', () => {
    it('holds a join shift near the join, then fades it out along a long way', () => {
        const visual = { start: 2, end: 0, taperStart: null, taperEnd: null };
        expect(visualShift(visual, 0, 1000)).toBeCloseTo(2);
        expect(visualShift(visual, 25, 1000)).toBeCloseTo(2);
        expect(visualShift(visual, 55, 1000)).toBeGreaterThan(0.5);
        expect(visualShift(visual, 90, 1000)).toBeCloseTo(0);
        expect(visualShift(visual, 500, 1000)).toBeCloseTo(0);
        // on a short way it changes over the middle instead
        expect(visualShift(visual, 0, 60)).toBeCloseTo(2);
        expect(visualShift(visual, 60, 60)).toBeCloseTo(0);
    });

    it('fits a road into a mapped carriageway area, and moves its stop line with it', async () => {
        const { streetGeometry } = await import('../../../../modules/lanes/geometry/street');
        // a 2-lane road (7 m) whose mapped carriageway area lies 2 m north of the way
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: { highway: 'stop', direction: 'forward' } }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', lanes: '2', 'width:lanes': '3.5|3.5' } }),
            new iD.osmNode({ id: 'n11', loc: at(-60, -1.5) }),
            new iD.osmNode({ id: 'n12', loc: at(60, -1.5) }),
            new iD.osmNode({ id: 'n13', loc: at(60, 5.5) }),
            new iD.osmNode({ id: 'n14', loc: at(-60, 5.5) }),
            new iD.osmWay({ id: 'w2', nodes: ['n11', 'n12', 'n13', 'n14', 'n11'], tags: { 'area:highway': 'primary' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const frame = metricFrame(origin);
        const { pieces, visuals } = roadGeometry([graph.entity('w1')], graph, [graph.entity('w2')]);
        const piece = pieces[0];
        // in the middle of the area the kerbs are at the area's edges
        const mid = (line: [number, number][]) => frame.toMetres(line[Math.floor(line.length / 2)])[1];
        const atMiddle = (k: number) => {
            const ys = piece.boundaries[k].map(p => frame.toMetres(p)).filter(p => Math.abs(p[0]) < 1).map(p => p[1]);
            return ys.length ? ys[0] : mid(piece.boundaries[k]);
        };
        expect(atMiddle(0)).toBeCloseTo(5.5, 0);
        expect(atMiddle(2)).toBeCloseTo(-1.5, 0);
        // far beyond the area the road is back on its way
        expect(frame.toMetres(piece.boundaries[0][0])[1]).toBeCloseTo(3.5, 0);

        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph, visuals);
        const stop = street.markings.find(m => m.kind === 'stop_line')!;
        const ys = stop.points.map(p => frame.toMetres(p)[1]).sort((a, b) => a - b);
        // the forward lane is the south one: from the area's south edge to its middle
        expect(ys[0]).toBeCloseTo(-1.5, 0);
        expect(ys[1]).toBeCloseTo(2, 0);
    });
});


describe('streetGeometry', () => {
    it('draws footways at their width, crossings, stop lines and mapped kerbs', async () => {
        const { streetGeometry, crossingMarkings } = await import('../../../../modules/lanes/geometry/street');
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: { highway: 'crossing', 'crossing:markings': 'zebra', 'crossing:island': 'yes' } }),
            new iD.osmNode({ id: 'n3', loc: at(90, 0), tags: { highway: 'stop' } }),
            new iD.osmNode({ id: 'n4', loc: at(100, 0) }),
            new iD.osmNode({ id: 'n5', loc: at(-100, 8) }), new iD.osmNode({ id: 'n6', loc: at(100, 8) }),
            new iD.osmNode({ id: 'n7', loc: at(-100, 6) }), new iD.osmNode({ id: 'n8', loc: at(100, 6) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4'], tags: { highway: 'primary', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n5', 'n6'], tags: { highway: 'footway', footway: 'sidewalk', width: '3' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n7', 'n8'], tags: { barrier: 'kerb', kerb: 'lowered' } })
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph);

        expect(street.paths.map(p => [p.id, p.kind])).toEqual([['w2', 'sidewalk']]);
        expect(street.kerbs.map(k => [k.id, k.kerb])).toEqual([['w3', 'lowered']]);

        const kinds = street.markings.map(m => m.kind);
        expect(kinds).toContain('crossing');
        expect(kinds.filter(k => k === 'zebra_bar').length).toBeGreaterThan(4);
        expect(kinds).toContain('island');
        // a stop sign near the end of a two-way road faces the forward lane only
        expect(street.markings.filter(m => m.kind === 'stop_line').map(m => m.key)).toEqual(['n3-stop_line-forward']);
        expect(street.symbols.filter(s => s.kind === 'stop_text')).toHaveLength(1);

        expect(crossingMarkings({ crossing: 'traffic_signals' })).toBe('lines');
        expect(crossingMarkings({ 'crossing:markings': 'no', crossing: 'zebra' })).toBe('none');
    });
});
