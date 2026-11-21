import { roundaboutOf, withTurbo } from '../../../../modules/lanes/osm/roundabout';

const m = 1 / 111320;
const at = (dx: number, dy: number): [number, number] => [5.12 + dx * m * 1.6, 52.09 + dy * m];

function ring() {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(20, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 20) }),
        new iD.osmNode({ id: 'n3', loc: at(-20, 0) }), new iD.osmNode({ id: 'n4', loc: at(0, -20) }),
        new iD.osmNode({ id: 'n5', loc: at(100, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'primary', junction: 'roundabout', lanes: '2', roundabout: 'turbo' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4', 'n1'], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n5', 'n1'], tags: { highway: 'primary', lanes: '2' } }),
        new iD.osmRelation({ id: 'r1', tags: { type: 'restriction', restriction: 'no_left_turn' }, members: [
            { id: 'w3', type: 'way', role: 'from' }, { id: 'n1', type: 'node', role: 'via' }, { id: 'w1', type: 'way', role: 'to' }] })
    ];
    return new iD.coreGraph(entities);
}

describe('roundabouts', () => {
    it('gathers the ring, its approaches, restrictions and turbo segments', () => {
        const g = ring();
        const r = roundaboutOf(g.entity('w2'), g)!;
        expect(r.ring.map(w => w.id).sort()).toEqual(['w1', 'w2']);
        expect(r.approaches.map(w => w.id)).toEqual(['w3']);
        expect(r.restrictions.map(x => x.id)).toEqual(['r1']);
        expect(r.turbo.map(w => w.id)).toEqual(['w1']);
        expect(roundaboutOf(g.entity('w3'), g)).toBeNull();
    });

    it('tags a turbo segment', () => {
        expect(withTurbo({ junction: 'roundabout', lanes: '2' }, true)).toEqual({ junction: 'roundabout', lanes: '2', roundabout: 'turbo', 'change:lanes': 'no|no' });
        expect(withTurbo({ junction: 'roundabout', roundabout: 'turbo' }, false)).toEqual({ junction: 'roundabout' });
    });
});
