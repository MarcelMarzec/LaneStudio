import { dispatch as d3_dispatch } from 'd3-dispatch';

import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { OsmEntity } from '../../osm';
import type { osmWay } from '../../osm/way';
import { presetManager } from '../../presets';
import { uiFields } from '../../ui/fields';
import { utilHighlightEntities } from '../../util';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import {
    assumedShoulder, cyclewayValue, isSidewalkWay, parallelWays, shoulderValue, sidewalkValue, withCycleway, withShoulder, withSidewalk
} from '../core/roadside';
import { isLaneRoad, laneRoadHighways, sidewalkExpectedHighways } from '../core/roads';
import { laneLayout } from '../geometry/layout';
import {
    canBeManaged, managedScheme, managedSchemes, variableSpeedReasons, variableSpeedReasonsOf, withManagedScheme, withVariableSpeed,
    type ManagedScheme
} from '../model/managed';
import { hasOldParkingTags, isParkingKey, parkingPositions, parkingValue, upgradeOldParking, withParkingValue, type ParkingSide } from '../model/parking';
import { centreLine, centreLines, withCentreLine, type CentreLine } from '../model/street_features';
import {
    insertLane, laneCount, laneDirections, laneKindOf, laneRefsInWayOrder, parseLanes, removeLane, setLaneKind,
    type LaneDirection, type LaneModel
} from '../model';
import type { InfoTopic } from './field_info';
import { choiceButtons, fieldNote, fieldReference, sidedRows } from './lane_fields';
import { parkingSideDetails, roadParkingScope } from './parking_fields';
import { centreLineIcon } from './section_lanes';
import { mphOf, roadSpeedPick, speedRoundels, speedTypeOf, ukSpeedTypes, withRoadMinspeed, withRoadSpeed } from './speed_roundels';

type Div = d3.Selection<HTMLDivElement>;

/*
 * Lane Studio's road inputs as fields of iD's own, in iD's Fields section among iD's fields: the number of lanes, the
 * centre line, the speed limit and minimum speed, hard shoulders, pavements, cycleways, street parking and active
 * traffic management. iD draws their label rows, bin and undo buttons and lists the ones not shown in "Add field";
 * their i button opens Lane Studio's overview with its wiki link. They replace iD's own fields for the same tags on the
 * roads Lane Studio edits, and edit one road at a time (with several selected, iD's fields are there instead).
 */

interface RoadFieldDef {
    /** the field id, `lanes/<name>` */
    id: string;
    keys: string[];
    /** all the keys of the road's tags the field edits, for its bin and undo */
    owns: (key: string) => boolean;
    info: InfoTopic;
    label: string;
    draw: (context: iD.Context, wrap: Div, road: osmWay, field: { id: string }) => void;
    /** classes of its input wrap */
    wrapClass: string;
}

const prefixed = (...bases: string[]) => (key: string) => bases.some(base => key === base || key.startsWith(`${base}:`));

/** The side of the way a one-way road's plain `shoulder=yes` is on: its driving side */
function shoulderSide(road: osmWay, graph: iD.Graph): ParkingSide | null {
    const layout = laneLayout(road, graph);
    const driveSide = laneDriveSide(road, graph);
    return layout.model.oneway === 'forward' ? driveSide
        : layout.model.oneway === 'backward' ? (driveSide === 'left' ? 'right' : 'left') : null;
}

/** The way's sides, forward first (beside traffic going the way's drawing direction), and their names */
function sidesOf(road: osmWay, graph: iD.Graph) {
    const forwardSide: ParkingSide = laneDriveSide(road, graph) === 'left' ? 'left' : 'right';
    const sides = [forwardSide, forwardSide === 'left' ? 'right' : 'left'] as ParkingSide[];
    const nameOf = (side: ParkingSide) => (side === forwardSide ? 'forward' : 'backward');
    return { sides, nameOf };
}


/* ---------- what each field draws ---------- */

