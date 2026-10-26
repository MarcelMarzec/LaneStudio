import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { railFeatures } from '../../../../modules/lanes/geometry/rail_features';
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
    function crossing(barrier: string) {
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n101', loc: at(-40, 0) }), new iD.osmNode({ id: 'n102', loc: at(40, 0) }),
            new iD.osmNode({ id: 'n1', loc: at(-2, 0), tags: { railway: 'level_crossing', 'crossing:barrier': barrier } }),
            new iD.osmNode({ id: 'n2', loc: at(2, 0), tags: { railway: 'level_crossing', 'crossing:barrier': barrier } }),
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
        const { overRoad } = crossing('double_half');
        expect(overRoad.filter(s => s.part === 'crossing-deck')).toHaveLength(2);
        expect(overRoad.filter(s => s.part === 'crossing-rail')).toHaveLength(4);
        // two halves each side, the west side's at n1, the east side's at n2
        const arms = overRoad.filter(s => s.part === 'crossing-arm');
        expect(arms).toHaveLength(4);
        const xs = arms.map(arm => Math.round(arm.points.map(p => frame.toMetres(p)[0]).reduce((a, b) => a + b) / arm.points.length));
        expect(xs.every(x => x < -4 || x > 4)).toBe(true);
        expect(overRoad.filter(s => s.part === 'crossing-light').length).toBeGreaterThan(0);
        expect(overRoad.filter(s => s.part === 'crossing-stop-line')).toHaveLength(2);
    });

    it('draws a crossing with no barriers tagged as panels and rails only', () => {
        const { overRoad } = crossing('no');
        expect(overRoad.filter(s => s.part === 'crossing-arm' || s.part === 'crossing-stop-line')).toHaveLength(0);
        expect(overRoad.filter(s => s.part === 'crossing-deck')).toHaveLength(2);
    });

    it('draws platforms with a safety line on the track side, and the track\'s equipment', () => {
        const entities: Entity[] = [
            new iD.osmNode({ id: 'n11', loc: at(0, -50) }), new iD.osmNode({ id: 'n12', loc: at(0, 50), tags: { railway: 'buffer_stop' } }),
            new iD.osmNode({ id: 'n21', loc: at(0, 0), tags: { railway: 'signal', 'railway:signal:direction': 'forward' } }),
            new iD.osmNode({ id: 'n31', loc: at(2.5, -30) }), new iD.osmNode({ id: 'n32', loc: at(8, -30) }),
            new iD.osmNode({ id: 'n33', loc: at(8, 30) }), new iD.osmNode({ id: 'n34', loc: at(2.5, 30) }),
            new iD.osmWay({ id: 'w1', nodes: ['n11', 'n21', 'n12'], tags: { railway: 'rail' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n31', 'n32', 'n33', 'n34', 'n31'], tags: { railway: 'platform' } })
        ];
        const graph = graphOf(entities);
        const { ground, trackside } = railFeatures(entities.map(e => graph.entity(e.id)), graph);
        expect(ground.filter(s => s.part === 'platform')).toHaveLength(1);
        // only the west edge faces the track; its safety line is 0.8 m back from it, on the platform
        const safety = ground.filter(s => s.part === 'platform-safety');
        expect(safety).toHaveLength(1);
        expect(frame.toMetres(safety[0].points[0])[0]).toBeCloseTo(3.3, 1);
        expect(trackside.map(s => s.part)).toEqual(expect.arrayContaining(['buffer-stop', 'signal-head', 'signal-post']));
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
