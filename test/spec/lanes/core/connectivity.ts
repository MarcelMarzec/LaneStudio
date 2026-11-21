import {
    parseConnectivity, formatConnectivity, toggleConnection, setConnection, connectionState, connectivityLane, connectivityRef,
    connectivitySyntaxProblems, fixConnectivitySyntax
} from '../../../../modules/lanes/model';
import {
    actionConnectLanes, actionDeclareConnectivity, connectionChange, connectionNode, findConnectivity
} from '../../../../modules/lanes/actions/connect_lanes';
import {
    connectivityProblems, laneLinksAt, resolveConnectivity, respot, sameAsDefault, spotAt, type LaneSpot
} from '../../../../modules/lanes/geometry/connectivity';
import { validationLaneTags } from '../../../../modules/lanes/validations/lane_tags';

// in Texas (right-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(30.27 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-97.74 + dx * mx, 30.27 + dy * m];

const lane = (wayID: string, direction: 'forward' | 'backward' | 'both_ways', index: number, from: string, to: string): LaneSpot =>
    ({ wayID: wayID as any, ref: { direction, index }, from: from as any, to: to as any });

/**
 * A T junction at n0: High Street (w1, one way, two lanes, left lane may turn left) runs east into East Street (w2, one
 * way, two lanes); North Street (w3, two way) leaves to the north, on the left
 */
function junction(extra: any[] = []) {
    return new iD.coreGraph([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(100, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left;through|through', name: 'High Street' } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', name: 'East Street' } }),
        new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'secondary', lanes: '2', name: 'North Street' } }),
        ...extra
    ]);
}

const relationOf = (g: iD.Graph, fromID = 'w1') => g.parentRelations(g.entity(fromID as any)).find(r => r.tags.type === 'connectivity');
const pairs = (g: iD.Graph, nodeID = 'n0') => laneLinksAt(g, nodeID).map(l =>
    `${l.from.wayID}:${connectivityLane(l.from.ref)}>${l.to.wayID}:${connectivityLane(l.to.ref)}${l.optional ? '?' : ''}${l.declared ? '*' : ''}`).sort();

describe('the connectivity tag (Relation:connectivity)', () => {
    it('reads and writes the wiki\'s examples', () => {
        expect(parseConnectivity('1:1|2:2,(3)')).toEqual([
            { from: '1', to: [{ to: '1', optional: false }] },
            { from: '2', to: [{ to: '2', optional: false }, { to: '3', optional: true }] }
        ]);
        expect(formatConnectivity(parseConnectivity('2:(3),2|1:1'))).toBe('1:1|2:2,(3)');
        for (const value of ['2:1|3:2', '1:(1),(2),3|2:4,(5)', '1:(1),2|2:3|3:4|4:(4)', 'bw:(1)', 'bw:bw|1:1|2:2|3:3', '1:(1),(2),3|2:4|3:5,(6)']) {
            expect(formatConnectivity(parseConnectivity(value))).toBe(value);
            expect(connectivitySyntaxProblems(value)).toEqual([]);
        }
    });

    it('adds, removes and marks connections needing a lane change', () => {
        expect(toggleConnection('1:1', '2', '3')).toBe('1:1|2:3');
        expect(toggleConnection('1:1|2:3', '2', '3')).toBe('1:1');
        expect(toggleConnection('1:1', '1', '2', true)).toBe('1:1,(2)');
        expect(toggleConnection('1:1,(2)', '1', '2')).toBe('1:1,2');
        expect(toggleConnection('1:1,(2)', '1', '2', true)).toBe('1:1');
        expect(setConnection('1:1', 'bw', '1', 'optional')).toBe('bw:(1)|1:1');
        expect(connectionState('1:1,(2)', '1', '2')).toBe('optional');
        expect(connectionState('1:1,(2)', '2', '2')).toBe('none');
    });

    it('numbers lanes from the driver\'s left, and the both_ways lane bw', () => {
        expect(connectivityLane({ direction: 'backward', index: 0 })).toBe('1');
        expect(connectivityLane({ direction: 'forward', index: 2 })).toBe('3');
        expect(connectivityLane({ direction: 'both_ways', index: 0 })).toBe('bw');
        expect(connectivityRef('2', 'backward')).toEqual({ direction: 'backward', index: 1 });
        expect(connectivityRef('bw', 'forward')).toEqual({ direction: 'both_ways', index: 0 });
        expect(connectivityRef('x', 'forward')).toBeNull();
    });

    it('finds what the wiki calls invalid, and writes one statement per from lane', () => {
        expect(connectivitySyntaxProblems('1,2:1|3:2')).toEqual(['several_from']);
        expect(fixConnectivitySyntax('1,2:1|3:2')).toBe('1:1|2:1|3:2');
        expect(connectivitySyntaxProblems('1:1|1:2')).toEqual(['repeated_from']);
        expect(fixConnectivitySyntax('1:1|1:2')).toBe('1:1,2');
        expect(connectivitySyntaxProblems('')).toEqual(['empty']);
        expect(connectivitySyntaxProblems('1-1')).toEqual(['no_colon']);
        expect(connectivitySyntaxProblems('0:1|2:left')).toEqual(['bad_lane']);
        expect(connectivitySyntaxProblems('1:')).toEqual(['no_to']);
    });
});

