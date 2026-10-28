import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { levelCrossingOf, railFeatures } from '../../../../modules/lanes/geometry/rail_features';
import { parkingSpaceGeometry, parkingSpaceKind } from '../../../../modules/lanes/geometry/parking_spaces';
import { railKind, trackShape } from '../../../../modules/lanes/geometry/railway';

// Boston, Lincolnshire (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.977 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-0.0318 + dx * mx, 52.977 + dy * m];
const frame = metricFrame(at(0, 0));

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
// @ts-expect-error -- the constructor also takes a list of entities
const graphOf = (entities: Entity[]) => new iD.coreGraph(entities) as iD.Graph;

describe('railway features', () => {
    // Sleaford Road crossing two tracks (as at Boston station), each with its own level crossing node
    function crossing(barrier: string, extra: Tags = {}) {
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n101', loc: at(-40, 0) }), new iD.osmNode({ id: 'n102', loc: at(40, 0) }),
            new iD.osmNode({ id: 'n1', loc: at(-2, 0), tags: { railway: 'level_crossing', 'crossing:barrier': barrier, ...extra } }),
            new iD.osmNode({ id: 'n2', loc: at(2, 0), tags: { railway: 'level_crossing', 'crossing:barrier': barrier, ...extra } }),
            new iD.osmNode({ id: 'n11', loc: at(-2, -50) }), new iD.osmNode({ id: 'n12', loc: at(-2, 50) }),
            new iD.osmNode({ id: 'n13', loc: at(2, -50) }), new iD.osmNode({ id: 'n14', loc: at(2, 50) }),
            new iD.osmWay({ id: 'w1', nodes: ['n101', 'n1', 'n2', 'n102'], tags: { highway: 'primary', name: 'Sleaford Road' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n11', 'n1', 'n12'], tags: { railway: 'rail' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n13', 'n2', 'n14'], tags: { railway: 'rail' } })
        ];
        const graph = graphOf(entities);
        return railFeatures(entities.map(e => graph.entity(e.id)), graph);
    }

    it('draws a level crossing\'s panels and rails over each track, and its barriers outside them both', () => {
        const { overRoad, symbols } = crossing('double_half');
        expect(overRoad.filter(s => s.part.startsWith('crossing-deck'))).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-rail')).toHaveLength(4);
        // two booms each side, the west side's at n1, the east side's at n2, each pivoting on a barrier machine
        const pedestals = overRoad.filter(s => s.part === 'crossing-pedestal');
        expect(pedestals).toHaveLength(4);
        const xs = pedestals.map(p => Math.round(p.points.map(q => frame.toMetres(q)[0]).reduce((a, b) => a + b) / p.points.length));
        expect(xs.every(x => x < -4 || x > 4)).toBe(true);
        // booms in red and white bands, with red lamps along them
        expect(overRoad.filter(s => s.part === 'crossing-boom-red').length).toBeGreaterThan(4);
        expect(overRoad.filter(s => s.part === 'crossing-boom-white').length).toBeGreaterThan(4);
        expect(overRoad.filter(s => s.part === 'crossing-boom-lamp')).toHaveLength(12);
        // the road traffic light signals on each side, facing the traffic coming in, with no St Andrew's cross
        expect(symbols.map(s => s.kind)).toEqual(['crossing-lights', 'crossing-lights']);
        expect(symbols.map(s => Math.round(s.facing)).sort((a, b) => a - b)).toEqual([90, 270]);
        expect(symbols.some(s => s.cross)).toBe(false);
        // the stop line on each side, and no centre lines of its own (the road's are drawn with the road)
        expect(overRoad.filter(s => s.part === 'crossing-stop-line')).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-centre-line')).toHaveLength(0);
    });

    it('draws a half barrier across only the lanes coming in, on the left of the traffic', () => {
        const { overRoad } = crossing('half');
        // the east side (n2): traffic coming in drives west, keeping left, on the south half of the road
        const east = overRoad.filter(s => s.part.startsWith('crossing-boom-') && s.key.startsWith('n2-'))
            .flatMap(s => s.points.map(p => frame.toMetres(p)[1]));
        expect(east.length).toBeGreaterThan(0);
        expect(Math.max(...east)).toBeLessThan(0.5);
    });

    it('puts a St Andrew\'s cross over the lights of an open crossing, and draws one with nothing tagged as panels and rails', () => {
        const lights = crossing('no', { 'crossing:light': 'yes' });
        expect(lights.overRoad.filter(s => s.part.startsWith('crossing-boom'))).toHaveLength(0);
        expect(lights.symbols.map(s => s.cross)).toEqual([true, true]);
        expect(lights.overRoad.filter(s => s.part === 'crossing-stop-line')).toHaveLength(2);
        const none = crossing('no');
        expect(none.overRoad.filter(s => s.part.startsWith('crossing-boom') || s.part === 'crossing-stop-line')).toHaveLength(0);
        expect(none.overRoad.filter(s => s.part.startsWith('crossing-deck'))).toHaveLength(2);
        expect(none.symbols).toHaveLength(0);
    });

    it('reads a level crossing\'s equipment from its tags', () => {
        expect(levelCrossingOf({ 'crossing:barrier': 'yes' })).toMatchObject({ barrier: 'full', lights: true, saltire: false });
        expect(levelCrossingOf({ crossing_barrier: 'yes' }).barrier).toBe('full');
        expect(levelCrossingOf({ crossing: 'uncontrolled' })).toMatchObject({ barrier: 'no', lights: false, saltire: true });
        expect(levelCrossingOf({ 'crossing:barrier': 'half', 'crossing:light': 'no' }).lights).toBe(false);
        expect(levelCrossingOf({ 'crossing:barrier': 'gates', 'crossing:activation': 'user' })).toMatchObject({ user: true, lights: false });
        expect(levelCrossingOf({ crossing: 'informal', 'crossing:barrier': 'full' })).toMatchObject({ informal: true, barrier: 'no', lights: false });
        expect(levelCrossingOf({ 'crossing:whistle': 'wayside', 'crossing:surface': 'rubber' })).toMatchObject({ whistle: true, surface: 'rubber' });
    });

    it('draws full barriers as two booms meeting in the middle on each side', () => {
        const { overRoad } = crossing('full');
        expect(overRoad.filter(s => s.part === 'crossing-pedestal')).toHaveLength(4);
    });

    it('draws a user worked crossing\'s gates, braced and with their swing, and its miniature warning lights', () => {
        const { overRoad, symbols } = crossing('gates', { 'crossing:activation': 'user', 'crossing:light': 'yes' });
        expect(overRoad.filter(s => s.part === 'crossing-gate')).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-gate-brace')).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-gate-swing')).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-gate-target')).toHaveLength(0);
        expect(symbols.map(s => s.kind)).toEqual(['crossing-mwl', 'crossing-mwl']);
    });

    it('gives an open crossing a St Andrew\'s cross and give way lines, and an informal one nothing but rails', () => {
        const open = crossing('no', { crossing: 'uncontrolled' });
        expect(open.symbols.map(s => s.kind)).toEqual(['crossing-saltire', 'crossing-saltire']);
        expect(open.overRoad.filter(s => s.part === 'crossing-give-way-line')).toHaveLength(4);
        expect(open.overRoad.filter(s => s.part === 'crossing-stop-line')).toHaveLength(0);
        const informal = crossing('no', { crossing: 'informal' });
        expect(informal.overRoad.filter(s => s.part.startsWith('crossing-deck'))).toHaveLength(0);
        expect(informal.overRoad.filter(s => s.part === 'crossing-rail')).toHaveLength(4);
        expect(informal.symbols).toHaveLength(0);
    });

    it('puts whistle boards beside the line, and colours the panels by their surface', () => {
        const { overRoad, symbols } = crossing('half', { 'crossing:whistle': 'yes', 'crossing:surface': 'wood' });
        expect(symbols.filter(s => s.kind === 'whistle-board')).toHaveLength(4);
        expect(overRoad.filter(s => s.part === 'crossing-deck rail-crossing-deck-wood')).toHaveLength(2);
    });

    it('draws platforms with a safety line on the track side, and the track\'s equipment', () => {
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n11', loc: at(0, -50) }), new iD.osmNode({ id: 'n12', loc: at(0, 50), tags: { railway: 'buffer_stop' } }),
            new iD.osmNode({ id: 'n21', loc: at(0, 0), tags: { railway: 'signal', 'railway:signal:direction': 'forward', 'railway:signal:main': 'GB-NR:colour_light',
                'railway:signal:main:states': 'GB-NR:stop;GB-NR:caution;GB-NR:preliminary_caution;GB-NR:clear', ref: 'BN123' } }),
            new iD.osmNode({ id: 'n22', loc: at(0, 20), tags: { railway: 'signal', 'railway:signal:shunting': 'GB-NR:position_light', 'railway:signal:direction': 'backward' } }),
            new iD.osmNode({ id: 'n31', loc: at(2.5, -30) }), new iD.osmNode({ id: 'n32', loc: at(8, -30) }),
            new iD.osmNode({ id: 'n33', loc: at(8, 30) }), new iD.osmNode({ id: 'n34', loc: at(2.5, 30) }),
            new iD.osmWay({ id: 'w1', nodes: ['n11', 'n21', 'n22', 'n12'], tags: { railway: 'rail' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n31', 'n32', 'n33', 'n34', 'n31'], tags: { railway: 'platform' } })
        ];
        const graph = graphOf(entities);
        const { ground, trackside, symbols } = railFeatures(entities.map(e => graph.entity(e.id)), graph);
        expect(ground.filter(s => s.part === 'platform')).toHaveLength(1);
        // only the west edge faces the track; its safety line is 0.8 m back from it, on the platform
        const safety = ground.filter(s => s.part === 'platform-safety');
        expect(safety).toHaveLength(1);
        expect(frame.toMetres(safety[0].points[0])[0]).toBeCloseTo(3.3, 1);
        expect(trackside.map(s => s.part)).toEqual(expect.arrayContaining(['buffer-stop', 'signal-post']));
        // a four-aspect colour-light signal showing red, with its plate, on the left of the line facing the trains
        // coming north (so facing south); a position-light shunt signal facing the other way
        const main = symbols.find(s => s.id === 'n21')!;
        expect(main).toMatchObject({ kind: 'signal', aspects: ['yellow', 'green', 'yellow', 'red'], lit: 'red', plate: 'BN123' });
        expect(Math.round(main.facing)).toBe(180);
        expect(frame.toMetres(main.loc)[0]).toBeLessThan(-1);
        const shunt = symbols.find(s => s.id === 'n22')!;
        expect(shunt.kind).toBe('shunt-signal');
        expect(Math.round(shunt.facing)).toBe(0);
    });

    it('knows the old course of a line, a planned one and a monorail', () => {
        expect(railKind({ railway: 'abandoned' })).toEqual({ kind: 'rail', status: 'abandoned' });
        expect(railKind({ railway: 'proposed', proposed: 'light_rail' })).toEqual({ kind: 'light_rail', status: 'proposed' });
        expect(railKind({ railway: 'rail', 'railway:preserved': 'yes' })).toEqual({ kind: 'rail', status: 'preserved' });
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 50) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { railway: 'abandoned' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n1', 'n2'], tags: { railway: 'monorail' } })
        ];
        const graph = graphOf(entities);
        const course = trackShape(graph.entity('w1') as any, graph, true)!;
        expect(course.rails).toHaveLength(0);
        expect(course.sleepers).toHaveLength(0);
        expect(course.bed).toBeDefined();
        expect(trackShape(graph.entity('w2') as any, graph, true)!.rails).toHaveLength(0);
    });
});

