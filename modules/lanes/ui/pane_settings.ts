import { select as d3_select } from 'd3-selection';

import { t, localizer } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { uiPane } from '../../ui/pane';
import { uiSection } from '../../ui/section';
import { uiTooltip } from '../../ui/tooltip';
import { laneSettings, defaultSurfaceOpacity } from '../core/lane_settings';
import { laneStudioLinks } from '../core/links';
import { setWhatsNewEnabled, whatsNewEnabled } from '../core/whats_new';
import { laneStudioVersion } from '../version';
import { laneStudioMark } from './logo';
import { loadChangelog, showWhatsNew } from './whats_new';

type Div = d3.Selection<HTMLDivElement>;

/** The icon on the pane button: Lane Studio's mark without its tile, its lines and arrows in the button's colour */
function ensurePaneIcon() {
    if (document.getElementById('lanes-icon-pane')) return;
    const svg = d3_select(document.body).append('svg')
        .attr('class', 'lanes-icon-defs')
        .attr('width', 0).attr('height', 0)
        .style('position', 'absolute');
    // (iD's other pane icons are plain shapes in the button's colour, with no background)
    const inner = laneStudioMark.replace(/^<svg[^>]*>|<\/svg>$/g, '')
        .replace(/<rect[^>]*\/>/, '')
        .replace(/"#fff"/g, '"currentColor"').replace('#ff922b', 'currentColor');
    svg.append('symbol').attr('id', 'lanes-icon-pane').attr('viewBox', '0 0 32 32').html(inner);
}


/** "Display": lane surface opacity and hiding iD's own drawing of what Lane Studio draws */
function uiSectionLaneDisplay(context: iD.Context) {
    const settings = laneSettings(context);

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('lanes-display', context) as any)
        .label(() => t.append('_lanes.settings.display'))
        .disclosureContent(render);

    settings.on('change.pane', () => section.reRender());

    function render(selection: Div) {
        let container = selection.selectAll<HTMLDivElement, number>('.display-options-container').data([0]);
        const enter = container.enter().append('div')
            .attr('class', 'display-options-container controls-list lanes-settings');

        // opacity slider, laid out like the Background pane's display options
        const slider = enter.append('label').attr('class', 'display-control display-control-lanes-opacity');
        slider.append('span').text(t('_lanes.settings.opacity'));
        slider.append('span').attr('class', 'display-option-value');
        const wrap = slider.append('div').attr('class', 'control-wrap');
        wrap.append('input')
            .attr('class', 'display-option-input')
            .attr('type', 'range')
            .attr('min', 0)
            .attr('max', 1)
            .attr('step', 0.01)
            .on('input', function(this: HTMLInputElement) {
                settings.setSurfaceOpacity(parseFloat(this.value));
            });
        wrap.append('button')
            .attr('class', 'display-option-reset')
            .attr('title', t('_lanes.settings.reset_opacity'))
            .on('click', (event: MouseEvent) => {
                if (event.button !== 0) return;
                settings.setSurfaceOpacity(defaultSurfaceOpacity);
            })
            .call(svgIcon('#iD-icon-' + (localizer.textDirection() === 'rtl' ? 'redo' : 'undo'), '') as any);

        // hide iD's own lines, vertices, points and cones, as a checkbox list like Map Data's
        const list = enter.append('ul').attr('class', 'layer-list lanes-settings-list');
        const item = list.append('li')
            .attr('class', 'lanes-hide-originals-option')
            .call((uiTooltip() as any).title(() => t.append('_lanes.settings.hide_originals_tip')).placement('top'));
        const label = item.append('label');
        label.append('input')
            .attr('type', 'checkbox')
            .on('change', function(this: HTMLInputElement) {
                settings.setHideOriginals(this.checked);
            });
        label.append('span').text(t('_lanes.settings.hide_originals'));
        // land use alone: Map Data's Land Use filter also hides car parks, and other surfaces Lane Studio draws
        const landuse = list.append('li')
            .attr('class', 'lanes-hide-landuse-option')
            .call((uiTooltip() as any).title(() => t.append('_lanes.settings.hide_landuse_tip')).placement('top'));
        const landuseLabel = landuse.append('label');
        landuseLabel.append('input')
            .attr('type', 'checkbox')
            .on('change', function(this: HTMLInputElement) {
                settings.setHideLanduse(this.checked);
            });
        landuseLabel.append('span').text(t('_lanes.settings.hide_landuse'));
        // brand logos from Wikidata in place of iD's markers
        const logos = list.append('li')
            .attr('class', 'lanes-brand-logos-option')
            .call((uiTooltip() as any).title(() => t.append('_lanes.settings.brand_logos_tip')).placement('top'));
        const logosLabel = logos.append('label');
        logosLabel.append('input')
            .attr('type', 'checkbox')
            .on('change', function(this: HTMLInputElement) {
                settings.setShowLogos(this.checked);
            });
        logosLabel.append('span').text(t('_lanes.settings.brand_logos'));

        // update
        container = enter.merge(container);
        const opacity = settings.surfaceOpacity();
        container.select('.display-option-input').property('value', opacity);
        container.select('.display-option-value').text(`${Math.round(opacity * 100)}%`);
        container.select('.display-option-reset').classed('disabled', opacity === defaultSurfaceOpacity);
        container.select('.lanes-hide-originals-option')
            .classed('active', settings.hideOriginals())
            .select('input')
            .property('checked', settings.hideOriginals());
        container.select('.lanes-brand-logos-option')
            .classed('active', settings.showLogos())
            .select('input')
            .property('checked', settings.showLogos());
        container.select('.lanes-hide-landuse-option')
            .classed('active', settings.hideLanduse())
            .select('input')
            .property('checked', settings.hideLanduse());
    }

    return section;
}


