import fs from 'node:fs';
import { load } from 'js-yaml';

import { mapKeyGroups } from '../../../../modules/lanes/ui/pane_key';

describe('Map key', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as { en: { key: { groups: Record<string, string>; entries: Record<string, string> } } }).en.key;

    it('names every group and entry', () => {
        for (const group of mapKeyGroups) {
            expect(strings.groups[group.id], group.id).toBeTruthy();
            for (const entry of group.entries) expect(strings.entries[entry.id], entry.id).toBeTruthy();
        }
    });
});
