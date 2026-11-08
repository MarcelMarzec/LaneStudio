import { laneLayout, stripOnCarriageway } from '../../../../modules/lanes/geometry/layout';
import { crossingMarkingList, crossingMarks, nearestJunction } from '../../../../modules/lanes/geometry/street';
import { contraflowSide, cyclewayValue, hasOldCycleways, upgradeOldCycleways } from '../../../../modules/lanes/core/roadside';
import { laneKindFromValues, laneKindOf, setLaneKind } from '../../../../modules/lanes/model/kinds';
import { parseLanes } from '../../../../modules/lanes/model';
import { roadSpeedFor, speedClassOf } from '../../../../modules/lanes/core/lane_speed';

// a straight road in Leicester (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const origin: [number, number] = [-1.13, 52.63];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];

function road(tags: Tags) {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(100, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
    ];
    const graph = new iD.coreGraph(entities);
    return { graph, way: graph.entity('w1') };
}

const stripsOf = (tags: Tags, side: 'left' | 'right') => {
    const { graph, way } = road(tags);
    return laneLayout(way, graph).roadside[side];
};


describe('road width, kerb to kerb (wiki: Key:width)', () => {
    it('takes parking and cycle lanes on the road out of the width before sharing it among the lanes', () => {
        const { graph, way } = road({ highway: 'residential', lanes: '2', width: '10', 'parking:both': 'lane', 'cycleway:left': 'lane' });
        const layout = laneLayout(way, graph);
        // 10 m less 2.2 m of parking each side and a 1.5 m cycle lane
        expect(layout.lanes[0].width).toBeCloseTo((10 - 4.4 - 1.5) / 2);
        const strips = [...layout.roadside.left, ...layout.roadside.right].filter(stripOnCarriageway).reduce((sum, s) => sum + s.width, 0);
        expect(layout.total + strips).toBeCloseTo(10);
    });

    it('counts half of half-on-kerb parking, and leaves out bays beside the road and parking on the pavement', () => {
        const half = road({ highway: 'residential', lanes: '2', width: '7', 'parking:both': 'half_on_kerb' });
        expect(laneLayout(half.way, half.graph).lanes[0].width).toBeCloseTo((7 - 2.2) / 2);
        const bays = road({ highway: 'residential', lanes: '2', width: '7', 'parking:both': 'street_side' });
        expect(laneLayout(bays.way, bays.graph).lanes[0].width).toBeCloseTo(3.5);
    });

    it('shares what tagged lane widths leave among the other lanes', () => {
        const { graph, way } = road({ highway: 'primary', lanes: '3', oneway: 'yes', width: '10', 'width:lanes': '3||' });
        const layout = laneLayout(way, graph);
        expect(layout.lanes.map(l => l.width)).toEqual([3, 3.5, 3.5]);
    });

    it('keeps sharing the tagged width when it is too narrow for its strips', () => {
        const { graph, way } = road({ highway: 'residential', lanes: '2', width: '5', 'parking:both': 'lane' });
        expect(laneLayout(way, graph).lanes[0].width).toBeCloseTo(2.5);
    });

    it('reads width:carriageway and est_width', () => {
        const a = road({ highway: 'residential', lanes: '2', 'width:carriageway': '8' });
        expect(laneLayout(a.way, a.graph).total).toBeCloseTo(8);
        const b = road({ highway: 'residential', lanes: '2', est_width: '6' });
        expect(laneLayout(b.way, b.graph).total).toBeCloseTo(6);
    });
});


