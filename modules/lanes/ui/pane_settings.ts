import { select as d3_select } from 'd3-selection';

import { t, localizer } from '../../core/localizer';
import { svgIcon } from '../../svg/icon';
import { uiPane } from '../../ui/pane';
import { uiSection } from '../../ui/section';
import { uiTooltip } from '../../ui/tooltip';
import { laneSettings, defaultSurfaceOpacity } from '../core/lane_settings';

type Div = d3.Selection<HTMLDivElement>;

/** The icon on the pane button: three lanes with dashed lines between them */
function ensurePaneIcon() {
    if (document.getElementById('lanes-icon-pane')) return;
    const svg = d3_select(document.body).append('svg')
        .attr('class', 'lanes-icon-defs')
        .attr('width', 0).attr('height', 0)
        .style('position', 'absolute');
    const symbol = svg.append('symbol').attr('id', 'lanes-icon-pane').attr('viewBox', '0 0 20 20');
    symbol.append('path').attr('d', 'M3 2h1.6v16H3zM15.4 2H17v16h-1.6z');
    symbol.append('path').attr('d', 'M7.3 2h1.2v3H7.3zM7.3 8.5h1.2v3H7.3zM7.3 15h1.2v3H7.3zM11.5 2h1.2v3h-1.2zM11.5 8.5h1.2v3h-1.2zM11.5 15h1.2v3h-1.2z');
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
        .sections([uiSectionLaneDisplay(context)]);
}