/** How many lanes go each way, one row each: the count, then − and + (iD's number field) */
function drawCounts(context: iD.Context, wrap: Div, road: osmWay) {
    const model = parseLanes(road.tags, { driveSide: laneDriveSide(road, context.graph()) });
    const total = laneCount(model);
    const groups: LaneDirection[] = model.oneway ? [model.oneway] : [...laneDirections];
    const perform = (change: (m: LaneModel) => LaneModel, annotation: string) =>
        context.perform(actionChangeLanes(road.id, change), t(`_lanes.annotation.${annotation}`));
    const list = wrap.append('ul').attr('class', 'rows lanes-counts');
    for (const direction of groups) {
        const n = model.lanes[direction].length;
        const row = list.append('li').attr('class', `labeled-input lanes-count-row lanes-count-${direction}`);
        row.append('div').attr('class', 'label lanes-count-label')
            .text(model.oneway ? t('_lanes.section.counts.lanes') : t(`_lanes.section.counts.${direction}`));
        const input = row.append('div').attr('class', 'form-field-input-wrap form-field-input-number lanes-count-input');
        const setCount = (count: number) => {
            const target = Math.max(0, Math.min(12, count));
            if (!Number.isFinite(target) || target === n || total - n + target < 1) return;
            perform(m => {
                let next = m;
                while (next.lanes[direction].length < target) next = insertLane(next, direction);
                while (next.lanes[direction].length > target) next = removeLane(next, { direction, index: next.lanes[direction].length - 1 });
                return next;
            }, target > n ? 'add_lane' : 'remove_lane');
        };
        input.append('input').attr('type', 'text').attr('inputmode', 'numeric')
            .attr('id', `lane-field-count-${direction}`)
            .attr('class', 'lanes-count-value')
            .attr('aria-label', model.oneway ? t('_lanes.section.counts.lanes') : t(`_lanes.section.counts.${direction}`))
            .property('value', n)
            .on('change', function(this: HTMLInputElement) {
                setCount(parseInt(this.value, 10));
                this.value = String(n);
            });
        input.append('button').attr('type', 'button').attr('class', 'form-field-button decrement lanes-count-remove')
            .attr('title', t('_lanes.section.counts.remove'))
            .attr('disabled', n === 0 || total <= 1 ? true : null)
            .on('click', () => perform(m => removeLane(m, { direction, index: m.lanes[direction].length - 1 }), 'remove_lane'));
        input.append('button').attr('type', 'button').attr('class', 'form-field-button increment lanes-count-add')
            .attr('title', t('_lanes.section.counts.add'))
            .on('click', () => perform(m => insertLane(m, direction), 'add_lane'));
    }
    if (model.countSource === 'assumed') fieldNote(wrap, t('_lanes.section.assumed'), 'assumed');
}

/** The centre line, picked from its four paintings (wiki: Key:overtaking) */
function drawCentreLine(context: iD.Context, wrap: Div, road: osmWay) {
    const model = parseLanes(road.tags, { driveSide: laneDriveSide(road, context.graph()) });
    if (model.oneway || !model.lanes.forward.length || !model.lanes.backward.length) {
        fieldNote(wrap, t('_lanes.centre_line.oneway'));
        return;
    }
    const current = centreLine(road.tags);
    const tagged = Object.keys(road.tags).some(prefixed('overtaking'));
    choiceButtons(wrap, centreLines.map(line => ({
        value: line,
        label: t(`_lanes.centre_line.values.${line}`),
        icon: (button: d3.Selection<any>) => centreLineIcon(button, line, model.driveSide)
    })), tagged ? current : undefined, (line: CentreLine) =>
        context.perform(actionChangeTags(road.id, withCentreLine(road.tags, line)), t('_lanes.annotation.overtaking')))
        .classed('centre-line-buttons', true);
    fieldNote(wrap, t(`_lanes.centre_line.notes.${current}`));
}

/** A value tagged in mph that no roundel shows (25 mph, 50 km/h), named under the roundels so it is not lost */
function unusualSpeed(value: string | undefined) {
    const mph = mphOf(value);
    return value && (mph === null || !/^\d+ mph$/i.test(value) || ![10, 20, 30, 40, 50, 60, 70].includes(mph)) ? value : undefined;
}

