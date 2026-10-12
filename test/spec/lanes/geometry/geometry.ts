import { offsetPolyline, metricFrame, polylineLength } from '../../../../modules/lanes/geometry/frame';
import { laneLayout, parseWidth } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

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
    it('splits a road at a junction and pulls it back by the side road', () => {
        const graph = tJunction();
        const { pieces, junctions } = roadGeometry([graph.entity('w1'), graph.entity('w2')], graph);
        const main = pieces.filter(p => p.wayID === 'w1');
        expect(main).toHaveLength(2);
        // each half of the 100 m road is shortened by about half the 6 m side road
        for (const piece of main) {
            expect(piece.length).toBeLessThan(98);
            expect(piece.length).toBeGreaterThan(90);
            expect(piece.lanes).toHaveLength(4);
            expect(piece.boundaries).toHaveLength(5);
        }
        expect(junctions.map(j => j.nodeID)).toEqual(['n2']);
    });

    it('reuses cached pieces until something changes', () => {
        const graph = tJunction();
        const ways = [graph.entity('w1'), graph.entity('w2')];
        const first = roadGeometry(ways, graph).pieces;
        const second = roadGeometry(ways, graph).pieces;
        expect(second[0]).toBe(first[0]);

        const edited = graph.replace(graph.entity('w2').update({ tags: { highway: 'residential', lanes: '4', width: '12' } }));
        const third = roadGeometry([edited.entity('w1'), edited.entity('w2')], edited).pieces;
        expect(third[0]).not.toBe(first[0]);
        const main = third.filter(p => p.wayID === 'w1');
        expect(polylineLength([[0, 0], [0, main[0].length]])).toBeLessThan(95);
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
