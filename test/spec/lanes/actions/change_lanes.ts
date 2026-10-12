import { actionChangeLanes } from '../../../../modules/lanes/actions/change_lanes';
import { insertLane, setLaneValue, parseLanes } from '../../../../modules/lanes/model';

describe('actionChangeLanes', () => {
    // a short road in London, so drive side is left-hand traffic
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = () => new iD.coreGraph([
        new iD.osmNode({ id: 'n1', loc: [-0.1280, 51.5070] }),
        new iD.osmNode({ id: 'n2', loc: [-0.1270, 51.5070] }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', lanes: '2' } })
    ]);

    it('writes lane tags through the lane model', () => {
        const result = actionChangeLanes('w1', m => insertLane(m, 'forward'))(graph());
        expect(result.entity('w1').tags).toEqual({
            highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1'
        });
    });

    it('uses the drive side at the way, so combined keys land on the right lanes', () => {
        const g = graph().replace(graph().entity('w1').update({ tags: { highway: 'primary', lanes: '2', 'access:lanes': 'yes|yes' } }));
        const result = actionChangeLanes('w1', m => setLaneValue(m, { direction: 'forward', index: 0 }, 'access:lanes', 'no'))(g);
        // left-hand traffic: forward lanes are listed first along the way
        expect(result.entity('w1').tags['access:lanes']).toBe('no|yes');
    });

    it('keeps the meaning of lane tags when the way is reversed', () => {
        const g = actionChangeLanes('w1', m =>
            setLaneValue(insertLane(m, 'forward'), { direction: 'forward', index: 0 }, 'turn:lanes', 'left')
        )(graph());
        const reversed = iD.actionReverse('w1')(g);
        const before = parseLanes(g.entity('w1').tags);
        const after = parseLanes(reversed.entity('w1').tags);
        expect(after.lanes.backward.map(l => l.values['turn:lanes'])).toEqual(before.lanes.forward.map(l => l.values['turn:lanes']));
        expect(after.lanes.forward).toHaveLength(before.lanes.backward.length);
    });
});
