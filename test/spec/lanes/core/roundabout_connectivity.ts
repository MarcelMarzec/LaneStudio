import { roundaboutOf, withTurbo } from '../../../../modules/lanes/osm/roundabout';
import { parseConnectivity, formatConnectivity, toggleConnection } from '../../../../modules/lanes/model';
import { actionConnectLanes, connectionNode } from '../../../../modules/lanes/actions/connect_lanes';

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
    // @ts-expect-error -- the constructor also takes a list of entities
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

describe('lane connectivity', () => {
    it('parses and formats the connectivity tag', () => {
        expect(parseConnectivity('1:1|2:2,(3)')).toEqual([
            { from: '1', to: [{ to: '1', optional: false }] },
            { from: '2', to: [{ to: '2', optional: false }, { to: '3', optional: true }] }
        ]);
        expect(formatConnectivity(parseConnectivity('2:(3),2|1:1'))).toBe('1:1|2:2,(3)');
        expect(toggleConnection('1:1', '2', '3')).toBe('1:1|2:3');
        expect(toggleConnection('1:1|2:3', '2', '3')).toBe('1:1');
    });

    it('creates, extends and removes a connectivity relation', () => {
        let g = ring();
        const from = g.entity('w3');
        const to = g.entity('w1');
        const node = connectionNode(from, { direction: 'forward', index: 0 }, to, { direction: 'forward', index: 1 });
        expect(node).toEqual({ nodeID: 'n1' });
        expect(connectionNode(to, { direction: 'forward', index: 0 }, from, { direction: 'forward', index: 0 })).toEqual({ problem: 'wrong_direction' });

        g = actionConnectLanes('w3', { direction: 'forward', index: 0 }, 'n1', 'w1', { direction: 'forward', index: 1 })(g);
        const relation = () => g.parentRelations(g.entity('w3')).find(r => r.tags.type === 'connectivity');
        expect(relation()!.tags.connectivity).toBe('1:2');
        g = actionConnectLanes('w3', { direction: 'forward', index: 1 }, 'n1', 'w1', { direction: 'forward', index: 1 })(g);
        expect(relation()!.tags.connectivity).toBe('1:2|2:2');
        g = actionConnectLanes('w3', { direction: 'forward', index: 0 }, 'n1', 'w1', { direction: 'forward', index: 1 })(g);
        g = actionConnectLanes('w3', { direction: 'forward', index: 1 }, 'n1', 'w1', { direction: 'forward', index: 1 })(g);
        expect(relation()).toBeUndefined();
    });
});
