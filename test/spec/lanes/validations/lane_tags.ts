import { validationLaneTags } from '../../../../modules/lanes/validations/lane_tags';

describe('lane_tags validation', () => {
    const validate = (tags: Tags) => {
        const way = new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags });
        // @ts-expect-error -- the constructor also takes a list of entities
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
