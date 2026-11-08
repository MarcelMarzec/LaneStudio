import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { utilDisplayLabel } from '../../util/utilDisplayLabel';
import { actionChangeLanes } from '../actions/change_lanes';
import type { Measurement } from '../core/mode_measure';
import { withParkingValue } from '../model/parking';
import { parseLanes, setLaneValue } from '../model';

type Div = d3.Selection<HTMLDivElement>;

/** The widths a measurement can be set as, each the tag it writes (`side` is the side of the road it was measured on) */
export type MeasureTarget = 'road' | 'lane' | 'sidewalk' | 'cycleway' | 'shoulder' | 'parking';
export const measureTargets: MeasureTarget[] = ['road', 'lane', 'sidewalk', 'cycleway', 'shoulder', 'parking'];

/** A measured width, rounded to 0.1 m as widths are usually tagged */
export const roundedWidth = (metres: number) => String(Math.round(metres * 10) / 10);

/** The tags a road has once a measured width is set as one of its widths */
export function withMeasuredWidth(tags: Tags, target: Exclude<MeasureTarget, 'lane'>, side: 'left' | 'right', metres: number): Tags {
    const value = roundedWidth(metres);
    switch (target) {
        case 'road': return { ...tags, width: value };
        case 'sidewalk': return { ...tags, [`sidewalk:${side}:width`]: value };
        case 'cycleway': return { ...tags, [`cycleway:${side}:width`]: value };
        case 'shoulder': return { ...tags, [`shoulder:${side}:width`]: value };
        case 'parking': return withParkingValue(tags, side, 'width', value);
    }
}

/**
 * The Measure tool's panel, in the sidebar in place of the feature search while the tool is on: how to measure, the
 * distance measured, and buttons setting it as a width of the road it was measured across, each one undo step
 */
export function measurePanel(context: iD.Context) {
    let _body: Div | null = null;
    let _measured: Measurement | null = null;
    let _points = 0;

    function panel(selection: Div) {
        const header = selection.append('div').attr('class', 'header fillL');
        header.append('button')
            .attr('class', 'close')
            .attr('title', t('_lanes.routing.close'))
            .on('click', () => context.enter(modeBrowse(context) as any))
            .call(svgIcon('#iD-icon-close', ''));
        header.append('h2').text(t('_lanes.measure.title'));
        _body = selection.append('div').attr('class', 'body')
            .append('div').attr('class', 'lanes-routing-sidebar lanes-measure-sidebar') as unknown as Div;
        render();
    }

    function render() {
        const body = _body;
        if (!body) return;
        body.selectAll('*').remove();
        const section = body.append('div').attr('class', 'routing-section');
        section.append('p').attr('class', 'routing-hint').text(t(_points === 1 ? '_lanes.measure.hint_second' : '_lanes.measure.hint'));
        const m = _measured;
        if (!m) return;
        section.append('p').attr('class', 'lanes-measure-result').text(t('_lanes.measure.metres', { m: m.metres.toFixed(2) }));
        const way = m.road ? context.hasEntity(m.road.wayID as osmWay['id']) as osmWay | undefined : undefined;
        const set = body.append('div').attr('class', 'routing-section');
        if (!way || !m.road) {
            set.append('p').attr('class', 'routing-hint').text(t('_lanes.measure.no_road'));
            return;
        }
        const road = m.road;
        set.append('h4').text(t('_lanes.measure.set_on', { road: utilDisplayLabel(way, context.graph()) }));
        const side = t(`_lanes.measure.sides.${road.side}`);
        const buttons = set.append('div').attr('class', 'lanes-measure-targets');
        for (const target of measureTargets) {
            const lane = target === 'lane';
            const readonly = lane && parseLanes(way.tags).keys['width:lanes']?.readonly;
            buttons.append('button')
                .attr('type', 'button')
                .attr('class', `button-secondary lanes-measure-target lanes-measure-${target}`)
                .attr('disabled', (lane && !road.lane) || readonly ? true : null)
                .text(t(`_lanes.measure.targets.${target}`, { side, width: roundedWidth(m.metres) }))
                .on('click', () => {
                    const annotation = t('_lanes.measure.annotation');
                    if (lane && road.lane) {
                        const ref = road.lane;
                        context.perform(actionChangeLanes(way.id, model => setLaneValue(model, ref, 'width:lanes', roundedWidth(m.metres))), annotation);
                    } else if (!lane) {
                        context.perform(actionChangeTags(way.id, withMeasuredWidth(way.tags, target as Exclude<MeasureTarget, 'lane'>, road.side, m.metres)), annotation);
                    }
                    (context.ui() as any).flash.label(t.append('_lanes.measure.done'))();
                });
        }
    }

    return {
        show() {
            const sidebar = (context.ui() as any).sidebar;
            sidebar.show(panel);
            sidebar.expand?.();
        },
        hide() {
            (context.ui() as any).sidebar.hide();
            _body = null;
        },
        update(measured: Measurement | null, points: number) {
            _measured = measured;
            _points = points;
            render();
        }
    };
}
