import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { cyclewayValue, shoulderValue, sidewalkValue, withCycleway, withShoulder, withSidewalk } from '../core/roadside';
import { insertLane, laneKindKeys, parseLanes, setLaneKind } from '../model';
import {
    kerbMarking, parkedPositions, parkingMaxstays, parkingOrientations, parkingValue, withParkingValue, type KerbMarking, type ParkingSide
} from '../model/parking';
import type { InfoTopic } from './field_info';
import { choiceButtons, fieldNote, fieldShell, laneField } from './lane_fields';
import { kerbLaneAt } from './road_sections';

type Div = d3.Selection<HTMLDivElement>;

/*
 * The + menu for the roadside: what to add to one side of the selected road (a lane, a hard shoulder, a pavement, a
 * cycleway, parking, or no-waiting lines), then that feature's tags, written as one undo step. It opens from the +
 * at each kerb of the selected road on the map, and from "Add to the roadside" in the Roadside section.
 */

export const roadsideFeatures = ['lane', 'shoulder', 'sidewalk', 'cycleway', 'parking', 'no_waiting'] as const;
export type RoadsideFeature = typeof roadsideFeatures[number];

const featureInfo: Record<RoadsideFeature, InfoTopic> = {
    lane: 'lanes', shoulder: 'shoulder', sidewalk: 'sidewalk', cycleway: 'cycleway', parking: 'parking', no_waiting: 'parking_restriction'
};

export interface RoadsideMenuOptions {
    wayID: WayId;
    /** the side of the way, when the menu opens from a + beside it; else the forward side */
    side?: ParkingSide;
    /** where to open it, in the page's pixels */
    at: [number, number];
}

type Draft = Record<string, string | undefined>;

/** The way's side beside forward traffic: its left where traffic keeps left */
function forwardSideOf(road: osmWay, graph: iD.Graph): ParkingSide {
    return laneDriveSide(road, graph) === 'left' ? 'left' : 'right';
}

/** The side a one-way road's plain `shoulder=yes` is on: its driving side */
function shoulderSideOf(road: osmWay, graph: iD.Graph): ParkingSide | null {
    const model = parseLanes(road.tags, { driveSide: laneDriveSide(road, graph) });
    const driveSide = model.driveSide;
    if (model.oneway === 'forward') return driveSide;
    if (model.oneway === 'backward') return driveSide === 'left' ? 'right' : 'left';
    return null;
}

/** Whether a feature is already on a side, so the menu changes it rather than adds it */
export function roadsideHas(road: osmWay, graph: iD.Graph, side: ParkingSide, feature: RoadsideFeature): boolean {
    const tags = road.tags;
    switch (feature) {
        case 'lane': return false;
        case 'shoulder': return shoulderValue(tags, side, shoulderSideOf(road, graph)) === 'yes';
        case 'sidewalk': return ['yes', 'separate'].includes(sidewalkValue(tags, side) ?? '');
        case 'cycleway': return !['', 'no', 'none'].includes(cyclewayValue(tags, side) ?? '');
        case 'parking': return [...parkedPositions, 'separate'].includes(parkingValue(tags, side) ?? '');
        case 'no_waiting': return !!kerbMarking(tags, side);
    }
}

/** What the form starts with: the side's tags as they are, or what is usually there */
function draftOf(road: osmWay, side: ParkingSide, feature: RoadsideFeature): Draft {
    const tags = road.tags;
    switch (feature) {
        case 'lane': return { kind: 'general' };
        case 'shoulder': return { width: tags[`shoulder:${side}:width`] ?? tags['shoulder:both:width'] ?? tags['shoulder:width'] };
        case 'sidewalk': return { value: sidewalkValue(tags, side) === 'separate' ? 'separate' : 'yes', width: tags[`sidewalk:${side}:width`] ?? tags['sidewalk:both:width'] };
        case 'cycleway': return { value: cyclewayValue(tags, side) && cyclewayValue(tags, side) !== 'no' ? cyclewayValue(tags, side) : 'lane' };
        case 'parking': {
            const position = parkingValue(tags, side);
            return {
                position: position && [...parkedPositions, 'separate'].includes(position) ? position : 'lane',
                orientation: parkingValue(tags, side, 'orientation') ?? 'parallel',
                fee: parkingValue(tags, side, 'fee'),
                maxstay: parkingValue(tags, side, 'maxstay'),
                zone: parkingValue(tags, side, 'zone')
            };
        }
        case 'no_waiting': {
            const marking = kerbMarking(tags, side);
            const times = (parkingValue(tags, side, 'restriction:conditional') ?? '').match(/@\s*\((.*)\)\s*$/)?.[1];
            return { lines: marking ?? 'double_yellow', times };
        }
    }
}