/** The road's speed limit, as roundels and the UK limit types' signs */
function drawSpeed(context: iD.Context, wrap: Div, road: osmWay) {
    const pick = roadSpeedPick(road.tags);
    speedRoundels(wrap, {
        current: pick, types: true, none: true,
        onPick: next => context.perform(actionChangeTags(road.id, withRoadSpeed(road.tags, next)), t('_lanes.annotation.speed'))
    });
    const odd = pick.kind === 'mph' ? unusualSpeed(road.tags.maxspeed) : undefined;
    if (odd) wrap.append('p').attr('class', 'speed-tagged').text(t('_lanes.speed.tagged', { value: odd }));
    // the lower national limit for some vehicles, as the Highway Code sets it
    const type = speedTypeOf(road.tags);
    const lower = type ? ukSpeedTypes[type].lower : undefined;
    if (lower) fieldNote(wrap, t(`_lanes.speed.lower.${lower.vehicles}`, { mph: lower.mph }), 'speed-lower');
}

/** The road's minimum speed, as blue roundels */
function drawMinspeed(context: iD.Context, wrap: Div, road: osmWay) {
    const minimum = mphOf(road.tags.minspeed);
    speedRoundels(wrap, {
        current: !road.tags.minspeed ? { kind: 'none' } : minimum === null ? undefined : { kind: 'mph', mph: minimum },
        minimum: true, none: true, noneLabel: t('_lanes.speed.min_none'),
        onPick: next => context.perform(actionChangeTags(road.id, withRoadMinspeed(road.tags, next)), t('_lanes.annotation.minspeed'))
    });
    const odd = unusualSpeed(road.tags.minspeed);
    if (odd) wrap.append('p').attr('class', 'speed-tagged').text(t('_lanes.speed.tagged', { value: odd }));
}

type SidedFeature = 'shoulder' | 'sidewalk' | 'cycleway' | 'parking';

/** A roadside feature, one dropdown per side, named by the traffic beside it (forward, backward) */
function drawSided(feature: SidedFeature) {
    return (context: iD.Context, wrap: Div, road: osmWay) => {
        const graph = context.graph();
        const tags = road.tags;
        const oneSide = shoulderSide(road, graph);
        const { sides, nameOf } = sidesOf(road, graph);
        const retag = (next: Tags) => context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.roadside'));
        const values: Record<SidedFeature, { values: string[]; read: (side: ParkingSide) => string | undefined; write: (side: ParkingSide, value: string | undefined) => Tags }> = {
            shoulder: { values: ['yes', 'no'], read: side => shoulderValue(tags, side, oneSide),
                write: (side, v) => withShoulder(tags, side, v as 'yes' | 'no' | undefined, oneSide) },
            sidewalk: { values: ['yes', 'no', 'separate'], read: side => sidewalkValue(tags, side), write: (side, v) => withSidewalk(tags, side, v) },
            cycleway: { values: ['lane', 'track', 'shared_lane', 'separate', 'no'], read: side => cyclewayValue(tags, side),
                write: (side, v) => withCycleway(tags, side, v) },
            parking: { values: [...parkingPositions], read: side => parkingValue(tags, side),
                write: (side, v) => (feature === 'parking' && !v ? withParkingValue(tags, side, '', undefined) : withParkingValue(tags, side, '', v)) }
        };
        const { values: offered, read, write } = values[feature];
        sidedRows(context, wrap, sides.map(side => {
            const current = read(side);
            // a value Lane Studio doesn't offer is kept in the list, so it shows as tagged
            const list = [...offered, ...(current && !offered.includes(current) ? [current] : [])];
            return {
                id: `roadside-${feature}-${side}`,
                label: t(`_lanes.roadside.${nameOf(side)}_short`),
                value: current ?? '',
                strict: true,
                emptyTitle: t('_lanes.roadside.unknown'),
                suggestions: list.map(value => ({ value, title: t(`_lanes.roadside.values.${value}`, { default: value }) })),
                onChange: (value: string) => retag(write(side, value || undefined))
            };
        }));

        if (feature === 'shoulder') drawShoulderExtras(context, wrap, road, sides, nameOf, oneSide);
        if (feature === 'sidewalk') drawSidewalkExtras(context, wrap, road, sides, nameOf);
        if (feature === 'parking') {
            for (const side of sides) {
                const hasDetails = Object.keys(tags).some(key => isParkingKey(key, side) && key !== `parking:${side}` && key !== 'parking:both');
                if (!parkingValue(tags, side) && !hasDetails) continue;
                parkingSideDetails(context, wrap, roadParkingScope(context, road, side), t(`_lanes.roadside.${nameOf(side)}`));
            }
            if (hasOldParkingTags(tags)) {
                const note = fieldNote(wrap, t('_lanes.parking.old_scheme'), 'lanes-suggestion');
                note.append('button').attr('type', 'button').text(t('_lanes.parking.upgrade'))
                    .on('click', () => retag(upgradeOldParking(tags)));
            }
        }
    };
}

