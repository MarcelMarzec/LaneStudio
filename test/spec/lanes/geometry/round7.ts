import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { bearingOf, parseTrafficSign, signGeometry } from '../../../../modules/lanes/geometry/signs';
import { shoulderValue, withShoulder } from '../../../../modules/lanes/core/roadside';
import { parseLanes, serialiseLanes, setLaneKind } from '../../../../modules/lanes/model';
import { signCode, signTags, turnedRound, withSignCode } from '../../../../modules/lanes/model/signs';
import { actionAddSign } from '../../../../modules/lanes/actions/add_sign';

// near Skegness (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay | typeof iD.osmRelation>;
function graphOf(entities: Entity[]) {
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities);
}
const entitiesOf = (graph: ReturnType<typeof graphOf>) => Object.values(graph.base().entities).filter(Boolean) as Parameters<typeof signGeometry>[0];

/** A two-way road running east from (-50, 0) to (50, 0), with a node in the middle */
const eastRoad = (tags: Tags, middle: Tags = {}) => [
    new iD.osmNode({ id: 'n1', loc: at(-50, 0) }),
    new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: middle }),
    new iD.osmNode({ id: 'n3', loc: at(50, 0) }),
    new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', ...tags } })
];


describe('hard shoulders', () => {
    it('reads shoulder=* for each side; a plain yes on a one-way road is on the driving side', () => {
        expect(shoulderValue({ shoulder: 'both' }, 'left')).toBe('yes');
        expect(shoulderValue({ shoulder: 'left' }, 'right')).toBe('no');
        expect(shoulderValue({ shoulder: 'yes' }, 'right', 'left')).toBe('no');
        expect(shoulderValue({ shoulder: 'yes' }, 'left', 'left')).toBe('yes');
        expect(shoulderValue({ shoulder: 'yes', 'shoulder:right': 'no' }, 'right')).toBe('no');
        expect(shoulderValue({}, 'left')).toBeUndefined();
    });

    it('writes one side at a time as shoulder=left/right/both/no', () => {
        expect(withShoulder({}, 'left', 'yes')).toEqual({ shoulder: 'left' });
        expect(withShoulder({ shoulder: 'left' }, 'right', 'yes')).toEqual({ shoulder: 'both' });
        expect(withShoulder({ shoulder: 'both' }, 'left', 'no')).toMatchObject({ shoulder: 'right' });
        expect(withShoulder({ shoulder: 'right' }, 'right', 'no')).toEqual({ shoulder: 'no' });
    });

    it('lays a shoulder strip beside the carriageway, on the left of a one-way road in the UK', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-50, 0) }), new iD.osmNode({ id: 'n2', loc: at(50, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'motorway', oneway: 'yes', lanes: '3', shoulder: 'yes', sidewalk: 'no' } })
        ]);
        const layout = laneLayout(graph.entity('w1'), graph);
        expect(layout.roadside.left[0]).toMatchObject({ kind: 'shoulder', width: 2.5 });
        expect(layout.roadside.right.some(s => s.kind === 'shoulder')).toBe(false);
    });

    it('takes the shoulder width from shoulder:<side>:width or shoulder:width', () => {
        const graph = graphOf(eastRoad({ lanes: '2', shoulder: 'both', 'shoulder:width': '1.5', 'shoulder:right:width': '3' }));
        const layout = laneLayout(graph.entity('w1'), graph);
        expect(layout.roadside.left[0]).toMatchObject({ kind: 'shoulder', width: 1.5 });
        expect(layout.roadside.right[0]).toMatchObject({ kind: 'shoulder', width: 3 });
    });
});


describe('variable-access lanes', () => {
    const tags = { highway: 'motorway', oneway: 'yes', lanes: '4', 'access:lanes': 'variable|yes|yes|yes' };

    it('reads access:lanes=variable as a lane type of its own', () => {
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(-50, 0) }), new iD.osmNode({ id: 'n2', loc: at(50, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
        ]);
        const kinds = laneLayout(graph.entity('w1'), graph).lanes.map(l => l.kind);
        expect(kinds).toEqual(['variable', 'general', 'general', 'general']);
    });

    it('paints a lane variable, and back, keeping other access values', () => {
        const model = parseLanes({ ...tags, 'access:lanes': 'yes|yes|yes|no' }, { driveSide: 'left' });
        const painted = serialiseLanes(setLaneKind(model, [{ direction: 'forward', index: 0 }], 'variable'), tags);
        expect(painted['access:lanes']).toBe('variable|yes|yes|no');
        const back = parseLanes(painted, { driveSide: 'left' });
        const general = serialiseLanes(setLaneKind(back, [{ direction: 'forward', index: 0 }], 'general'), painted);
        expect(general['access:lanes']).toBe('|yes|yes|no');
    });
});


