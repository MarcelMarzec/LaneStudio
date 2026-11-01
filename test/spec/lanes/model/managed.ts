import {
    canBeManaged, isVariableSpeed, managedBadge, managedScheme, variableSpeedReasonsOf, withManagedScheme, withVariableSpeed
} from '../../../../modules/lanes/model/managed';


describe('active traffic management', () => {
    it('is offered on motorways and trunk roads', () => {
        expect(canBeManaged({ highway: 'motorway' })).toBe(true);
        expect(canBeManaged({ highway: 'trunk' })).toBe(true);
        expect(canBeManaged({ highway: 'primary' })).toBe(false);
    });

    it('reads the scheme from the road', () => {
        const managed = { active_traffic_management: 'yes' };
        expect(managedScheme({}, false)).toBe('none');
        expect(managedScheme({ active_traffic_management: 'no' }, false)).toBe('none');
        expect(managedScheme(managed, false)).toBe('controlled');
        expect(managedScheme({ ...managed, shoulder: 'no' }, false)).toBe('all_lanes_running');
        expect(managedScheme({ ...managed, shoulder: 'no' }, true)).toBe('dynamic_hard_shoulder');
    });

    it('writes the wiki\'s all lanes running tags', () => {
        expect(withManagedScheme({ highway: 'motorway' }, 'all_lanes_running')).toEqual({
            highway: 'motorway', active_traffic_management: 'yes', 'maxspeed:variable': 'yes', shoulder: 'no'
        });
    });

    it('gives the hard shoulder back in a controlled scheme', () => {
        const next = withManagedScheme({ active_traffic_management: 'yes', shoulder: 'no', 'maxspeed:variable': 'weather' }, 'controlled');
        expect(next).toEqual({ active_traffic_management: 'yes', 'maxspeed:variable': 'weather' });
    });

    it('leaves a variable limit when the scheme goes', () => {
        const next = withManagedScheme({ active_traffic_management: 'yes', 'maxspeed:variable': 'yes', shoulder: 'no' }, 'none');
        expect(next).toEqual({ 'maxspeed:variable': 'yes' });
    });

    it('badges a scheme, then a variable limit', () => {
        expect(managedBadge({ active_traffic_management: 'yes' }, false)).toBe('controlled');
        expect(managedBadge({ 'maxspeed:variable': 'weather' }, false)).toBe('variable_speed');
        expect(managedBadge({ 'maxspeed:variable': 'no' }, false)).toBeNull();
        expect(managedBadge({}, false)).toBeNull();
    });
});


describe('variable speed limits', () => {
    it('is read from any direction, and the old maxspeed=signals', () => {
        expect(isVariableSpeed({ 'maxspeed:variable': 'yes' })).toBe(true);
        expect(isVariableSpeed({ 'maxspeed:variable:forward': 'obstruction' })).toBe(true);
        expect(isVariableSpeed({ maxspeed: 'signals' })).toBe(true);
        expect(isVariableSpeed({ maxspeed: '70 mph' })).toBe(false);
    });

    it('reads and writes reasons', () => {
        expect(variableSpeedReasonsOf({ 'maxspeed:variable': 'weather;peak_traffic' })).toEqual(['weather', 'peak_traffic']);
        expect(variableSpeedReasonsOf({ 'maxspeed:variable': 'yes' })).toEqual([]);
        expect(withVariableSpeed({}, true)).toEqual({ 'maxspeed:variable': 'yes' });
        expect(withVariableSpeed({}, true, ['weather', 'obstruction'])).toEqual({ 'maxspeed:variable': 'weather;obstruction' });
        expect(withVariableSpeed({ 'maxspeed:variable': 'yes' }, false)).toEqual({});
    });
});
