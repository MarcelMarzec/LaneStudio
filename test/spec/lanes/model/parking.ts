import {
    formatConditional, hasOldParkingTags, kerbMarking, parkingBadgeParts, parkingUse, parkingValue, parseConditional, shortDuration,
    upgradeOldParking, withoutParkingSide, withParkingValue
} from '../../../../modules/lanes/model/parking';
import { centreLine, withCentreLine, withOvertaking } from '../../../../modules/lanes/model/street_features';
import { canBeManaged, showsManaged } from '../../../../modules/lanes/model/managed';
import { kerbLaneAt } from '../../../../modules/lanes/ui/road_sections';
import { parseLanes } from '../../../../modules/lanes/model';


describe('street parking (wiki: Street parking)', () => {
    it('reads a side through parking:both', () => {
        const tags = { 'parking:both': 'lane', 'parking:both:orientation': 'diagonal', 'parking:right:fee': 'yes' };
        expect(parkingValue(tags, 'left')).toBe('lane');
        expect(parkingValue(tags, 'right', 'orientation')).toBe('diagonal');
        expect(parkingValue(tags, 'left', 'fee')).toBeUndefined();
        expect(parkingValue(tags, 'right', 'fee')).toBe('yes');
    });

    it('writes parking:both when both sides match, and per side when they differ', () => {
        let tags: Tags = { 'parking:left': 'lane' };
        tags = withParkingValue(tags, 'right', '', 'lane');
        expect(tags).toEqual({ 'parking:both': 'lane' });
        tags = withParkingValue(tags, 'left', '', 'no');
        expect(tags).toEqual({ 'parking:left': 'no', 'parking:right': 'lane' });
        tags = withParkingValue(tags, 'right', 'maxstay', '2 hours');
        expect(tags['parking:right:maxstay']).toBe('2 hours');
        expect(withoutParkingSide({ 'parking:both': 'lane', 'parking:both:fee': 'yes' }, 'left'))
            .toEqual({ 'parking:right': 'lane', 'parking:right:fee': 'yes' });
    });

    it('reads and writes values at times', () => {
        expect(parseConditional('no_parking @ (Mo-Sa 08:00-18:30)')).toEqual([{ value: 'no_parking', condition: 'Mo-Sa 08:00-18:30' }]);
        expect(parseConditional('no_parking @ (Mo-Fr 07:00-09:00; Sa 10:00-12:00); none @ (Su)')).toHaveLength(2);
        expect(parseConditional('not conditional')).toBeNull();
        expect(formatConditional([{ value: 'no', condition: 'Mo-Fr 20:00-24:00; Su' }])).toBe('no @ (Mo-Fr 20:00-24:00; Su)');
    });

    it('paints yellow and red lines as UK no-waiting lines, only where nobody parks on the road', () => {
        expect(kerbMarking({ 'parking:left': 'no', 'parking:left:restriction': 'no_parking' }, 'left')).toBe('double_yellow');
        expect(kerbMarking({ 'parking:left:restriction:conditional': 'no_parking @ (Mo-Sa 08:00-18:30)' }, 'left')).toBe('single_yellow');
        expect(kerbMarking({ 'parking:both:restriction': 'no_stopping' }, 'right')).toBe('double_red');
        expect(kerbMarking({ 'parking:both:restriction': 'no_parking', 'parking:both:restriction:conditional': 'none @ (Su)' }, 'right')).toBe('single_yellow');
        expect(kerbMarking({ 'parking:left': 'lane', 'parking:left:restriction': 'no_parking' }, 'left')).toBeUndefined();
        expect(kerbMarking({ 'parking:left': 'no' }, 'left')).toBeUndefined();
    });

    it('knows what parking is kept for, and its badge', () => {
        expect(parkingUse({ 'parking:left:restriction': 'loading_only' }, 'left')).toBe('loading');
        expect(parkingUse({ 'parking:both:access': 'private' }, 'right')).toBe('permit');
        expect(parkingUse({ restriction: 'charging_only' })).toBe('charging');
        expect(parkingBadgeParts(key => ({ fee: 'yes', maxstay: '2 hours', zone: 'A' } as Tags)[key]))
            .toMatchObject({ fee: 'yes', maxstay: '2h', zone: 'A' });
        expect(shortDuration('30 minutes')).toBe('30m');
    });

    it('upgrades the old scheme', () => {
        const old = {
            highway: 'residential', 'parking:lane:both': 'parallel', 'parking:lane:both:parallel': 'on_street',
            'parking:condition:right': 'ticket', 'parking:condition:right:maxstay': '2 hours',
            'parking:condition:left': 'no_parking', 'parking:condition:left:time_interval': 'Mo-Fr 08:00-18:00'
        };
        expect(hasOldParkingTags(old)).toBe(true);
        const next = upgradeOldParking(old);
        expect(hasOldParkingTags(next)).toBe(false);
        expect(next).toMatchObject({
            'parking:both': 'lane', 'parking:both:orientation': 'parallel', 'parking:right:fee': 'yes', 'parking:right:maxstay': '2 hours',
            'parking:left:restriction:conditional': 'no_parking @ (Mo-Fr 08:00-18:00)'
        });
    });
});


