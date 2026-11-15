import { accessClassNames, laneAccess } from '../../../../modules/lanes/core/route_access';

describe('the Routing tool\'s colours by access', () => {
    const lane = (direction: string, kind = 'general', values: Record<string, string> = {}) => ({ direction, kind, values });

    it('colours a road by the vehicle\'s own key: red for no, green for yes, yellow for discouraged', () => {
        expect(laneAccess({ highway: 'service', hgv: 'no' }, 'hgv')?.cls).toBe('no');
        expect(laneAccess({ highway: 'service', hgv: 'yes' }, 'hgv')?.cls).toBe('yes');
        expect(laneAccess({ highway: 'service', hgv: 'discouraged' }, 'hgv')?.cls).toBe('discouraged');
        expect(laneAccess({ highway: 'service', hgv: 'delivery' }, 'hgv')?.cls).toBe('destination');
        expect(laneAccess({ highway: 'service', motor_vehicle: 'customers' }, 'car')?.cls).toBe('destination');
    });

    it('leaves a road with nothing tagged for the vehicle as it is', () => {
        expect(laneAccess({ highway: 'service' }, 'hgv')).toBeNull();
        expect(laneAccess({ highway: 'service', bicycle: 'no' }, 'hgv')).toBeNull();
        // a van's key says nothing of lorries, nor the other way round
        expect(laneAccess({ highway: 'service', goods: 'no' }, 'hgv')).toBeNull();
        expect(laneAccess({ highway: 'service', hgv: 'no' }, 'van')).toBeNull();
    });

    it('takes a key above the vehicle\'s own, marked as inherited', () => {
        const access = laneAccess({ highway: 'service', access: 'private', hgv: 'yes' }, 'car');
        expect(access).toMatchObject({ cls: 'permission', key: 'access', inherited: true });
        expect(laneAccess({ highway: 'service', access: 'private', hgv: 'yes' }, 'hgv')).toMatchObject({ cls: 'yes', inherited: false });
        expect(laneAccess({ highway: 'service', psv: 'designated' }, 'bus')).toMatchObject({ cls: 'designated', key: 'psv', inherited: true });
    });

    it('reads a direction\'s key for the lanes going that way', () => {
        const tags = { highway: 'primary', 'hgv:forward': 'no', hgv: 'destination' };
        expect(laneAccess(tags, 'hgv', lane('forward'))?.cls).toBe('no');
        expect(laneAccess(tags, 'hgv', lane('backward'))?.cls).toBe('destination');
    });

    it('closes a lane kept for other traffic, unless the lane says otherwise', () => {
        expect(laneAccess({ highway: 'primary', motor_vehicle: 'yes' }, 'car', lane('forward', 'bus', { 'bus:lanes': 'designated' }))?.cls).toBe('no');
        expect(laneAccess({ highway: 'primary' }, 'bus', lane('forward', 'bus', { 'bus:lanes': 'designated' }))?.cls).toBe('designated');
        expect(laneAccess({ highway: 'primary' }, 'bicycle', lane('forward', 'bus', { 'bus:lanes': 'designated' }))).toBeNull();
        expect(laneAccess({ highway: 'primary' }, 'car', lane('forward', 'general', { 'motor_vehicle:lanes': 'no' }))?.cls).toBe('no');
    });

    it('edges a road whose access changes at times', () => {
        const access = laneAccess({ highway: 'residential', 'hgv:conditional': 'no @ (Mo-Fr 07:00-19:00)' }, 'hgv');
        expect(access).toMatchObject({ cls: 'yes', conditional: true });
        expect(accessClassNames(access)).toBe(' access-yes access-inherited access-conditional');
        expect(accessClassNames(null)).toBe('');
    });
});
