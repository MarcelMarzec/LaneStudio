import { laneCorridor, junctionExits, turnForAngle } from '../../../../modules/lanes/osm/corridor';
import { copiedLaneTags, canCopyLanes } from '../../../../modules/lanes/actions/copy_lanes';

const m = 1 / 111320;
const mx = m / Math.cos(52.52 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [13.40 + dx * mx, 52.52 + dy * m];

// A main road w1 -> w2 -> w3 heading east; a side road north at n2, a slip road to the south-east at n3
function graph() {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(100, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(200, 0) }), new iD.osmNode({ id: 'n4', loc: at(300, 0) }),
        new iD.osmNode({ id: 'n5', loc: at(100, 100) }), new iD.osmNode({ id: 'n6', loc: at(260, -40) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', ref: 'A1', lanes: '3' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n3', 'n2'], tags: { highway: 'primary', ref: 'A1' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n3', 'n4'], tags: { highway: 'primary', ref: 'A1' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n2', 'n5'], tags: { highway: 'residential', name: 'North Street' } }),
        new iD.osmWay({ id: 'w5', nodes: ['n3', 'n6'], tags: { highway: 'primary_link', oneway: 'yes', destination: 'Airport', 'destination:ref': 'A2' } })
    ];
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities);
}

describe('laneCorridor', () => {
    it('follows the same ref through junctions, whichever way ways are drawn', () => {
        const g = graph();
        const steps = laneCorridor(g.entity('w1'), g, { direction: 'forward', maxWays: 5 });
        expect(steps.map(s => [s.way.id, s.alongWay])).toEqual([['w1', true], ['w2', false], ['w3', true]]);
        expect(steps[2].distance).toBeCloseTo(300, 0);
    });

    it('stops at the way limit', () => {
        const g = graph();
        expect(laneCorridor(g.entity('w1'), g, { direction: 'forward', maxWays: 2 })).toHaveLength(2);
    });

    it('lists exits with turn suggestions and sign text', () => {
        const g = graph();
        const exits = junctionExits(g.entity('w2'), false, 'n3', g);
        const byWay = Object.fromEntries(exits.map(e => [e.way.id, e]));
        expect(byWay.w3.turn).toBe('through');
        expect(byWay.w5.turn).toBe('slight_right');
        expect(byWay.w5.destination).toBe('Airport');
        expect(byWay.w5.destinationRef).toBe('A2');
        const fromW1 = junctionExits(g.entity('w1'), true, 'n2', g);
        expect(fromW1.find(e => e.way.id === 'w4')!.turn).toBe('left');
    });

    it('maps angles to turn values', () => {
        expect(turnForAngle(5)).toBe('through');
        expect(turnForAngle(-40)).toBe('slight_right');
        expect(turnForAngle(90)).toBe('left');
        expect(turnForAngle(-140)).toBe('sharp_right');
        expect(turnForAngle(175)).toBe('reverse');
    });
});

describe('copiedLaneTags', () => {
    it('copies lanes along a road but keeps turn and destination lanes', () => {
        const from = { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1',
            'bus:lanes:forward': 'designated|', 'turn:lanes:forward': 'left|through', 'access:lanes': 'yes|no|yes' };
        const to = { highway: 'primary', name: 'x', lanes: '2', 'turn:lanes:backward': 'left' };
        expect(copiedLaneTags(from, to, true)).toEqual({
            highway: 'primary', name: 'x', 'turn:lanes:backward': 'left',
            lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', 'bus:lanes:forward': 'designated|', 'access:lanes': 'yes|no|yes'
        });
    });

    it('swaps directions onto a road drawn the other way', () => {
        const from = { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', 'bus:lanes:forward': 'designated|', 'access:lanes': 'yes|no|no' };
        expect(copiedLaneTags(from, { highway: 'primary' }, false)).toEqual({
            highway: 'primary', lanes: '3', 'lanes:backward': '2', 'lanes:forward': '1', 'bus:lanes:backward': 'designated|', 'access:lanes': 'no|no|yes'
        });
    });

    it('only copies between roads of the same kind', () => {
        expect(canCopyLanes({ highway: 'primary', oneway: 'yes' }, { highway: 'primary' })).toBe(false);
        expect(canCopyLanes({ highway: 'motorway' }, { highway: 'primary', oneway: '-1' })).toBe(true);
    });
});