/** Under the hard shoulders: their widths, and the picked one (clicked on the map) highlighted */
function drawShoulderExtras(context: iD.Context, wrap: Div, road: osmWay, sides: ParkingSide[], nameOf: (side: ParkingSide) => string,
    oneSide: ParkingSide | null) {
    const graph = context.graph();
    const tags = road.tags;
    const layout = laneLayout(road, graph);
    const running = layout.lanes.some(l => l.kind === 'variable');
    const withShoulders = sides.filter(side => layout.roadside[side].some(s => s.kind === 'shoulder'));
    const state = laneState(context);
    const picked = state.shoulder()?.wayID === road.id ? state.shoulder()!.side : null;
    if (withShoulders.length) {
        const rows = sidedRows(context, wrap, withShoulders.map(side => {
            const key = `shoulder:${side}:width`;
            return {
                id: `shoulder-width-${side}`,
                label: t('_lanes.roadside.side_width', { side: t(`_lanes.roadside.${nameOf(side)}_short`) }),
                value: tags[key] ?? tags['shoulder:both:width'] ?? tags['shoulder:width'] ?? '',
                suggestions: ['1', '1.5', '2', '2.5', '3', '3.3', '3.5'].map(v => ({ value: v, title: `${v} m` })),
                onChange: (value: string) => {
                    const next = { ...tags };
                    if (value) next[key] = value;
                    else delete next[key];
                    context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.roadside'));
                }
            };
        }));
        rows.classed('lanes-shoulder-widths', true);
        if (withShoulders.some(side => layout.roadside[side].find(s => s.kind === 'shoulder')?.assumed)) fieldNote(wrap, t('_lanes.roadside.shoulder_assumed'));
    }
    if (sides.some(side => assumedShoulder(tags, side, oneSide, running))) fieldNote(wrap, t('_lanes.roadside.shoulder_motorway'));
    if (picked) {
        const node = wrap.node()?.closest('.form-field');
        node?.classList.add('lanes-picked');
        node?.scrollIntoView({ block: 'nearest' });
    }
}

/** Under the pavements: one mapped separately beside the road that its tags don't say */
function drawSidewalkExtras(context: iD.Context, wrap: Div, road: osmWay, sides: ParkingSide[], nameOf: (side: ParkingSide) => string) {
    const graph = context.graph();
    const tags = road.tags;
    const nearby = context.history().intersects(road.extent(graph).padByMeters(25));
    const sidewalks = parallelWays(road, graph, nearby, isSidewalkWay);
    for (const side of sides) {
        const found = sidewalks[side][0];
        const current = sidewalkValue(tags, side);
        if (!found || current === 'separate') continue;
        const sideName = t(`_lanes.roadside.${nameOf(side)}`).toLowerCase();
        const note = fieldNote(wrap, current === 'yes'
            ? t('_lanes.roadside.double_mapped', { side: sideName })
            : t('_lanes.roadside.separate_found', { side: sideName }), 'lanes-suggestion');
        note.append('button').attr('type', 'button').text(t('_lanes.roadside.use_separate'))
            .on('click', () => context.perform(actionChangeTags(road.id, withSidewalk(tags, side, 'separate')), t('_lanes.annotation.roadside')))
            .on('mouseenter', () => utilHighlightEntities([found.way.id], true, context))
            .on('mouseleave', () => utilHighlightEntities([found.way.id], false, context));
    }
}

/**
 * Active traffic management: the scheme, and whether the limit is variable and why. Picking dynamic hard shoulder adds
 * the running hard shoulder as a variable lane on the driving side, and picking another scheme takes it away, as one edit.
 */
