import {
    markingType, withMarkingType, crossingOptions, withCrossing, withDirection, passingPlaceDirection, withPassingPlaceDirection
} from '../../../../modules/lanes/model/markings';

describe('road marking tags', () => {
    it('reads the marking type', () => {
        expect(markingType({ highway: 'crossing' })).toBe('crossing');
        expect(markingType({ highway: 'give_way' })).toBe('give_way');
        expect(markingType({ traffic_calming: 'table' })).toBe('calming');
        expect(markingType({ traffic_calming: 'island' })).toBe('calming');
        expect(markingType({ highway: 'passing_place' })).toBe('passing_place');
        expect(markingType({ barrier: 'bollard' })).toBe('none');
    });

    it('writes a passing place\'s side by the traffic beside it', () => {
        expect(passingPlaceDirection({ passing_place: 'left' }, 'left')).toBe('forward');
        expect(passingPlaceDirection({ passing_place: 'left' }, 'right')).toBe('backward');
        expect(passingPlaceDirection({}, 'left')).toBe('both');
        expect(withPassingPlaceDirection({ highway: 'passing_place' }, 'backward', 'left')).toEqual({ highway: 'passing_place', passing_place: 'right' });
        expect(withPassingPlaceDirection({ highway: 'passing_place' }, 'both', 'left')).toEqual({ highway: 'passing_place', passing_place: 'both' });
    });

    it('switches type and removes the old type\'s keys only', () => {
        const crossing = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra', 'crossing:island': 'yes', name: 'x' };
        expect(withMarkingType(crossing, 'stop')).toEqual({ highway: 'stop', name: 'x' });
        expect(withMarkingType({ highway: 'stop', direction: 'forward' }, 'calming')).toEqual({ traffic_calming: 'hump' });
        expect(withMarkingType({}, 'crossing')).toEqual({ highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' });
        expect(withMarkingType({ highway: 'give_way', direction: 'backward' }, 'none')).toEqual({});
    });

    it('reads and writes crossings in the current scheme', () => {
        expect(crossingOptions({ crossing: 'traffic_signals' })).toEqual({ markings: 'lines', signals: true, island: false });
        expect(crossingOptions({ crossing: 'unmarked' }).markings).toBe('no');
        expect(withCrossing({ highway: 'crossing' }, { markings: 'zebra', signals: false, island: true })).toEqual({
            highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra', 'crossing:signals': 'no', 'crossing:island': 'yes'
        });
        expect(withCrossing({ highway: 'crossing', 'crossing:island': 'yes' }, { markings: 'no', signals: false, island: false })).toMatchObject({
            crossing: 'unmarked', 'crossing:island': 'no'
        });
    });

    it('sets the direction a sign applies to', () => {
        expect(withDirection({ highway: 'stop' }, 'forward')).toEqual({ highway: 'stop', direction: 'forward' });
        expect(withDirection({ highway: 'stop', direction: 'forward' }, 'both')).toEqual({ highway: 'stop' });
    });
});
