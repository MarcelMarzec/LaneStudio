import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';

/** Every file under a folder */
function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? files(full) : /\.(ts|js)$/.test(entry.name) ? [full] : [];
    });
}

describe('Lane Studio strings', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as { en: Record<string, unknown> }).en;

    // a key filed under the wrong heading in data/lanes.yaml shows as "Missing translation" in the app
    it('has every _lanes key the code names', () => {
        const missing: string[] = [];
        for (const file of files('modules')) {
            const source = fs.readFileSync(file, 'utf8');
            for (const match of source.matchAll(/['"`]_lanes\.([A-Za-z0-9_.]+)['"`]/g)) {
                let value: unknown = strings;
                for (const part of match[1].split('.')) value = (value as Record<string, unknown> | undefined)?.[part];
                if (value === undefined) missing.push(`${file}: _lanes.${match[1]}`);
            }
        }
        expect(missing).toEqual([]);
    });
});
