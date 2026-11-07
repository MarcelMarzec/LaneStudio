import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { prefs } from '../../core/preferences';
import { modeSelect } from '../../modes/select';
import type { osmWay } from '../../osm/way';
import { utilHighlightEntities } from '../../util';
import { actionChangeLanes } from '../actions/change_lanes';
import { actionCopyLanes, canCopyLanes } from '../actions/copy_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import { laneCorridor } from '../osm/corridor';
import { roundaboutOf, turboRestrictionCount, withTurbo } from '../osm/roundabout';
import {
    laneKindOf, laneValue, parseLanes, setLaneValue, toggleTurn,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';
import { fieldNote, fieldShell, laneArrowIcon, type FieldChrome } from './lane_fields';
import { roadSection } from './road_sections';
import { tooltip } from './section_lanes';

type Div = d3.Selection<HTMLDivElement>;

/** A check box field, as iD's check fields: the label row, then the box and its text in one row */
export function checkField(parent: Div, options: FieldChrome & { id: string; label: string; text: string; checked: boolean;
    onChange: (checked: boolean) => void }) {
    const { wrap } = fieldShell(parent, { ...options, labelFor: `lane-field-${options.id}` });
    const label = wrap.append('label').attr('class', 'form-field-input-check lane-check-field');
    label.append('input').attr('type', 'checkbox').attr('id', `lane-field-${options.id}`)
        .property('checked', options.checked)
        .on('change', function(this: HTMLInputElement) { options.onChange(this.checked); });
    label.append('span').attr('class', options.checked ? 'set' : null).text(options.text);
    return wrap;
}

/** A roundabout: the whole ring, turbo tagging and its checks */
export function uiSectionRoundabout(context: iD.Context) {
    const state = laneState(context);
    return roadSection(context, {
        id: 'lanes-roundabout',
        label: () => t('_lanes.roundabout.title'),
        shows: road => !!roundaboutOf(road, context.graph()),
        always: road => {
            const ring = road ? roundaboutOf(road, context.graph()) : null;
            if (ring) state.setCorridor(ring.ring.map(w => w.id));
        },
        render: (selection, road) => {
            const ring = roundaboutOf(road, context.graph());
            if (!ring) return;
            const box = selection.append('div').attr('class', 'lanes-editor lanes-roundabout');
            fieldNote(box, t('_lanes.roundabout.summary', { segments: ring.ring.length, approaches: ring.approaches.length }));

            const turbo = road.tags.roundabout === 'turbo';
            const wrap = checkField(box, {
                id: 'turbo', label: t('_lanes.roundabout.turbo_label'), info: 'turbo', text: t('_lanes.roundabout.turbo'),
                checked: turbo, present: turbo,
                onRemove: () => context.perform(actionChangeTags(road.id, withTurbo(road.tags, false)), t('_lanes.annotation.roundabout')),
                onChange: checked => context.perform(actionChangeTags(road.id, withTurbo(road.tags, checked)), t('_lanes.annotation.roundabout'))
            });
            fieldNote(wrap, t('_lanes.roundabout.turbo_hint'));

            if (ring.turbo.length) {
                const untagged = ring.ring.filter(w => w.tags.roundabout !== 'turbo');
                if (untagged.length) {
                    const note = fieldNote(box, t('_lanes.roundabout.untagged', { n: untagged.length, total: ring.ring.length }), 'lanes-suggestion');
                    note.append('button').attr('type', 'button').text(t('_lanes.roundabout.select_next'))
                        .on('click', () => context.enter(modeSelect(context, [untagged[0].id])));
                }
                const found = ring.restrictions.length;
                fieldNote(box, t('_lanes.roundabout.restrictions', { n: found, needed: turboRestrictionCount }),
                    found < turboRestrictionCount ? 'lanes-suggestion' : '');
            }
            fieldNote(box, t('_lanes.roundabout.spiral'));
        }
    });
}


/**
 * Look ahead: the roads the selected road leads on to (outlined on the map whether or not the section is open), the
 * exits at its end with suggested turn and destination values for the selected lanes, and copying lanes to the next
 * road. Suggestions are only written when clicked, one road per click.
 */
export function uiSectionLookAhead(context: iD.Context) {
    const state = laneState(context);

    const lookAhead = (road: osmWay, model: LaneModel, refs: LaneRef[]) => {
        const travel: 'forward' | 'backward' = model.oneway || (refs[0]?.direction === 'backward' ? 'backward' : 'forward');
        const limit = Math.max(1, Math.min(10, parseInt(prefs('lanes-lookahead') ?? '', 10) || 5));
        const steps = laneCorridor(road, context.graph(), { direction: travel, maxWays: limit, maxMetres: 1500 });
        return { travel, limit, steps };
    };
    const selectedRefs = (road: osmWay, model: LaneModel) => (state.selected()?.wayID === road.id ? state.selected()!.refs : [])
        .filter(ref => model.lanes[ref.direction][ref.index]);
    const modelOf = (road: osmWay) => parseLanes(road.tags, { driveSide: laneDriveSide(road, context.graph()) });

    const section = roadSection(context, {
        id: 'lanes-lookahead',
        label: () => t('_lanes.lookahead.title'),
        shows: road => !roundaboutOf(road, context.graph()),
        always: road => {
            if (!road || roundaboutOf(road, context.graph())) return;
            const model = modelOf(road);
            state.setCorridor(lookAhead(road, model, selectedRefs(road, model)).steps.map(step => step.way.id));
        },
        render: (selection, road) => {
            const box = selection.append('div').attr('class', 'lanes-editor lanes-lookahead');
            const graph = context.graph();
            const model = modelOf(road);
            const refs = selectedRefs(road, model);
            const { travel, limit, steps } = lookAhead(road, model, refs);
            const perform = (change: (m: LaneModel) => LaneModel, annotation: string) =>
                context.perform(actionChangeLanes(road.id, change), t(`_lanes.annotation.${annotation}`));
            const setLimit = (n: number) => {
                prefs('lanes-lookahead', String(Math.max(1, Math.min(10, n || 5))));
                section.reRender();
            };

            /* how many roads to follow, as iD's number fields */
            const { wrap: input } = fieldShell(box, {
                id: 'lookahead-limit', label: t('_lanes.lookahead.limit'), labelFor: 'lane-field-lookahead-limit', info: 'lookahead',
                wrapClass: 'form-field-input-number'
            });
            input.append('input').attr('type', 'text').attr('id', 'lane-field-lookahead-limit').attr('inputmode', 'numeric')
                .property('value', limit)
                .on('change', function(this: HTMLInputElement) { setLimit(parseInt(this.value, 10)); });
            for (const step of [-1, 1]) {
                const which = step > 0 ? 'increment' : 'decrement';
                input.append('button').attr('type', 'button').attr('class', `form-field-button ${which}`)
                    .attr('title', t(`inspector.${which}`))
                    .attr('disabled', limit + step < 1 || limit + step > 10 ? true : null)
                    .on('click', () => setLimit(limit + step));
            }
            if (!model.oneway) fieldNote(box, t(`_lanes.lookahead.travelling_${travel}`));

            /* the corridor, one line per road: its name, its lanes our way and how far along it is */
            const list = box.append('ol').attr('class', 'lanes-corridor');
            steps.forEach((step, i) => {
                const tags = step.way.tags;
                const stepModel = parseLanes(tags, { driveSide: laneDriveSide(step.way, graph) });
                // the lanes travelling our way on this road, left to right for the driver
                const direction: LaneDirection = stepModel.oneway || (step.alongWay ? 'forward' : 'backward');
                const item = list.append('li').attr('class', i === 0 ? 'current' : null)
                    .on('mouseenter', () => utilHighlightEntities([step.way.id], true, context))
                    .on('mouseleave', () => utilHighlightEntities([step.way.id], false, context));
                item.append('a').attr('href', '#').attr('class', 'lanes-corridor-name')
                    .text([tags.ref, tags.name].filter(Boolean).join(' ') || t('_lanes.lookahead.unnamed'))
                    .on('click', (event: MouseEvent) => {
                        event.preventDefault();
                        utilHighlightEntities([step.way.id], false, context);
                        context.enter(modeSelect(context, [step.way.id]));
                    });
                const cells = item.append('span').attr('class', 'lanes-corridor-cells');
                stepModel.lanes[direction].forEach((_, index) => {
                    const ref = { direction, index };
                    cells.append('span')
                        .attr('class', `lanes-cell lane-${laneKindOf(stepModel, ref)}`)
                        .call(cell => laneArrowIcon(cell as any, laneValue(stepModel, ref, 'turn:lanes'), 'travel', 16, stepModel.driveSide));
                });
                if (stepModel.countSource === 'assumed') cells.classed('assumed', true);
                item.append('span').attr('class', 'lanes-corridor-distance').text(t('_lanes.lookahead.metres', { n: Math.round(step.distance) }));
            });

            /* exits at the end of the selected road */
            const first = steps[0];
            if (first?.exits.length) {
                box.append('h5').attr('class', 'lanes-lookahead-heading').text(t('_lanes.lookahead.exits'));
                const exits = box.append('ul').attr('class', 'lanes-exits');
                for (const exit of first.exits) {
                    const li = exits.append('li')
                        .on('mouseenter', () => utilHighlightEntities([exit.way.id], true, context))
                        .on('mouseleave', () => utilHighlightEntities([exit.way.id], false, context));
                    const turnCell = li.append('span').attr('class', 'lanes-exit-turn').attr('title', t(`_lanes.turn.${exit.turn}`));
                    laneArrowIcon(turnCell as any, exit.turn, 'travel', 18, model.driveSide);
                    li.append('span').attr('class', 'lanes-exit-name')
                        .text((exit.exitNumber ? t('_lanes.lookahead.exit_number', { n: exit.exitNumber }) + ' ' : '') +
                            ([exit.destinationRef, exit.destination].filter(Boolean).join(' ') || t('_lanes.lookahead.unnamed')));
                    if (!refs.length) continue;
                    const actions = li.append('span').attr('class', 'lanes-exit-actions');
                    actions.append('button').attr('type', 'button').text(t('_lanes.lookahead.use_turn'))
                        .call(tooltip(t('_lanes.lookahead.use_turn_tip')))
                        .on('click', () => perform(m => refs.reduce(
                            (acc, ref) => setLaneValue(acc, ref, 'turn:lanes', toggleTurn(laneValue(acc, ref, 'turn:lanes'), exit.turn)), m), 'turn'));
                    if (exit.destination || exit.destinationRef) {
                        actions.append('button').attr('type', 'button').text(t('_lanes.lookahead.use_destination'))
                            .call(tooltip(t('_lanes.lookahead.use_destination_tip')))
                            .on('click', () => perform(m => {
                                let next = m;
                                if (exit.destination && !next.keys['destination:lanes']?.readonly) next = setLaneValue(next, refs, 'destination:lanes', exit.destination);
                                if (exit.destinationRef && !next.keys['destination:ref:lanes']?.readonly) next = setLaneValue(next, refs, 'destination:ref:lanes', exit.destinationRef);
                                return next;
                            }, 'value'));
                    }
                }
                if (!refs.length) fieldNote(box, t('_lanes.lookahead.select_lanes'));
            }

            /* copy to the next road */
            const second = steps[1];
            if (second && canCopyLanes(road.tags, second.way.tags)) {
                const sameOrientation = first.alongWay === second.alongWay;
                box.append('button').attr('type', 'button').attr('class', 'lanes-copy-next')
                    .text(t('_lanes.lookahead.copy', { road: second.way.tags.ref ?? second.way.tags.name ?? second.way.id }))
                    .call(tooltip(t('_lanes.lookahead.copy_tip')))
                    .on('click', () => {
                        context.perform(actionCopyLanes(road.id, second.way.id, sameOrientation), t('_lanes.annotation.copy'));
                        context.enter(modeSelect(context, [second.way.id]));
                    });
            }
        }
    });
    // the exits' buttons need the lanes picked on the map
    state.on('change.section-lookahead', () => {
        if (section.road()) section.reRender();
    });
    return section;
}
