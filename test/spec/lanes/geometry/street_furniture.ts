import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { streetGeometry } from '../../../../modules/lanes/geometry/street';
import { signGeometry } from '../../../../modules/lanes/geometry/signs';
import { railFeatures } from '../../../../modules/lanes/geometry/rail_features';
import { laneLabel } from '../../../../modules/lanes/svg/lanes';

// Leicester (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-1.13 + dx * mx, 52.63 + dy * m];

/** A road 200 m long running east, n1 to n3 through n2, and other entities */
function road(tags: Tags, extra: any[] = [], middle: Tags = {}) {
    return new iD.coreGraph([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: middle }), new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags }),
        ...extra
    ]);
}

describe('tags the first audit left out', () => {
    beforeAll(async () => {
        const cache: any = iD.fileFetcher.cache();
        cache.locales_index_lanes = { en: { rtl: false, pct: 1 } };
        cache.locale_lanes_en = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
        iD.localizer.addLocaleDir('lanes', 'locales/lanes');
        await iD.localizer.ensureLoaded();
    });

    it('labels lanes with their sign\'s street, E-road, arrow and country, toll and payment, times and lorry limits', () => {
        const tags = { highway: 'trunk', oneway: 'yes', lanes: '2', 'destination:street:lanes': 'High Street|', 'destination:int_ref:lanes': '|E15',
            'destination:ref:lanes': '|A1', 'destination:arrow:lanes': 'left|', 'destination:country:lanes': '|F', 'toll:lanes': 'yes|no',
            'payment:cards:lanes': 'yes|no', 'bus:lanes:conditional': 'designated| @ (Mo-Fr 07:00-10:00)', 'maxspeed:hgv': '50 mph' };
        const graph = road(tags);
        const piece = roadGeometry([graph.entity('w1')], graph).pieces[0];
        const [kerb, outer] = piece.layout.lanes.map(lane => laneLabel(piece, lane, tags).text);
        expect(kerb).toContain('← High Street');
        expect(kerb).toContain('toll · cards');
        expect(kerb).toContain('bus Mo-Fr 07:00-10:00');
        expect(outer).toContain('A1 E15');
        expect(outer).toContain('(F)');
        // the road's lorry limit, once per direction
        expect([kerb, outer].filter(text => text.includes('HGV 50 mph'))).toHaveLength(1);
    });

    it('stands priority signs at each end of a narrow stretch, and a gantry over a toll gantry', () => {
        const graph = road({ highway: 'unclassified', priority: 'forward' }, [], { highway: 'toll_gantry' });
        const { signs, gantries } = signGeometry([graph.entity('w1'), graph.entity('n2')], graph);
        expect(signs.map(s => s.faces[0].code).sort()).toEqual(['GB:615', 'GB:811']);
        expect(signs.find(s => s.faces[0].code === 'GB:811')!.key).toBe('w1-priority-forward');
        expect(gantries).toHaveLength(1);
    });

    it('draws street lamps, bus stops with shelters, mirrors, milestones and ramps up steps', () => {
        const graph = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: at(0, 0), tags: { highway: 'street_lamp' } }),
            new iD.osmNode({ id: 'n2', loc: at(10, 0), tags: { highway: 'bus_stop', shelter: 'yes' } }),
            new iD.osmNode({ id: 'n3', loc: at(20, 0), tags: { highway: 'traffic_mirror' } }),
            new iD.osmNode({ id: 'n4', loc: at(30, 0), tags: { highway: 'milestone', distance: '12' } }),
            new iD.osmNode({ id: 'n5', loc: at(40, 0) }), new iD.osmNode({ id: 'n6', loc: at(40, 10) }),
            new iD.osmWay({ id: 'w1', nodes: ['n5', 'n6'], tags: { highway: 'steps', 'ramp:bicycle': 'yes' } })
        ]);
        const street = streetGeometry((['n1', 'n2', 'n3', 'n4', 'w1'] as const).map(id => graph.entity(id)), graph);
        expect(street.symbols.map(s => s.kind).sort()).toEqual(['bus_shelter', 'bus_stop', 'milestone', 'street_lamp', 'traffic_mirror']);
        expect(street.symbols.find(s => s.kind === 'milestone')!.text).toBe('12');
        expect(street.paths[0].ramp).toBeDefined();
    });

    it('draws an overhead line with masts, semaphores and other countries\' signals', () => {
        const graph = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: at(-150, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: { railway: 'signal', 'railway:signal:main': 'GB-NR:semaphore', 'railway:signal:main:form': 'semaphore' } }),
            new iD.osmNode({ id: 'n3', loc: at(50, 0), tags: { railway: 'signal', 'railway:signal:main': 'DE-ESO:hp', 'railway:signal:main:form': 'light' } }),
            new iD.osmNode({ id: 'n4', loc: at(150, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4'], tags: { railway: 'rail', electrified: 'contact_line' } })
        ]);
        const features = railFeatures((['w1', 'n2', 'n3'] as const).map(id => graph.entity(id)), graph);
        expect(features.trackside.filter(s => s.part === 'contact-wire')).toHaveLength(1);
        expect(features.trackside.filter(s => s.part === 'catenary-mast')).toHaveLength(5);
        expect(features.symbols.find(s => s.id === 'n2')!.kind).toBe('semaphore');
        expect(features.symbols.find(s => s.id === 'n3')!.aspects).toEqual(['red', 'green', 'yellow']);
    });

    it('fits a road into its carriageway mapped as a multipolygon', () => {
        // the area's middle is 2.5 m north of the road's line, with a hole in it
        const ring = (id: string, pts: [number, number][]) => {
            const nodes = pts.map((p, i) => new iD.osmNode({ id: `n${id}${i}` as `n${number}`, loc: at(...p) }));
            return [...nodes, new iD.osmWay({ id: `w${id}` as `w${number}`, nodes: [...nodes.map(n => n.id), nodes[0].id] })];
        };
        const outer = ring('10', [[-110, -3], [110, -3], [110, 8], [-110, 8]]);
        const inner = ring('20', [[-5, 6], [5, 6], [5, 7], [-5, 7]]);
        const relation = new iD.osmRelation({ id: 'r1', tags: { type: 'multipolygon', 'area:highway': 'primary' },
            members: [{ id: 'w10', type: 'way', role: 'outer' }, { id: 'w20', type: 'way', role: 'inner' }] });
        const graph = road({ highway: 'primary', lanes: '2' }, [...outer, ...inner, relation]);
        const roads = roadGeometry([graph.entity('w1')], graph, [graph.entity('r1')]);
        expect(roads.visuals.get('w1')?.fit).toBeDefined();
        expect(roads.areaRoads.get('r1')).toBe('w1');
    });
});
