import { t } from '../../core/localizer';

/**
 * Lane Studio's mark: a road of three lanes seen from above, its lane lines dashed, with a turn arrow in each lane
 * (left, ahead, right): what Lane Studio maps. lanes.html has it as the page's icon, the settings pane's button has its lines and
 * arrows (in the button's colour, without the tile), and it is saved as
 * docs/img/lane-studio-logo.svg and LanesWebsite/assets/img/lanestudio-mark.svg; test/spec/lanes/ui/logo.ts
 * checks they all match.
 */
export const laneStudioMark =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="7" fill="#2b313b"/>' +
    '<path d="M11 3v26M21 3v26" stroke="#fff" stroke-width="1.5" stroke-dasharray="3 2.6" opacity="0.8"/>' +
    '<g fill="none" stroke="#ff922b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M16 26V8M12.6 11.4 16 8l3.4 3.4"/>' +
    '<path d="M6.5 26v-9L3.2 12.5M3 16.1l.2-3.6 3.5.85"/>' +
    '<path d="M25.5 26v-9l3.3-4.5M29 16.1l-.2-3.6-3.5.85"/>' +
    '</g></svg>';

/** Lane Studio's name and mark, at the top of the sidebar */
export function uiLaneStudioLogo(sidebar: d3.Selection<HTMLDivElement>) {
    const brand = sidebar.insert('div', ':first-child').attr('class', 'lanes-brand');
    brand.append('span').attr('class', 'lanes-brand-mark').attr('aria-hidden', 'true').html(laneStudioMark);
    const name = brand.append('span').attr('class', 'lanes-brand-name');
    name.append('strong').text('Lane');
    name.append('span').text('Studio');
    brand.attr('title', t('_lanes.brand.tooltip'));
}
