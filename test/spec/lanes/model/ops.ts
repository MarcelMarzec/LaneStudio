import {
    parseLanes, serialiseLanes, insertLane, removeLane, moveLane, setLaneValue,
    toggleTurn, parseTurn, formatTurn, parseChange, formatChange, dividerAt, setDivider, nextDivider
} from '../../../../modules/lanes/model';

type Model = ReturnType<typeof parseLanes>;
// eslint-disable-next-line no-unused-vars -- a parameter name in a function type
const edit = (tags: Tags, change: (model: Model) => Model, driveSide: 'left' | 'right' = 'right') =>
    serialiseLanes(change(parseLanes(tags, { driveSide })), tags);


describe('insertLane', () => {
    it('adds a slot to every lane key, keeping their style', () => {
        const tags = {
            highway: 'primary', oneway: 'yes', lanes: '2', maxspeed: '50',
            'turn:lanes': 'left|through', 'maxspeed:lanes': '|40', 'fancy:lanes': 'a|b'
        };
        const result = edit(tags, m => insertLane(m, 'forward'));
        expect(result).toEqual({
            highway: 'primary', oneway: 'yes', lanes: '3', maxspeed: '50',
            'turn:lanes': 'left|through|none', 'maxspeed:lanes': '|40|', 'fancy:lanes': 'a|b|'
        });
    });

    it('keeps empty-slot style in turn:lanes', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left|' };
        expect(edit(tags, m => insertLane(m, 'forward', 0))['turn:lanes']).toBe('|left|');
    });

    it('writes counts on a two-way road', () => {
        const tags = { highway: 'primary', lanes: '2' };
        expect(edit(tags, m => insertLane(m, 'forward'))).toEqual({
            highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1'
        });
    });

    it('writes an assumed count once the user changes it', () => {
        expect(edit({ highway: 'residential' }, m => insertLane(m, 'both_ways'))).toEqual({
            highway: 'residential', lanes: '3', 'lanes:forward': '1', 'lanes:backward': '1', 'lanes:both_ways': '1'
        });
    });

    it('refuses the wrong direction on a one-way road', () => {
        expect(() => insertLane(parseLanes({ highway: 'primary', oneway: 'yes' }), 'backward')).toThrow();
    });

    it('leaves read-only keys alone and reports them', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '2', 'maxspeed:lanes:conditional': '100|60 @ (wet)' };
        const model = insertLane(parseLanes(tags), 'forward');
        expect(serialiseLanes(model, tags)['maxspeed:lanes:conditional']).toBe('100|60 @ (wet)');
        expect(model.issues).toContainEqual({ code: 'key_not_updated', key: 'maxspeed:lanes:conditional' });
    });

    it('does not change its input', () => {
        const model = parseLanes({ highway: 'primary', oneway: 'yes', lanes: '1', 'turn:lanes': 'left' });
        insertLane(model, 'forward');
        expect(model.lanes.forward).toHaveLength(1);
        expect(model.countsTouched).toBe(false);
    });
});


describe('removeLane', () => {
    it('drops the slot everywhere and removes keys that become empty', () => {
        const tags = {
            highway: 'primary', lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2',
            'turn:lanes:forward': 'left|none', 'bus:lanes:backward': 'designated|'
        };
        const result = edit(tags, m => removeLane(removeLane(m, { direction: 'forward', index: 0 }), { direction: 'backward', index: 0 }));
        expect(result).toEqual({ highway: 'primary', lanes: '2', 'lanes:forward': '1', 'lanes:backward': '1' });
    });

    it('never removes the last lane', () => {
        expect(() => removeLane(parseLanes({ highway: 'primary', oneway: 'yes', lanes: '1' }), { direction: 'forward', index: 0 })).toThrow();
    });
});


describe('moveLane', () => {
    it('moves a lane to the centre group with its values', () => {
        const tags = {
            highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1',
            'turn:lanes:forward': 'left|through'
        };
        const result = edit(tags, m => moveLane(m, { direction: 'forward', index: 0 }, 'both_ways'));
        expect(result).toEqual({
            highway: 'primary', lanes: '3', 'lanes:forward': '1', 'lanes:backward': '1', 'lanes:both_ways': '1',
            'turn:lanes:forward': 'through', 'turn:lanes:both_ways': 'left'
        });
    });
});


