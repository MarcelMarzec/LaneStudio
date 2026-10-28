import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import { uiTooltip } from '../../ui/tooltip';
import { laneRouting } from '../core/lane_routing';
import { modeLaneRouting } from '../core/mode_routing';
import { laneSpeed } from '../core/lane_speed';
import { modeLaneSpeed } from '../core/mode_speed';

type Div = d3.Selection<HTMLDivElement>;

interface ModeButton {
    id: 'select' | 'routing' | 'speed';
    /** an icon drawn in a 20 unit box */
    icon: string;
    active: () => boolean;
    click: () => void;
}

/**
 * The Selection, Routing and Speed Limit buttons in the top bar, before iD's Point, Line and Area: Selection (the
 * default) selects and edits as iD does; Routing turns editing off and shows the routes through lanes and footways;
 * Speed Limit colours the lanes by their limit and sets limits with a click.
 */
export function uiToolLaneModes(context: iD.Context) {
    const routing = laneRouting(context);
    const speed = laneSpeed(context);
    const drawing = () => /^(add|draw)/.test(context.mode()?.id ?? '');

    const buttons: ModeButton[] = [
        {
            id: 'select',
            // a pointer
            icon: '<path d="M5 2.5v14l3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5h5z" fill="currentColor"/>',
            active: () => !routing.active() && !speed.active() && !drawing(),
            click: () => {
                if (routing.active() || speed.active() || drawing()) context.enter(modeBrowse(context) as any);
            }
        },
        {
            id: 'routing',
            // a road forking into two arrows
            icon: '<path d="M10 18v-6.5M10 11.5 5 6.5M10 11.5l5-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
                '<path d="M2.5 3.5h5.2l-5.2 5.2zM17.5 3.5h-5.2l5.2 5.2z" fill="currentColor"/>',
            active: () => routing.active(),
            click: () => {
                if (routing.active()) context.enter(modeBrowse(context) as any);
                else context.enter(modeLaneRouting(context) as any);
            }
        },
        {
            id: 'speed',
            // a speed limit roundel (styled inline: iD's own CSS paints svg text dark, which hid it on the button)
            icon: '<circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="2.6"/>' +
                '<text x="10" y="13.2" text-anchor="middle" style="color: inherit; fill: currentColor; font-size: 9px; font-weight: 700">30</text>',
            active: () => speed.active(),
            click: () => {
                if (speed.active()) context.enter(modeBrowse(context) as any);
                else context.enter(modeLaneSpeed(context) as any);
            }
        }
    ];

    const tool = {
        id: 'lane_modes',
        label: t.append('_lanes.toolbar.tools'),
        render(selection: Div) {
            const wrap = selection.append('div').attr('class', 'joined').style('display', 'flex');
            const items = wrap.selectAll('button.lanes-mode-button')
                .data(buttons, (d: unknown) => (d as ModeButton).id)
                .enter()
                .append('button')
                .attr('class', d => `lanes-mode-button lanes-mode-${d.id} bar-button`)
                .on('click', (_event: MouseEvent, d: ModeButton) => d.click())
                .call((uiTooltip() as any)
                    .placement('bottom')
                    .title((d: ModeButton) => t.append(`_lanes.toolbar.${d.id}.tooltip`))
                    .scrollContainer(context.container().select('.top-toolbar')));
            items.append('svg').attr('class', 'icon').attr('viewBox', '0 0 20 20').attr('width', 20).attr('height', 20)
                .html(d => d.icon);
            items.append('span').attr('class', 'label').text(d => t(`_lanes.toolbar.${d.id}.title`));

            const update = () => {
                wrap.selectAll<HTMLButtonElement, ModeButton>('button.lanes-mode-button')
                    .classed('active', d => d.active())
                    .attr('aria-pressed', d => d.active());
            };
            context.on('enter.lane-modes', update);
            routing.on('change.lane-modes', update);
            speed.on('change.lane-modes', update);
            update();
        }
    };
    return tool;
}