/** The road's tags with the feature on the side, as the form says */
function withFeature(road: osmWay, graph: iD.Graph, side: ParkingSide, feature: RoadsideFeature, draft: Draft): Tags {
    let tags = { ...road.tags };
    const set = (key: string, value: string | undefined) => {
        if (value) tags[key] = value;
        else delete tags[key];
    };
    switch (feature) {
        case 'shoulder':
            tags = withShoulder(tags, side, 'yes', shoulderSideOf(road, graph));
            if (draft.width !== undefined) set(`shoulder:${side}:width`, draft.width);
            break;
        case 'sidewalk':
            tags = withSidewalk(tags, side, draft.value ?? 'yes');
            if (draft.value === 'yes' && draft.width !== undefined) set(`sidewalk:${side}:width`, draft.width);
            break;
        case 'cycleway':
            tags = withCycleway(tags, side, draft.value ?? 'lane');
            break;
        case 'parking': {
            const write = (key: string, value: string | undefined) => { tags = withParkingValue(tags, side, key, value || undefined); };
            write('', draft.position ?? 'lane');
            if (draft.position !== 'separate') {
                write('orientation', draft.orientation ?? 'parallel');
                write('fee', draft.fee);
                write('maxstay', draft.maxstay);
                write('zone', draft.zone);
            }
            // parking where there were no-waiting lines: the lines go
            if (parkingValue(tags, side, 'restriction') === 'no_parking' || parkingValue(tags, side, 'restriction') === 'no_stopping') write('restriction', undefined);
            break;
        }
        case 'no_waiting': {
            const lines = (draft.lines ?? 'double_yellow') as KerbMarking;
            const value = lines.endsWith('red') ? 'no_stopping' : 'no_parking';
            const write = (key: string, v: string | undefined) => { tags = withParkingValue(tags, side, key, v); };
            write('', 'no');
            if (lines.startsWith('double')) {
                write('restriction', value);
                write('restriction:conditional', undefined);
            } else {
                write('restriction', undefined);
                write('restriction:conditional', `${value} @ (${draft.times})`);
            }
            for (const key of ['orientation', 'fee', 'maxstay', 'zone', 'markings', 'capacity']) write(key, undefined);
            break;
        }
        case 'lane':
            break;
    }
    return tags;
}

/** Whether the form says enough to write: a single line needs its times */
function complete(feature: RoadsideFeature, draft: Draft): boolean {
    if (feature === 'no_waiting' && (draft.lines ?? '').startsWith('single')) return !!draft.times?.trim();
    return true;
}


let _close: (() => void) | null = null;

/** Closes the roadside menu, if it is open */
export function closeRoadsideMenu() {
    _close?.();
}

