import { joinInto } from '../../../../modules/lanes/svg/routing';

describe('a route line joining the next road', () => {
    it('joins a road whose lanes begin behind the lane turned from further on, so the turn does not loop back', () => {
        // a right-turn slip lane heading south (screen y down) ending 7 m short of the road it turns west into
        const line: [number, number][] = [[606, 345], [415, 289]];
        const joined = joinInto([578, 278], [-0.23, 0.97], line);
        expect(joined[0][0]).toBeLessThan(578);
        expect(joined[joined.length - 1]).toEqual([415, 289]);
    });

    it('leaves a road starting ahead of the lane alone', () => {
        const line: [number, number][] = [[0, 20], [0, 100]];
        expect(joinInto([0, 10], [0, 1], line)).toBe(line);
        const turn: [number, number][] = [[10, 20], [100, 20]];
        expect(joinInto([0, 10], [0, 1], turn)).toBe(turn);
    });
});
