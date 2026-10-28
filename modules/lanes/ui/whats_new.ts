import { t } from '../../core/localizer';
import { uiModal } from '../../ui/modal';
import { laneStudioLinks } from '../core/links';
import { parseChangelog, setWhatsNewEnabled, versionsSince, whatsNewEnabled, whatsNewSince, type ChangelogVersion } from '../core/whats_new';
import { laneStudioVersion } from '../version';

type Selection = d3.Selection<any>;

/** At most this many versions are listed; the full changelog is a link away */
const shownVersions = 25;

/** The changelog as built alongside the app (`dist/lanes-changelog.md`), parsed */
export async function loadChangelog(context: iD.Context): Promise<ChangelogVersion[]> {
    const response = await fetch(`${context.asset('lanes-changelog.md')}?v=${laneStudioVersion}`);
    if (!response.ok) throw new Error(`changelog: ${response.status}`);
    return parseChangelog(await response.text());
}

/** A changelog line, with `code` in backticks shown as code */
function appendLine(parent: Selection, line: string) {
    line.split('`').forEach((part, i) => {
        if (!part) return;
        if (i % 2) parent.append('code').text(part);
        else parent.append('span').text(part);
    });
}

/** `2026-Oct-26` as `26 Oct 2026` */
const spellDate = (date: string) => date.split('-').reverse().join(' ');

/**
 * The what's new menu: the changelog of every version since `since`, newest first, under each its headings and
 * lines, with a box to stop it showing after updates
 */
export function showWhatsNew(context: iD.Context, versions: ChangelogVersion[], since?: string) {
    // uiModal is plain JavaScript: it returns the modal selection with a close() method
    const modal = uiModal(context.container()) as any;
    modal.select('.modal').attr('class', 'modal-splash modal lanes-whats-new');
    const body = modal.select('.content').append('div').attr('class', 'fillL');

    const header = body.append('div').attr('class', 'modal-section');
    header.append('h3').text(t('_lanes.whats_new.title'));
    header.append('p').text(since ?
        t('_lanes.whats_new.since', { since: `v${since}`, version: `v${laneStudioVersion}` }) :
        t('_lanes.whats_new.current', { version: `v${laneStudioVersion}` }));

    const list = body.append('div').attr('class', 'modal-section lanes-whats-new-list');
    for (const version of versions.slice(0, shownVersions)) {
        const item = list.append('div').attr('class', 'lanes-whats-new-version');
        const title = item.append('h4');
        title.append('span').attr('class', 'lanes-whats-new-number').text(`v${version.version}`);
        if (version.date) title.append('span').attr('class', 'lanes-whats-new-date').text(spellDate(version.date));
        for (const group of version.groups) {
            if (group.heading) item.append('h5').text(group.heading);
            const lines = item.append('ul');
            for (const line of group.lines) appendLine(lines.append('li'), line);
        }
    }
    if (versions.length > shownVersions) {
        list.append('p').attr('class', 'lanes-whats-new-more').text(t('_lanes.whats_new.more', { n: versions.length - shownVersions }));
    }

    const footer = body.append('div').attr('class', 'modal-section lanes-whats-new-footer');
    const option = footer.append('label').attr('class', 'lanes-whats-new-option');
    option.append('input')
        .attr('type', 'checkbox')
        .property('checked', !whatsNewEnabled())
        .on('change', function(this: HTMLInputElement) {
            setWhatsNewEnabled(!this.checked);
        });
    option.append('span').text(t('_lanes.whats_new.hide'));
    footer.append('a')
        .attr('href', laneStudioLinks.changelog).attr('target', '_blank')
        .text(t('_lanes.whats_new.full'));
    footer.append('button').attr('class', 'lanes-whats-new-close')
        .text(t('_lanes.whats_new.close'))
        .on('click', () => modal.close());
    return modal;
}

/**
 * After an update, shows what changed since the version last used (once, unless turned off in the menu or the
 * Lane Studio settings). Call after `context.init()`.
 */
export function laneStudioWhatsNew(context: iD.Context) {
    const since = whatsNewSince();
    if (!since) return;
    Promise.all([context.ui().ensureLoaded(), loadChangelog(context)])
        .then(([, changelog]) => {
            const versions = versionsSince(changelog, since);
            if (!versions.length) return;
            // the welcome screen or iD's restore-your-changes prompt (when there are unsaved edits) comes first: the
            // menu waits until it is closed
            whenNoDialog(context, () => showWhatsNew(context, versions, since));
        })
        .catch(() => { /* without the changelog there is nothing to show */ });
}

/** Calls `then` once no dialog is open, straight away if none is */
function whenNoDialog(context: iD.Context, then: () => void) {
    const container = context.container();
    const open = () => !container.select('.modal').empty();
    if (!open()) {
        then();
        return;
    }
    const observer = new MutationObserver(() => {
        if (open()) return;
        observer.disconnect();
        // (a moment later, so a dialog that opens as another closes, as iD's do, is seen first)
        window.setTimeout(() => whenNoDialog(context, then), 300);
    });
    observer.observe(container.node()!, { childList: true, subtree: true });
}