describe('parking spaces mapped as areas', () => {
    it('paints lines round each bay but the side it is driven into from', () => {
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n41', loc: at(-20, 0) }), new iD.osmNode({ id: 'n42', loc: at(20, 0) }),
            new iD.osmNode({ id: 'n51', loc: at(0, 1) }), new iD.osmNode({ id: 'n52', loc: at(2.4, 1) }),
            new iD.osmNode({ id: 'n53', loc: at(2.4, 5.8) }), new iD.osmNode({ id: 'n54', loc: at(0, 5.8) }),
            new iD.osmWay({ id: 'w1', nodes: ['n41', 'n42'], tags: { highway: 'service', service: 'parking_aisle' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n51', 'n52', 'n53', 'n54', 'n51'], tags: { amenity: 'parking_space', parking_space: 'disabled' } })
        ];
        const graph = graphOf(entities);
        const { spaces } = parkingSpaceGeometry(entities.map(e => graph.entity(e.id)), graph);
        expect(spaces).toHaveLength(1);
        expect(spaces[0].kind).toBe('disabled');
        // three lines: the side facing the aisle (y = 1) is open
        expect(spaces[0].lines).toHaveLength(3);
        for (const line of spaces[0].lines) {
            expect(line.every(p => Math.abs(frame.toMetres(p)[1] - 1) < 0.05)).toBe(false);
        }
        expect(parkingSpaceKind({ parking_space: 'charging' })).toBe('charging');
        expect(parkingSpaceKind({})).toBe('normal');
    });
});
