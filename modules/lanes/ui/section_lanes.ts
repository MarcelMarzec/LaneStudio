import { t } from '../../core/localizer';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { actionChangeTags } from '../../actions/change_tags';
import { uiSection } from '../../ui/section';
import { markingTypes, type MarkingType } from '../model/markings';
import { signChoices, signNameKey, type SignChoice } from '../model/signs';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import { laneTools } from '../core/lane_tools';
import { builtHighway } from '../core/roads';
import {
    choiceButtons, fieldNote, fieldShell, laneArrowIcon, laneChangeIcon, laneField, laneSuggestions, moreFields,
    type FieldChrome, type MoreField
} from './lane_fields';
import type { InfoTopic } from './field_info';
import { uiTooltip } from '../../ui/tooltip';
import { isTrafficIsland, overtakingBanned, withOvertaking, type CentreLine } from '../model/street_features';
import { isKerbWay, parallelWays } from '../core/roadside';
import { svgIcon } from '../../svg/icon';
import { openRoadsideMenu } from './roadside_menu';
import { isShownOnDemand, onShownChange, selectedLaneRoad, showOnDemand } from './road_sections';
import { mphLimits, mphOf, roadSpeedPick, speedPickLabel, speedChoice, ukSpeedTypes, type SpeedPick, type UkSpeedType } from './speed_roundels';
import {
    parseLanes, laneRefsInWayOrder, laneCount, removeLane, moveLane, setLaneValue, laneValue,
    turnValues, parseTurn, toggleTurn, parseChange, formatChange, laneDirections, rareTurnValues,
    conditionalSlot, laneConditions, parseLaneConditional, withLaneConditions,
    laneKindKeys, laneKindOf, setLaneKind,
    type LaneModel, type LaneRef
} from '../model';

type Div = d3.Selection<HTMLDivElement>;

/** iD's hover tooltip with a line of text (uiTooltip is plain JavaScript, so its setters are not typed) */
export const tooltip = (text: string) => (uiTooltip() as any).title(() => text).placement('top');

