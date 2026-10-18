import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { junctionLabels, placeShields, shieldRefs } from '../../../../modules/lanes/geometry/route_labels';
import { signGeometry } from '../../../../modules/lanes/geometry/signs';
import { streetGeometry } from '../../../../modules/lanes/geometry/street';
import { parkingBays } from '../../../../modules/lanes/svg/lanes';
import { laneState } from '../../../../modules/lanes/core/lane_state';
import { laneSuggestions } from '../../../../modules/lanes/ui/lane_fields';

// near Skegness (left-hand traffic, mph); 1 m ≈ 1/111320° of latitude
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
const all = (graph: ReturnType<typeof graphOf>) => Object.values(graph.base().entities).filter(Boolean) as Parameters<typeof signGeometry>[0];
const waysOf = (graph: ReturnType<typeof graphOf>) => all(graph).filter(e => e.type === 'way') as Parameters<typeof roadGeometry>[0];
const node = (id: string, x: number, y: number, tags: Tags = {}) => new iD.osmNode({ id: id as `n${number}`, loc: at(x, y), tags });
const way = (id: string, nodes: string[], tags: Tags) => new iD.osmWay({ id: id as `w${number}`, nodes: nodes as `n${number}`[], tags });


describe('road shields', () => {
    it('signs UK road numbers by road type', () => {
        expect(shieldRefs({ highway: 'motorway', ref: 'M6' })).toEqual([{ text: 'M6', style: 'motorway' }]);
        expect(shieldRefs({ highway: 'trunk', ref: 'A1(M)' })).toEqual([{ text: 'A1(M)', style: 'motorway' }]);
        expect(shieldRefs({ highway: 'trunk', ref: 'A46' })).toEqual([{ text: 'A46', style: 'primary' }]);
        expect(shieldRefs({ highway: 'primary', ref: 'A52;B1449' })).toEqual([{ text: 'A52', style: 'other' }, { text: 'B1449', style: 'other' }]);
        expect(shieldRefs({ highway: 'motorway_link', ref: 'M6' })).toEqual([]);
        expect(shieldRefs({ highway: 'primary', ref: 'E 20' })).toEqual([]);
    });

    it('puts one shield on a dual carriageway, and spaces them along a long road', () => {
        const graph = graphOf([
            node('n1', -2000, 12), node('n2', 2000, 12), node('n3', 2000, -12), node('n4', -2000, -12),
            way('w1', ['n1', 'n2'], { highway: 'motorway', oneway: 'yes', ref: 'M11' }),
            way('w2', ['n3', 'n4'], { highway: 'motorway', oneway: 'yes', ref: 'M11' })
        ]);
        // 1 px a metre, the view 3000 px wide
        const project = (loc: [number, number]) => { const p = frame.toMetres(loc); return [p[0] + 1500, 500 - p[1]] as [number, number]; };
        const shields = placeShields(waysOf(graph), graph, project, { width: 3000, height: 1000 });
        expect(shields.length).toBeGreaterThanOrEqual(2);
        for (let i = 0; i < shields.length; i++) {
            for (let j = i + 1; j < shields.length; j++) {
                const d = Math.hypot(shields[i].point[0] - shields[j].point[0], shields[i].point[1] - shields[j].point[1]);
                expect(d).toBeGreaterThanOrEqual(900);
            }
        }
    });
});


describe('motorway junctions', () => {
    it('labels a junction beside the road on the side its slip road leaves', () => {
        // eastbound, keeping left: the slip road leaves to the north
        const graph = graphOf([
            node('n1', -300, 0), node('n2', 0, 0, { highway: 'motorway_junction', ref: '15', name: 'Skegness' }), node('n3', 300, 0),
            node('n4', 80, 15), node('n5', 160, 40),
            way('w1', ['n1', 'n2'], { highway: 'motorway', oneway: 'yes', lanes: '3' }),
            way('w2', ['n2', 'n3'], { highway: 'motorway', oneway: 'yes', lanes: '3' }),
            way('w3', ['n2', 'n4', 'n5'], { highway: 'motorway_link', oneway: 'yes', lanes: '1' })
        ]);
        const [label] = junctionLabels(all(graph), graph);
        expect(label).toMatchObject({ nodeID: 'n2', ref: '15', name: 'Skegness' });
        const [x, y] = frame.toMetres(label.anchor);
        const half = laneLayout(graph.entity('w1'), graph).total / 2;
        expect(Math.abs(x)).toBeLessThan(0.5);
        expect(y).toBeGreaterThan(half + 2);
    });
});


