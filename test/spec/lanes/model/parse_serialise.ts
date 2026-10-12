import {
    parseLanes, serialiseLanes, laneRefsInWayOrder, parseLaneTagKey, laneTagKey, laneOneway
} from '../../../../modules/lanes/model';

// Real-world shaped tag sets (tags only, no geometry) that must survive a round trip unchanged
const fixtures: Record<string, Tags> = {
    'UK motorway approach to a junction': {
        highway: 'motorway', lanes: '4', maxspeed: '70 mph',
        'turn:lanes': 'none|none|slight_left|slight_left',
        'destination:lanes': 'London|London|Reading|Reading',
        'destination:ref:lanes': 'M4|M4|A33|A33'
    },
    'two-way road with a centre turn lane (US)': {
        highway: 'primary', lanes: '5', 'lanes:forward': '2', 'lanes:backward': '2', 'lanes:both_ways': '1',
        'turn:lanes:forward': 'none|right', 'turn:lanes:backward': 'none|none', 'turn:lanes:both_ways': 'left'
    },
    'bus lane on a one-way road': {
        highway: 'secondary', oneway: 'yes', lanes: '3',
        'bus:lanes': '||designated', 'psv:lanes': '||designated', 'access:lanes': '||no'
    },
    'oneway=-1 with turn lanes': {
        highway: 'tertiary', oneway: '-1', lanes: '2', 'turn:lanes': 'left|through;right'
    },
    'combined access:lanes on a two-way road': {
        highway: 'residential', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1',
        'access:lanes': 'yes|yes|no'
    },
    'conditional and unknown keys': {
        highway: 'trunk', oneway: 'yes', lanes: '2',
        'maxspeed:lanes': '100|80',
        'maxspeed:lanes:conditional': '100|60 @ (wet)',
        'fancy_new_key:lanes': 'a|b'
    },
    'mismatched turn:lanes is kept': {
        highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through'
    },
    'width per lane with start and end': {
        highway: 'primary', oneway: 'yes', lanes: '2',
        'width:lanes': '3.5|3', 'width:lanes:start': '3.5|0', 'width:lanes:end': '3.5|3'
    },
    'turbo roundabout segment': {
        highway: 'primary', junction: 'roundabout', roundabout: 'turbo', lanes: '2', 'change:lanes': 'no|no'
    },
    'no lane tags at all': {
        highway: 'residential', name: 'High Street'
    },
    'empty slots inherit': {
        highway: 'primary', oneway: 'yes', lanes: '3', maxspeed: '100', 'maxspeed:lanes': '||80'
    },
    'hov lanes': {
        highway: 'motorway', lanes: '3', 'hov:lanes': 'designated|no|no', 'hov:minimum': '2'
    }
};


describe('lane tag keys', () => {
    it('parses key ids and directions', () => {
        expect(parseLaneTagKey('turn:lanes')).toMatchObject({ id: 'turn:lanes', base: 'turn', direction: undefined });
        expect(parseLaneTagKey('turn:lanes:forward')).toMatchObject({ id: 'turn:lanes', direction: 'forward' });
        expect(parseLaneTagKey('destination:ref:lanes:backward')).toMatchObject({ id: 'destination:ref:lanes', base: 'destination:ref', direction: 'backward' });
        expect(parseLaneTagKey('maxspeed:lanes:forward:conditional')).toMatchObject({ id: 'maxspeed:lanes:conditional', direction: 'forward', conditional: true });
        expect(parseLaneTagKey('width:lanes:start')).toMatchObject({ id: 'width:lanes:start', direction: undefined });
    });

    it('ignores count keys and free-text keys', () => {
        for (const key of ['lanes', 'lanes:forward', 'lanes:bus', 'source:lanes', 'note:lanes', 'highway']) {
            expect(parseLaneTagKey(key)).toBeNull();
        }
    });

    it('builds directional keys', () => {
        expect(laneTagKey('turn:lanes', 'forward')).toBe('turn:lanes:forward');
        expect(laneTagKey('maxspeed:lanes:conditional', 'backward')).toBe('maxspeed:lanes:backward:conditional');
        expect(laneTagKey('turn:lanes')).toBe('turn:lanes');
    });
});


describe('laneOneway', () => {
    it('follows oneway tags and implied oneways', () => {
        expect(laneOneway({ highway: 'primary' })).toBe(false);
        expect(laneOneway({ highway: 'primary', oneway: 'yes' })).toBe('forward');
        expect(laneOneway({ highway: 'primary', oneway: '-1' })).toBe('backward');
        expect(laneOneway({ highway: 'primary', junction: 'roundabout' })).toBe('forward');
        expect(laneOneway({ highway: 'motorway' })).toBe('forward');
        expect(laneOneway({ highway: 'motorway', oneway: 'no' })).toBe(false);
    });
});


