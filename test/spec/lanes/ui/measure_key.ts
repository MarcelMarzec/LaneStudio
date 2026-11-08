import fs from 'node:fs';
import { load } from 'js-yaml';

import { roundedWidth, withMeasuredWidth } from '../../../../modules/lanes/ui/measure_panel';
import { mapKeyGroups } from '../../../../modules/lanes/ui/pane_key';

describe('Measure tool', () => {
    it('rounds a measured width to 0.1 m', () => {
        expect(roundedWidth(3.4567)).toBe('3.5');
        expect(roundedWidth(7)).toBe('7');
    });

    it('sets a measurement as a road\'s widths', () => {
        expect(withMeasuredWidth({ highway: 'residential' }, 'road', 'left', 7.34)).toEqual({ highway: 'residential', width: '7.3' });
        expect(withMeasuredWidth({}, 'sidewalk', 'right', 1.96)).toEqual({ 'sidewalk:right:width': '2' });
        expect(withMeasuredWidth({}, 'cycleway', 'left', 1.5)).toEqual({ 'cycleway:left:width': '1.5' });
        expect(withMeasuredWidth({}, 'shoulder', 'left', 3.3)).toEqual({ 'shoulder:left:width': '3.3' });
        expect(withMeasuredWidth({ 'parking:both': 'lane' }, 'parking', 'left', 2.2)['parking:left:width']).toBe('2.2');
    });
});

describe('Map key', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as { en: { key: { groups: Record<string, string>; entries: Record<string, string> } } }).en.key;

    it('names every group and entry', () => {
        for (const group of mapKeyGroups) {
            expect(strings.groups[group.id], group.id).toBeTruthy();
            for (const entry of group.entries) expect(strings.entries[entry.id], entry.id).toBeTruthy();
        }
    });
});