function drawManaged(context: iD.Context, wrap: Div, road: osmWay) {
    const tags = road.tags;
    const model = parseLanes(tags, { driveSide: laneDriveSide(road, context.graph()) });
    const running = laneRefsInWayOrder(model).filter(ref => laneKindOf(model, ref) === 'variable');
    const current = managedScheme(tags, running.length > 0);
    const retag = (next: Tags) => context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.managed'));
    const lanesFor = (scheme: ManagedScheme) => (m: LaneModel) => {
        // from the last lane back, so the lanes still to go keep their places
        if (scheme !== 'dynamic_hard_shoulder') {
            return running.slice().sort((a, b) => b.index - a.index).reduce((next, ref) => removeLane(next, ref), m);
        }
        if (running.length || !m.oneway) return m;
        const direction = m.oneway === 'backward' ? 'backward' : 'forward';
        const index = m.driveSide === 'left' ? 0 : m.lanes[direction].length;
        return setLaneKind(insertLane(m, direction, index), [{ direction, index }], 'variable');
    };

    choiceButtons(wrap, managedSchemes.map(scheme => ({
        value: scheme,
        label: t(`_lanes.managed.schemes.${scheme}`),
        tip: t(`_lanes.managed.scheme_tips.${scheme}`),
        disabled: scheme === 'dynamic_hard_shoulder' && !model.oneway
    })), current, scheme => {
        context.perform((graph: iD.Graph) => {
            const changed = actionChangeLanes(road.id, lanesFor(scheme))(graph);
            const way = changed.entity(road.id) as osmWay;
            return actionChangeTags(road.id, withManagedScheme(way.tags, scheme))(changed);
        }, t('_lanes.annotation.managed'));
    }).classed('lanes-managed-schemes', true);
    fieldNote(wrap, t('_lanes.managed.hint'));

    // a variable limit, and why it varies
    const variable = tags['maxspeed:variable'] !== undefined && tags['maxspeed:variable'] !== 'no';
    const reasons = variableSpeedReasonsOf(tags);
    const check = wrap.append('label').attr('class', 'lane-check lanes-variable-speed').attr('title', t('_lanes.managed.variable_tip'));
    check.append('input').attr('type', 'checkbox').property('checked', variable)
        .on('change', function(this: HTMLInputElement) { retag(withVariableSpeed(tags, this.checked, reasons)); });
    check.append('span').text(t('_lanes.managed.variable'));
    if (tags.maxspeed === 'signals') fieldNote(wrap, t('_lanes.managed.signals'));
    if (!variable) return;
    fieldNote(wrap, t('_lanes.managed.reasons_label'));
    const list = wrap.append('div').attr('class', 'lane-multi-check');
    for (const reason of variableSpeedReasons) {
        const label = list.append('label').attr('class', 'lane-check');
        label.append('input').attr('type', 'checkbox').property('checked', reasons.includes(reason))
            .on('change', function(this: HTMLInputElement) {
                retag(withVariableSpeed(tags, true, this.checked ? [...reasons, reason] : reasons.filter(r => r !== reason)));
            });
        label.append('span').text(t(`_lanes.managed.reasons.${reason}`));
    }
}


