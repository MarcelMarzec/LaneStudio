import { parseLanes, parseLaneConditional, formatLaneConditional, laneConditions, withLaneConditions, turnValues } from '../../../../modules/lanes/model';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { edgesAt } from '../../../../modules/lanes/geometry/road_geometry';
import { turnArrowSymbol } from '../../../../modules/lanes/svg/defs';

describe('conditional lane tags', () => {
    it('reads and writes lists of lane values under conditions', () => {
        const rules = parseLaneConditional('100|60 @ (wet); 80|40 @ (22:00-06:00)')!;
        expect(rules).toEqual([{ values: ['100', '60'], condition: 'wet' }, { values: ['80', '40'], condition: '22:00-06:00' }]);
        expect(laneConditions(rules, 1)).toBe('60 @ (wet); 40 @ (22:00-06:00)');
        expect(formatLaneConditional(rules)).toBe('100|60 @ (wet); 80|40 @ (22:00-06:00)');
        // a semicolon inside a condition belongs to it
        expect(parseLaneConditional('no|yes @ (Mo-Fr 07:00-10:00; Sa 08:00-12:00)')![0].condition).toBe('Mo-Fr 07:00-10:00; Sa 08:00-12:00');
        expect(parseLaneConditional('no|yes')).toBeNull();
    });

    it('sets one lane\'s conditions, keeping the other lanes\' and dropping empty rules', () => {
        const tags = { highway: 'trunk', oneway: 'yes', lanes: '2', 'maxspeed:lanes:conditional': '100|60 @ (wet)' };
        const model = parseLanes(tags);
        const next = withLaneConditions(model, tags, 'maxspeed', [{ direction: 'forward', index: 1 }], '50 @ (wet); 40 @ (snow)')!;
        expect(next['maxspeed:lanes:conditional']).toBe('100|50 @ (wet); |40 @ (snow)');
        const cleared = withLaneConditions(model, { ...tags, 'maxspeed:lanes:conditional': '|60 @ (wet)' }, 'maxspeed', [{ direction: 'forward', index: 1 }], '')!;
        expect(cleared['maxspeed:lanes:conditional']).toBeUndefined();
        // a two-way road: the lane's own direction
        const two = { highway: 'primary', lanes: '2' };
        const both = withLaneConditions(parseLanes(two), two, 'access', [{ direction: 'backward', index: 0 }], 'no @ (Mo-Fr 07:00-10:00)')!;
        expect(both['access:lanes:backward:conditional']).toBe('no @ (Mo-Fr 07:00-10:00)');
        expect(withLaneConditions(model, tags, 'maxspeed', [{ direction: 'forward', index: 0 }], 'not a condition')).toBeNull();
    });
});

describe('rarely used lane tags', () => {
    it('draws a lane widening from width:lanes:start to width:lanes:end', () => {
        const graph = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: [-1.13, 52.63] }),
            new iD.osmNode({ id: 'n2', loc: [-1.128, 52.63] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'width:lanes': '3.5|3',
                'width:lanes:start': '3.5|0', 'width:lanes:end': '3.5|3' } })
        ]);
        const layout = laneLayout(graph.entity('w1'), graph);
        const visual = { start: 0, end: 0, taperStart: [], taperEnd: [] };
        const width = (s: number) => { const e = edgesAt(layout, visual, s, 100); return [e[1] - e[0], e[2] - e[1]]; };
        expect(width(0)[1]).toBeCloseTo(0, 3);
        expect(width(50)[1]).toBeCloseTo(1.5, 3);
        expect(width(100)[1]).toBeCloseTo(3, 3);
        expect(width(50)[0]).toBeCloseTo(3.5, 3);
    });

    it('knows the lane shift and next-junction arrows', () => {
        for (const value of ['slide_left', 'slide_right', 'next_left', 'next_right']) {
            expect(turnValues).toContain(value);
            expect(turnArrowSymbol(value)).toBeDefined();
        }
        expect(turnArrowSymbol('slide_right')).toEqual({ id: 'lanes-arrow-slide_left', mirror: true });
    });
});
