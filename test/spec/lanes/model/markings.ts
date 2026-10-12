import {
    markingType, withMarkingType, crossingOptions, withCrossing, withDirection
} from '../../../../modules/lanes/model/markings';

describe('road marking tags', () => {
    it('reads the marking type', () => {
        expect(markingType({ highway: 'crossing' })).toBe('crossing');
        expect(markingType({ highway: 'give_way' })).toBe('give_way');
        expect(markingType({ traffic_calming: 'table' })).toBe('calming');
        expect(markingType({ traffic_calming: 'island' })).toBe('none');
        expect(markingType({ barrier: 'bollard' })).toBe('none');
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