/** Lane Studio's road fields, in the order they come in iD's Fields section */
export const roadFieldDefs: RoadFieldDef[] = [
    { id: 'lanes/counts', keys: ['lanes', 'lanes:forward', 'lanes:backward', 'lanes:both_ways'], owns: key => /^lanes(:(forward|backward|both_ways))?$/.test(key),
        info: 'lanes', label: '_lanes.section.counts.title', draw: drawCounts, wrapClass: 'lane-field-rows' },
    { id: 'lanes/centre_line', keys: ['overtaking', 'overtaking:forward', 'overtaking:backward'], owns: prefixed('overtaking'),
        info: 'centre_line', label: '_lanes.centre_line.title', draw: drawCentreLine, wrapClass: 'lane-field-body' },
    { id: 'lanes/maxspeed', keys: ['maxspeed', 'maxspeed:type', 'source:maxspeed'], owns: key => ['maxspeed', 'maxspeed:type', 'source:maxspeed'].includes(key),
        info: 'maxspeed', label: '_lanes.speed.road_label', draw: drawSpeed, wrapClass: 'lane-field-body form-field-speed' },
    { id: 'lanes/minspeed', keys: ['minspeed'], owns: key => key === 'minspeed',
        info: 'minspeed', label: '_lanes.speed.min_road_label', draw: drawMinspeed, wrapClass: 'lane-field-body form-field-speed' },
    { id: 'lanes/shoulder', keys: ['shoulder', 'shoulder:left', 'shoulder:right', 'shoulder:both'], owns: prefixed('shoulder'),
        info: 'shoulder', label: '_lanes.roadside.shoulder', draw: drawSided('shoulder'), wrapClass: 'lane-field-rows' },
    { id: 'lanes/sidewalk', keys: ['sidewalk', 'sidewalk:left', 'sidewalk:right', 'sidewalk:both'], owns: prefixed('sidewalk'),
        info: 'sidewalk', label: '_lanes.roadside.sidewalk', draw: drawSided('sidewalk'), wrapClass: 'lane-field-rows' },
    { id: 'lanes/cycleway', keys: ['cycleway', 'cycleway:left', 'cycleway:right', 'cycleway:both'], owns: prefixed('cycleway'),
        info: 'cycleway', label: '_lanes.roadside.cycleway', draw: drawSided('cycleway'), wrapClass: 'lane-field-rows' },
    { id: 'lanes/parking', keys: ['parking:left', 'parking:right', 'parking:both'], owns: key => isParkingKey(key) || /^parking:(lane|condition)(:|$)/.test(key),
        info: 'parking', label: '_lanes.roadside.parking', draw: drawSided('parking'), wrapClass: 'lane-field-rows' },
    { id: 'lanes/managed', keys: ['active_traffic_management', 'maxspeed:variable'], owns: key => key === 'active_traffic_management' || key.startsWith('maxspeed:variable'),
        info: 'managed', label: '_lanes.managed.title', draw: drawManaged, wrapClass: 'lane-field-body' }
];


/** An iD field type drawing one of Lane Studio's road fields for the selected road */
function roadFieldType(def: RoadFieldDef) {
    const type = function(field: { id: string }, context: iD.Context) {
        const dispatch = d3_dispatch('change');
        let _selection: Div | null = null;
        let _entityIDs: string[] = [];

        const draw = () => {
            if (!_selection) return;
            let wrap = _selection.selectAll<HTMLDivElement, unknown>('.lane-road-field-wrap').data([0]);
            wrap = wrap.enter().append('div').attr('class', `form-field-input-wrap lane-road-field-wrap ${def.wrapClass}`).merge(wrap as any) as any;
            wrap.selectAll('*').remove();
            const entity = _entityIDs.length === 1 ? context.hasEntity(_entityIDs[0] as OsmEntity['id']) : undefined;
            if (isLaneRoad(entity)) def.draw(context, wrap as Div, entity, field);
        };

        // (iD calls tags() straight after drawing the field, so that draws it)
        const impl: any = (selection: Div) => {
            _selection = selection;
        };
        impl.tags = () => {
            draw();
            return impl;
        };
        impl.entityIDs = (ids: string[]) => {
            _entityIDs = ids;
            return impl;
        };
        impl.focus = () => {
            _selection?.select<HTMLElement>('input, button.lane-choice, .speed-roundel').node()?.focus();
        };
        impl.on = (name: string, listener: any) => {
            dispatch.on(name as 'change', listener);
            return impl;
        };
        // the hard shoulder picked on the map is shown in its field
        if (def.id === 'lanes/shoulder') laneState(context).on('change.road-field-shoulder', draw);
        return impl;
    };
    // one road at a time: with several selected, iD's own fields are there instead
    (type as any).supportsMultiselection = false;
    return type;
}


