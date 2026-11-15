import fs from 'node:fs';
import { load } from 'js-yaml';

import {
    accessChain, accessClass, accessConditional, accessDefaultRows, accessFor, accessModes, accessParts, accessSizeOrder, accessValues,
    accessValuesFor, impliedAccess,
    taggedAccessKeys
} from '../../../../modules/lanes/model/access';

describe('access tags (wiki: Key:access)', () => {
    it('inherits down the wiki\'s transport mode hierarchy', () => {
        expect(accessChain('hgv')).toEqual(['hgv', 'motor_vehicle', 'vehicle', 'access']);
        expect(accessChain('bus')).toEqual(['bus', 'psv', 'motor_vehicle', 'vehicle', 'access']);
        expect(accessChain('bicycle')).toEqual(['bicycle', 'vehicle', 'access']);
        expect(accessChain('foot')).toEqual(['foot', 'access']);
        // goods and hgv are siblings, not one inside the other
        expect(accessChain('hgv')).not.toContain('goods');
        // every mode's parent is listed before it
        const misplaced = accessModes.filter((mode, i) => mode.parent && accessModes.findIndex(m => m.key === mode.parent) > i);
        expect(misplaced).toEqual([]);
    });

    it('takes the most specific key tagged, its direction first', () => {
        const tags = { access: 'private', motor_vehicle: 'destination', hgv: 'no', 'hgv:forward': 'delivery' };
        expect(accessFor(tags, 'hgv')).toEqual({ value: 'no', key: 'hgv' });
        expect(accessFor(tags, 'hgv', 'forward')).toEqual({ value: 'delivery', key: 'hgv:forward' });
        expect(accessFor(tags, 'hgv', 'backward')).toEqual({ value: 'no', key: 'hgv' });
        expect(accessFor(tags, 'motorcar')).toEqual({ value: 'destination', key: 'motor_vehicle' });
        expect(accessFor(tags, 'bicycle')).toEqual({ value: 'private', key: 'access' });
        expect(accessFor({ highway: 'service' }, 'hgv')).toBeUndefined();
        // a list reads as its first value
        expect(accessFor({ motor_vehicle: 'agricultural;forestry' }, 'motorcar')?.value).toBe('agricultural');
    });

    it('finds a conditional restriction unless a plain value lower down overrides it', () => {
        expect(accessConditional({ 'motor_vehicle:conditional': 'no @ (Mo-Fr 07:00-19:00)' }, 'hgv')).toBe('no @ (Mo-Fr 07:00-19:00)');
        expect(accessConditional({ 'motor_vehicle:conditional': 'no @ (Mo-Fr 07:00-19:00)', hgv: 'yes' }, 'hgv')).toBeUndefined();
        expect(accessConditional({ 'hgv:forward:conditional': 'no @ (weight>7.5)' }, 'hgv', 'forward')).toBe('no @ (weight>7.5)');
    });

    it('splits keys into their mode and direction or condition', () => {
        expect(accessParts('hgv:forward')).toEqual({ mode: 'hgv', suffix: ':forward' });
        expect(accessParts('motor_vehicle:backward:conditional')).toEqual({ mode: 'motor_vehicle', suffix: ':backward:conditional' });
        expect(accessParts('hazmat:water')).toEqual({ mode: 'hazmat:water', suffix: '' });
        expect(accessParts('maxspeed')).toBeNull();
        expect(accessParts('access:lanes')).toBeNull();
        expect(taggedAccessKeys({ highway: 'service', 'hgv:conditional': 'x', hgv: 'no', access: 'private', name: 'A' }))
            .toEqual(['access', 'hgv', 'hgv:conditional']);
    });

    it('offers the values the wiki lists for each key', () => {
        expect(accessValuesFor('access')).not.toContain('designated');
        expect(accessValuesFor('access')).not.toContain('use_sidepath');
        expect(accessValuesFor('bicycle')).toContain('dismount');
        expect(accessValuesFor('bicycle')).toContain('use_sidepath');
        expect(accessValuesFor('motor_vehicle')).not.toContain('dismount');
        expect(accessValuesFor('hgv')).toEqual(expect.arrayContaining(['delivery', 'destination', 'discouraged', 'no_turnaround']));
        expect(accessValuesFor('goods')).not.toContain('no_turnaround');
    });

    it('implies access from the kind of road, as iD does, for modes below the ones listed', () => {
        expect(impliedAccess({ highway: 'motorway' }, 'hgv')).toBe('yes');
        expect(impliedAccess({ highway: 'motorway' }, 'foot')).toBe('no');
        expect(impliedAccess({ highway: 'cycleway' }, 'motorcar')).toBe('no');
        expect(impliedAccess({ highway: 'primary', motorroad: 'yes' }, 'bicycle')).toBe('no');
        expect(impliedAccess({ highway: 'service' }, 'access')).toBe('yes');
        expect(impliedAccess({ barrier: 'gate' }, 'access')).toBeUndefined();
    });

    it('sorts values into what they mean for getting through', () => {
        expect(accessClass('yes')).toBe('yes');
        expect(accessClass('permissive')).toBe('yes');
        expect(accessClass('designated')).toBe('designated');
        expect(accessClass('no')).toBe('no');
        for (const value of ['destination', 'delivery', 'customers']) expect(accessClass(value)).toBe('destination');
        for (const value of ['private', 'permit', 'agricultural', 'forestry', 'military']) expect(accessClass(value)).toBe('permission');
        expect(accessClass('discouraged')).toBe('discouraged');
        expect(accessClass('use_sidepath')).toBe('sidepath');
        expect(accessClass('unknown')).toBe('unknown');
        expect(accessClass(undefined)).toBeUndefined();
    });

    it('names every mode and value in Lane Studio\'s strings', () => {
        const strings = load(fs.readFileSync('data/lanes.yaml', 'utf8')) as any;
        const field = strings.en.access_field;
        for (const mode of accessModes) expect(field.modes[mode.key.replace(/:/g, '_')], mode.key).toBeTruthy();
        for (const value of accessValues) expect(field.values[value], value).toBeTruthy();
    });
});

describe('the Allowed Access field\'s order', () => {
    it('ranks every mode by size, everyone first and people on foot last of the vehicles', () => {
        expect(new Set(accessSizeOrder)).toEqual(new Set(accessModes.map(mode => mode.key)));
        expect(accessSizeOrder.length).toBe(accessModes.length);
        expect(accessSizeOrder[0]).toBe('access');
        const at = (key: string) => accessSizeOrder.indexOf(key);
        expect(at('hgv')).toBeLessThan(at('bus'));
        expect(at('bus')).toBeLessThan(at('goods'));
        expect(at('goods')).toBeLessThan(at('motorcar'));
        expect(at('motorcar')).toBeLessThan(at('motorcycle'));
        expect(at('motorcycle')).toBeLessThan(at('bicycle'));
        expect(at('bicycle')).toBeLessThan(at('foot'));
        expect(accessDefaultRows).toEqual(['access', 'hgv', 'motorcar', 'bicycle', 'foot']);
    });
});