/** Opens the roadside menu for a road */
export function openRoadsideMenu(context: iD.Context, options: RoadsideMenuOptions) {
    closeRoadsideMenu();
    const graph = context.graph();
    const road = context.hasEntity(options.wayID) as osmWay | undefined;
    if (!road) return;
    const opener = document.activeElement as HTMLElement | null;
    let side: ParkingSide = options.side ?? forwardSideOf(road, graph);
    let feature: RoadsideFeature | null = null;
    let draft: Draft = {};

    const container = d3_select(context.container().node() as HTMLElement);
    const menu = container.append('div')
        .attr('class', 'lanes-roadside-menu')
        .attr('role', 'dialog')
        .attr('aria-labelledby', 'lanes-roadside-menu-title') as unknown as Div;
    menu.on('pointerdown.lanes-menu', (event: Event) => event.stopPropagation())
        .on('keydown.lanes-menu', (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        });

    const sideName = (s: ParkingSide) => t(`_lanes.roadside.${s === forwardSideOf(road, graph) ? 'forward' : 'backward'}`);

    function place() {
        const node = menu.node()!;
        const width = node.offsetWidth || 280;
        const height = node.offsetHeight || 300;
        const x = Math.max(8, Math.min(window.innerWidth - width - 8, options.at[0] + 12));
        const y = Math.max(8, Math.min(window.innerHeight - height - 8, options.at[1] - 20));
        menu.style('left', `${x}px`).style('top', `${y}px`);
    }

    function render() {
        menu.selectAll('*').remove();
        const current = context.hasEntity(options.wayID) as osmWay | undefined;
        if (!current) return close();
        const head = menu.append('div').attr('class', 'lanes-roadside-menu-head');
        if (feature) {
            head.append('button').attr('type', 'button').attr('class', 'lanes-roadside-menu-back')
                .attr('title', t('_lanes.add_menu.back'))
                .attr('aria-label', t('_lanes.add_menu.back'))
                .call(svgIcon('#iD-icon-backward') as any)
                .on('click', () => {
                    feature = null;
                    render();
                });
        }
        head.append('h3').attr('id', 'lanes-roadside-menu-title')
            .text(feature ? t(`_lanes.add_menu.features.${feature}.title`) : t('_lanes.add_menu.title'));
        head.append('button').attr('type', 'button').attr('class', 'lanes-roadside-menu-close')
            .attr('title', t('icons.close')).attr('aria-label', t('icons.close'))
            .call(svgIcon('#iD-icon-close') as any)
            .on('click', close);

        const body = menu.append('div').attr('class', 'lanes-roadside-menu-body');
        // which side: forward is beside traffic going the way's drawing direction
        const { wrap: sides } = fieldShell(body, { id: 'add-side', label: t('_lanes.add_menu.side'), wrapClass: 'lane-field-body' });
        const forward = forwardSideOf(current, graph);
        choiceButtons(sides, ([forward, forward === 'left' ? 'right' : 'left'] as ParkingSide[]).map(s => ({
            value: s, label: sideName(s)
        })), side, s => {
            side = s;
            if (feature) draft = draftOf(current, side, feature);
            render();
        });

        if (!feature) renderList(body, current);
        else renderForm(body, current, feature);
        place();
    }

    function pick(current: osmWay, item: RoadsideFeature) {
        feature = item;
        draft = draftOf(current, side, item);
        render();
        menu.select<HTMLElement>('.lanes-roadside-menu-body input, .lanes-roadside-menu-body button.lane-choice').node()?.focus();
    }

    function renderList(body: Div, current: osmWay) {
        const list = body.append('ul').attr('class', 'lanes-roadside-menu-items');
        const onSide = side;
        for (const item of roadsideFeatures) {
            const has = roadsideHas(current, context.graph(), onSide, item);
            const button = list.append('li').append('button').attr('type', 'button')
                .attr('class', `lanes-roadside-menu-item lanes-roadside-menu-item-${item}` + (has ? ' present' : ''))
                .on('click', () => pick(current, item));
            button.append('span').attr('class', 'lanes-roadside-menu-item-title').text(t(`_lanes.add_menu.features.${item}.title`));
            button.append('span').attr('class', 'lanes-roadside-menu-item-text')
                .text(has ? t('_lanes.add_menu.already') : t(`_lanes.add_menu.features.${item}.text`));
        }
    }

    function renderForm(body: Div, current: osmWay, item: RoadsideFeature) {
        const set = (key: string, value: string | undefined, redraw = false) => {
            draft = { ...draft, [key]: value || undefined };
            if (redraw) render();
            else body.select('.lanes-roadside-menu-apply').attr('disabled', complete(item, draft) ? null : true);
        };
        const info = featureInfo[item];
        const strict = (id: string, key: string, values: { value: string; title: string }[], redraw = false) => laneField(context, body, {
            id: `add-${id}`, label: t(`_lanes.add_menu.fields.${id}`), info, value: draft[key] ?? '', present: false, strict: true,
            suggestions: values, onChange: value => set(key, value, redraw)
        });
        const combo = (id: string, key: string, values: { value: string; title?: string }[], placeholder?: string) => laneField(context, body, {
            id: `add-${id}`, label: t(`_lanes.add_menu.fields.${id}`), info, value: draft[key] ?? '', present: false,
            suggestions: values, placeholder, onChange: value => set(key, value)
        });
        const widths = (values: string[]) => values.map(value => ({ value, title: `${value} m` }));
        switch (item) {
            case 'lane':
                strict('lane_kind', 'kind', Object.keys(laneKindKeys).map(kind => ({ value: kind, title: t(`_lanes.kind.${kind}`) })));
                break;
            case 'shoulder':
                combo('width', 'width', widths(['1', '1.5', '2', '2.5', '3', '3.3', '3.5']));
                break;
            case 'sidewalk':
                strict('sidewalk', 'value', ['yes', 'separate', 'no'].map(value => ({ value, title: t(`_lanes.roadside.values.${value}`) })), true);
                if (draft.value === 'yes') combo('width', 'width', widths(['1.5', '2', '2.5', '3', '4']));
                break;
            case 'cycleway':
                strict('cycleway', 'value', ['lane', 'track', 'shared_lane', 'separate', 'no'].map(value => ({ value, title: t(`_lanes.roadside.values.${value}`) })));
                break;
            case 'parking': {
                strict('parking_position', 'position', [...parkedPositions, 'separate'].map(value => ({ value, title: t(`_lanes.roadside.values.${value}`) })), true);
                if (draft.position === 'separate') break;
                const { wrap } = fieldShell(body, { id: 'add-orientation', label: t('_lanes.add_menu.fields.orientation'), info: 'parking_orientation', wrapClass: 'lane-field-body' });
                choiceButtons(wrap, parkingOrientations.map(value => ({ value, label: t(`_lanes.parking.orientations.${value}`) })),
                    draft.orientation as typeof parkingOrientations[number], value => set('orientation', value, true));
                strict('fee', 'fee', ['yes', 'no'].map(value => ({ value, title: t(`_lanes.parking.yes_no.${value}`) })));
                combo('maxstay', 'maxstay', parkingMaxstays.map(value => ({ value })));
                combo('zone', 'zone', [], t('_lanes.parking.zone_placeholder'));
                break;
            }
            case 'no_waiting':
                strict('lines', 'lines', (['double_yellow', 'single_yellow', 'double_red', 'single_red'] as const)
                    .map(value => ({ value, title: t(`_lanes.add_menu.lines.${value}`) })), true);
                if ((draft.lines ?? '').startsWith('single')) combo('times', 'times', [], t('_lanes.parking.times.placeholder'));
                break;
        }
        fieldNote(body, t(`_lanes.add_menu.features.${item}.hint`));

        const foot = menu.append('div').attr('class', 'lanes-roadside-menu-foot');
        foot.append('button').attr('type', 'button').attr('class', 'lanes-roadside-menu-cancel').text(t('_lanes.add_menu.cancel'))
            .on('click', close);
        foot.append('button').attr('type', 'button').attr('class', 'lanes-roadside-menu-apply button')
            .attr('disabled', complete(item, draft) ? null : true)
            .text(roadsideHas(current, context.graph(), side, item) ? t('_lanes.add_menu.change') : t('_lanes.add_menu.add'))
            .on('click', () => {
                // the field being typed in writes its value as it loses focus
                (document.activeElement as HTMLElement | null)?.blur?.();
                if (!complete(item, draft)) return;
                apply(item);
            });
    }

    function apply(item: RoadsideFeature) {
        const annotation = t(`_lanes.annotation.${item === 'lane' ? 'add_lane' : 'roadside'}`);
        const chosen = side;
        const values = draft;
        if (item === 'lane') {
            context.perform(actionChangeLanes(options.wayID, m => {
                const at = kerbLaneAt(m, chosen);
                const next = insertLane(m, at.direction, at.index);
                return values.kind && values.kind !== 'general' ? setLaneKind(next, [at], values.kind) : next;
            }), annotation);
        } else {
            context.perform((g: iD.Graph) => {
                const way = g.entity(options.wayID) as osmWay;
                return actionChangeTags(options.wayID, withFeature(way, g, chosen, item, values))(g);
            }, annotation);
        }
        close();
    }

    function close() {
        d3_select(document).on('pointerdown.lanes-roadside-menu', null);
        menu.remove();
        _close = null;
        opener?.focus?.();
    }
    _close = close;

    // a click elsewhere closes it (after this click has finished)
    window.setTimeout(() => {
        d3_select(document).on('pointerdown.lanes-roadside-menu', (event: PointerEvent) => {
            const target = event.target as Element | null;
            // (the dropdown of a field in the menu is drawn outside it)
            if (!menu.node()?.contains(target) && !target?.closest?.('.combobox')) close();
        });
    }, 0);

    render();
    menu.select<HTMLElement>('.lanes-roadside-menu-item').node()?.focus();
}
