import { t } from '../../core/localizer';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { actionChangeTags } from '../../actions/change_tags';
import { prefs } from '../../core/preferences';
import { modeSelect } from '../../modes/select';
import { actionCopyLanes, canCopyLanes } from '../actions/copy_lanes';
import { laneCorridor } from '../osm/corridor';
import { uiDisclosure } from '../../ui/disclosure';
import { uiSection } from '../../ui/section';
import { utilHighlightEntities } from '../../util';
import {
    parallelWays, isSidewalkWay, isKerbWay, sidewalkValue, withSidewalk, cyclewayValue, withCycleway,
    parkingValue, withParking, shoulderValue, withShoulder
} from '../core/roadside';
import { laneLayout } from '../geometry/layout';
import { roundaboutOf, withTurbo, turboRestrictionCount, type Roundabout } from '../osm/roundabout';
import { markingTypes, type MarkingType } from '../model/markings';
import { signChoices, signNameKey, type SignChoice } from '../model/signs';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import { laneTools } from '../core/lane_tools';
import { laneField, laneSuggestions, laneArrowIcon, laneChangeIcon, sidedField } from './lane_fields';
import { uiTooltip } from '../../ui/tooltip';
import { isLaneRoad } from '../core/roads';
import { isTrafficIsland } from '../model/street_features';
import {
    mphLimits, mphOf, roadSpeedPick, speedPickLabel, speedRoundels, speedTypeOf, ukSpeedTypes, withRoadMinspeed, withRoadSpeed,
    type SpeedPick, type UkSpeedType
} from './speed_roundels';
import {
    parseLanes, laneRefsInWayOrder, laneCount, insertLane, removeLane, moveLane, setLaneValue, laneValue,
    turnValues, parseTurn, toggleTurn, parseChange, formatChange, laneDirections,
    laneKindKeys, laneKindOf, setLaneKind,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';

type Div = d3.Selection<HTMLDivElement>;

/** iD's hover tooltip with a line of text (uiTooltip is plain JavaScript, so its setters are not typed) */
const tooltip = (text: string) => (uiTooltip() as any).title(() => text).placement('top');

/** Per-lane values edited as text in the inspector */
const textFields: { id: string; key: string }[] = [
    { id: 'maxspeed', key: 'maxspeed:lanes' },
    { id: 'minspeed', key: 'minspeed:lanes' },
    { id: 'destination', key: 'destination:lanes' },
    { id: 'destination_ref', key: 'destination:ref:lanes' },
    { id: 'access', key: 'access:lanes' },
    { id: 'width', key: 'width:lanes' },
    { id: 'maxwidth', key: 'maxwidth:lanes' },
    { id: 'maxheight', key: 'maxheight:lanes' },
    { id: 'maxweight', key: 'maxweight:lanes' },
    { id: 'surface', key: 'surface:lanes' }
];

const handledKeys = new Set([
    'turn:lanes', 'change:lanes', 'maxspeed:type:lanes', ...textFields.map(f => f.key),
    ...Object.values(laneKindKeys).filter((k): k is string => !!k)
]);

/** What the Paint tool can write */
const paintKeys = [
    { key: 'kind', label: 'inspector.kind' },
    { key: 'turn:lanes', label: 'inspector.turn' },
    { key: 'change:lanes', label: 'inspector.change' },
    { key: 'maxspeed:lanes', label: 'field.maxspeed' },
    { key: 'access:lanes', label: 'field.access' },
    { key: 'surface:lanes', label: 'field.surface' },
    { key: 'width:lanes', label: 'field.width' }
];

const paintChoices: Record<string, { value: string; label: string }[]> = {
    'kind': Object.keys(laneKindKeys).map(kind => ({ value: kind, label: `_lanes.kind.${kind}` })),
    'turn:lanes': turnValues.map(value => ({ value, label: `_lanes.turn.${value}` })),
    'change:lanes': ['yes', 'no', 'not_left', 'not_right'].map(value => ({ value, label: `_lanes.change.${value}` }))
};



/** The "Lanes" section in iD's entity editor, shown for one selected road */
export function uiSectionLanes(context: iD.Context) {
    const state = laneState(context);
    const tools = laneTools(context);
    let _entityIDs: string[] = [];

    const way = (): osmWay | undefined => {
        if (_entityIDs.length !== 1) return undefined;
        const entity = context.hasEntity(_entityIDs[0] as WayId);
        return isLaneRoad(entity) ? entity : undefined;
    };

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('lanes', context) as any)
        .label(() => t.append('_lanes.section.title'))
        .shouldDisplay(() => !!way())
        .disclosureContent(render);

    // keep the inspector in step with lanes picked on the map
    tools.on('change.section', () => {
        if (way()) section.reRender();
    });
    state.on('change.section', () => {
        if (way()) section.reRender();
    });


    function perform(wayID: WayId, change: (model: LaneModel) => LaneModel, annotation: string) {
        context.perform(actionChangeLanes(wayID, change), t(`_lanes.annotation.${annotation}`));
    }


    function render(selection: Div) {
        const road = way();
        selection.selectAll('*').remove();
        if (!road) return;

        const graph = context.graph();
        const model = parseLanes(road.tags, { driveSide: laneDriveSide(road, graph) });
        const wayID = road.id;
        const total = laneCount(model);

        // drop selected lanes that no longer exist
        const selected = (state.selected()?.wayID === wayID ? state.selected()!.refs : [])
            .filter(ref => model.lanes[ref.direction][ref.index]);

        const wrap = selection.append('div').attr('class', 'lanes-editor');

        /* summary */
        const summary = model.oneway
            ? t('_lanes.section.summary.oneway', { n: total })
            : t('_lanes.section.summary.twoway', { forward: model.lanes.forward.length, backward: model.lanes.backward.length }) +
              (model.lanes.both_ways.length ? ', ' + t('_lanes.section.summary.both_ways', { n: model.lanes.both_ways.length }) : '');
        wrap.append('p').attr('class', 'lanes-summary').text(summary);
        if (model.countSource === 'assumed') {
            wrap.append('p').attr('class', 'lanes-note assumed').text(t('_lanes.section.assumed'));
        }

        /* lane counts per direction */
        const groups: LaneDirection[] = model.oneway ? [model.oneway] : [...laneDirections];
        const counts = wrap.append('div').attr('class', 'lanes-counts');
        for (const direction of groups) {
            const n = model.lanes[direction].length;
            const row = counts.append('div').attr('class', `lanes-count-row lanes-count-${direction}`);
            row.append('span').attr('class', 'lanes-count-label')
                .text(model.oneway ? t('_lanes.section.counts.lanes') : t(`_lanes.section.counts.${direction}`));
            row.append('button').attr('class', 'lanes-count-remove')
                .attr('title', t('_lanes.section.counts.remove'))
                .attr('disabled', n === 0 || total <= 1 ? true : null)
                .text('−')
                .on('click', () => perform(wayID, m => removeLane(m, { direction, index: m.lanes[direction].length - 1 }), 'remove_lane'));
            row.append('span').attr('class', 'lanes-count-value').text(n);
            row.append('button').attr('class', 'lanes-count-add')
                .attr('title', t('_lanes.section.counts.add'))
                .text('+')
                .on('click', () => perform(wayID, m => insertLane(m, direction), 'add_lane'));
        }

        renderTools(wrap);

        /* lane strip, left to right along the way */
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.section.strip_hint'));
        const strip = wrap.append('div').attr('class', 'lanes-strip');
        laneRefsInWayOrder(model).forEach((ref, i) => {
            const turns = parseTurn(laneValue(model, ref, 'turn:lanes'));
            const isSelected = selected.some(r => r.direction === ref.direction && r.index === ref.index);
            strip.append('button')
                .attr('class', `lanes-strip-lane lane-${laneKindOf(model, ref)} lane-${ref.direction}` + (isSelected ? ' selected' : ''))
                .attr('aria-pressed', isSelected)
                .attr('aria-label', `${i + 1}, ${t(`_lanes.direction.${ref.direction}`)}` +
                    (turns.length ? ', ' + turns.map(v => t(`_lanes.turn.${v}`, { default: v })).join(', ') : ''))
                .on('click', (event: MouseEvent) => {
                    if (event.shiftKey) state.toggle(wayID, ref);
                    else state.select(wayID, [ref]);
                })
                .attr('title', turns.length ? turns.map(v => t(`_lanes.turn.${v}`, { default: v })).join(' + ') : t('_lanes.turn.none'))
                .call(button => {
                    laneArrowIcon(button as any, laneValue(model, ref, 'turn:lanes'), ref.direction, 26, model.driveSide);
                });
        });

        /* issues with the lane tags */
        if (model.issues.length) {
            const issues = wrap.append('ul').attr('class', 'lanes-issues');
            for (const issue of model.issues) {
                issues.append('li').text(t(`_lanes.issue.${issue.code}`, {
                    key: issue.key ?? '', expected: issue.expected ?? '', actual: issue.actual ?? ''
                }));
            }
        }

        if (selected.length) {
            renderInspector(wrap, model, wayID, selected, road);
        } else renderRoadLimits(wrap, road);
        const shoulder = state.shoulder();
        if (shoulder?.wayID === wayID) renderShoulder(wrap, road, shoulder.side);
        const ring = roundaboutOf(road, graph);
        if (ring) renderRoundabout(wrap, road, ring);
        else {
            // the corridor is outlined on the map whether or not Look ahead is open
            const ahead = lookAhead(road, model, selected);
            subsection(wrap, 'lanes-lookahead', t('_lanes.lookahead.title'), content => renderLookAhead(content, road, model, selected, ahead));
        }
        subsection(wrap, 'lanes-roadside', t('_lanes.roadside.title'), content => renderRoadside(content, road));
    }


    /** A part of the section that folds away as iD's own sections do, remembered across selections */
    function subsection(wrap: Div, key: string, label: string, content: (content: Div) => void) {
        wrap.append('div').attr('class', `lanes-subsection ${key}`)
            .call((uiDisclosure(context, key, true) as any)
                .label(() => label)
                .content((selection: Div) => {
                    selection.selectAll('*').remove();
                    content(selection);
                }));
    }


    /** A roundabout: the whole ring, turbo tagging and its checks */
    function renderRoundabout(wrap: Div, road: osmWay, ring: Roundabout) {
        state.setCorridor(ring.ring.map(w => w.id));
        const box = wrap.append('div').attr('class', 'lanes-roundabout');
        box.append('h4').text(t('_lanes.roundabout.title'));
        box.append('p').attr('class', 'lanes-note').text(t('_lanes.roundabout.summary', {
            segments: ring.ring.length, approaches: ring.approaches.length
        }));

        const turbo = road.tags.roundabout === 'turbo';
        const label = box.append('label').attr('class', 'lane-check');
        label.append('input').attr('type', 'checkbox')
            .property('checked', turbo)
            .on('change', function(this: HTMLInputElement) {
                context.perform(actionChangeTags(road.id, withTurbo(road.tags, this.checked)), t('_lanes.annotation.roundabout'));
            });
        label.append('span').text(t('_lanes.roundabout.turbo'));
        box.append('p').attr('class', 'lanes-note').text(t('_lanes.roundabout.turbo_hint'));

        if (ring.turbo.length) {
            const untagged = ring.ring.filter(w => w.tags.roundabout !== 'turbo');
            if (untagged.length) {
                const note = box.append('p').attr('class', 'lanes-note lanes-suggestion')
                    .text(t('_lanes.roundabout.untagged', { n: untagged.length, total: ring.ring.length }));
                note.append('button').text(t('_lanes.roundabout.select_next'))
                    .on('click', () => context.enter(modeSelect(context, [untagged[0].id])));
            }
            const found = ring.restrictions.length;
            box.append('p').attr('class', 'lanes-note' + (found < turboRestrictionCount ? ' lanes-suggestion' : ''))
                .text(t('_lanes.roundabout.restrictions', { n: found, needed: turboRestrictionCount }));
        }
        box.append('p').attr('class', 'lanes-note').text(t('_lanes.roundabout.spiral'));
    }


    /** The roads ahead of the selected road, in the direction of the selected lanes, outlined on the map */
    function lookAhead(road: osmWay, model: LaneModel, refs: LaneRef[]) {
        const travel: 'forward' | 'backward' = model.oneway || (refs[0]?.direction === 'backward' ? 'backward' : 'forward');
        const limit = Math.max(1, Math.min(10, parseInt(prefs('lanes-lookahead') ?? '', 10) || 5));
        const steps = laneCorridor(road, context.graph(), { direction: travel, maxWays: limit, maxMetres: 1500 });
        state.setCorridor(steps.map(step => step.way.id));
        return { travel, limit, steps };
    }

    /**
     * Look ahead: the roads the selected road leads on to, the exits at its end with suggested
     * turn and destination values for the selected lanes, and copying lanes to the next road.
     * Suggestions are only written when clicked, one road per click.
     */
    function renderLookAhead(box: Div, road: osmWay, model: LaneModel, refs: LaneRef[], ahead: ReturnType<typeof lookAhead>) {
        const graph = context.graph();
        const { travel, limit, steps } = ahead;
        const setLimit = (n: number) => {
            prefs('lanes-lookahead', String(Math.max(1, Math.min(10, n || 5))));
            section.reRender();
        };

        /* how many roads to follow, as iD's number fields */
        const field = box.append('div').attr('class', 'form-field lane-form-field form-field-lane-lookahead-limit');
        field.append('label').attr('class', 'field-label').attr('for', 'lane-field-lookahead-limit')
            .append('span').attr('class', 'label-text')
            .append('span').attr('class', 'label-textvalue').text(t('_lanes.lookahead.limit'));
        const input = field.append('div').attr('class', 'form-field-input-wrap form-field-input-number');
        input.append('input').attr('type', 'text').attr('id', 'lane-field-lookahead-limit').attr('inputmode', 'numeric')
            .property('value', limit)
            .on('change', function(this: HTMLInputElement) { setLimit(parseInt(this.value, 10)); });
        for (const step of [-1, 1]) {
            const which = step > 0 ? 'increment' : 'decrement';
            input.append('button').attr('class', `form-field-button ${which}`)
                .attr('title', t(`inspector.${which}`))
                .attr('disabled', limit + step < 1 || limit + step > 10 ? true : null)
                .on('click', () => setLimit(limit + step));
        }
        if (!model.oneway) {
            box.append('p').attr('class', 'lanes-note').text(t(`_lanes.lookahead.travelling_${travel}`));
        }

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
                const turnCell = li.append('span').attr('class', 'lanes-exit-turn')
                    .attr('title', t(`_lanes.turn.${exit.turn}`));
                laneArrowIcon(turnCell as any, exit.turn, 'travel', 18, model.driveSide);
                li.append('span').attr('class', 'lanes-exit-name')
                    .text((exit.exitNumber ? t('_lanes.lookahead.exit_number', { n: exit.exitNumber }) + ' ' : '') +
                        ([exit.destinationRef, exit.destination].filter(Boolean).join(' ') || t('_lanes.lookahead.unnamed')));
                if (!refs.length) continue;
                const actions = li.append('span').attr('class', 'lanes-exit-actions');
                actions.append('button').text(t('_lanes.lookahead.use_turn'))
                    .call(tooltip(t('_lanes.lookahead.use_turn_tip')))
                    .on('click', () => perform(road.id, m => refs.reduce(
                        (acc, ref) => setLaneValue(acc, ref, 'turn:lanes', toggleTurn(laneValue(acc, ref, 'turn:lanes'), exit.turn)), m), 'turn'));
                if (exit.destination || exit.destinationRef) {
                    actions.append('button').text(t('_lanes.lookahead.use_destination'))
                        .call(tooltip(t('_lanes.lookahead.use_destination_tip')))
                        .on('click', () => perform(road.id, m => {
                            let next = m;
                            if (exit.destination && !next.keys['destination:lanes']?.readonly) next = setLaneValue(next, refs, 'destination:lanes', exit.destination);
                            if (exit.destinationRef && !next.keys['destination:ref:lanes']?.readonly) next = setLaneValue(next, refs, 'destination:ref:lanes', exit.destinationRef);
                            return next;
                        }, 'value'));
                }
            }
            if (!refs.length) box.append('p').attr('class', 'lanes-note').text(t('_lanes.lookahead.select_lanes'));
        }

        /* copy to the next road */
        const second = steps[1];
        if (second && canCopyLanes(road.tags, second.way.tags)) {
            const sameOrientation = first.alongWay === second.alongWay;
            box.append('button').attr('class', 'lanes-copy-next')
                .text(t('_lanes.lookahead.copy', { road: second.way.tags.ref ?? second.way.tags.name ?? second.way.id }))
                .call(tooltip(t('_lanes.lookahead.copy_tip')))
                .on('click', () => {
                    context.perform(actionCopyLanes(road.id, second.way.id, sameOrientation), t('_lanes.annotation.copy'));
                    context.enter(modeSelect(context, [second.way.id]));
                });
        }
    }


    /** A field label laid out like iD's, over a row of speed limit roundels */
    function speedField(parent: Div, label: string, tagged: string | undefined, roundel: (row: Div) => void) {
        const field = parent.append('div').attr('class', 'form-field lane-form-field form-field-speed');
        field.append('label').attr('class', 'field-label')
            .append('span').attr('class', 'label-text')
            .append('span').attr('class', 'label-textvalue').text(label);
        roundel(field);
        // a value no roundel shows (25 mph, mixed lanes) is named, so it is not lost from sight
        if (tagged) field.append('p').attr('class', 'speed-tagged').text(t('_lanes.speed.tagged', { value: tagged }));
    }

    /** A value tagged in mph that no roundel shows (25 mph, 50 km/h), named under the roundels so it is not lost */
    const unusualSpeed = (value: string | undefined) => {
        const mph = mphOf(value);
        return value && (mph === null || !mphLimits.includes(mph) || !/mph/i.test(value)) ? value : undefined;
    };

    /**
     * The speed limit or minimum speed of the selected lanes, picked from roundels (blue for a minimum speed);
     * no roundel clears the lanes' own, so they follow the road
     */
    function renderLaneSpeed(parent: Div, wayID: WayId, refs: LaneRef[], measure: 'maxspeed' | 'minspeed', value: string | undefined,
        type?: string) {
        const mph = mphOf(value);
        const minimum = measure === 'minspeed';
        // a lane's limit type (maxspeed:type:lanes), like a road's: the national limit, a motorway, a 20 zone…
        const typed = !minimum && type && Object.hasOwn(ukSpeedTypes, type) ? type as UkSpeedType : undefined;
        const current: SpeedPick | undefined = value === undefined ? undefined : typed ? { kind: 'type', type: typed }
            : !value ? { kind: 'none' } : mph === null ? undefined : { kind: 'mph', mph };
        const unusual = value === undefined ? t('inspector.multiple_values') : typed ? undefined : unusualSpeed(value);
        speedField(parent, t(minimum ? '_lanes.speed.min_road_label' : '_lanes.speed.road_label'), unusual, row => speedRoundels(row, {
            current, minimum, types: !minimum, none: true, noneLabel: t('_lanes.speed.lanes_none'),
            onPick: pick => perform(wayID, m => {
                const next = setLaneValue(m, refs, `${measure}:lanes`,
                    pick.kind === 'mph' ? `${pick.mph} mph` : pick.kind === 'type' ? `${ukSpeedTypes[pick.type].mph} mph` : '');
                return minimum ? next : setLaneValue(next, refs, 'maxspeed:type:lanes', pick.kind === 'type' ? pick.type : '');
            }, 'value')
        }));
        // the lower national limit for some vehicles, as for the whole road
        const lower = typed ? ukSpeedTypes[typed].lower : undefined;
        if (lower) parent.append('p').attr('class', 'lanes-note speed-lower').text(t(`_lanes.speed.lower.${lower.vehicles}`, { mph: lower.mph }));
    }

    /**
     * The selected lanes' speed limit and minimum speed, laid out as the whole road's are, with what the road's own
     * limit is (which the lanes follow when they have none of their own), and a button to edit the whole road instead
     */
    function renderLaneLimits(wrap: Div, road: osmWay, model: LaneModel, refs: LaneRef[]) {
        const keys = ['maxspeed:lanes', 'minspeed:lanes'].filter(key => !model.keys[key]?.readonly);
        const box = wrap.append('div').attr('class', 'lane-inspector road-limits lane-limits');
        const head = box.append('div').attr('class', 'lane-limits-head');
        head.append('h4').text(t(refs.length === 1 ? '_lanes.speed.lane_title' : '_lanes.speed.lanes_title', { n: refs.length }));
        head.append('button').attr('class', 'lane-limits-road')
            .text(t('_lanes.speed.whole_road'))
            .call(tooltip(t('_lanes.speed.whole_road_tip')))
            .on('click', () => state.clear());
        box.append('p').attr('class', 'lanes-note')
            .text(t('_lanes.speed.road_is', { limit: speedPickLabel(roadSpeedPick(road.tags)) }));
        const shared = (key: string) => {
            const values = refs.map(ref => laneValue(model, ref, key));
            return values.every(v => v === values[0]) ? values[0] : undefined;
        };
        for (const key of keys) {
            renderLaneSpeed(box, road.id, refs, key === 'maxspeed:lanes' ? 'maxspeed' : 'minspeed', shared(key),
                key === 'maxspeed:lanes' ? shared('maxspeed:type:lanes') : undefined);
        }
    }

    /** Limits for the whole road, shown while no lane is selected */
    function renderRoadLimits(wrap: Div, road: osmWay) {
        const box = wrap.append('div').attr('class', 'lane-inspector road-limits');
        box.append('h4').text(t('_lanes.inspector.whole_road'));
        const retag = (next: Tags, annotation = 'speed') => context.perform(actionChangeTags(road.id, next), t(`_lanes.annotation.${annotation}`));

        /* the speed limit: a roundel, or a sign for the UK limit types (national, motorway, restricted road, 20 zone) */
        const pick = roadSpeedPick(road.tags);
        speedField(box, t('_lanes.speed.road_label'), pick.kind === 'mph' ? unusualSpeed(road.tags.maxspeed) : undefined, row => speedRoundels(row, {
            current: pick, types: true, none: true,
            onPick: next => retag(withRoadSpeed(road.tags, next))
        }));
        const type = speedTypeOf(road.tags);
        // the lower national limit for some vehicles, as the Highway Code sets it
        const lower = type ? ukSpeedTypes[type].lower : undefined;
        if (lower) {
            box.append('p').attr('class', 'lanes-note speed-lower')
                .text(t(`_lanes.speed.lower.${lower.vehicles}`, { mph: lower.mph }));
        }

        /* the minimum speed, as blue roundels */
        const minimum = mphOf(road.tags.minspeed);
        speedField(box, t('_lanes.speed.min_road_label'), unusualSpeed(road.tags.minspeed), row => speedRoundels(row, {
            current: !road.tags.minspeed ? { kind: 'none' } : minimum === null ? undefined : { kind: 'mph', mph: minimum },
            minimum: true, none: true, noneLabel: t('_lanes.speed.min_none'),
            onPick: next => retag(withRoadMinspeed(road.tags, next), 'minspeed')
        }));

        laneField(context, box, {
            id: 'road-maxweight',
            label: t('_lanes.field.maxweight'),
            value: road.tags.maxweight ?? '',
            suggestions: laneSuggestions(context, road, 'maxweight'),
            onChange: value => {
                const next = { ...road.tags };
                if (value) next.maxweight = value;
                else delete next.maxweight;
                retag(next, 'value');
            }
        });
    }


    /** The hard shoulder picked on the map: whether it is there, and its width */
    function renderShoulder(wrap: Div, road: osmWay, side: 'left' | 'right') {
        const graph = context.graph();
        const tags = road.tags;
        const layout = laneLayout(road, graph);
        const driveSide = laneDriveSide(road, graph);
        const oneSide = layout.model.oneway === 'forward' ? driveSide
            : layout.model.oneway === 'backward' ? (driveSide === 'left' ? 'right' : 'left') : null;
        const retag = (next: Tags) => context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.roadside'));

        const box = wrap.append('div').attr('class', 'lane-inspector shoulder-inspector');
        box.append('h4').text(`${t('_lanes.roadside.shoulder')} · ${t(`_lanes.roadside.${side}`)}`);

        const current = shoulderValue(tags, side, oneSide);
        const row = box.append('div').attr('class', 'lane-row');
        const buttons = row.append('div').attr('class', 'lane-buttons');
        for (const value of ['yes', 'no'] as const) {
            buttons.append('button')
                .attr('class', value === current ? 'active' : null)
                .attr('aria-pressed', value === current)
                .text(t(`_lanes.roadside.shoulder_${value}`))
                .on('click', () => {
                    if (value === current) return;
                    const next = withShoulder(tags, side, value, oneSide);
                    if (value === 'no') delete next[`shoulder:${side}:width`];
                    retag(next);
                });
        }

        const widthKey = `shoulder:${side}:width`;
        const strip = layout.roadside[side].find(s => s.kind === 'shoulder');
        laneField(context, box, {
            id: 'shoulder-width',
            label: t('_lanes.roadside.shoulder_width'),
            value: tags[widthKey] ?? tags['shoulder:both:width'] ?? tags['shoulder:width'] ?? '',
            suggestions: ['1', '1.5', '2', '2.5', '3', '3.3', '3.5'].map(v => ({ value: v, title: `${v} m` })),
            disabled: !strip,
            onChange: value => {
                const next = { ...tags };
                if (value) next[widthKey] = value;
                else delete next[widthKey];
                retag(next);
            }
        });
        if (strip?.assumed) box.append('p').attr('class', 'lanes-note').text(t('_lanes.roadside.shoulder_assumed'));
        box.node()?.scrollIntoView({ block: 'nearest' });
    }


    /**
     * Hard shoulders, pavements, cycleways and parking, one field each with a dropdown per side as iD's own
     * two-sided fields, with what separately mapped ways and kerbs suggest under them
     */
    function renderRoadside(box: Div, road: osmWay) {
        const graph = context.graph();
        const tags = road.tags;
        box.append('p').attr('class', 'lanes-note').text(t('_lanes.roadside.hint'));

        const extent = road.extent(graph).padByMeters(25);
        const nearby = context.history().intersects(extent);
        const sidewalks = parallelWays(road, graph, nearby, isSidewalkWay);
        const kerbs = parallelWays(road, graph, nearby, isKerbWay, 1, 15);
        const retag = (next: Tags) => context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.roadside'));

        // a plain shoulder=yes on a one-way road is on its driving side
        const layout = laneLayout(road, graph);
        const driveSide = laneDriveSide(road, graph);
        const oneSide = layout.model.oneway === 'forward' ? driveSide
            : layout.model.oneway === 'backward' ? (driveSide === 'left' ? 'right' : 'left') : null;

        type Feature = { id: string; values: string[]; read: (side: 'left' | 'right') => string | undefined;
            write: (side: 'left' | 'right', value: string | undefined) => Tags };
        const features: Feature[] = [
            { id: 'shoulder', values: ['yes', 'no'], read: side => shoulderValue(tags, side, oneSide),
                write: (side, v) => withShoulder(tags, side, v as 'yes' | 'no' | undefined, oneSide) },
            { id: 'sidewalk', values: ['yes', 'no', 'separate'], read: side => sidewalkValue(tags, side),
                write: (side, v) => withSidewalk(tags, side, v) },
            { id: 'cycleway', values: ['lane', 'track', 'shared_lane', 'separate', 'no'], read: side => cyclewayValue(tags, side),
                write: (side, v) => withCycleway(tags, side, v) },
            { id: 'parking', values: ['lane', 'street_side', 'half_on_kerb', 'on_kerb', 'separate', 'no'], read: side => parkingValue(tags, side),
                write: (side, v) => withParking(tags, side, v) }
        ];
        // the sides by the traffic beside them: forward (along the way's drawing direction) keeps to the left where
        // traffic drives on the left, so its side is the way's left (tags stay :left and :right)
        const forwardSide: 'left' | 'right' = driveSide === 'left' ? 'left' : 'right';
        const sideOf = (side: 'left' | 'right') => (side === forwardSide ? 'forward' : 'backward');
        const sides = [forwardSide, forwardSide === 'left' ? 'right' : 'left'] as const;
        for (const feature of features) {
            sidedField(context, box, `roadside-${feature.id}`, t(`_lanes.roadside.${feature.id}`), sides.map(side => {
                const current = feature.read(side);
                // a value Lane Studio doesn't offer is kept in the list, so it shows as tagged
                const values = [...feature.values, ...(current && !feature.values.includes(current) ? [current] : [])];
                return {
                    id: `roadside-${feature.id}-${side}`,
                    label: t(`_lanes.roadside.${sideOf(side)}_short`),
                    value: current ?? '',
                    strict: true,
                    emptyTitle: t('_lanes.roadside.unknown'),
                    suggestions: values.map(value => ({ value, title: t(`_lanes.roadside.values.${value}`, { default: value }) })),
                    onChange: (value: string) => retag(feature.write(side, value || undefined))
                };
            }));

            // under the pavements: a pavement mapped separately that the road's tags don't say
            if (feature.id !== 'sidewalk') continue;
            for (const side of sides) {
                const found = sidewalks[side][0];
                const current = sidewalkValue(tags, side);
                if (!found || current === 'separate') continue;
                const sideName = t(`_lanes.roadside.${sideOf(side)}`).toLowerCase();
                const note = box.append('p').attr('class', 'lanes-note lanes-suggestion');
                note.text(current === 'yes'
                    ? t('_lanes.roadside.double_mapped', { side: sideName })
                    : t('_lanes.roadside.separate_found', { side: sideName }));
                note.append('button').text(t('_lanes.roadside.use_separate'))
                    .on('click', () => retag(withSidewalk(tags, side, 'separate')))
                    .on('mouseenter', () => utilHighlightEntities([found.way.id], true, context))
                    .on('mouseleave', () => utilHighlightEntities([found.way.id], false, context));
            }
        }

        // kerb to kerb width from mapped kerbs on both sides
        const left = kerbs.left[0];
        const right = kerbs.right[0];
        if (left && right) {
            const width = Math.round((right.offset - left.offset) * 10) / 10;
            const tagged = parseFloat(tags.width ?? '');
            const note = box.append('p').attr('class', 'lanes-note lanes-suggestion')
                .text(t('_lanes.roadside.kerb_width', { width: String(width) }) + ' ');
            if (Math.abs(tagged - width) >= 0.3 || Number.isNaN(tagged)) {
                note.append('button').text(t('_lanes.roadside.set_width', { width: String(width) }))
                    .on('click', () => retag({ ...tags, width: String(width) }));
            }
        }

        // traffic islands on the road
        const islands = nearby.filter(e => e.type === 'way' && (isTrafficIsland(e.tags) || e.tags.traffic_calming === 'island') &&
            road.extent(graph).intersects(e.extent(graph)));
        if (islands.length) {
            box.append('p').attr('class', 'lanes-note').text(t('_lanes.roadside.islands', { n: islands.length }));
        }
    }


    function renderInspector(wrap: Div, model: LaneModel, wayID: WayId, refs: LaneRef[], road: osmWay) {
        const inspector = wrap.append('div').attr('class', 'lane-inspector');
        const order = laneRefsInWayOrder(model);
        const first = refs[0];

        inspector.append('h4').text(refs.length === 1
            ? t('_lanes.inspector.title', { n: order.findIndex(r => r.direction === first.direction && r.index === first.index) + 1, total: order.length }) +
              ' · ' + t(`_lanes.direction.${first.direction}`)
            : t('_lanes.inspector.title_multi', { n: refs.length }));

        // a value shared by all selected lanes, or undefined when they differ
        const shared = (key: string) => {
            const values = refs.map(ref => laneValue(model, ref, key));
            return values.every(v => v === values[0]) ? values[0] : undefined;
        };
        const readonly = (key: string) => !!model.keys[key]?.readonly;

        /* direction (two-way roads, one lane) */
        if (!model.oneway && refs.length === 1) {
            const row = inspector.append('div').attr('class', 'lane-row lane-direction');
            row.append('label').text(t('_lanes.inspector.direction'));
            const buttons = row.append('div').attr('class', 'lane-buttons');
            for (const direction of laneDirections) {
                buttons.append('button')
                    .attr('class', direction === first.direction ? 'active' : null)
                    .attr('aria-pressed', direction === first.direction)
                    .text(t(`_lanes.direction.${direction}`))
                    .on('click', () => {
                        if (direction === first.direction) return;
                        perform(wayID, m => moveLane(m, first, direction), 'move_lane');
                        const moved = parseLanes((context.entity(wayID) as osmWay).tags, { driveSide: model.driveSide });
                        state.select(wayID, [{ direction, index: moved.lanes[direction].length - 1 }]);
                    });
            }
        }

        /* turn arrows */
        const turnRow = inspector.append('div').attr('class', 'lane-row lane-turns');
        turnRow.append('label').text(t('_lanes.inspector.turn'));
        if (readonly('turn:lanes')) {
            turnRow.append('p').attr('class', 'lanes-note').text(t('_lanes.inspector.readonly', { key: 'turn:lanes' }));
        } else {
            const current = shared('turn:lanes');
            const active = current === undefined ? [] : parseTurn(current);
            const grid = turnRow.append('div').attr('class', 'lane-buttons turn-grid');
            for (const value of turnValues.filter(v => v !== 'none')) {
                const name = t(`_lanes.turn.${value}`);
                const button = grid.append('button')
                    .attr('class', `turn-${value}` + (active.includes(value) ? ' active' : ''))
                    .attr('aria-pressed', active.includes(value))
                    .attr('aria-label', name)
                    .on('click', () => perform(wayID, m => refs.reduce(
                        (acc, ref) => setLaneValue(acc, ref, 'turn:lanes', toggleTurn(laneValue(acc, ref, 'turn:lanes'), value)), m), 'turn'))
                    .call(tooltip(name));
                // the arrow as painted, pointing up the lane
                laneArrowIcon(button as any, value, 'forward', 24, model.driveSide);
            }
        }

        /* the lanes' speed limits, after their turn arrows */
        renderLaneLimits(inspector, road, model, refs);

        /* lane change */
        if (!readonly('change:lanes')) {
            const current = shared('change:lanes');
            const change = (current !== undefined ? parseChange(current) : undefined) ?? { toLeft: true, toRight: true };
            const row = inspector.append('div').attr('class', 'lane-row lane-change');
            row.append('label').text(t('_lanes.inspector.change'));
            const buttons = row.append('div').attr('class', 'lane-buttons change-buttons');
            for (const side of ['toLeft', 'toRight'] as const) {
                const allowed = change[side];
                const name = t(side === 'toLeft' ? '_lanes.inspector.change_left' : '_lanes.inspector.change_right');
                const state = t(current === undefined ? '_lanes.inspector.mixed' : allowed ? '_lanes.inspector.allowed' : '_lanes.inspector.not_allowed');
                const button = buttons.append('button')
                    .attr('class', `change-${side}` + (allowed && current !== undefined ? ' active' : '') + (current === undefined ? ' mixed' : ''))
                    .attr('aria-pressed', current === undefined ? 'mixed' : allowed)
                    .attr('aria-label', `${name}: ${state}`)
                    .on('click', () => {
                        const next = current === undefined ? true : !allowed;
                        perform(wayID, m => refs.reduce((acc, ref) => {
                            const was = parseChange(laneValue(acc, ref, 'change:lanes')) ?? { toLeft: true, toRight: true };
                            return setLaneValue(acc, ref, 'change:lanes', formatChange({ ...was, [side]: next }));
                        }, m), 'change');
                    })
                    .call(tooltip(`${name}: ${state}`));
                laneChangeIcon(button as any, side === 'toLeft', allowed);
            }
        }

        /* lane type, from a dropdown of type names */
        const kinds = refs.map(ref => laneKindOf(model, ref));
        laneField(context, inspector, {
            id: 'kind',
            label: t('_lanes.inspector.kind'),
            value: kinds.every(k => k === kinds[0]) ? kinds[0] : undefined,
            strict: true,
            suggestions: Object.keys(laneKindKeys).map(kind => ({ value: kind, title: t(`_lanes.kind.${kind}`) })),
            onChange: kind => {
                if (Object.hasOwn(laneKindKeys, kind)) perform(wayID, m => setLaneKind(m, refs, kind), 'kind');
                else section.reRender();
            }
        });

        /* per-lane values, laid out like iD's fields with suggestions */
        const fieldFor = (id: string, key: string, label: string) => laneField(context, inspector, {
            id,
            label,
            value: shared(key),
            suggestions: laneSuggestions(context, road, key),
            disabled: readonly(key),
            disabledReason: t('_lanes.inspector.readonly', { key }),
            onChange: value => perform(wayID, m => setLaneValue(m, refs, key, value), 'value')
        });
        for (const field of textFields) {
            // speed limits and minimum speeds are picked from roundels above, unless the road's lane speeds can't be
            // edited here
            if ((field.id === 'maxspeed' || field.id === 'minspeed') && !readonly(field.key)) continue;
            fieldFor(field.id, field.key, t(`_lanes.field.${field.id}`));
        }

        /* other lane keys on the road, so nothing is hidden */
        const others = Object.values(model.keys).filter(key => !handledKeys.has(key.id));
        if (others.length) {
            inspector.append('h5').text(t('_lanes.inspector.other_keys'));
            for (const key of others) fieldFor(key.id.replace(/[^\w-]/g, '_'), key.id, key.id);
        }

        /* reorder within the direction (left and right as seen by its drivers) */
        if (refs.length === 1 && model.lanes[first.direction].length > 1) {
            const row = inspector.append('div').attr('class', 'lane-row lane-order');
            row.append('label').text(t('_lanes.inspector.order'));
            const buttons = row.append('div').attr('class', 'lane-buttons');
            const count = model.lanes[first.direction].length;
            for (const [by, label] of [[-1, 'move_left'], [1, 'move_right']] as const) {
                const to = first.index + by;
                buttons.append('button')
                    .attr('disabled', to < 0 || to >= count ? true : null)
                    .text(t(`_lanes.inspector.${label}`))
                    .on('click', () => {
                        perform(wayID, m => moveLane(m, first, first.direction, to), 'move_lane');
                        state.select(wayID, [{ direction: first.direction, index: to }]);
                    });
            }
        }

        /* remove */
        if (refs.length === 1 && laneCount(model) > 1) {
            inspector.append('button')
                .attr('class', 'lane-remove button-warning')
                .text(t('_lanes.inspector.remove'))
                .on('click', () => {
                    perform(wayID, m => removeLane(m, first), 'remove_lane');
                    state.clear();
                });
        }
    }


    /** Select, Paint and Width tool buttons, and the paint palette */
    function renderTools(wrap: Div) {
        const tool = tools.tool();
        const bar = wrap.append('div').attr('class', 'lane-buttons lanes-tools');
        for (const id of ['select', 'paint', 'width', 'marking', 'sign', 'connect'] as const) {
            bar.append('button')
                .attr('class', `lanes-tool-${id}` + (tool === id ? ' active' : ''))
                .attr('aria-pressed', tool === id)
                .attr('title', t(`_lanes.tools.${id}_tip`))
                .text(t(`_lanes.tools.${id}`))
                .on('click', () => tools.setTool(id));
        }
        if (tool === 'width') {
            wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.tools.width_hint'));
        }
        if (tool === 'connect') {
            wrap.append('p').attr('class', 'lanes-note')
                .text(t(tools.connectFrom() ? '_lanes.connect.pick_to' : '_lanes.connect.pick_from'));
        }
        if (tool === 'marking') {
            laneField(context, wrap, {
                id: 'tool-marking',
                label: t('_lanes.tools.marking_type'),
                value: tools.marking(),
                strict: true,
                suggestions: markingTypes.filter(v => v !== 'none').map(type => ({ value: type, title: t(`_lanes.markings.types.${type}`) })),
                onChange: value => tools.setMarking(value as MarkingType)
            });
            wrap.append('p').attr('class', 'lanes-note')
                .text(t('_lanes.markings.placing', { type: t(`_lanes.markings.types.${tools.marking()}`) }));
        }
        if (tool === 'sign') {
            laneField(context, wrap, {
                id: 'tool-sign',
                label: t('_lanes.tools.sign_type'),
                value: tools.sign(),
                strict: true,
                suggestions: signChoices.map(choice => ({ value: choice, title: t(`_lanes.signs.names.${signNameKey(choice)}`) })),
                onChange: value => tools.setSign(value as SignChoice)
            });
            wrap.append('p').attr('class', 'lanes-note')
                .text(t('_lanes.signs.placing', { type: t(`_lanes.signs.names.${signNameKey(tools.sign())}`) }));
        }
        if (tool !== 'paint') return;

        const paint = tools.paint();
        const palette = wrap.append('div').attr('class', 'lanes-palette');
        laneField(context, palette, {
            id: 'paint-key',
            label: t('_lanes.tools.paint_key'),
            value: paint.key,
            strict: true,
            suggestions: paintKeys.map(key => ({ value: key.key, title: t(`_lanes.${key.label}`) })),
            onChange: key => {
                const value = key === 'kind' ? 'bus' : key === 'turn:lanes' ? 'left' : key === 'change:lanes' ? 'no' : '';
                tools.setPaint({ key, value });
            }
        });

        // a fixed choice of values, or any value with suggestions for the selected road
        const choices = paintChoices[paint.key];
        const road = way();
        laneField(context, palette, {
            id: 'paint-value',
            label: t('_lanes.tools.paint_value'),
            value: paint.value,
            strict: !!choices,
            suggestions: choices ? choices.map(choice => ({ value: choice.value, title: t(choice.label) }))
                : road ? laneSuggestions(context, road, paint.key) : [],
            onChange: value => tools.setPaint({ key: paint.key, value })
        });
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.tools.paint_hint'));
    }


    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