/** Per-lane values edited as text in the inspector, and whether each shows before it is tagged or picked */
const textFields: { id: string; key: string; info: InfoTopic; shown: (road: osmWay) => boolean }[] = [
    { id: 'destination', key: 'destination:lanes', info: 'destination', shown: road => ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link'].includes(builtHighway(road.tags) ?? '') },
    { id: 'destination_ref', key: 'destination:ref:lanes', info: 'destination_ref', shown: () => false },
    { id: 'access', key: 'access:lanes', info: 'access', shown: () => true },
    { id: 'width', key: 'width:lanes', info: 'width', shown: () => true },
    { id: 'maxwidth', key: 'maxwidth:lanes', info: 'maxwidth', shown: () => false },
    { id: 'maxheight', key: 'maxheight:lanes', info: 'maxheight', shown: () => false },
    { id: 'maxweight', key: 'maxweight:lanes', info: 'maxweight', shown: () => false },
    { id: 'surface', key: 'surface:lanes', info: 'surface', shown: () => false },
    { id: 'destination_street', key: 'destination:street:lanes', info: 'destination_street', shown: () => false },
    { id: 'destination_int_ref', key: 'destination:int_ref:lanes', info: 'destination_int_ref', shown: () => false },
    { id: 'destination_arrow', key: 'destination:arrow:lanes', info: 'destination_arrow', shown: () => false },
    { id: 'destination_country', key: 'destination:country:lanes', info: 'destination_country', shown: () => false },
    { id: 'destination_symbol', key: 'destination:symbol:lanes', info: 'destination_symbol', shown: () => false },
    { id: 'width_start', key: 'width:lanes:start', info: 'width_start_end', shown: () => false },
    { id: 'width_end', key: 'width:lanes:end', info: 'width_start_end', shown: () => false },
    { id: 'toll', key: 'toll:lanes', info: 'toll', shown: road => road.tags.toll === 'yes' },
    { id: 'payment_cash', key: 'payment:cash:lanes', info: 'payment', shown: () => false },
    { id: 'payment_cards', key: 'payment:cards:lanes', info: 'payment', shown: () => false }
];

/** `:conditional` lane values, set lane by lane in conditional syntax (`no @ (Mo-Fr 07:00-10:00)`) */
const conditionalFields: { id: string; base: string; info: InfoTopic }[] = [
    { id: 'access_conditional', base: 'access', info: 'conditional' },
    { id: 'maxspeed_conditional', base: 'maxspeed', info: 'conditional' }
];

const handledKeys = new Set([
    'turn:lanes', 'change:lanes', 'maxspeed:lanes', 'minspeed:lanes', 'maxspeed:type:lanes', ...textFields.map(f => f.key),
    ...conditionalFields.map(f => `${f.base}:lanes:conditional`),
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

/** What is beside a lane on one side, for its drivers: another lane its way, the centre line, or the kerb */
type Beside = 'lane' | 'centre' | 'kerb';

/** A value tagged in mph that no roundel shows (25 mph, 50 km/h), named under the roundels so it is not lost */
export function unusualSpeed(value: string | undefined) {
    const mph = mphOf(value);
    return value && (mph === null || !mphLimits.includes(mph) || !/mph/i.test(value)) ? value : undefined;
}

/**
 * A field of speed limit roundels, laid out like iD's fields: the label row with its buttons, the roundels, and a
 * value no roundel shows (25 mph, mixed lanes) named under them so it is not lost from sight
 */
export function speedField(parent: Div, id: string, label: string, chrome: FieldChrome, tagged: string | undefined, roundels: (row: Div) => void) {
    const { field, wrap } = fieldShell(parent, { ...chrome, id, label, wrapClass: 'lane-field-body form-field-speed' });
    field.classed('form-field-speed', true);
    roundels(wrap as Div);
    if (tagged) wrap.append('p').attr('class', 'speed-tagged').text(t('_lanes.speed.tagged', { value: tagged }));
    return field;
}


/**
 * The "Lanes" section in iD's entity editor, shown for one selected road, above iD's Fields (where Lane Studio's road
 * fields are, among iD's): the tools, the lanes along the road with the + menu for the roadside, and the selected
 * lanes' own fields
 */
export function uiSectionLanes(context: iD.Context) {
    const state = laneState(context);
    const tools = laneTools(context);
    let _entityIDs: string[] = [];

    const way = (): osmWay | undefined => selectedLaneRoad(context, _entityIDs);

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
    onShownChange('lanes', () => {
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

        // drop selected lanes that no longer exist
        const selected = (state.selected()?.wayID === wayID ? state.selected()!.refs : [])
            .filter(ref => model.lanes[ref.direction][ref.index]);

        const wrap = selection.append('div').attr('class', 'lanes-editor');
        renderTools(wrap);
        renderStrip(wrap, model, wayID, selected);
        renderRoadside(wrap, road);

        /* issues with the lane tags */
        if (model.issues.length) {
            const issues = wrap.append('ul').attr('class', 'lanes-issues');
            for (const issue of model.issues) {
                issues.append('li').text(t(`_lanes.issue.${issue.code}`, {
                    key: issue.key ?? '', expected: issue.expected ?? '', actual: issue.actual ?? ''
                }));
            }
        }

        if (selected.length) renderInspector(wrap, model, wayID, selected, road);
    }


    /** The lanes along the road, left to right as the way is drawn: click one to edit it */
    function renderStrip(wrap: Div, model: LaneModel, wayID: WayId, selected: LaneRef[]) {
        const { wrap: body } = fieldShell(wrap, { id: 'strip', label: t('_lanes.section.strip_title'), info: 'lane_strip', wrapClass: 'lane-field-body' });
        const strip = body.append('div').attr('class', 'lanes-strip');
        laneRefsInWayOrder(model).forEach((ref, i) => {
            const turns = parseTurn(laneValue(model, ref, 'turn:lanes'));
            const isSelected = selected.some(r => r.direction === ref.direction && r.index === ref.index);
            strip.append('button')
                .attr('type', 'button')
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
        fieldNote(body, t('_lanes.section.strip_hint'));
    }


    /**
     * Under the lanes: the + menu for the roadside (a lane, hard shoulder, pavement, cycleway, parking or no-waiting
     * lines, as the + at each kerb on the map), the kerb-to-kerb width of mapped kerbs, and the islands on the road
     */
    function renderRoadside(wrap: Div, road: osmWay) {
        const graph = context.graph();
        const add = wrap.append('button').attr('type', 'button').attr('class', 'lanes-roadside-add-button')
            .on('click', function(this: HTMLButtonElement) {
                const rect = this.getBoundingClientRect();
                openRoadsideMenu(context, { wayID: road.id, at: [rect.left, rect.bottom + 24] });
            });
        add.call(svgIcon('#iD-icon-plus', 'inline') as any);
        add.append('span').text(t('_lanes.add_menu.open'));

        const nearby = context.history().intersects(road.extent(graph).padByMeters(25));
        const kerbs = parallelWays(road, graph, nearby, isKerbWay, 1, 15);
        const left = kerbs.left[0];
        const right = kerbs.right[0];
        if (left && right) {
            const width = Math.round((right.offset - left.offset) * 10) / 10;
            const tagged = parseFloat(road.tags.width ?? '');
            const note = fieldNote(wrap, t('_lanes.roadside.kerb_width', { width: String(width) }) + ' ', 'lanes-suggestion');
            if (Math.abs(tagged - width) >= 0.3 || Number.isNaN(tagged)) {
                note.append('button').attr('type', 'button').text(t('_lanes.roadside.set_width', { width: String(width) }))
                    .on('click', () => context.perform(actionChangeTags(road.id, { ...road.tags, width: String(width) }), t('_lanes.annotation.roadside')));
            }
        }
        const islands = nearby.filter(e => e.type === 'way' && (isTrafficIsland(e.tags) || e.tags.traffic_calming === 'island') &&
            road.extent(graph).intersects(e.extent(graph)));
        if (islands.length) fieldNote(wrap, t('_lanes.roadside.islands', { n: islands.length }));
    }


    /** The selected lanes' speed limit or minimum speed, from roundels; none clears the lanes' own, so they follow the road */
    function renderLaneSpeed(parent: Div, road: osmWay, model: LaneModel, refs: LaneRef[], measure: 'maxspeed' | 'minspeed') {
        const shared = (key: string) => {
            const values = refs.map(ref => laneValue(model, ref, key));
            return values.every(v => v === values[0]) ? values[0] : undefined;
        };
        const minimum = measure === 'minspeed';
        const value = shared(`${measure}:lanes`);
        const type = minimum ? undefined : shared('maxspeed:type:lanes');
        const mph = mphOf(value);
        // a lane's limit type (maxspeed:type:lanes), like a road's: the national limit, a motorway, a 20 zone…
        const typed = type && Object.hasOwn(ukSpeedTypes, type) ? type as UkSpeedType : undefined;
        const current: SpeedPick | undefined = value === undefined ? undefined : typed ? { kind: 'type', type: typed }
            : !value ? { kind: 'none' } : mph === null ? undefined : { kind: 'mph', mph };
        const unusual = value === undefined ? t('inspector.multiple_values') : typed ? undefined : unusualSpeed(value);
        const write = (speed: string, speedType: string) => perform(road.id, m => {
            const next = setLaneValue(m, refs, `${measure}:lanes`, speed);
            return minimum ? next : setLaneValue(next, refs, 'maxspeed:type:lanes', speedType);
        }, 'value');
        speedField(parent, `lane-${measure}`, t(minimum ? '_lanes.speed.lane_min_label' : '_lanes.speed.lane_label'), {
            info: minimum ? 'lane_minspeed' : 'lane_speed',
            present: value === undefined || !!value,
            onRemove: () => write('', '')
        }, unusual, row => speedChoice(context, row, `lane-${measure}`, {
            current, minimum, types: !minimum, none: true, noneLabel: t('_lanes.speed.lanes_none'),
            onPick: pick => write(pick.kind === 'mph' ? `${pick.mph} mph` : pick.kind === 'type' ? `${ukSpeedTypes[pick.type].mph} mph` : '',
                pick.kind === 'type' ? pick.type : '')
        }));
        // the lower national limit for some vehicles, as for the whole road
        const lower = typed ? ukSpeedTypes[typed].lower : undefined;
        if (lower) fieldNote(parent, t(`_lanes.speed.lower.${lower.vehicles}`, { mph: lower.mph }), 'speed-lower');
    }


    function renderInspector(wrap: Div, model: LaneModel, wayID: WayId, refs: LaneRef[], road: osmWay) {
        const inspector = wrap.append('div').attr('class', 'lane-inspector');
        const order = laneRefsInWayOrder(model);
        const first = refs[0];
        const more: MoreField[] = [];

        const head = inspector.append('div').attr('class', 'lane-inspector-head');
        head.append('h4').text(refs.length === 1
            ? t('_lanes.inspector.title', { n: order.findIndex(r => r.direction === first.direction && r.index === first.index) + 1, total: order.length }) +
              ' · ' + t(`_lanes.direction.${first.direction}`)
            : t('_lanes.inspector.title_multi', { n: refs.length }));
        head.append('button').attr('type', 'button').attr('class', 'lane-limits-road lane-inspector-road')
            .text(t('_lanes.speed.whole_road'))
            .call(tooltip(t('_lanes.inspector.whole_road_tip')))
            .on('click', () => state.clear());

        // a value shared by all selected lanes, or undefined when they differ
        const shared = (key: string) => {
            const values = refs.map(ref => laneValue(model, ref, key));
            return values.every(v => v === values[0]) ? values[0] : undefined;
        };
        const readonly = (key: string) => !!model.keys[key]?.readonly;
        const tagged = (key: string) => refs.some(ref => !!laneValue(model, ref, key));
        const lanesChrome = (key: string, info: InfoTopic, annotation = 'value'): FieldChrome => ({
            info,
            present: tagged(key),
            onRemove: readonly(key) ? undefined : () => perform(wayID, m => setLaneValue(m, refs, key, ''), annotation)
        });

        /* direction (two-way roads, one lane) */
        if (!model.oneway && refs.length === 1) {
            const { wrap: body } = fieldShell(inspector, { id: 'direction', label: t('_lanes.inspector.direction'), info: 'direction', wrapClass: 'lane-field-body' });
            choiceButtons(body, laneDirections.map(direction => ({ value: direction, label: t(`_lanes.direction.${direction}`) })),
                first.direction, direction => {
                    perform(wayID, m => moveLane(m, first, direction), 'move_lane');
                    const moved = parseLanes((context.entity(wayID) as osmWay).tags, { driveSide: model.driveSide });
                    state.select(wayID, [{ direction, index: moved.lanes[direction].length - 1 }]);
                }).classed('lane-direction', true);
        }

        /* turn arrows */
        {
            const { wrap: body } = fieldShell(inspector, { ...lanesChrome('turn:lanes', 'turn', 'turn'), id: 'turn', label: t('_lanes.inspector.turn'), wrapClass: 'lane-field-body lane-turns' });
            if (readonly('turn:lanes')) {
                fieldNote(body, t('_lanes.inspector.readonly', { key: 'turn:lanes' }));
            } else {
                const current = shared('turn:lanes');
                const active = current === undefined ? [] : parseTurn(current);
                const grid = body.append('div').attr('class', 'lane-buttons turn-grid');
                // the rarely painted arrows once asked for, or on a lane with one
                const rare = isShownOnDemand(wayID, 'lane-rare-turns') || active.some(value => rareTurnValues.includes(value));
                if (!rare) more.push({ id: 'lane-rare-turns', title: t('_lanes.field.more_turns'), show: () => showOnDemand(wayID, 'lane-rare-turns') });
                for (const value of turnValues.filter(v => v !== 'none' && (rare || !rareTurnValues.includes(v)))) {
                    const name = t(`_lanes.turn.${value}`);
                    const button = grid.append('button')
                        .attr('type', 'button')
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
        }

        /* lane change and overtaking, by what is beside each lane */
        renderChange(inspector, model, road, refs);

        /* the lanes' speed limits */
        if (!readonly('maxspeed:lanes')) {
            renderLaneSpeed(inspector, road, model, refs, 'maxspeed');
            fieldNote(inspector, t('_lanes.speed.road_is', { limit: speedPickLabel(roadSpeedPick(road.tags)) }));
        }
        if (!readonly('minspeed:lanes')) {
            if (tagged('minspeed:lanes') || road.tags.minspeed || isShownOnDemand(wayID, 'lane-minspeed')) {
                renderLaneSpeed(inspector, road, model, refs, 'minspeed');
            } else {
                more.push({ id: 'lane-minspeed', title: t('_lanes.speed.lane_min_label'), show: () => showOnDemand(wayID, 'lane-minspeed') });
            }
        }

        /* lane type, from a dropdown of type names */
        const kinds = refs.map(ref => laneKindOf(model, ref));
        laneField(context, inspector, {
            id: 'kind',
            label: t('_lanes.inspector.kind'),
            info: 'kind',
            value: kinds.every(k => k === kinds[0]) ? kinds[0] : undefined,
            present: kinds.some(k => k !== 'general'),
            onRemove: () => perform(wayID, m => setLaneKind(m, refs, 'general'), 'kind'),
            strict: true,
            suggestions: Object.keys(laneKindKeys).map(kind => ({ value: kind, title: t(`_lanes.kind.${kind}`) })),
            onChange: kind => {
                if (Object.hasOwn(laneKindKeys, kind)) perform(wayID, m => setLaneKind(m, refs, kind), 'kind');
                else section.reRender();
            }
        });

        /* per-lane values, laid out like iD's fields with suggestions */
        const fieldFor = (id: string, key: string, label: string, info: InfoTopic) => laneField(context, inspector, {
            ...lanesChrome(key, info),
            id,
            label,
            value: shared(key),
            suggestions: laneSuggestions(context, road, key),
            disabled: readonly(key),
            disabledReason: t('_lanes.inspector.readonly', { key }),
            onChange: value => perform(wayID, m => setLaneValue(m, refs, key, value), 'value')
        });
        for (const field of textFields) {
            if (field.shown(road) || tagged(field.key) || readonly(field.key) || isShownOnDemand(wayID, `lane-${field.id}`)) {
                fieldFor(field.id, field.key, t(`_lanes.field.${field.id}`), field.info);
            } else {
                more.push({ id: `lane-${field.id}`, title: t(`_lanes.field.${field.id}`), show: () => showOnDemand(wayID, `lane-${field.id}`) });
            }
        }
        // conditional values: the selected lanes' own conditions, in conditional syntax
        for (const field of conditionalFields) {
            const slots = refs.map(ref => conditionalSlot(model, road.tags, field.base, ref));
            const rules = slots.map(({ key }) => (road.tags[key] ? parseLaneConditional(road.tags[key]) : []));
            const texts = slots.map(({ slot }, i) => (rules[i] ? laneConditions(rules[i]!, slot) : undefined));
            const present = texts.some(Boolean) || rules.some(r => r === null);
            if (!present && !isShownOnDemand(wayID, `lane-${field.id}`)) {
                more.push({ id: `lane-${field.id}`, title: t(`_lanes.field.${field.id}`), show: () => showOnDemand(wayID, `lane-${field.id}`) });
                continue;
            }
            const unreadable = rules.some(r => r === null || r.some(rule => rule.values.length !== slots[0].count));
            const apply = (text: string) => {
                const next = withLaneConditions(model, road.tags, field.base, refs, text);
                if (next) context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.value'));
            };
            laneField(context, inspector, {
                info: field.info,
                present,
                onRemove: unreadable ? undefined : () => apply(''),
                id: field.id,
                label: t(`_lanes.field.${field.id}`),
                value: texts.every(v => v === texts[0]) ? texts[0] ?? '' : undefined,
                placeholder: t('_lanes.field.conditional_placeholder'),
                suggestions: [],
                disabled: unreadable,
                disabledReason: t('_lanes.inspector.readonly', { key: slots[0].key }),
                onChange: apply
            });
        }
        // speed limits the lanes can't have edited here are still shown, as text
        for (const key of ['maxspeed:lanes', 'minspeed:lanes']) {
            if (readonly(key)) fieldFor(key.replace(/\W/g, '_'), key, key, key.startsWith('min') ? 'lane_minspeed' : 'lane_speed');
        }

        /* other lane keys on the road, so nothing is hidden */
        const others = Object.values(model.keys).filter(key => !handledKeys.has(key.id));
        if (others.length) {
            inspector.append('h5').text(t('_lanes.inspector.other_keys'));
            for (const key of others) fieldFor(key.id.replace(/[^\w-]/g, '_'), key.id, key.id, 'other_keys');
        }

        /* reorder within the direction (left and right as seen by its drivers) */
        if (refs.length === 1 && model.lanes[first.direction].length > 1) {
            const { wrap: body } = fieldShell(inspector, { id: 'order', label: t('_lanes.inspector.order'), info: 'position', wrapClass: 'lane-field-body' });
            const buttons = body.append('div').attr('class', 'lane-buttons lane-order');
            const count = model.lanes[first.direction].length;
            for (const [by, label] of [[-1, 'move_left'], [1, 'move_right']] as const) {
                const to = first.index + by;
                buttons.append('button')
                    .attr('type', 'button')
                    .attr('disabled', to < 0 || to >= count ? true : null)
                    .text(t(`_lanes.inspector.${label}`))
                    .on('click', () => {
                        perform(wayID, m => moveLane(m, first, first.direction, to), 'move_lane');
                        state.select(wayID, [{ direction: first.direction, index: to }]);
                    });
            }
        }

        moreFields(context, inspector, 'lane', more);

        /* remove */
        if (refs.length === 1 && laneCount(model) > 1) {
            inspector.append('button')
                .attr('type', 'button')
                .attr('class', 'lane-remove button-warning')
                .text(t('_lanes.inspector.remove'))
                .on('click', () => {
                    perform(wayID, m => removeLane(m, first), 'remove_lane');
                    state.clear();
                });
        }
    }


    /**
     * Lane change, aware of what is beside each selected lane on each side: into another lane going the same way it
     * is the lane's `change:lanes`; across the centre line it is overtaking, which is the road's `overtaking:forward`
     * or `overtaking:backward` (the double white line on the map); beside the kerb there is nothing to change into
     */
    function renderChange(parent: Div, model: LaneModel, road: osmWay, refs: LaneRef[]) {
        if (model.keys['change:lanes']?.readonly) return;
        const order = laneRefsInWayOrder(model);
        const besideOf = (ref: LaneRef, toLeft: boolean): Beside => {
            const at = order.findIndex(r => r.direction === ref.direction && r.index === ref.index);
            // backward lanes are driven against the way: their drivers' left is the way's right
            const step = (ref.direction === 'backward') === toLeft ? 1 : -1;
            const other = order[at + step];
            if (!other) return 'kerb';
            if (ref.direction === 'both_ways' || other.direction === ref.direction) return 'lane';
            return 'centre';
        };
        const allowedOf = (ref: LaneRef, toLeft: boolean, beside: Beside): boolean => {
            if (beside === 'centre') return !overtakingBanned(road.tags, ref.direction);
            const change = parseChange(laneValue(model, ref, 'change:lanes')) ?? { toLeft: true, toRight: true };
            return toLeft ? change.toLeft : change.toRight;
        };

        const changeTagged = refs.some(ref => !!laneValue(model, ref, 'change:lanes'));
        const { wrap: body } = fieldShell(parent, {
            id: 'change', label: t('_lanes.inspector.change'), info: 'change', wrapClass: 'lane-field-body',
            present: changeTagged,
            onRemove: () => perform(road.id, m => setLaneValue(m, refs, 'change:lanes', ''), 'change')
        });
        const buttons = body.append('div').attr('class', 'lane-buttons change-buttons');
        for (const toLeft of [true, false]) {
            const side = toLeft ? 'toLeft' : 'toRight';
            const besides = refs.map(ref => besideOf(ref, toLeft));
            const acting = refs.filter((_, i) => besides[i] !== 'kerb');
            const kinds = new Set(besides.filter(b => b !== 'kerb'));
            const allowed = acting.map(ref => allowedOf(ref, toLeft, besideOf(ref, toLeft)));
            const mixed = allowed.some(a => a !== allowed[0]);
            const isAllowed = !!allowed[0];
            const kind: Beside = !acting.length ? 'kerb' : kinds.size === 1 ? [...kinds][0] : 'lane';
            const name = t(`_lanes.inspector.beside.${kind}_${toLeft ? 'left' : 'right'}`);
            const status = kind === 'kerb' ? t('_lanes.inspector.beside.nothing')
                : t(mixed ? '_lanes.inspector.mixed' : isAllowed ? '_lanes.inspector.allowed' : '_lanes.inspector.not_allowed');
            const button = buttons.append('button')
                .attr('type', 'button')
                .attr('class', `change-${side} change-beside-${kind}` + (isAllowed && !mixed && kind !== 'kerb' ? ' active' : '') + (mixed ? ' mixed' : ''))
                .attr('aria-pressed', kind === 'kerb' ? null : mixed ? 'mixed' : isAllowed)
                .attr('aria-label', `${name}: ${status}`)
                .attr('disabled', kind === 'kerb' ? true : null)
                .on('click', () => {
                    const next = mixed ? true : !isAllowed;
                    const laneRefs = acting.filter(ref => besideOf(ref, toLeft) === 'lane');
                    const directions = new Set(acting.filter(ref => besideOf(ref, toLeft) === 'centre')
                        .map(ref => ref.direction as 'forward' | 'backward'));
                    const annotation = directions.size && !laneRefs.length ? 'overtaking' : 'change';
                    context.perform((graph: iD.Graph) => {
                        let g = graph;
                        if (laneRefs.length) {
                            g = actionChangeLanes(road.id, m => laneRefs.reduce((acc, ref) => {
                                const was = parseChange(laneValue(acc, ref, 'change:lanes')) ?? { toLeft: true, toRight: true };
                                return setLaneValue(acc, ref, 'change:lanes', formatChange({ ...was, [side]: next }));
                            }, m))(g);
                        }
                        if (directions.size) {
                            let tags = (g.entity(road.id) as osmWay).tags;
                            for (const direction of directions) tags = withOvertaking(tags, direction, !next);
                            g = actionChangeTags(road.id, tags)(g);
                        }
                        return g;
                    }, t(`_lanes.annotation.${annotation}`));
                })
                .call(tooltip(`${name}: ${status}`));
            laneChangeIcon(button as any, toLeft, kind === 'kerb' ? false : isAllowed || mixed, 24, kind);
        }
        fieldNote(body, t('_lanes.inspector.change_hint'));
    }


    /** Select, Paint, Width, Markings, Signs and Connect, and what the tool picked needs */
    function renderTools(wrap: Div) {
        const tool = tools.tool();
        const { wrap: body } = fieldShell(wrap, { id: 'tools', label: t('_lanes.tools.title'), info: 'tools', wrapClass: 'lane-field-body' });
        const bar = body.append('div').attr('class', 'lane-buttons lanes-tools');
        for (const id of ['select', 'paint', 'width', 'marking', 'sign', 'connect'] as const) {
            bar.append('button')
                .attr('type', 'button')
                .attr('class', `lanes-tool-${id}` + (tool === id ? ' active' : ''))
                .attr('aria-pressed', tool === id)
                .attr('title', t(`_lanes.tools.${id}_tip`))
                .text(t(`_lanes.tools.${id}`))
                .on('click', () => tools.setTool(id));
        }
        if (tool === 'width') fieldNote(body, t('_lanes.tools.width_hint'));
        if (tool === 'connect') fieldNote(body, t(tools.connectFrom() ? '_lanes.connect.pick_to' : '_lanes.connect.pick_from'));
        if (tool === 'marking') {
            laneField(context, wrap, {
                id: 'tool-marking',
                label: t('_lanes.tools.marking_type'),
                info: 'marking_tool',
                value: tools.marking(),
                present: false,
                strict: true,
                suggestions: markingTypes.filter(v => v !== 'none').map(type => ({ value: type, title: t(`_lanes.markings.types.${type}`) })),
                onChange: value => tools.setMarking(value as MarkingType)
            });
            fieldNote(wrap, t('_lanes.markings.placing', { type: t(`_lanes.markings.types.${tools.marking()}`) }));
        }
        if (tool === 'sign') {
            laneField(context, wrap, {
                id: 'tool-sign',
                label: t('_lanes.tools.sign_type'),
                info: 'sign_tool',
                value: tools.sign(),
                present: false,
                strict: true,
                suggestions: signChoices.map(choice => ({ value: choice, title: t(`_lanes.signs.names.${signNameKey(choice)}`) })),
                onChange: value => tools.setSign(value as SignChoice)
            });
            fieldNote(wrap, t('_lanes.signs.placing', { type: t(`_lanes.signs.names.${signNameKey(tools.sign())}`) }));
        }
        if (tool !== 'paint') return;

        const paint = tools.paint();
        const palette = wrap.append('div').attr('class', 'lanes-palette');
        laneField(context, palette, {
            id: 'paint-key',
            label: t('_lanes.tools.paint_key'),
            info: 'paint',
            value: paint.key,
            present: false,
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
            info: 'paint',
            value: paint.value,
            present: false,
            strict: !!choices,
            suggestions: choices ? choices.map(choice => ({ value: choice.value, title: t(choice.label) }))
                : road ? laneSuggestions(context, road, paint.key) : [],
            onChange: value => tools.setPaint({ key: paint.key, value })
        });
        fieldNote(wrap, t('_lanes.tools.paint_hint'));
    }


    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}


/**
 * A centre line choice's icon: the lanes either side with their direction of travel (forward traffic keeps to the
 * way's left where traffic drives on the left), and the line between them as painted, solid on the side of traffic
 * that may not cross it
 */
export function centreLineIcon(selection: d3.Selection<any>, line: CentreLine, driveSide: 'left' | 'right') {
    const svg = selection.append('svg').attr('class', 'centre-line-icon').attr('width', 34).attr('height', 26).attr('viewBox', '-17 -13 34 26');
    const forwardLeft = driveSide === 'left';
    const leftBanned = forwardLeft ? line === 'no_forward' || line === 'no_both' : line === 'no_backward' || line === 'no_both';
    const rightBanned = forwardLeft ? line === 'no_backward' || line === 'no_both' : line === 'no_forward' || line === 'no_both';
    const stroke = (x: number, solid: boolean) => svg.append('path').attr('d', `M${x} -12V12`)
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.8)
        .attr('stroke-dasharray', solid ? null : '4 3');
    const single = line === 'dashed';
    if (single) stroke(0, false);
    else {
        stroke(-2, leftBanned);
        stroke(2, rightBanned);
    }
    // the traffic on each side: up on the left half for forward traffic where it keeps left
    const arrow = (x: number, up: boolean) => svg.append('path')
        .attr('d', up ? `M${x} 8V-6M${x - 3} -3L${x} -7L${x + 3} -3` : `M${x} -8V6M${x - 3} 3L${x} 7L${x + 3} 3`)
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.5).attr('stroke-linecap', 'round').attr('opacity', 0.75);
    arrow(-10, forwardLeft);
    arrow(10, !forwardLeft);
    return svg;
}
