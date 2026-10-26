import { prefs } from '../../core/preferences';
import { laneStudioVersion } from '../version';

/** One version's section of CHANGELOG.md: its headings, each with the lines under it */
export interface ChangelogVersion {
    version: string;
    /** as written under the heading, `2026-Oct-26` */
    date: string;
    groups: { heading: string; lines: string[] }[];
}

/** A version's place in time, to compare two: its date, then its number that day (1 for the first) */
export function versionOrder(version: string): number | null {
    const match = version.replace(/^v/, '').match(/^(\d{2})\.(\d{2})\.(\d{2})(?:r(\d+))?$/);
    if (!match) return null;
    return Date.UTC(2000 + Number(match[1]), Number(match[2]) - 1, Number(match[3])) + Number(match[4] ?? 1);
}

/**
 * The versions in CHANGELOG.md, newest first: under each `# YY.MM.DD` heading, its `####` headings and their
 * `*` lines (a line's continuation, indented below it, is joined to it). Day headings (`### 2026-Oct-21`) of
 * older versions are left out.
 */
export function parseChangelog(markdown: string): ChangelogVersion[] {
    const versions: ChangelogVersion[] = [];
    let current: ChangelogVersion | null = null;
    let group: ChangelogVersion['groups'][number] | null = null;
    for (const line of markdown.split('\n')) {
        const heading = line.match(/^# (\S+)\s*$/);
        if (heading) {
            current = versionOrder(heading[1]) === null ? null : { version: heading[1], date: '', groups: [] };
            if (current) versions.push(current);
            group = null;
            continue;
        }
        if (!current) continue;
        const date = line.match(/^##### (\S+)/);
        if (date && !current.date) {
            current.date = date[1];
        } else if (/^#### /.test(line)) {
            group = { heading: line.slice(5).trim(), lines: [] };
            current.groups.push(group);
        } else if (/^\* /.test(line)) {
            if (!group) {
                group = { heading: '', lines: [] };
                current.groups.push(group);
            }
            group.lines.push(line.slice(2).trim());
        } else if (/^\s+\S/.test(line) && group?.lines.length) {
            group.lines[group.lines.length - 1] += ' ' + line.trim();
        }
    }
    return versions;
}

/** The versions newer than `since`, newest first */
export function versionsSince(versions: ChangelogVersion[], since: string): ChangelogVersion[] {
    const after = versionOrder(since) ?? -Infinity;
    return versions.filter(v => (versionOrder(v.version) ?? -Infinity) > after);
}

/** The version people had before this menu came in, for those who used Lane Studio then */
const beforeWhatsNew = '26.10.21';

/** Whether the menu is shown after an update (a setting, on unless turned off) */
export const whatsNewEnabled = () => prefs('lanes-whatsNew') !== 'off';
export const setWhatsNewEnabled = (on: boolean) => prefs('lanes-whatsNew', on ? null : 'off');

/**
 * The version to show what's new since, if there is anything to show: the version last used, else (for
 * someone who used Lane Studio before it remembered versions) the version before this menu existed. Remembers
 * the version used now, so the menu is shown once per update. None for someone new or up to date.
 */
export function whatsNewSince(): string | null {
    const last = prefs('lanes-lastVersion') ?? (prefs('lanes-sawWelcome') ? beforeWhatsNew : null);
    prefs('lanes-lastVersion', laneStudioVersion);
    if (!last || !whatsNewEnabled()) return null;
    const [was, now] = [versionOrder(last), versionOrder(laneStudioVersion)];
    return was !== null && now !== null && now > was ? last : null;
}