describe('traffic sign values', () => {
    it('splits several signs, carrying the country prefix and bracketed values', () => {
        expect(parseTrafficSign('GB:670[40],954')).toEqual([{ code: 'GB:670', value: '40' }, { code: 'GB:954', value: undefined }]);
        expect(parseTrafficSign('GB:629.2[4.2m];GB:616')).toEqual([{ code: 'GB:629.2', value: '4.2m' }, { code: 'GB:616', value: undefined }]);
        expect(parseTrafficSign('stop')).toEqual([{ code: 'stop', value: undefined }]);
        expect(parseTrafficSign('none')).toEqual([]);
    });

    it('reads bearings, compass points and ranges', () => {
        expect(bearingOf('90')).toBe(90);
        expect(bearingOf('SW')).toBe(225);
        expect(bearingOf('350-10')).toBe(0);
        expect(bearingOf('forward')).toBeNull();
    });

    it('edits the first sign on a post, keeping the rest', () => {
        expect(signCode({ traffic_sign: 'GB:670[40];GB:954' })).toEqual({ code: 'GB:670', value: '40' });
        expect(withSignCode({ traffic_sign: 'GB:670[40];GB:954' }, 'GB:629', '2.1 m').traffic_sign).toBe('GB:629[2.1 m];GB:954');
        expect(withSignCode({ traffic_sign: 'GB:629[2.1 m]' }, 'GB:616', '2.1 m').traffic_sign).toBe('GB:616');
    });

    it('turns a sign round', () => {
        expect(turnedRound({ direction: '270' }).direction).toBe('90');
        expect(turnedRound({ 'traffic_sign:direction': 'forward' })['traffic_sign:direction']).toBe('backward');
        expect(turnedRound({ 'camera:direction': '45' })['camera:direction']).toBe('225');
    });

    it('tags what the Signs tool places', () => {
        expect(signTags('GB:670', '40 mph')).toEqual({ traffic_sign: 'GB:670', maxspeed: '40 mph' });
        expect(signTags('message', undefined)).toEqual({ traffic_sign: 'variable_message' });
        expect(signTags('camera:speed', '50 mph')).toEqual({ highway: 'speed_camera', maxspeed: '50 mph' });
        expect(signTags('camera:red_light', undefined)).toMatchObject({ man_made: 'surveillance', 'surveillance:zone': 'traffic' });
    });
});


