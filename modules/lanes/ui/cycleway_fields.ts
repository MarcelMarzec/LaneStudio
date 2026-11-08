import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { osmWay } from '../../osm/way';
import { uiDisclosure } from '../../ui/disclosure';
import { cyclewayValue, roadContraflowSide, type Side } from '../core/roadside';
import { sidedRows } from './lane_fields';

type Div = d3.Selection<HTMLDivElement>;

/*
 * A side's cycle lane or track in detail (wiki: Key:cycleway), under the Cycleway field, folded away as each side's
 * parking is: the line beside it, which way its cycles go, its width, a buffer, what keeps it apart, and its colour.
 * Each is written as `cycleway:<side>:<key>`.
 */

/** The details offered, their values (blank: not tagged), and whether a value may be typed */
export const cyclewayDetails: { key: string; values: string[]; typed?: boolean; lanesOnly?: boolean }[] = [
    { key: 'lane', values: ['exclusive', 'advisory'], lanesOnly: true },
    { key: 'oneway', values: ['yes', '-1', 'no'] },
    { key: 'width', values: ['1', '1.5', '2', '2.5', '3'], typed: true },
    { key: 'buffer', values: ['yes', 'no', '0.5', '1'], typed: true, lanesOnly: true },
    { key: 'separation', values: ['bollard', 'flex_post', 'kerb', 'planter', 'vertical_panel', 'no'], lanesOnly: true },
    { key: 'surface:colour', values: ['green', 'red', 'blue'] }
];

/** Writes one detail of a side's cycleway, `cycleway:<side>:<key>`; blank removes it */
export function withCyclewayDetail(tags: Tags, side: Side, key: string, value: string | undefined): Tags {
    const next = { ...tags };
    const tagKey = `cycleway:${side}:${key}`;
    // a value set on both sides at once moves onto each side, so this side can differ
    const both = next[`cycleway:both:${key}`];
    if (both !== undefined) {
        delete next[`cycleway:both:${key}`];
        for (const other of ['left', 'right'] as const) if (next[`cycleway:${other}:${key}`] === undefined) next[`cycleway:${other}:${key}`] = both;
    }
    if (value) next[tagKey] = value;
    else delete next[tagKey];
    return next;
}

/** One disclosure per side with a cycle lane or track, under the Cycleway field */
export function cyclewaySideDetails(context: iD.Context, wrap: Div, road: osmWay, sides: Side[], nameOf: (side: Side) => string) {
    const contraflow = roadContraflowSide(road, context.graph());
    for (const side of sides) {
        const value = cyclewayValue(road.tags, side, contraflow);
        if (value !== 'lane' && value !== 'track' && value !== 'opposite_lane' && value !== 'opposite_track') continue;
        const lane = value.endsWith('lane');
        const holder = wrap.append('div').attr('class', `lane-cycleway-details lane-cycleway-details-${side}`);
        holder.call((uiDisclosure(context, `lanes_cycleway_${side}_details`, false) as any)
            .label(() => t('_lanes.cycleway.details_title', { side: t(`_lanes.roadside.${nameOf(side)}`) }))
            .content((selection: Div) => {
                selection.selectAll('*').remove();
                const tags = (context.hasEntity(road.id) as osmWay | undefined)?.tags ?? road.tags;
                const get = (key: string) => tags[`cycleway:${side}:${key}`] ?? tags[`cycleway:both:${key}`];
                sidedRows(context, selection, cyclewayDetails.filter(d => lane || !d.lanesOnly).map(detail => ({
                    id: `cycleway-${side}-${detail.key.replace(':', '-')}`,
                    label: t(`_lanes.cycleway.${detail.key.replace(':', '_')}`),
                    value: get(detail.key) ?? '',
                    strict: !detail.typed,
                    emptyTitle: t('_lanes.roadside.unknown'),
                    suggestions: detail.values.map(v => ({ value: v, title: t(`_lanes.cycleway.values.${detail.key.replace(':', '_')}.${v.replace('.', '_').replace('-', 'minus')}`, { default: v }) })),
                    onChange: (next: string) => context.perform(actionChangeTags(road.id, withCyclewayDetail(tags, side, detail.key, next || undefined)),
                        t('_lanes.annotation.roadside'))
                })));
            }));
    }
}