/** Which fields a road shows from the start, and which wait in "Add field" until tagged or picked */
function placeFor(id: string, highway: string): 'fields' | 'more' | null {
    const motorway = highway === 'motorway';
    switch (id) {
        case 'lanes/counts':
        case 'lanes/maxspeed': return 'fields';
        case 'lanes/centre_line': return ['motorway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'].includes(highway) ? 'more' : 'fields';
        case 'lanes/minspeed': return motorway ? 'fields' : 'more';
        case 'lanes/shoulder': return motorway || highway === 'trunk' ? 'fields' : 'more';
        case 'lanes/sidewalk': return sidewalkExpectedHighways.has(highway) ? 'fields' : 'more';
        case 'lanes/cycleway': return 'more';
        case 'lanes/parking': return ['residential', 'living_street'].includes(highway) ? 'fields' : 'more';
        case 'lanes/managed': return motorway ? 'fields' : canBeManaged({ highway }) ? 'more' : null;
    }
    return null;
}

/** iD's fields Lane Studio's replace on the roads it edits */
const replacedFields = ['lanes', 'maxspeed', 'minspeed', 'sidewalk', 'cycleway', 'parking/side/parking', 'parking/side/orientation'];

/**
 * Registers Lane Studio's road fields with iD (as field types and fields) and puts them in the presets of the roads
 * Lane Studio edits, among iD's own fields in place of iD's for the same tags: the number of lanes and the centre line
 * where iD has Lanes, the speed limits where iD has its speed limit, and the roadside after iD's fields.
 */
export function laneStudioRoadFields() {
    for (const def of roadFieldDefs) (uiFields as any)[`lanes_${def.id.slice('lanes/'.length)}`] = roadFieldType(def);
    presetManager.ensureLoaded().then(() => {
        presetManager.merge({
            fields: Object.fromEntries(roadFieldDefs.map(def => [def.id, {
                type: `lanes_${def.id.slice('lanes/'.length)}`, keys: def.keys, geometry: ['line'], label: def.id
            }])) as any
        });
        for (const def of roadFieldDefs) {
            const field = presetManager.field(def.id) as any;
            if (!field) continue;
            field.label = () => t.append(def.label);
            field.title = () => t(def.label);
            field.terms = () => [...def.keys, t(def.label).toLowerCase()];
            field.allKeys = (tags: Tags) => [...new Set([...def.keys, ...Object.keys(tags ?? {}).filter(def.owns)])];
            field.referenceComponent = () => fieldReference(def.info, def.id.replace('/', '-'));
        }
        for (const preset of presetManager.collection as any[]) {
            const highway = preset.tags?.highway;
            if (!laneRoadHighways.has(highway) || preset.suggestion || !preset.geometry?.includes('line')) continue;
            arrangeFields(preset.originalFields, preset.originalMoreFields, highway);
        }
    }).catch(() => { /* without presets there are no fields to add to */ });
}

/** A road preset's fields with Lane Studio's in place of iD's for the same tags (both lists are changed in place) */
export function arrangeFields(fields: string[], more: string[], highway: string) {
    const place = (id: string) => placeFor(id, highway);
    // the number of lanes, the centre line and the speed limits together, where iD has the first of Lanes or its
    // speed limit, else after oneway (or the name)
    const road = ['lanes/counts', 'lanes/centre_line', 'lanes/maxspeed', 'lanes/minspeed'].filter(id => place(id) === 'fields');
    const first = fields.findIndex(id => id === 'lanes' || id === 'maxspeed');
    const result = fields.filter(id => !replacedFields.includes(id));
    let at = first >= 0 ? fields.slice(0, first).filter(id => !replacedFields.includes(id)).length : -1;
    if (at < 0) {
        const anchors = ['name', 'ref_road_number', 'service', 'oneway', 'oneway_yes'].map(id => result.indexOf(id));
        const best = Math.max(...anchors);
        at = best >= 0 ? best + 1 : 0;
    }
    result.splice(at, 0, ...road);
    // the roadside after iD's fields
    for (const id of ['lanes/shoulder', 'lanes/sidewalk', 'lanes/parking', 'lanes/managed']) {
        if (place(id) === 'fields' && !result.includes(id)) result.push(id);
    }
    const others = more.filter(id => !replacedFields.includes(id));
    for (const def of roadFieldDefs) {
        if (place(def.id) === 'more' && !result.includes(def.id) && !others.includes(def.id)) others.push(def.id);
    }
    fields.splice(0, fields.length, ...result);
    more.splice(0, more.length, ...others);
}
