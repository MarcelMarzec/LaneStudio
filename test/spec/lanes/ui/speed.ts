import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import { junctionSpeedClass, laneSpeed, speedClassOf, speedTypeKind } from '../../../../modules/lanes/core/lane_speed';
import {
    mphOf, roadMaxspeed, roadSpeedPick, samePick, speedTypeOf, withRoadMinspeed, withRoadSpeed, withSpeedType
} from '../../../../modules/lanes/ui/speed_roundels';
import { speedPanel } from '../../../../modules/lanes/ui/speed_panel';

const road = (tags: Tags) => new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'residential', ...tags } });

describe('speed limits in mph', () => {
    it('reads limits in mph, and bare numbers as km/h', () => {
        expect(mphOf('30 mph')).toBe(30);
        expect(mphOf('20mph')).toBe(20);
        expect(mphOf('48')).toBe(30);
        expect(mphOf('80 km/h')).toBe(50);
        expect(mphOf('none')).toBeNull();
        expect(mphOf(undefined)).toBeNull();
    });

    it('colours a lane by its own limit, else its road\'s, and marks a road with none as missing', () => {
        expect(speedClassOf(undefined, road({ maxspeed: '30 mph' }))).toBe(30);
        expect(speedClassOf('20 mph', road({ maxspeed: '30 mph' }))).toBe(20);
        expect(speedClassOf(undefined, road({ maxspeed: '25 mph' }))).toBe('other');
        expect(speedClassOf(undefined, road({ maxspeed: 'signals' }))).toBe('other');
        expect(speedClassOf(undefined, road({}))).toBe('missing');
    });

    it('sets a road\'s limit, a UK limit type with its limit, or none', () => {
        expect(withRoadSpeed({ highway: 'residential' }, { kind: 'mph', mph: 20 })).toEqual({ highway: 'residential', maxspeed: '20 mph' });
        expect(withRoadSpeed({ highway: 'primary' }, { kind: 'type', type: 'GB:nsl_single' }))
            .toEqual({ highway: 'primary', maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' });
        expect(withRoadSpeed({ highway: 'motorway' }, { kind: 'type', type: 'GB:motorway' }))
            .toEqual({ highway: 'motorway', maxspeed: '70 mph', 'maxspeed:type': 'GB:motorway' });
        // a 20 zone is not the same as a plain 20
        expect(withRoadSpeed({}, { kind: 'type', type: 'GB:zone20' })).toEqual({ maxspeed: '20 mph', 'maxspeed:type': 'GB:zone20' });
        expect(withRoadSpeed({ maxspeed: '20 mph', 'maxspeed:type': 'GB:zone20' }, { kind: 'mph', mph: 20 })).toEqual({ maxspeed: '20 mph' });
        // leaving a type drops it, and the older source:maxspeed becomes maxspeed:type
        expect(withRoadSpeed({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' }, { kind: 'mph', mph: 40 })).toEqual({ maxspeed: '40 mph' });
        expect(withRoadSpeed({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' }, { kind: 'none' })).toEqual({});
        expect(withRoadSpeed({ 'source:maxspeed': 'GB:nsl_single' }, { kind: 'type', type: 'GB:nsl_dual' }))
            .toEqual({ maxspeed: '70 mph', 'maxspeed:type': 'GB:nsl_dual' });
        expect(withSpeedType({ maxspeed: '70 mph', 'maxspeed:type': 'GB:motorway' }, undefined)).toEqual({ maxspeed: '70 mph' });
    });

    it('reads the UK limit types from maxspeed:type, or source:maxspeed', () => {
        expect(speedTypeOf({ 'maxspeed:type': 'GB:nsl_dual' })).toBe('GB:nsl_dual');
        expect(speedTypeOf({ 'source:maxspeed': 'GB:motorway' })).toBe('GB:motorway');
        expect(speedTypeOf({ 'maxspeed:type': 'sign' })).toBeUndefined();
        // a type alone sets the limit
        expect(roadMaxspeed({ 'maxspeed:type': 'GB:nsl_restricted' })).toBe('30 mph');
        expect(roadMaxspeed({ 'maxspeed:type': 'GB:zone20' })).toBe('20 mph');
        expect(roadMaxspeed({ maxspeed: 'national', 'maxspeed:type': 'GB:nsl_single' })).toBe('60 mph');
        expect(roadMaxspeed({ maxspeed: '40 mph', 'maxspeed:type': 'GB:nsl_single' })).toBe('40 mph');
        expect(speedClassOf(undefined, road({ 'maxspeed:type': 'GB:motorway' }))).toBe(70);
        expect(roadSpeedPick({ 'source:maxspeed': 'GB:motorway' })).toEqual({ kind: 'type', type: 'GB:motorway' });
        expect(roadSpeedPick({ 'maxspeed:type': 'GB:nsl_restricted' })).toEqual({ kind: 'type', type: 'GB:nsl_restricted' });
        // maxspeed=national alone, by the kind of road
        expect(roadSpeedPick({ highway: 'trunk', dual_carriageway: 'yes', maxspeed: 'national' })).toEqual({ kind: 'type', type: 'GB:nsl_dual' });
    });

    it('patterns a limit set by its type, unless the lane has a number of its own', () => {
        expect(speedTypeKind(undefined, road({ 'maxspeed:type': 'GB:nsl_single' }))).toBe('national');
        expect(speedTypeKind(undefined, road({ 'maxspeed:type': 'GB:nsl_dual', maxspeed: '70 mph' }))).toBe('national');
        expect(speedTypeKind(undefined, road({ 'source:maxspeed': 'GB:motorway' }))).toBe('motorway');
        expect(speedTypeKind(undefined, road({ 'maxspeed:type': 'GB:zone20' }))).toBe('zone');
        expect(speedTypeKind(undefined, road({ 'maxspeed:type': 'GB:nsl_restricted' }))).toBe('restricted');
        expect(speedTypeKind(undefined, road({ maxspeed: '30 mph' }))).toBeNull();
        expect(speedTypeKind('40 mph', road({ 'maxspeed:type': 'GB:nsl_single' }))).toBeNull();
    });

    it('colours a junction by its roads\' limit, or the main road\'s where they differ', () => {
        const main = new iD.osmWay({ id: 'w1', tags: { highway: 'primary', maxspeed: '40 mph' } });
        const side = new iD.osmWay({ id: 'w2', tags: { highway: 'service' } });
        expect(junctionSpeedClass([main, side])).toBe(40);
        expect(junctionSpeedClass([side, side])).toBe('missing');
        expect(junctionSpeedClass([])).toBeNull();
    });

    it('sets a minimum speed, and colours lanes by it', () => {
        expect(withRoadMinspeed({ highway: 'motorway' }, { kind: 'mph', mph: 30 })).toEqual({ highway: 'motorway', minspeed: '30 mph' });
        expect(withRoadMinspeed({ minspeed: '30 mph' }, { kind: 'none' })).toEqual({});
        expect(speedClassOf(undefined, road({ maxspeed: '70 mph', minspeed: '40 mph' }), 'minspeed')).toBe(40);
        expect(speedClassOf('20 mph', road({ minspeed: '40 mph' }), 'minspeed')).toBe(20);
        expect(speedClassOf(undefined, road({ maxspeed: '70 mph' }), 'minspeed')).toBe('missing');
    });

    it('reads the roundel a road shows', () => {
        expect(roadSpeedPick({ maxspeed: '30 mph' })).toEqual({ kind: 'mph', mph: 30 });
        expect(roadSpeedPick({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' })).toEqual({ kind: 'type', type: 'GB:nsl_single' });
        expect(roadSpeedPick({})).toEqual({ kind: 'none' });
        expect(samePick({ kind: 'mph', mph: 30 }, { kind: 'mph', mph: 30 })).toBe(true);
        expect(samePick({ kind: 'mph', mph: 30 }, { kind: 'mph', mph: 40 })).toBe(false);
        expect(samePick(undefined, { kind: 'none' })).toBe(false);
    });
});

describe('the Speed Limit tool\'s panel', () => {
    let context: iD.Context;

    beforeAll(async () => {
        const cache: any = iD.fileFetcher.cache();
        cache.locales_index_lanes = { en: { rtl: false, pct: 1 } };
        cache.locale_lanes_en = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
        iD.localizer.addLocaleDir('lanes', 'locales/lanes');
        await iD.localizer.ensureLoaded();
    });

    beforeEach(() => {
        context = iD.coreContext().assetPath('../dist/').init();
        (context as any).container(d3_select(document.createElement('div')));
    });

    it('marks the limit picked, and lets go of it when it is clicked again', () => {
        const speed = laneSpeed(context);
        const body = d3_select(document.createElement('div'));
        speedPanel(context).panel(body as any);
        const roundel = () => body.select<HTMLButtonElement>('.speed-roundel-30').node()!;
        roundel().click();
        expect(speed.picked()).toEqual({ kind: 'mph', mph: 30 });
        speedPanel(context).panel(body.html('') as any);
        expect(roundel().classList.contains('active')).toBe(true);
        roundel().click();
        expect(speed.picked()).toBeNull();
    });

    it('shows minimum speeds as blue roundels, and lets go of a speed limit picked', () => {
        const speed = laneSpeed(context);
        speed.setPicked({ kind: 'mph', mph: 30 });
        speed.setMeasure('minspeed');
        expect(speed.picked()).toBeNull();
        const body = d3_select(document.createElement('div'));
        speedPanel(context).panel(body as any);
        expect(body.selectAll('.speed-roundels-min .speed-roundel').size()).toBe(8);
        expect(body.select('.speed-roundel-type').empty()).toBe(true);
        expect(body.select('.speed-swatch.speed-missing').empty()).toBe(true);
        speed.setMeasure('maxspeed');
    });

    it('turns the tool on and off on the container', () => {
        const speed = laneSpeed(context);
        speed.setActive(true);
        expect(context.container().classed('lanes-speed')).toBe(true);
        speed.setActive(false);
        expect(context.container().classed('lanes-speed')).toBe(false);
    });
});