describe('the centre line (wiki: Key:overtaking)', () => {
    it('reads who may not overtake', () => {
        expect(centreLine({})).toBe('dashed');
        expect(centreLine({ overtaking: 'no' })).toBe('no_both');
        expect(centreLine({ overtaking: 'backward' })).toBe('no_forward');
        expect(centreLine({ 'overtaking:backward': 'no' })).toBe('no_backward');
    });

    it('writes one direction at a time, or both together', () => {
        expect(withCentreLine({ overtaking: 'no' }, 'no_forward')).toEqual({ 'overtaking:forward': 'no' });
        expect(withOvertaking({ 'overtaking:forward': 'no' }, 'backward', true)).toEqual({ overtaking: 'no' });
        expect(withOvertaking({ overtaking: 'no' }, 'forward', false)).toEqual({ 'overtaking:backward': 'no' });
        expect(withOvertaking({ 'overtaking:backward': 'no' }, 'backward', false)).toEqual({ overtaking: 'yes' });
    });
});


describe('active traffic management in the sidebar', () => {
    it('shows on motorways, and elsewhere only once tagged', () => {
        expect(showsManaged({ highway: 'motorway' })).toBe(true);
        expect(showsManaged({ highway: 'trunk' })).toBe(false);
        expect(showsManaged({ highway: 'trunk', 'maxspeed:variable': 'yes' })).toBe(true);
        expect(showsManaged({ highway: 'motorway_link', active_traffic_management: 'yes' })).toBe(true);
        expect(canBeManaged({ highway: 'trunk_link' })).toBe(true);
        expect(canBeManaged({ highway: 'primary' })).toBe(false);
    });
});


describe('a lane added at the kerb', () => {
    it('goes beside the kerb of that side, for its traffic', () => {
        const left = parseLanes({ highway: 'primary', lanes: '2' }, { driveSide: 'left' });
        expect(kerbLaneAt(left, 'left')).toEqual({ direction: 'forward', index: 0 });
        expect(kerbLaneAt(left, 'right')).toEqual({ direction: 'backward', index: 0 });
        const right = parseLanes({ highway: 'primary', lanes: '2' }, { driveSide: 'right' });
        expect(kerbLaneAt(right, 'right')).toEqual({ direction: 'forward', index: 1 });
        expect(kerbLaneAt(right, 'left')).toEqual({ direction: 'backward', index: 1 });
        const oneway = parseLanes({ highway: 'primary', oneway: 'yes', lanes: '2' }, { driveSide: 'left' });
        expect(kerbLaneAt(oneway, 'right')).toEqual({ direction: 'forward', index: 2 });
    });
});