describe('cycleways', () => {
    it('reads cycle lane and track widths', () => {
        expect(stripsOf({ highway: 'primary', 'cycleway:left': 'lane', 'cycleway:left:width': '2' }, 'left')[0])
            .toMatchObject({ kind: 'cycle_lane', width: 2, assumed: false });
        expect(stripsOf({ highway: 'primary', 'cycleway:both': 'track', 'cycleway:both:width': '3' }, 'right')
            .find(s => s.kind === 'cycle_track')).toMatchObject({ width: 3, assumed: false });
    });

    it('draws an old contraflow lane on one side only, where its cycles keep to', () => {
        // one-way along the way in the UK: traffic keeps left, so cycles coming the other way keep to the way's right
        const tags = { highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' };
        expect(stripsOf(tags, 'right').some(s => s.kind === 'cycle_lane')).toBe(true);
        expect(stripsOf(tags, 'left').some(s => s.kind === 'cycle_lane')).toBe(false);
        expect(contraflowSide('forward', 'right')).toBe('left');
        expect(contraflowSide('backward', 'left')).toBe('left');
        expect(contraflowSide(false, 'left')).toBe(null);
        expect(cyclewayValue(tags, 'left', 'right')).toBeUndefined();
    });

    it('upgrades the old opposite_* values', () => {
        const tags = { highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' };
        expect(hasOldCycleways(tags)).toBe(true);
        expect(upgradeOldCycleways(tags, 'right')).toEqual({
            highway: 'residential', oneway: 'yes', 'cycleway:right': 'lane', 'cycleway:right:oneway': '-1', 'oneway:bicycle': 'no'
        });
        expect(upgradeOldCycleways({ highway: 'residential', oneway: 'yes', 'cycleway:left': 'opposite_track', 'cycleway:right': 'lane' }, 'left'))
            .toEqual({ highway: 'residential', oneway: 'yes', 'cycleway:left': 'track', 'cycleway:left:oneway': '-1', 'cycleway:right': 'lane', 'oneway:bicycle': 'no' });
        expect(hasOldCycleways({ cycleway: 'lane' })).toBe(false);
    });

    it('puts the kerb outside a painted cycle lane', () => {
        // the strip is on the carriageway, so it counts in the road's width
        const { graph, way } = road({ highway: 'residential', lanes: '2', width: '8', 'cycleway:both': 'lane' });
        expect(laneLayout(way, graph).lanes[0].width).toBeCloseTo(2.5);
    });
});


describe('lane types (wiki: Lanes)', () => {
    it('reads designated lanes', () => {
        expect(laneKindFromValues({ 'bus:lanes': 'designated' })).toBe('bus');
        expect(laneKindFromValues({ 'psv:lanes': 'designated' })).toBe('psv');
    });

    it('reads a lane closed to general traffic and open to one kind of traffic as kept for it', () => {
        expect(laneKindFromValues({ 'access:lanes': 'no', 'bus:lanes': 'yes' })).toBe('bus');
        expect(laneKindFromValues({ 'motor_vehicle:lanes': 'no', 'psv:lanes': 'yes' })).toBe('psv');
        expect(laneKindFromValues({ 'vehicle:lanes': 'no', 'bicycle:lanes': 'yes' })).toBe('bicycle');
        expect(laneKindFromValues({ 'access:lanes': 'no' })).toBe('restricted');
        // open to buses but not closed to anyone: general traffic
        expect(laneKindFromValues({ 'bus:lanes': 'yes' })).toBe('general');
    });

    it('reads cycleway:lanes=lane as a cycle lane, and a busway as bus lanes', () => {
        expect(laneKindFromValues({ 'cycleway:lanes': 'lane' })).toBe('bicycle');
        expect(laneKindFromValues({}, 'busway')).toBe('bus');
        const { graph, way } = road({ highway: 'busway', lanes: '2' });
        expect(laneLayout(way, graph).lanes.map(l => l.kind)).toEqual(['bus', 'bus']);
    });

    it('opens a closed lane again when it becomes general traffic', () => {
        const model = parseLanes({ highway: 'primary', oneway: 'yes', lanes: '2', 'access:lanes': 'no|yes', 'bus:lanes': 'yes|' });
        const ref = { direction: 'forward' as const, index: 0 };
        expect(laneKindOf(model, ref)).toBe('bus');
        const next = setLaneKind(model, [ref], 'general');
        expect(laneKindOf(next, ref)).toBe('general');
        expect(next.lanes.forward[0].values['access:lanes']).toBe('');
    });
});


describe('blank lane slots take the road\'s plain key', () => {
    it('turns every lane by plain turn=*, and keeps a lane\'s own', () => {
        const { graph, way } = road({ highway: 'primary', oneway: 'yes', lanes: '2', turn: 'right', 'turn:lanes': 'left|' });
        expect(laneLayout(way, graph).lanes.map(l => l.turn)).toEqual(['left', 'right']);
    });

    it('reads turn:forward and turn:backward', () => {
        const { graph, way } = road({ highway: 'primary', lanes: '2', 'turn:forward': 'through', 'turn:backward': 'left' });
        const lanes = laneLayout(way, graph).lanes;
        expect(lanes.find(l => l.ref.direction === 'forward')!.turn).toBe('through');
        expect(lanes.find(l => l.ref.direction === 'backward')!.turn).toBe('left');
    });

    it('labels lanes with destination on one-way roads and destination:forward on two-way ones', () => {
        const oneway = road({ highway: 'primary', oneway: 'yes', lanes: '2', destination: 'Leicester' });
        expect(laneLayout(oneway.way, oneway.graph).lanes[1]).toMatchObject({ inherited: ['destination:lanes'] });
        const twoway = road({ highway: 'primary', lanes: '2', destination: 'Leicester', 'destination:backward': 'Hinckley' });
        const lanes = laneLayout(twoway.way, twoway.graph).lanes;
        expect(lanes.find(l => l.ref.direction === 'forward')!.values['destination:lanes']).toBeUndefined();
        expect(lanes.find(l => l.ref.direction === 'backward')!.values['destination:lanes']).toBe('Hinckley');
    });
});


describe('speed limits for one direction (wiki: Key:maxspeed)', () => {
    it('colours each direction by its own limit', () => {
        const { way } = road({ highway: 'primary', 'maxspeed:forward': '30 mph', 'maxspeed:backward': '40 mph' });
        expect(speedClassOf(undefined, way, 'maxspeed', 'forward')).toBe(30);
        expect(speedClassOf(undefined, way, 'maxspeed', 'backward')).toBe(40);
        expect(speedClassOf(undefined, way)).toBe(30);
        expect(roadSpeedFor({ maxspeed: '50 mph', 'maxspeed:backward': '40 mph' }, 'maxspeed', 'forward')).toBe('50 mph');
    });
});


describe('stop and give way with no direction', () => {
    it('faces the nearest junction along the road, not the nearer end by node count', () => {
        // nodes bunched near the start, a junction at the far end 30 m on, the start a dead end
        const entities = [
            new iD.osmNode({ id: 'n11', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n12', loc: at(5, 0) }),
            new iD.osmNode({ id: 'n13', loc: at(10, 0) }),
            new iD.osmNode({ id: 'n14', loc: at(15, 0) }),
            new iD.osmNode({ id: 'n15', loc: at(70, 0) }),
            new iD.osmNode({ id: 'n16', loc: at(70, 50) }),
            new iD.osmWay({ id: 'w1', nodes: ['n11', 'n12', 'n13', 'n14', 'n15'], tags: { highway: 'residential' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n15', 'n16'], tags: { highway: 'primary' } })
        ];
        const graph = new iD.coreGraph(entities);
        expect(nearestJunction(graph.entity('w1'), 1, graph)).toBe('forward');
        expect(nearestJunction(graph.entity('w2'), 1, graph)).toBe('backward');
        expect(nearestJunction(graph.entity('w2'), 0, graph)).toBeUndefined();
    });
});


describe('crossing markings (wiki: Key:crossing:markings)', () => {
    it('paints UK signal crossings with studs, elsewhere with lines', () => {
        expect(crossingMarkingList({ highway: 'crossing', crossing: 'traffic_signals' }, true)).toEqual(['dots']);
        expect(crossingMarkingList({ highway: 'crossing', crossing_ref: 'puffin' }, true)).toEqual(['dots']);
        expect(crossingMarkingList({ highway: 'crossing', crossing: 'traffic_signals' }, false)).toEqual(['lines']);
        expect(crossingMarkingList({ highway: 'crossing', crossing: 'traffic_signals', 'crossing:markings': 'zebra' }, true)).toEqual(['zebra']);
    });

    it('reads several markings at once', () => {
        expect(crossingMarkingList({ 'crossing:markings': 'zebra;dots' })).toEqual(['zebra', 'dots']);
        expect(crossingMarkingList({ 'crossing:markings': 'no;zebra' })).toEqual(['none']);
    });

    it('draws a tiger crossing as a zebra with a cycle crossing beside it', () => {
        expect(crossingMarkingList({ highway: 'crossing', crossing: 'uncontrolled', crossing_ref: 'tiger' })).toEqual(['tiger']);
        const marks = crossingMarks('tiger', 10, 5);
        expect(marks.some(mark => mark.cls.includes('elephant'))).toBe(true);
        expect(marks.filter(mark => mark.cls.includes('zebra_bar')).every(mark => mark.points.every(([, u]) => u <= 0.4))).toBe(true);
    });

    it('colours the marks by crossing:markings:colour', () => {
        const marks = crossingMarks('zebra_bicolour', 4, 3, 'yellow');
        expect(marks[1].cls).toContain('alt colour-yellow');
        expect(marks[0].cls).not.toContain('colour');
    });
});
