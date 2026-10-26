import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import { laneSpeed, speedClassOf } from '../../../../modules/lanes/core/lane_speed';
import { mphOf, roadSpeedPick, samePick, withRoadSpeed } from '../../../../modules/lanes/ui/speed_roundels';
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

    it('sets a road\'s limit, the national speed limit, or none', () => {
        expect(withRoadSpeed({ highway: 'residential' }, { kind: 'mph', mph: 20 })).toEqual({ highway: 'residential', maxspeed: '20 mph' });
        expect(withRoadSpeed({ highway: 'primary' }, { kind: 'national' }))
            .toEqual({ highway: 'primary', maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' });
        expect(withRoadSpeed({ highway: 'trunk', dual_carriageway: 'yes' }, { kind: 'national' }))
            .toEqual({ highway: 'trunk', dual_carriageway: 'yes', maxspeed: '70 mph', 'maxspeed:type': 'GB:nsl_dual' });
        // leaving the national limit drops its type
        expect(withRoadSpeed({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' }, { kind: 'mph', mph: 40 })).toEqual({ maxspeed: '40 mph' });
        expect(withRoadSpeed({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' }, { kind: 'none' })).toEqual({});
    });

    it('reads the roundel a road shows', () => {
        expect(roadSpeedPick({ maxspeed: '30 mph' })).toEqual({ kind: 'mph', mph: 30 });
        expect(roadSpeedPick({ maxspeed: '60 mph', 'maxspeed:type': 'GB:nsl_single' })).toEqual({ kind: 'national' });
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

    it('turns the tool on and off on the container', () => {
        const speed = laneSpeed(context);
        speed.setActive(true);
        expect(context.container().classed('lanes-speed')).toBe(true);
        speed.setActive(false);
        expect(context.container().classed('lanes-speed')).toBe(false);
    });
});