/** "About Lane Studio": the what's new menu (and whether it shows after updates), and links to the website,
 *  privacy policy and contact page */
function uiSectionLaneAbout(context: iD.Context) {
    const section = (uiSection('lanes-about', context) as any)
        .label(() => t.append('_lanes.settings.about'))
        .disclosureContent(render);

    function render(selection: Div) {
        let container = selection.selectAll<HTMLDivElement, number>('.lanes-about-container').data([0]);
        const enter = container.enter().append('div').attr('class', 'lanes-about-container lanes-settings');

        const list = enter.append('ul').attr('class', 'layer-list lanes-settings-list');
        const item = list.append('li')
            .attr('class', 'lanes-whats-new-setting')
            .call((uiTooltip() as any).title(() => t.append('_lanes.settings.whats_new_tip')).placement('top'));
        const label = item.append('label');
        label.append('input')
            .attr('type', 'checkbox')
            .on('change', function(this: HTMLInputElement) {
                setWhatsNewEnabled(this.checked);
                section.reRender();
            });
        label.append('span').text(t('_lanes.settings.whats_new_option'));

        enter.append('button')
            .attr('class', 'button-link lanes-show-whats-new')
            .text(t('_lanes.settings.show_whats_new'))
            .on('click', () => {
                loadChangelog(context)
                    .then(versions => showWhatsNew(context, versions.slice(0, 10)))
                    .catch(() => (context.ui() as any).flash.label(t.append('_lanes.whats_new.failed'))());
            });

        const links = enter.append('ul').attr('class', 'lanes-about-links');
        for (const key of ['website', 'privacy', 'contact'] as const) {
            links.append('li').append('a')
                .attr('href', laneStudioLinks[key]).attr('target', '_blank').attr('rel', 'noopener')
                .call(svgIcon('#iD-icon-out-link', 'inline') as any)
                .append('span').text(t(`_lanes.settings.${key}`));
        }
        enter.append('p').attr('class', 'lanes-about-version').text(`Lane Studio v${laneStudioVersion}`);

        // update
        container = enter.merge(container);
        container.select('.lanes-whats-new-setting')
            .classed('active', whatsNewEnabled())
            .select('input')
            .property('checked', whatsNewEnabled());
    }

    return section;
}


/** The Lane Studio pane, beside iD's Background, Map Data and Issues panes */
export function uiPaneLaneStudio(context: iD.Context) {
    ensurePaneIcon();
    return (uiPane('lane-studio', context) as any)
        .key(t('_lanes.settings.key'))
        .label(t.append('_lanes.settings.title'))
        .description(t.append('_lanes.settings.description'))
        .iconName('lanes-icon-pane')
        .sections([uiSectionLaneDisplay(context), uiSectionLaneAbout(context)]);
}
