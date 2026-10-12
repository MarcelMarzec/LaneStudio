import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { NodeId } from '../../osm';
import type { osmNode } from '../../osm/node';
import { uiSection } from '../../ui/section';
import { laneTools } from '../core/lane_tools';
import { isLaneRoad } from '../core/roads';
import {
    markingTypes, markingType, withMarkingType, crossingOptions, withCrossing, withDirection,
    calmingValues, crossingMarkingValues, type MarkingType
} from '../model/markings';

type Div = d3.Selection<HTMLDivElement>;

/**
 * "Road markings" in the sidebar for a node on a road: what is painted or standing there
 * (crossing, stop, give way, signals, traffic calming, mini-roundabout) and its options.
 */
export function uiSectionMarkings(context: iD.Context) {
    const tools = laneTools(context);
    let _entityIDs: string[] = [];

    const node = (): osmNode | undefined => {
        if (_entityIDs.length !== 1) return undefined;
        const entity = context.hasEntity(_entityIDs[0] as NodeId);
        if (!entity || entity.type !== 'node') return undefined;
        return context.graph().parentWays(entity).some(isLaneRoad) ? entity as osmNode : undefined;
    };

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('road-markings', context) as any)
        .label(() => t.append('_lanes.markings.title'))
        .shouldDisplay(() => !!node())
        .disclosureContent(render);

    tools.on('change.markings', () => {
        if (node()) section.reRender();
    });

    function change(n: osmNode, tags: Tags) {
        context.perform(actionChangeTags(n.id, tags), t('_lanes.annotation.marking'));
    }

    function buttons(row: Div, values: readonly string[], current: string, label: (v: string) => string, pick: (v: string) => void) {
        const wrap = row.append('div').attr('class', 'lane-buttons');
        for (const value of values) {
            wrap.append('button')
                .attr('class', value === current ? 'active' : null)
                .attr('aria-pressed', value === current)
                .text(label(value))
                .on('click', () => { if (value !== current) pick(value); });
        }
    }

    function render(selection: Div) {
        selection.selectAll('*').remove();
        const n = node();
        if (!n) return;
        const tags = n.tags;
        const type = markingType(tags);
        const wrap = selection.append('div').attr('class', 'lanes-editor markings-editor');

        const typeRow = wrap.append('div').attr('class', 'lane-row');
        typeRow.append('label').text(t('_lanes.markings.type'));
        buttons(typeRow, markingTypes, type, v => t(`_lanes.markings.types.${v}`),
            v => change(n, withMarkingType(tags, v as MarkingType)));

        if (type === 'crossing') {
            const options = crossingOptions(tags);
            const row = wrap.append('div').attr('class', 'lane-row');
            row.append('label').text(t('_lanes.markings.crossing_markings'));
            buttons(row, crossingMarkingValues, options.markings, v => t(`_lanes.markings.crossing.${v}`),
                v => change(n, withCrossing(tags, { ...options, markings: v })));

            for (const key of ['signals', 'island'] as const) {
                const label = wrap.append('label').attr('class', 'lane-check');
                label.append('input').attr('type', 'checkbox')
                    .property('checked', options[key])
                    .on('change', function(this: HTMLInputElement) {
                        change(n, withCrossing(tags, { ...options, [key]: this.checked }));
                    });
                label.append('span').text(t(`_lanes.markings.crossing.${key}`));
            }
        }

        if (type === 'stop' || type === 'give_way' || type === 'traffic_signals') {
            const row = wrap.append('div').attr('class', 'lane-row');
            row.append('label').text(t('_lanes.markings.direction'));
            const current = tags.direction === 'forward' || tags.direction === 'backward' ? tags.direction : 'both';
            buttons(row, ['forward', 'backward', 'both'], current, v => t(`_lanes.markings.directions.${v}`),
                v => change(n, withDirection(tags, v as 'forward' | 'backward' | 'both')));
            wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.markings.direction_hint'));
            if (type === 'stop') {
                const label = wrap.append('label').attr('class', 'lane-check');
                label.append('input').attr('type', 'checkbox')
                    .property('checked', tags.stop === 'all')
                    .on('change', function(this: HTMLInputElement) {
                        const next = { ...tags };
                        if (this.checked) next.stop = 'all';
                        else delete next.stop;
                        change(n, next);
                    });
                label.append('span').text(t('_lanes.markings.all_way_stop'));
            }
        }

        if (type === 'calming') {
            const row = wrap.append('div').attr('class', 'lane-row');
            row.append('label').text(t('_lanes.markings.calming'));
            buttons(row, calmingValues, tags.traffic_calming ?? '', v => t(`_lanes.markings.calming_types.${v}`),
                v => change(n, { ...tags, traffic_calming: v }));
        }

        renderPlaceTool(wrap);
    }

    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    function renderPlaceTool(wrap: Div) {
        if (tools.tool() !== 'marking') return;
        const note = wrap.append('p').attr('class', 'lanes-note');
        note.text(t('_lanes.markings.placing', { type: t(`_lanes.markings.types.${tools.marking()}`) }) + ' ');
        note.append('a').attr('href', '#').text(t('_lanes.markings.stop_placing'))
            .on('click', (event: MouseEvent) => {
                event.preventDefault();
                tools.setTool('select');
            });
    }

    return section;
}