describe('lane connections at a junction', () => {
    it('works out the connections where no relation declares them, by the turn arrows', () => {
        // (and North Street's southbound lane turns left into East Street)
        expect(pairs(junction())).toEqual(['w1:1>w2:1', 'w1:1>w3:1', 'w1:2>w2:2', 'w3:1>w2:1']);
    });

    it('leaves out a turn a restriction bans', () => {
        const g = junction([new iD.osmRelation({ id: 'r9', tags: { type: 'restriction', restriction: 'no_left_turn' }, members: [
            { id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w3', type: 'way', role: 'to' }] })]);
        expect(pairs(g)).toEqual(['w1:1>w2:1', 'w1:2>w2:2', 'w3:1>w2:1']);
    });

    it('starts a new relation from the connections worked out, so the other lanes keep theirs', () => {
        let g = junction();
        const from = lane('w1', 'forward', 0, 'n1', 'n0');
        const to = lane('w2', 'forward', 1, 'n0', 'n2');
        expect(connectionNode(g, from, to)).toEqual({ nodeID: 'n0' });
        g = actionConnectLanes(from, 'n0' as any, to)(g);
        const relation = relationOf(g)!;
        expect(relation.tags).toEqual({ type: 'connectivity', connectivity: '1:1,2|2:2' });
        expect(relation.members.map(mm => [mm.role, mm.id])).toEqual([['from', 'w1'], ['via', 'n0'], ['to', 'w2']]);
        expect(pairs(g)).toEqual(['w1:1>w2:1*', 'w1:1>w2:2*', 'w1:1>w3:1', 'w1:2>w2:2*', 'w3:1>w2:1']);

        // shift-click: needs a lane change
        g = actionConnectLanes(from, 'n0' as any, to, 'toggle_optional')(g);
        expect(relationOf(g)!.tags.connectivity).toBe('1:1,(2)|2:2');
        expect(pairs(g)).toContain('w1:1>w2:2?*');

        // back to what Lane Studio works out: the relation is not needed
        g = actionConnectLanes(from, 'n0' as any, to, 'none')(g);
        expect(relationOf(g)!.tags.connectivity).toBe('1:1|2:2');
        expect(sameAsDefault(g, relationOf(g)!)).toBe(true);

        // and with no lanes left, it goes
        g = actionConnectLanes(lane('w1', 'forward', 0, 'n1', 'n0'), 'n0' as any, lane('w2', 'forward', 0, 'n0', 'n2'), 'none')(g);
        g = actionConnectLanes(lane('w1', 'forward', 1, 'n1', 'n0'), 'n0' as any, lane('w2', 'forward', 1, 'n0', 'n2'), 'none')(g);
        expect(relationOf(g)).toBeUndefined();
    });

    it('writes no relation that says nothing', () => {
        const g = junction();
        // the only lane into North Street: taking it away is a turn restriction's job
        const change = connectionChange(g, lane('w1', 'forward', 0, 'n1', 'n0'), 'n0' as any, lane('w3', 'forward', 0, 'n0', 'n3'), 'toggle');
        expect(change).toMatchObject({ current: '1:1', value: '', changes: false });
        expect(actionConnectLanes(lane('w1', 'forward', 0, 'n1', 'n0'), 'n0' as any, lane('w3', 'forward', 0, 'n0', 'n3'))(g)).toBe(g);
    });

    it('declares the connections worked out as a relation, to edit from there', () => {
        const g = actionDeclareConnectivity(lane('w1', 'forward', 0, 'n1', 'n0'), 'n0' as any, lane('w2', 'forward', 0, 'n0', 'n2'))(junction());
        expect(relationOf(g)!.tags.connectivity).toBe('1:1|2:2');
    });

    it('splits a road running through the junction, as a relation\'s roads end at its via node', () => {
        // Main Street (w4) runs through n0 from west to east; North Street (w3) comes in from the north
        let g = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(100, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }),
            new iD.osmWay({ id: 'w4', nodes: ['n1', 'n0', 'n2'], tags: { highway: 'primary', lanes: '2' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'secondary', lanes: '2' } })
        ]);
        // southbound on North Street, turning left onto Main Street eastbound
        const from = lane('w3', 'backward', 0, 'n3', 'n0');
        const to = lane('w4', 'forward', 0, 'n0', 'n2');
        expect(connectionNode(g, from, to)).toEqual({ nodeID: 'n0' });
        g = actionConnectLanes(from, 'n0' as any, to, 'toggle_optional')(g);
        const relation = relationOf(g, 'w3')!;
        const toWay = g.entity(relation.members.find(mm => mm.role === 'to')!.id as any) as unknown as InstanceType<typeof iD.osmWay>;
        expect(toWay.nodes).toEqual(['n0', 'n2']);
        expect(relation.tags.connectivity).toBe('1:(1)');
        // the lane picked on the half the split made new is found again
        expect(respot(g, lane('w4', 'forward', 0, 'n0', 'n2'))!.wayID).toBe(toWay.id);
    });

    it('connects a both_ways lane as bw', () => {
        // a two-way road with a centre turn lane, joining a one-way road
        let g = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', lanes: '3', 'lanes:forward': '1', 'lanes:backward': '1', 'lanes:both_ways': '1' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'secondary', oneway: 'yes', lanes: '1' } })
        ]);
        const from = spotAt(g, { wayID: 'w1' as any, ref: { direction: 'both_ways', index: 0 } }, 'n0' as any, true)!;
        expect(from).toMatchObject({ from: 'n1', to: 'n0' });
        g = actionConnectLanes(from, 'n0' as any, lane('w3', 'forward', 0, 'n0', 'n3'), 'toggle_optional')(g);
        expect(relationOf(g)!.tags.connectivity).toBe('bw:(1)|1:1');
        expect(pairs(g)).toContain('w1:bw>w3:1?*');
    });

    it('reads a relation over via ways, from the end of its from road to the start of its to road', () => {
        // w1 runs east to n0, an unmarked link (w5) to n4, then w6 carries on east
        const g = new iD.coreGraph([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n4', loc: at(30, 0) }), new iD.osmNode({ id: 'n5', loc: at(130, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } }),
            new iD.osmWay({ id: 'w5', nodes: ['n0', 'n4'], tags: { highway: 'primary', oneway: 'yes', lane_markings: 'no' } }),
            new iD.osmWay({ id: 'w6', nodes: ['n4', 'n5'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'connectivity', connectivity: '1:1|2:2,(3)' }, members: [
                { id: 'w1', type: 'way', role: 'from' }, { id: 'w5', type: 'way', role: 'via' }, { id: 'w6', type: 'way', role: 'to' }] })
        ]);
        const r = resolveConnectivity(g, g.entity('r1' as any) as any);
        expect(r).toMatchObject({ fromNode: 'n0', toNode: 'n4', fromDirection: 'forward', toDirection: 'forward', viaWays: ['w5'] });
        const declared = laneLinksAt(g, 'n0').filter(l => l.declared);
        expect(declared.map(l => `${connectivityLane(l.from.ref)}>${connectivityLane(l.to.ref)}${l.optional ? '?' : ''}`)).toEqual(['1>1', '2>2', '2>3?']);
        expect(declared.every(l => l.toNodeID === 'n4' && l.viaWays?.[0] === 'w5')).toBe(true);
        expect(findConnectivity(g, 'w1' as any, 'n0' as any, 'w6' as any)?.id).toBe('r1');
        expect(connectionNode(g, lane('w1', 'forward', 0, 'n1', 'n0'), lane('w6', 'forward', 2, 'n4', 'n5'))).toEqual({ nodeID: 'n0' });
    });

    it('finds problems in a relation: members, roads not joined, lanes the roads do not have', () => {
        const relation = (members: any[], connectivity = '1:1') => {
            const g = junction([new iD.osmRelation({ id: 'r1', tags: { type: 'connectivity', connectivity }, members })]);
            return connectivityProblems(g, g.entity('r1' as any) as any);
        };
        const fromVia = [{ id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }];
        expect(relation([...fromVia, { id: 'w2', type: 'way', role: 'to' }], '1:1|2:2')).toEqual([]);
        expect(relation([...fromVia, { id: 'w2', type: 'way', role: 'to' }], '1:3')).toEqual(['to_lane']);
        expect(relation([...fromVia, { id: 'w2', type: 'way', role: 'to' }], '3:1')).toEqual(['from_lane']);
        expect(relation(fromVia)).toEqual(['members']);
        expect(relation([{ id: 'w1', type: 'way', role: 'from' }, { id: 'n2', type: 'node', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }])).toEqual(['not_joined']);
        // (East Street is one way away from the junction: no lane of it arrives there)
        expect(relation([{ id: 'w2', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w3', type: 'way', role: 'to' }])).toEqual(['from_lane']);
    });

    it('reports connectivity relations in the Issues pane, fixing two from lanes in one statement', () => {
        const g = junction([new iD.osmRelation({ id: 'r1', tags: { type: 'connectivity', connectivity: '1,2:1' }, members: [
            { id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }] })]);
        const context = iD.coreContext().assetPath('../dist/').init();
        const issues = validationLaneTags(context)(g.entity('r1' as any), g);
        expect(issues.map(i => i.subtype)).toEqual(['connectivity_syntax']);
        expect(issues[0].dynamicFixes!(context)).toHaveLength(1);
    });
});
