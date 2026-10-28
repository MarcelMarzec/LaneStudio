import { t } from '../../core/localizer';
import { prefs } from '../../core/preferences';
import { services } from '../../services';
import { uiModal } from '../../ui/modal';
import { uiSectionPrivacy } from '../../ui/sections/privacy';
import { laneStudioVersion } from '../version';

const wikiLinks: [string, string][] = [
    ['Lanes', 'https://wiki.openstreetmap.org/wiki/Lanes'],
    ['Key:turn', 'https://wiki.openstreetmap.org/wiki/Key:turn'],
    ['Key:destination', 'https://wiki.openstreetmap.org/wiki/Key:destination'],
    ['Key:sidewalk', 'https://wiki.openstreetmap.org/wiki/Key:sidewalk'],
    ['Good practice', 'https://wiki.openstreetmap.org/wiki/Good_practice'],
    ['Tagging for the renderer', 'https://wiki.openstreetmap.org/wiki/Tagging_for_the_renderer']
];

/**
 * Lane Studio's welcome screen, shown once instead of iD's: what the app is for, where edits go,
 * how to start, the mapping rules that matter most, and iD's privacy settings.
 * Call right after `context.init()`, before iD's UI renders; it takes over iD's own first-run splash.
 */
export function laneStudioSplash(context: iD.Context) {
    if (prefs('lanes-sawWelcome')) return;
    // iD shows its own splash unless it believes it was seen
    prefs('sawSplash', true);
    prefs('sawPrivacyVersion', context.privacyVersion);

    context.ui().ensureLoaded().then(() => {
        if (context.history().hasRestorableChanges()) return;
        prefs('lanes-sawWelcome', true);

        // uiModal is plain JavaScript: it returns the modal selection with a close() method
        const modal = uiModal(context.container()) as any;
        modal.select('.modal').attr('class', 'modal-splash modal lanes-welcome');
        const body = modal.select('.content').append('div').attr('class', 'fillL');

        body.append('div').attr('class', 'modal-section')
            .append('h3').text(t('_lanes.welcome.title'));

        const section = body.append('div').attr('class', 'modal-section');
        const server = services.osm?.getUrlRoot?.() ?? 'OpenStreetMap';
        section.append('p').text(t('_lanes.welcome.intro', { version: `v${laneStudioVersion}`, idVersion: context.version, server }));

        const steps = section.append('ol');
        for (const step of ['zoom', 'click', 'tools', 'markings', 'save']) {
            steps.append('li').text(t(`_lanes.welcome.steps.${step}`));
        }

        section.append('p').attr('class', 'lanes-welcome-rules').text(t('_lanes.welcome.rules'));

        const links = section.append('p');
        links.append('span').text(t('_lanes.welcome.wiki') + ' ');
        wikiLinks.forEach(([label, href], i) => {
            links.append('a').attr('href', href).attr('target', '_blank').text(label);
            if (i < wikiLinks.length - 1) links.append('span').text(' · ');
        });

        (uiSectionPrivacy(context) as any).render(section);

        body.append('div').attr('class', 'modal-actions')
            .append('button').attr('class', 'start-editing lanes-welcome-start')
            .text(t('_lanes.welcome.start'))
            .on('click', () => modal.close());
    });
}
