import fs from 'node:fs';

import { laneStudioVersion } from '../../../modules/lanes/version';

// The version rules in CLAUDE.md: every commit is a new version, its date, YY.MM.DD (with r2, r3 … for later
// commits that day), kept only in modules/lanes/version.ts, with its own section at the top of the changelog
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const versionPattern = /^(\d{2})\.(\d{2})\.(\d{2})(?:r([2-9]|[1-9]\d+))?$/;

/** A version's date and its number that day (1 for the first release), or null if it is not a date version */
function parseVersion(version: string) {
    const match = version.match(versionPattern);
    if (!match) return null;
    const [year, month, day] = [2000 + Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day, release: Number(match[4] ?? 1), sort: date.getTime() + Number(match[4] ?? 1) };
}

describe('Lane Studio version', () => {
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const headings = [...changelog.matchAll(/^# (.+)$/gm)].map(match => match[1].trim()).slice(1);
    const versions = headings;

    it('is the commit\'s date, YY.MM.DD', () => {
        expect(parseVersion(laneStudioVersion), laneStudioVersion).not.toBeNull();
        // 31 February is not a date
        expect(parseVersion('26.02.31')).toBeNull();
        expect(parseVersion('26.10.21r2')).toMatchObject({ day: 21, release: 2 });
        expect(parseVersion('26.10.21.2')).toBeNull();
        expect(parseVersion('26.10.21r1')).toBeNull();
        expect(parseVersion('0.2.0')).toBeNull();
    });

    it('opens the changelog with the current version: there is no Unreleased section', () => {
        expect(headings).not.toContain('Unreleased');
        expect(headings[0]).toBe(laneStudioVersion);
    });

    it('lists every version under its date, newest first, each once, each with what changed', () => {
        expect(new Set(versions).size).toBe(versions.length);
        for (const version of versions) {
            const parsed = parseVersion(version);
            expect(parsed, version).not.toBeNull();
            // the line under the heading spells the same date out
            const spelled = `${parsed!.year}-${months[parsed!.month - 1]}-${String(parsed!.day).padStart(2, '0')}`;
            expect(changelog).toMatch(new RegExp(`^# ${version.replace(/\./g, '\\.')}\\n##### ${spelled}\\b`, 'm'));
            // and at least one line says what changed
            const section = changelog.split(/^# /m).find(part => part.startsWith(`${version}\n`))!;
            expect(section, `${version}: no changes listed`).toMatch(/^\* \S/m);
        }
        for (let i = 1; i < versions.length; i++) {
            expect(parseVersion(versions[i - 1])!.sort, `${versions[i - 1]} after ${versions[i]}`)
                .toBeGreaterThan(parseVersion(versions[i])!.sort);
        }
    });

    it('lists the work in older versions under the days it was done, newest first', () => {
        // each `# ` section: its `### YYYY-Mon-DD` day headings (versions from before every commit was one span days)
        const sections = changelog.split(/^# /m).slice(2);
        for (const section of sections) {
            const name = section.split('\n')[0].trim();
            const days = [...section.matchAll(/^### (.+)$/gm)].map(match => match[1].trim());
            const times = days.map(day => {
                const match = day.match(/^(\d{4})-([A-Z][a-z]{2})-(\d{2})$/);
                expect(match, `${name}: day heading "${day}"`).not.toBeNull();
                const month = months.indexOf(match![2]);
                expect(month, `${name}: month in "${day}"`).toBeGreaterThanOrEqual(0);
                return Date.UTC(Number(match![1]), month, Number(match![3]));
            });
            for (let i = 1; i < times.length; i++) expect(times[i - 1], `${name}: days newest first`).toBeGreaterThan(times[i]);
            // a version has no work dated after it
            const release = parseVersion(name)!;
            const releasedOn = Date.UTC(release.year, release.month - 1, release.day);
            expect(times.every(t => t <= releasedOn), `${name}: work dated after its version`).toBe(true);
        }
    });

    it('leaves package.json with iD\'s version', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
        expect(pkg.version).not.toBe(laneStudioVersion);
    });
});