describe('setLaneValue', () => {
    it('creates a new turn key with none on the other lanes', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3' };
        expect(edit(tags, m => setLaneValue(m, { direction: 'forward', index: 0 }, 'turn:lanes', 'left'))).toEqual({
            ...tags, 'turn:lanes': 'left|none|none'
        });
    });

    it('creates a directional key on a two-way road', () => {
        const tags = { highway: 'primary', lanes: '2' };
        expect(edit(tags, m => setLaneValue(m, { direction: 'backward', index: 0 }, 'maxspeed:lanes', '30'))).toEqual({
            ...tags, 'maxspeed:lanes:backward': '30'
        });
    });

    it('writes empty slots for other keys and only touches that key', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left||', 'fancy:lanes': 'x|y|z' };
        expect(edit(tags, m => setLaneValue(m, { direction: 'forward', index: 2 }, 'bus:lanes', 'designated'))).toEqual({
            ...tags, 'bus:lanes': '||designated'
        });
    });

    it('updates a combined key in place', () => {
        const tags = { highway: 'primary', lanes: '2', 'access:lanes': 'yes|yes' };
        expect(edit(tags, m => setLaneValue(m, { direction: 'forward', index: 0 }, 'access:lanes', 'no'))['access:lanes']).toBe('yes|no');
        expect(edit(tags, m => setLaneValue(m, { direction: 'forward', index: 0 }, 'access:lanes', 'no'), 'left')['access:lanes']).toBe('no|yes');
    });

    it('sets several lanes at once', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3' };
        const refs = [{ direction: 'forward', index: 1 }, { direction: 'forward', index: 2 }] as const;
        expect(edit(tags, m => setLaneValue(m, [...refs], 'maxspeed:lanes', '80'))['maxspeed:lanes']).toBe('|80|80');
    });

    it('refuses read-only keys', () => {
        const model = parseLanes({ highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left' });
        expect(() => setLaneValue(model, { direction: 'forward', index: 0 }, 'turn:lanes', 'right')).toThrow();
    });
});


describe('turn values', () => {
    it('parses, formats and toggles', () => {
        expect(parseTurn('left;through')).toEqual(['left', 'through']);
        expect(parseTurn('none')).toEqual([]);
        expect(formatTurn(['through', 'left'])).toBe('left;through');
        expect(formatTurn([])).toBe('none');
        expect(toggleTurn('left', 'through')).toBe('left;through');
        expect(toggleTurn('left;through', 'left')).toBe('through');
        expect(toggleTurn('left', 'left')).toBe('none');
    });
});


describe('lane change dividers', () => {
    it('reads and writes change values', () => {
        expect(parseChange('not_left')).toEqual({ toLeft: false, toRight: true });
        expect(parseChange('only_left')).toEqual({ toLeft: true, toRight: false });
        expect(parseChange('')).toBeUndefined();
        expect(formatChange({ toLeft: true, toRight: false })).toBe('not_right');
    });

    it('sets a solid divider between two lanes', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3' };
        const model = setDivider(parseLanes(tags), 'forward', 0, { leftToRight: false, rightToLeft: false });
        expect(serialiseLanes(model, tags)['change:lanes']).toBe('not_right|not_left|');
        expect(dividerAt(model, 'forward', 0)).toEqual({ leftToRight: false, rightToLeft: false });
        expect(dividerAt(model, 'forward', 1)).toEqual({ leftToRight: true, rightToLeft: true });
    });

    it('cycles dashed, solid, one way, the other way', () => {
        const dashed = { leftToRight: true, rightToLeft: true };
        const solid = nextDivider(dashed);
        expect(solid).toEqual({ leftToRight: false, rightToLeft: false });
        const oneWay = nextDivider(solid);
        expect(oneWay).toEqual({ leftToRight: true, rightToLeft: false });
        expect(nextDivider(nextDivider(oneWay))).toEqual(dashed);
    });
});


describe('moveLane within a direction', () => {
    it('reorders lanes and every key with them', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through|right', 'bus:lanes': 'designated||' };
        const result = edit(tags, m => moveLane(m, { direction: 'forward', index: 0 }, 'forward', 2));
        expect(result).toEqual({ ...tags, 'turn:lanes': 'through|right|left', 'bus:lanes': '||designated' });
    });
});
