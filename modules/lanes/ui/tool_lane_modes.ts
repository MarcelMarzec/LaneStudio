import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import { uiTooltip } from '../../ui/tooltip';
import { laneRouting } from '../core/lane_routing';
import { modeLaneRouting } from '../core/mode_routing';

type Div = d3.Selection<HTMLDivElement>;

interface ModeButton {
    id: 'select' | 'routing';
    /** an icon drawn in a 20 unit box */
    icon: string;
    active: () => boolean;
    click: () => void;
}

/**
 * The Selection and Routing buttons in the top bar, before iD's Point, Line and Area: Selection (the default)
 * selects and edits as iD does; Routing turns editing off and shows the routes through lanes and footways.
 */
export function uiToolLaneModes(context: iD.Context) {
    const routing = laneRouting(context);
    const drawing = () => /^(add|draw)/.test(context.mode()?.id ?? '');

    const buttons: ModeButton[] = [
        {
            id: 'select',
            // a pointer
            icon: '<path d="M5 2.5v14l3.6-3.4 2.6 5.6 2.4-1.1-2.6-5.5h5z" fill="currentColor"/>',
            active: () => !routing.active() && !drawing(),
            click: () => {
                if (routing.active() || drawing()) context.enter(modeBrowse(context) as any);
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
            update();
        }
    };
    return tool;
}
