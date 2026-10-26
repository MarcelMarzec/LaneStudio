import fs from 'node:fs';

import { prefs } from '../../../../modules/core/preferences';
import { parseChangelog, versionOrder, versionsSince, whatsNewSince, setWhatsNewEnabled } from '../../../../modules/lanes/core/whats_new';
import { laneStudioVersion } from '../../../../modules/lanes/version';

const sample = `# Lane Studio changelog

Some words.

# 26.10.26r2
##### 2026-Oct-26

#### Railways
* Tram rails are set in the road,
  drawn over its lanes (\`embedded=no\` keeps ballast)

#### Website
* A logo

# 26.10.26
##### 2026-Oct-26

#### Versions
* Every change is a version

# 26.10.21
##### 2026-Oct-21

### 2026-Oct-21

#### Routing tool (new)
* A Routing tool
`;

describe('what\'s new', () => {
    afterEach(() => {
        prefs('lanes-lastVersion', null);
        prefs('lanes-sawWelcome', null);
        prefs('lanes-whatsNew', null);
    });

    it('reads each version\'s headings and lines from the changelog', () => {
        const versions = parseChangelog(sample);
        expect(versions.map(v => v.version)).toEqual(['26.10.26r2', '26.10.26', '26.10.21']);
        expect(versions[0].date).toBe('2026-Oct-26');
        expect(versions[0].groups).toEqual([
            { heading: 'Railways', lines: ['Tram rails are set in the road, drawn over its lanes (`embedded=no` keeps ballast)'] },
            { heading: 'Website', lines: ['A logo'] }
        ]);
        // day headings of older versions are not headings of their own
        expect(versions[2].groups.map(g => g.heading)).toEqual(['Routing tool (new)']);
    });

    it('orders versions by date, then by their number that day', () => {
        expect(versionOrder('26.10.26r2')!).toBeGreaterThan(versionOrder('26.10.26')!);
        expect(versionOrder('v26.10.26')!).toBeGreaterThan(versionOrder('26.10.21r9')!);
        expect(versionOrder('0.2.0')).toBeNull();
        expect(versionsSince(parseChangelog(sample), '26.10.26').map(v => v.version)).toEqual(['26.10.26r2']);
    });

    it('shows what changed once per update, to people who have used Lane Studio before, unless turned off', () => {
        // someone new: the welcome screen, not what's new
        expect(whatsNewSince()).toBeNull();
        expect(prefs('lanes-lastVersion')).toBe(laneStudioVersion);
        // up to date
        expect(whatsNewSince()).toBeNull();
        // back after an update
        prefs('lanes-lastVersion', '26.10.21');
        expect(whatsNewSince()).toBe('26.10.21');
        expect(whatsNewSince()).toBeNull();
        // someone who used Lane Studio before it remembered versions
        prefs('lanes-lastVersion', null);
        prefs('lanes-sawWelcome', 'true');
        expect(whatsNewSince()).toBe('26.10.21');
        // turned off
        prefs('lanes-lastVersion', '26.10.21');
        setWhatsNewEnabled(false);
        expect(whatsNewSince()).toBeNull();
        expect(prefs('lanes-lastVersion')).toBe(laneStudioVersion);
    });

    it('reads the real changelog: the current version first, every section with lines', () => {
        const versions = parseChangelog(fs.readFileSync('CHANGELOG.md', 'utf8'));
        expect(versions[0].version).toBe(laneStudioVersion);
        for (const version of versions) expect(version.groups.flatMap(g => g.lines).length, version.version).toBeGreaterThan(0);
    });
});