describe('slip roads', () => {
    it('starts a slip road from the outer lane of a wide motorway', () => {
        const graph = graphOf([
            node('n1', -300, 0), node('n2', 0, 0), node('n3', 300, 0), node('n4', 100, 12), node('n5', 200, 40),
            way('w1', ['n1', 'n2'], { highway: 'motorway', oneway: 'yes', lanes: '3' }),
            way('w2', ['n2', 'n3'], { highway: 'motorway', oneway: 'yes', lanes: '3' }),
            way('w3', ['n2', 'n4', 'n5'], { highway: 'motorway_link', oneway: 'yes', lanes: '1' })
        ]);
        const { visuals } = roadGeometry(waysOf(graph), graph);
        const outer = laneLayout(graph.entity('w1'), graph).edges[0];
        const lane = laneLayout(graph.entity('w1'), graph).lanes[0].width;
        // the slip road's centre starts on the outer (left) lane's centre, more than a lane from the middle
        expect(visuals.get('w3')?.start).toBeCloseTo(outer + lane / 2, 1);
        expect(Math.abs(visuals.get('w3')!.start)).toBeGreaterThan(3.5);
    });

    it('ends a joining slip road on the lane it becomes', () => {
        const graph = graphOf([
            node('n1', -300, 0), node('n2', 0, 0), node('n3', 300, 0), node('n4', -200, 40), node('n5', -100, 12),
            way('w1', ['n1', 'n2'], { highway: 'motorway', oneway: 'yes', lanes: '3' }),
            way('w2', ['n2', 'n3'], { highway: 'motorway', oneway: 'yes', lanes: '4' }),
            way('w3', ['n4', 'n5', 'n2'], { highway: 'motorway_link', oneway: 'yes', lanes: '1' })
        ]);
        const { visuals } = roadGeometry(waysOf(graph), graph);
        const after = laneLayout(graph.entity('w2'), graph);
        // the gained lane is the left one of the four
        expect(visuals.get('w3')?.end).toBeCloseTo((after.edges[0] + after.edges[1]) / 2, 1);
    });
});


describe('speed roundels', () => {
    const symbolsOf = (graph: ReturnType<typeof graphOf>) => streetGeometry(all(graph), graph).symbols;

    it('paints a lane its own limit, and a minimum speed where it begins', () => {
        const graph = graphOf([
            node('n1', -200, 0), node('n2', 0, 0), node('n3', 200, 0),
            way('w1', ['n1', 'n2'], { highway: 'primary', oneway: 'yes', lanes: '3', maxspeed: '50 mph' }),
            way('w2', ['n2', 'n3'], { highway: 'primary', oneway: 'yes', lanes: '3', maxspeed: '50 mph', minspeed: '30 mph', 'maxspeed:lanes': '50 mph|50 mph|40 mph' })
        ]);
        const symbols = symbolsOf(graph);
        expect(symbols.filter(s => s.kind === 'speed_limit').map(s => s.text)).toEqual(['40']);
        expect(symbols.filter(s => s.kind === 'min_speed').map(s => s.text)).toEqual(['30', '30', '30']);
    });

    it('paints each lane where the road limit changes', () => {
        const graph = graphOf([
            node('n1', -200, 0), node('n2', 0, 0), node('n3', 200, 0),
            way('w1', ['n1', 'n2'], { highway: 'primary', oneway: 'yes', lanes: '2', maxspeed: '60 mph' }),
            way('w2', ['n2', 'n3'], { highway: 'primary', oneway: 'yes', lanes: '2', maxspeed: '50 mph' })
        ]);
        expect(symbolsOf(graph).filter(s => s.kind === 'speed_limit').map(s => s.text)).toEqual(['50', '50']);
    });
});


