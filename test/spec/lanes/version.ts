import fs from 'node:fs';

import { laneStudioVersion } from '../../../modules/lanes/version';

// The version rules in CLAUDE.md: one version, in modules/lanes/version.ts, matching the changelog
describe('Lane Studio version', () => {
    const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
    const headings = [...changelog.matchAll(/^# (.+)$/gm)].map(match => match[1].trim()).slice(1);

    it('is a plain A.B.C version', () => {
        expect(laneStudioVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('opens the changelog with an Unreleased section, then the current version', () => {
        expect(headings[0]).toBe('Unreleased');
        expect(headings[1]).toBe(laneStudioVersion);
    });

    it('dates every released version, newest first, each once', () => {
        const released = headings.slice(1);
        expect(new Set(released).size).toBe(released.length);
        for (const version of released) {
            expect(version).toMatch(/^\d+\.\d+\.\d+$/);
            expect(changelog).toMatch(new RegExp(`^# ${version.replace(/\./g, '\\.')}\\n##### \\d{4}-[A-Z][a-z]{2}-\\d{2}$`, 'm'));
        }
        const parts = (v: string) => v.split('.').map(Number);
        for (let i = 1; i < released.length; i++) {
            const [a, b] = [parts(released[i - 1]), parts(released[i])];
            const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
            expect(newer, `${released[i - 1]} after ${released[i]}`).toBeGreaterThan(0);
        }
    });

    it('leaves package.json with iD\'s version', () => {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string };
        expect(pkg.version).not.toBe(laneStudioVersion);
    });
});