describe('sign placement', () => {
    it('stands a sign on a road node at the near-side kerb of its traffic, facing it', () => {
        // forward traffic runs east; in the UK its near side is the north kerb, and the sign faces west
        const graph = graphOf(eastRoad({ lanes: '2' }, { traffic_sign: 'GB:670[30]', direction: 'forward' }));
        const { signs } = signGeometry(entitiesOf(graph), graph);
        expect(signs).toHaveLength(1);
        const [x, y] = frame.toMetres(signs[0].anchor);
        expect(Math.abs(x)).toBeLessThan(0.1);
        expect(y).toBeGreaterThan(3);
        expect(signs[0].facing).toBeCloseTo(270);
        expect(signs[0].faces).toEqual([{ code: 'GB:670', value: '30' }]);
    });

    it('fills in a speed limit sign without a number from the road', () => {
        const graph = graphOf(eastRoad({ lanes: '2', maxspeed: '40 mph' }, { traffic_sign: 'GB:670', direction: 'backward' }));
        const { signs } = signGeometry(entitiesOf(graph), graph);
        expect(signs[0].faces[0]).toEqual({ code: 'GB:670', value: '40' });
        // backward traffic runs west: its near side is the south kerb, and the sign faces east
        expect(frame.toMetres(signs[0].anchor)[1]).toBeLessThan(-3);
        expect(signs[0].facing).toBeCloseTo(90);
    });

    it('draws message signs on a gantry overhead, and the gantry itself', () => {
        const graph = graphOf([
            ...eastRoad({ lanes: '2' }),
            new iD.osmNode({ id: 'n11', loc: at(10, 8) }), new iD.osmNode({ id: 'n12', loc: at(10, 0), tags: { traffic_sign: 'variable_message', direction: '270' } }),
            new iD.osmNode({ id: 'n13', loc: at(10, -8) }),
            new iD.osmWay({ id: 'w2', nodes: ['n11', 'n12', 'n13'], tags: { man_made: 'gantry' } })
        ]);
        const { signs, gantries } = signGeometry(entitiesOf(graph), graph);
        expect(gantries.map(g => g.id)).toEqual(['w2']);
        expect(signs).toHaveLength(1);
        expect(signs[0]).toMatchObject({ kind: 'message', overhead: true, facing: 270 });
    });

    it('finds cameras and the stretch an average speed system covers', () => {
        const graph = graphOf([
            ...eastRoad({ lanes: '2', maxspeed: '50 mph' }),
            new iD.osmNode({ id: 'c1', loc: at(-30, 6), tags: { highway: 'speed_camera', direction: '270', maxspeed: '50 mph' } }),
            new iD.osmNode({ id: 'c2', loc: at(-40, 6), tags: { man_made: 'surveillance', 'surveillance:type': 'camera' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'enforcement', enforcement: 'average_speed', maxspeed: '50 mph' }, members: [
                { id: 'c2', type: 'node', role: 'device' }, { id: 'n1', type: 'node', role: 'from' }, { id: 'n3', type: 'node', role: 'to' }
            ] })
        ]);
        const { signs, sections } = signGeometry(entitiesOf(graph), graph);
        const byNode = Object.fromEntries(signs.map(s => [s.nodeID, s]));
        expect(byNode.c1).toMatchObject({ kind: 'camera', camera: 'speed', facing: 270 });
        expect(byNode.c1.faces).toEqual([{ code: 'maxspeed', value: '50' }]);
        expect(byNode.c2).toMatchObject({ kind: 'camera', camera: 'average_speed' });
        expect(sections).toHaveLength(1);
        const line = sections[0].line.map(frame.toMetres);
        expect(line[0][0]).toBeCloseTo(-50, 0);
        expect(line[line.length - 1][0]).toBeCloseTo(50, 0);
    });
});


describe('actionAddSign', () => {
    const road = () => graphOf([
        new iD.osmNode({ id: 'n1', loc: at(-50, 0) }), new iD.osmNode({ id: 'n2', loc: at(50, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', lanes: '2', sidewalk: 'both', maxspeed: '30 mph' } })
    ]);

    it('puts a sign beyond the pavement on the near side of the clicked traffic, facing it', () => {
        const graph = road();
        const forward = actionAddSign('w1', at(10, 1), 'forward', 'GB:670', graph);
        const node = forward.action(graph).entity(forward.nodeID);
        const [x, y] = frame.toMetres(node.loc);
        const layout = laneLayout(graph.entity('w1'), graph);
        const pavement = layout.roadside.left.reduce((sum, s) => sum + s.width, 0);
        expect(x).toBeCloseTo(10, 0);
        // north of the road: beyond the kerb and pavement
        expect(y).toBeCloseTo(-layout.edges[0] + pavement + 0.8, 1);
        expect(node.tags).toEqual({ traffic_sign: 'GB:670', maxspeed: '30 mph', direction: '270' });

        const backward = actionAddSign('w1', at(10, -1), 'backward', 'camera:speed', graph);
        const camera = backward.action(graph).entity(backward.nodeID);
        expect(frame.toMetres(camera.loc)[1]).toBeLessThan(-3);
        expect(camera.tags).toEqual({ highway: 'speed_camera', maxspeed: '30 mph', direction: '90' });
    });

    it('makes a red light camera the device of an enforcement relation', () => {
        const graph = road();
        const { action, nodeID } = actionAddSign('w1', at(0, 0), 'forward', 'camera:red_light', graph);
        const after = action(graph);
        const node = after.entity(nodeID);
        expect(node.tags['camera:direction']).toBe('270');
        const relations = after.parentRelations(node);
        expect(relations).toHaveLength(1);
        expect(relations[0].tags).toEqual({ type: 'enforcement', enforcement: 'traffic_signals' });
        expect(relations[0].members).toEqual([{ id: nodeID, type: 'node', role: 'device' }]);
    });
});
