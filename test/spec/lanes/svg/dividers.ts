import { dividerClass } from '../../../../modules/lanes/svg/lanes';
import type { LaneInfo } from '../../../../modules/lanes/geometry/layout';

const lane = (direction: string) => ({ ref: { direction, index: 0 }, kind: 'general' }) as unknown as LaneInfo;
const [forward, backward, bothWays] = ['forward', 'backward', 'both_ways'].map(lane);


describe('the line between lanes going opposite ways', () => {
    it('is a dashed line unless overtaking is banned', () => {
        expect(dividerClass(forward, backward, true, {})).toBe('dashed');
        expect(dividerClass(forward, backward, true, { overtaking: 'yes' })).toBe('dashed');
        expect(dividerClass(forward, bothWays, true, {})).toBe('dashed');
    });

    it('is a double solid line with overtaking=no', () => {
        expect(dividerClass(forward, backward, true, { overtaking: 'no' })).toBe('double-solid');
    });

    it('is solid on the side of the traffic that may not overtake', () => {
        expect(dividerClass(forward, backward, true, { overtaking: 'backward' })).toBe('solid-left');
        expect(dividerClass(forward, backward, true, { overtaking: 'forward' })).toBe('solid-right');
        expect(dividerClass(backward, forward, true, { 'overtaking:forward': 'no' })).toBe('solid-right');
    });

    it('is not drawn on a road without lane markings', () => {
        expect(dividerClass(forward, backward, false, { overtaking: 'no' })).toBe('none');
    });
});
