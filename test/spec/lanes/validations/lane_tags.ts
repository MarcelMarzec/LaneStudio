import type { OsmEntity } from '../../../../modules/osm';
import { validationLaneTags } from '../../../../modules/lanes/validations/lane_tags';

describe('lane_tags validation', () => {
    const validate = (tags: Tags) => {
        const way = new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags });
        const graph = new iD.coreGraph([new iD.osmNode({ id: 'n1', loc: [0, 0] }), new iD.osmNode({ id: 'n2', loc: [0.001, 0] }), way]);
        const context = iD.coreContext().assetPath('../dist/').init();
        return validationLaneTags(context)(way, graph);
    };

    it('says nothing about good lane tags', () => {
        expect(validate({ highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|through;right', 'change:lanes': 'not_right|yes' })).toEqual([]);
        expect(validate({ highway: 'footway', 'turn:lanes': 'nonsense' })).toEqual([]);
    });

    it('finds value counts that do not match the lanes', () => {
        const issues = validate({ highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through' });
        expect(issues.map(i => i.subtype)).toEqual(['count_mismatch']);
    });

    it('finds and fixes unknown turn values and deprecated change values', () => {
        const issues = validate({ highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'straight|u_turn;left', 'change:lanes': 'only_left|yes' });
        expect(issues.map(i => [i.subtype, i.hash])).toEqual([
            ['unknown_turn', 'straight'], ['unknown_turn', 'u_turn'], ['deprecated_change', 'only_left']
        ]);
        expect(issues.every(i => i.dynamicFixes && i.dynamicFixes(iD.coreContext()).length === 1)).toBe(true);
    });

    it('flags lanes=0, hov=lane and destination on two-way roads', () => {
        expect(validate({ highway: 'residential', lanes: '0' }).map(i => i.subtype)).toEqual(['zero_lanes']);
        expect(validate({ highway: 'motorway', lanes: '3', hov: 'lane' }).map(i => i.subtype)).toEqual(['hov_lane']);
        expect(validate({ highway: 'primary', lanes: '2', destination: 'London' }).map(i => i.subtype)).toEqual(['destination_twoway']);
    });
});


describe('lane_tags validation: widths, bus lanes, old values, dead ends and merges', () => {
    // as iD's own tests of where roads lead: the map data counts as loaded
    beforeEach(() => {
        iD.services.osm = iD.serviceOsm;
        iD.services.osm.isDataLoaded = () => true;
    });
    afterEach(() => {
        delete (iD.services as { osm?: unknown }).osm;
    });

    const context = () => iD.coreContext().assetPath('../dist/').init();
    const validateIn = (entities: OsmEntity[], wayID: string) => {
        const graph = new iD.coreGraph(entities);
        return validationLaneTags(context())(graph.entity(wayID as never), graph);
    };
    const line = (tags: Tags) => [
        new iD.osmNode({ id: 'n1', loc: [-1.13, 52.63] }), new iD.osmNode({ id: 'n2', loc: [-1.129, 52.63] }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
    ];

    it('flags a width narrower than the lanes', () => {
        expect(validateIn(line({ highway: 'primary', oneway: 'yes', lanes: '2', width: '6', 'width:lanes': '3.5|3.5' }), 'w1').map(i => i.subtype))
            .toContain('width_too_narrow');
        expect(validateIn(line({ highway: 'primary', oneway: 'yes', lanes: '2', width: '7', 'width:lanes': '3.5|3.5' }), 'w1').map(i => i.subtype))
            .not.toContain('width_too_narrow');
    });

    it('flags bus lanes counted but not marked, and marks the kerb-side lane', () => {
        const issues = validateIn(line({ highway: 'primary', oneway: 'yes', lanes: '2', 'lanes:bus': '1' }), 'w1');
        const bus = issues.find(i => i.subtype === 'lanes_bus_unmarked')!;
        expect(bus).toBeDefined();
        expect(bus.dynamicFixes!(context()).length).toBe(1);
        expect(validateIn(line({ highway: 'primary', oneway: 'yes', lanes: '2', 'lanes:bus': '1', 'bus:lanes': 'designated|' }), 'w1')
            .map(i => i.subtype)).not.toContain('lanes_bus_unmarked');
    });

    it('flags the old cycleway and busway values with their upgrades', () => {
        const subtypes = validateIn(line({ highway: 'residential', oneway: 'yes', lanes: '1', cycleway: 'opposite_lane', busway: 'lane' }), 'w1').map(i => i.subtype);
        expect(subtypes).toEqual(expect.arrayContaining(['old_cycleway', 'old_busway']));
    });

    it('flags turn arrows at a dead end, not where a road joins', () => {
        const turns = { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|through' };
        expect(validateIn(line(turns), 'w1').map(i => i.subtype)).toContain('turn_dead_end');
        const joined = [...line(turns), new iD.osmNode({ id: 'n3', loc: [-1.129, 52.631] }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'residential' } })];
        expect(validateIn(joined, 'w1').map(i => i.subtype)).not.toContain('turn_dead_end');
    });

    it('flags a merging lane whose road carries on with as many lanes', () => {
        const merge = { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'none|merge_to_left' };
        const next = (lanes: string) => [...line(merge), new iD.osmNode({ id: 'n3', loc: [-1.128, 52.63] }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes } })];
        expect(validateIn(next('2'), 'w1').map(i => i.subtype)).toContain('merge_never_ends');
        expect(validateIn(next('1'), 'w1').map(i => i.subtype)).not.toContain('merge_never_ends');
    });
});