describe('average speed sections', () => {
    it('draws a section from its relation alone, with its cameras off screen', () => {
        const graph = graphOf([
            node('n1', -300, 0), node('n2', -200, 0), node('n3', 200, 0), node('n4', 300, 0), node('n5', -205, 8, { highway: 'speed_camera' }),
            way('w1', ['n1', 'n2', 'n3', 'n4'], { highway: 'primary', lanes: '2' }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'enforcement', enforcement: 'average_speed' }, members: [
                { id: 'n5', type: 'node', role: 'device' }, { id: 'n2', type: 'node', role: 'from' }, { id: 'n3', type: 'node', role: 'to' }
            ] })
        ]);
        // in view: the road and the relation, not the camera
        const inView = [graph.entity('w1'), graph.entity('r1')] as Parameters<typeof signGeometry>[0];
        const { signs, sections } = signGeometry(inView, graph);
        expect(signs).toHaveLength(0);
        expect(sections).toHaveLength(1);
    });
});


describe('parking', () => {
    it('lays parking on the road inside the kerb, and on the pavement beyond it', () => {
        const graph = graphOf([
            node('n1', -50, 0), node('n2', 50, 0),
            way('w1', ['n1', 'n2'], { highway: 'residential', 'parking:left': 'lane', 'parking:right': 'on_kerb', 'parking:right:orientation': 'perpendicular', sidewalk: 'both' })
        ]);
        const { roadside } = laneLayout(graph.entity('w1'), graph);
        expect(roadside.left.map(s => s.kind)).toEqual(['parking', 'sidewalk']);
        expect(roadside.left[0].parking).toEqual({ orientation: 'parallel', position: 'lane' });
        expect(roadside.right[0]).toMatchObject({ kind: 'parking', width: 5, parking: { orientation: 'perpendicular', position: 'on_kerb' } });
    });

    it('marks bays by how cars park', () => {
        // a 60 m strip, 2.2 m deep
        const polygon = [at(0, 0), at(60, 0), at(60, 2.2), at(0, 2.2)];
        const parallel = parkingBays('a', polygon, { orientation: 'parallel', position: 'lane' });
        const perpendicular = parkingBays('b', polygon, { orientation: 'perpendicular', position: 'lane' });
        expect(parallel.dividers).toHaveLength(9);
        expect(perpendicular.dividers.length).toBeGreaterThan(20);
        const diagonal = parkingBays('c', polygon, { orientation: 'diagonal', position: 'lane' });
        const [p, q] = diagonal.dividers[0].map(frame.toMetres);
        // a diagonal bay line leans along the road
        expect(Math.abs(q[0] - p[0])).toBeGreaterThan(1);
    });
});


describe('limits in the sidebar', () => {
    let context: iD.Context;
    beforeEach(() => {
        context = iD.coreContext().assetPath('../dist/').init();
        context.history().merge([
            node('n1', -50, 0), node('n2', 50, 0),
            way('w1', ['n1', 'n2'], { highway: 'primary', lanes: '2' })
        ]);
    });

    it('suggests limits with their units, in feet and inches where roads are signed in mph', () => {
        const road = context.entity('w1') as Parameters<typeof laneSuggestions>[1];
        expect(laneSuggestions(context, road, 'maxweight:lanes').map(s => s.title)).toEqual(['3.5 t', '7.5 t', '16 t', '18 t', '44 t']);
        const heights = laneSuggestions(context, road, 'maxheight:lanes');
        expect(heights[0]).toEqual({ value: '2.1', title: '2.1 m' });
        expect(heights.find(s => s.value === '14\'6"')?.title).toBe('14\'6" (4.42 m)');
    });

    it('picks a hard shoulder or lanes, not both', () => {
        const state = laneState(context);
        state.select('w1', [{ direction: 'forward', index: 0 }]);
        state.selectShoulder('w1', 'left');
        expect(state.selected()).toBeNull();
        expect(state.shoulder()).toEqual({ wayID: 'w1', side: 'left' });
        state.select('w1', [{ direction: 'forward', index: 0 }]);
        expect(state.shoulder()).toBeNull();
    });
});