describe('parseLanes', () => {
    it('reads a one-way road', () => {
        const model = parseLanes(fixtures['UK motorway approach to a junction']);
        expect(model.oneway).toBe('forward');
        expect(model.countSource).toBe('tagged');
        expect(model.lanes.forward).toHaveLength(4);
        expect(model.lanes.backward).toHaveLength(0);
        expect(model.lanes.forward[2].values['turn:lanes']).toBe('slight_left');
        expect(model.lanes.forward[0].values['destination:ref:lanes']).toBe('M4');
        expect(model.issues).toEqual([]);
    });

    it('reads a two-way road with a centre lane', () => {
        const model = parseLanes(fixtures['two-way road with a centre turn lane (US)']);
        expect(model.oneway).toBe(false);
        expect(model.lanes.forward).toHaveLength(2);
        expect(model.lanes.backward).toHaveLength(2);
        expect(model.lanes.both_ways).toHaveLength(1);
        expect(model.keys['turn:lanes'].style).toBe('directional');
        expect(model.lanes.forward[1].values['turn:lanes']).toBe('right');
        expect(model.lanes.both_ways[0].values['turn:lanes']).toBe('left');
    });

    it('reads oneway=-1 lanes as backward lanes', () => {
        const model = parseLanes(fixtures['oneway=-1 with turn lanes']);
        expect(model.oneway).toBe('backward');
        expect(model.lanes.backward.map(l => l.values['turn:lanes'])).toEqual(['left', 'through;right']);
    });

    it('distributes a combined key in way order (right-hand traffic)', () => {
        const model = parseLanes(fixtures['combined access:lanes on a two-way road'], { driveSide: 'right' });
        expect(model.keys['access:lanes'].style).toBe('combined');
        // way order: backward lanes (reversed), then forward lanes
        expect(model.lanes.backward[0].values['access:lanes']).toBe('yes');
        expect(model.lanes.forward[0].values['access:lanes']).toBe('yes');
        expect(model.lanes.forward[1].values['access:lanes']).toBe('no');
    });

    it('distributes a combined key in way order (left-hand traffic)', () => {
        const model = parseLanes(fixtures['combined access:lanes on a two-way road'], { driveSide: 'left' });
        // way order: forward lanes, then backward lanes (reversed)
        expect(model.lanes.forward[0].values['access:lanes']).toBe('yes');
        expect(model.lanes.forward[1].values['access:lanes']).toBe('yes');
        expect(model.lanes.backward[0].values['access:lanes']).toBe('no');
    });

    it('keeps conditional keys and mismatched keys read-only', () => {
        const conditional = parseLanes(fixtures['conditional and unknown keys']);
        expect(conditional.keys['maxspeed:lanes:conditional'].readonly).toBe(true);
        expect(conditional.keys['fancy_new_key:lanes'].readonly).toBe(false);

        const mismatched = parseLanes(fixtures['mismatched turn:lanes is kept']);
        expect(mismatched.keys['turn:lanes'].readonly).toBe(true);
        expect(mismatched.issues).toContainEqual(expect.objectContaining({ code: 'count_mismatch', key: 'turn:lanes', expected: 3, actual: 2 }));
    });

    it('assumes the wiki defaults when nothing is tagged', () => {
        const residential = parseLanes({ highway: 'residential' });
        expect(residential.countSource).toBe('assumed');
        expect(residential.lanes.forward).toHaveLength(1);
        expect(residential.lanes.backward).toHaveLength(1);

        const service = parseLanes({ highway: 'service' });
        expect(service.lanes.both_ways).toHaveLength(1);
        expect(service.lanes.forward).toHaveLength(0);

        const oneway = parseLanes({ highway: 'primary', oneway: 'yes' });
        expect(oneway.lanes.forward).toHaveLength(1);
    });

    it('infers the count from lane keys when `lanes` is missing', () => {
        const model = parseLanes({ highway: 'primary', oneway: 'yes', 'turn:lanes': 'left|through|right' });
        expect(model.countSource).toBe('inferred');
        expect(model.lanes.forward).toHaveLength(3);
    });

    it('splits an even two-way count and flags an odd one', () => {
        const even = parseLanes({ highway: 'primary', lanes: '4' });
        expect([even.lanes.forward.length, even.lanes.backward.length]).toEqual([2, 2]);
        expect(even.issues).toEqual([]);

        const odd = parseLanes({ highway: 'primary', lanes: '3' });
        expect(odd.lanes.forward.length + odd.lanes.backward.length).toBe(3);
        expect(odd.issues).toContainEqual(expect.objectContaining({ code: 'ambiguous_direction_counts' }));
    });

    it('treats a two-way lanes=1 as one lane shared by both directions', () => {
        const model = parseLanes({ highway: 'unclassified', lanes: '1' });
        expect(model.lanes.both_ways).toHaveLength(1);
        expect(model.issues).toEqual([]);
    });

    it('flags counts that do not add up and invalid counts', () => {
        const model = parseLanes({ highway: 'primary', lanes: '4', 'lanes:forward': '1', 'lanes:backward': '1' });
        expect(model.issues).toContainEqual(expect.objectContaining({ code: 'direction_counts_mismatch', expected: 4, actual: 2 }));

        const invalid = parseLanes({ highway: 'primary', oneway: 'yes', lanes: '1.5' });
        expect(invalid.issues).toContainEqual(expect.objectContaining({ code: 'invalid_lane_count' }));
    });
});


describe('laneRefsInWayOrder', () => {
    const tags = { highway: 'primary', 'lanes:forward': '2', 'lanes:backward': '1', 'lanes:both_ways': '1', lanes: '4' };

    it('puts backward lanes left of forward lanes in right-hand traffic', () => {
        const refs = laneRefsInWayOrder(parseLanes(tags, { driveSide: 'right' }));
        expect(refs).toEqual([
            { direction: 'backward', index: 0 },
            { direction: 'both_ways', index: 0 },
            { direction: 'forward', index: 0 },
            { direction: 'forward', index: 1 }
        ]);
    });

    it('puts forward lanes left of backward lanes in left-hand traffic', () => {
        const refs = laneRefsInWayOrder(parseLanes(tags, { driveSide: 'left' }));
        expect(refs.map(r => r.direction)).toEqual(['forward', 'forward', 'both_ways', 'backward']);
    });
});


describe('serialiseLanes round trip', () => {
    for (const [name, tags] of Object.entries(fixtures)) {
        for (const driveSide of ['left', 'right'] as const) {
            it(`keeps "${name}" unchanged (${driveSide}-hand traffic)`, () => {
                expect(serialiseLanes(parseLanes(tags, { driveSide }), tags)).toEqual(tags);
            });
        }
    }
});
