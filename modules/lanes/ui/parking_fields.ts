import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { OsmEntity } from '../../osm';
import { uiDisclosure } from '../../ui/disclosure';
import { utilGetSetValue, utilNoAuto } from '../../util';
import {
    formatConditional, parkedPositions, parkingAccessValues, parkingDirections, parkingMaxstays, parkingOrientations, parkingPrivateValues,
    parkingReasons, parkingRestrictions, parkingSurfaces, parkingValue, parseConditional, shortDuration, withParkingValue, type ParkingSide
} from '../model/parking';
import type { InfoTopic } from './field_info';
import { choiceButtons, fieldNote, fieldShell, laneField, laneInput, moreFields, tagChrome, type FieldChrome, type MoreField } from './lane_fields';

type Div = d3.Selection<HTMLDivElement>;

/*
 * The fields of street parking (wiki: Street parking): where and how cars park, and its legal side (restrictions,
 * at times too, fees, time limits, zones, who may park). The same fields serve a side of a road
 * (`parking:<side>:<key>`, with `both` for what both sides share) and a parking area mapped on its own (`<key>`).
 * The fields usually needed are shown; the rest wait in "Add field" until they are tagged or picked.
 */

/** Reads and writes one parking's keys: a side of a road, or a parking area of its own */
export interface ParkingScope {
    /** a CSS-safe id for its fields */
    id: string;
    /** a key's value; `''` is where cars stand (`parking:<side>`, or `parking` for an area) */
    get(key: string): string | undefined;
    /** writes several keys as one undo step; `undefined` removes a key */
    set(changes: Record<string, string | undefined>): void;
    /** the bin and undo of one key */
    chrome(key: string, info: InfoTopic): FieldChrome;
    /** a parking area mapped on its own: always parked, and keyed without a prefix */
    area: boolean;
}

const _shownDetails = new Set<string>();

/** The scope of a side of a road: `parking:<side>:<key>`, read through `parking:both:<key>` */
export function roadParkingScope(context: iD.Context, road: OsmEntity, side: ParkingSide): ParkingScope {
    const annotation = t('_lanes.annotation.parking');
    const base = context.graph().base().entities[road.id] as OsmEntity | undefined;
    const write = (changes: Record<string, string | undefined>) => {
        let tags = road.tags;
        for (const [key, value] of Object.entries(changes)) tags = withParkingValue(tags, side, key, value || undefined);
        context.perform(actionChangeTags(road.id, tags), annotation);
    };
    return {
        id: `parking-${side}`,
        area: false,
        get: key => parkingValue(road.tags, side, key),
        set: write,
        chrome: (key, info) => {
            const now = parkingValue(road.tags, side, key);
            const was = base ? parkingValue(base.tags, side, key) : undefined;
            return {
                info,
                present: now !== undefined,
                onRemove: () => write({ [key]: undefined }),
                modified: now !== was,
                onRevert: () => write({ [key]: was })
            };
        }
    };
}

/** The scope of a parking area mapped on its own (`amenity=parking` + `parking=street_side|lane|…`) */
export function areaParkingScope(context: iD.Context, area: OsmEntity): ParkingScope {
    const annotation = t('_lanes.annotation.street_feature');
    const keyOf = (key: string) => key || 'parking';
    return {
        id: 'sf-parking',
        area: true,
        get: key => area.tags[keyOf(key)],
        set: changes => {
            const tags = { ...area.tags };
            for (const [key, value] of Object.entries(changes)) {
                if (value) tags[keyOf(key)] = value;
                else delete tags[keyOf(key)];
            }
            context.perform(actionChangeTags(area.id, tags), annotation);
        },
        chrome: (key, info) => tagChrome(context, area.id, [keyOf(key)], annotation, info)
    };
}

const titled = (group: string, values: readonly string[]) => values.map(value => ({ value, title: t(`_lanes.parking.${group}.${value}`, { default: value }) }));

interface DetailField {
    key: string;
    info: InfoTopic;
    /** shown before it is tagged or picked */
    primary: (parked: boolean, scope: ParkingScope) => boolean;
    /** offered at all */
    offered?: (parked: boolean, scope: ParkingScope) => boolean;
    draw: (parent: Div, scope: ParkingScope, label: string, chrome: FieldChrome) => void;
}

/** A dropdown of fixed values, written as they are */
const strictField = (context: iD.Context, group: string, values: readonly string[]) =>
    (parent: Div, scope: ParkingScope, label: string, chrome: FieldChrome, key: string) => laneField(context, parent, {
        ...chrome, id: `${scope.id}-${key.replace(/\W/g, '-')}`, label, value: scope.get(key) ?? '', strict: true,
        emptyTitle: t('_lanes.parking.not_tagged'), suggestions: titled(group, values),
        onChange: value => scope.set({ [key]: value || undefined })
    });

/** A text field with suggestions, for values of any kind */
const comboField = (context: iD.Context, suggestions: { value: string; title?: string }[], placeholder?: string) =>
    (parent: Div, scope: ParkingScope, label: string, chrome: FieldChrome, key: string) => laneField(context, parent, {
        ...chrome, id: `${scope.id}-${key.replace(/\W/g, '-')}`, label, value: scope.get(key) ?? '', suggestions, placeholder,
        onChange: value => scope.set({ [key]: value || undefined })
    });

/**
 * A restriction at times (`restriction:conditional=no_parking @ (Mo-Sa 08:00-18:30)`): what applies, and when, in
 * two inputs; a value with more than one part, or one it can't read, is edited as it is written
 */
function timesField(context: iD.Context, parent: Div, scope: ParkingScope, key: string, label: string, chrome: FieldChrome,
    values: { value: string; title: string }[]) {
    const raw = scope.get(key);
    const parts = parseConditional(raw);
    if (parts === null || parts.length > 1) {
        laneField(context, parent, {
            ...chrome, id: `${scope.id}-${key.replace(/\W/g, '-')}`, label, value: raw ?? '', suggestions: [],
            onChange: value => scope.set({ [key]: value || undefined })
        });
        return;
    }
    const part = parts[0] ?? { value: '', condition: '' };
    const id = `${scope.id}-${key.replace(/\W/g, '-')}`;
    const { wrap } = fieldShell(parent, { ...chrome, id, label, labelFor: `lane-field-${id}-when`, wrapClass: 'form-field-input-directionalcombo lane-times' });
    const list = wrap.append('ul').attr('class', 'rows rows-table');
    let value = part.value;
    let condition = part.condition;
    const write = () => scope.set({ [key]: value && condition ? formatConditional([{ value, condition }]) : undefined });

    const what = list.append('li').attr('class', 'labeled-input');
    what.append('div').attr('class', 'label').text(t('_lanes.parking.times.what'));
    laneInput(context, what.append('div').attr('class', 'form-field-input-wrap'), {
        id: `${id}-what`, value, strict: true, emptyTitle: t('_lanes.parking.not_tagged'), suggestions: values,
        onChange: v => {
            value = v;
            if (condition) write();
        }
    });

    const when = list.append('li').attr('class', 'labeled-input');
    when.append('div').attr('class', 'label').text(t('_lanes.parking.times.when'));
    const input = when.append('div').attr('class', 'form-field-input-wrap').append('input')
        .attr('type', 'text').attr('id', `lane-field-${id}-when`).attr('class', 'lane-field-input')
        .attr('placeholder', t('_lanes.parking.times.placeholder'))
        .call(utilNoAuto as any);
    utilGetSetValue(input as any, condition);
    input.on('change', function(this: HTMLInputElement) {
        const next = context.cleanTagValue(this.value.trim()).replace(/^\((.*)\)$/, '$1');
        if (next === condition) return;
        condition = next;
        if (value || !next) write();
    });
}


/** The parking's fields, in the order they are usually needed */
function detailFields(context: iD.Context): DetailField[] {
    const restrictionTitles = titled('restrictions', parkingRestrictions);
    const orientationIcons = (orientation: string) => (button: d3.Selection<any>) => {
        const svg = button.append('svg').attr('width', 30).attr('height', 22).attr('viewBox', '-15 -11 30 22').attr('class', 'parking-orientation-icon');
        svg.append('path').attr('d', 'M-14 9H14').attr('stroke', 'currentColor').attr('stroke-width', 1.5);
        const car = (x: number) => {
            const g = svg.append('g').attr('transform', `translate(${x} 1) rotate(${orientation === 'parallel' ? 90 : orientation === 'diagonal' ? 45 : 0})`);
            g.append('rect').attr('x', -2.6).attr('y', -4.5).attr('width', 5.2).attr('height', 9).attr('rx', 1.4)
                .attr('fill', 'currentColor').attr('opacity', 0.85);
        };
        if (orientation === 'parallel') [-8, 4].forEach(car);
        else [-9, -1, 7].forEach(car);
    };
    const parkedOnly = (parked: boolean) => parked;
    return [
        {
            key: 'orientation', info: 'parking_orientation', primary: parkedOnly, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => {
                const { wrap } = fieldShell(parent, { ...chrome, id: `${scope.id}-orientation`, label, wrapClass: 'lane-field-body' });
                choiceButtons(wrap, parkingOrientations.map(value => ({
                    value, label: t(`_lanes.parking.orientations.${value}`), icon: orientationIcons(value)
                })), scope.get('orientation') as typeof parkingOrientations[number] | undefined, value => scope.set({ orientation: value }));
            }
        },
        {
            key: 'restriction', info: 'parking_restriction', primary: () => true,
            draw: (parent, scope, label, chrome) => strictField(context, 'restrictions', parkingRestrictions)(parent, scope, label, chrome, 'restriction')
        },
        {
            key: 'restriction:conditional', info: 'parking_times', primary: () => true,
            draw: (parent, scope, label, chrome) => timesField(context, parent, scope, 'restriction:conditional', label, chrome, restrictionTitles)
        },
        {
            key: 'fee', info: 'parking_fee', primary: parkedOnly, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => strictField(context, 'yes_no', ['yes', 'no'])(parent, scope, label, chrome, 'fee')
        },
        {
            key: 'maxstay', info: 'parking_maxstay', primary: parkedOnly, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, parkingMaxstays.map(value => ({ value })))(parent, scope, label, chrome, 'maxstay')
        },
        {
            key: 'access', info: 'parking_access', primary: parkedOnly, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, titled('access_values', parkingAccessValues))(parent, scope, label, chrome, 'access')
        },
        {
            key: 'zone', info: 'parking_zone', primary: parkedOnly, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, [], t('_lanes.parking.zone_placeholder'))(parent, scope, label, chrome, 'zone')
        },
        {
            key: 'reason', info: 'parking_reason', primary: (parked, scope) => !parked && !scope.area, offered: (parked, scope) => !scope.area,
            draw: (parent, scope, label, chrome) => comboField(context, titled('reasons', parkingReasons))(parent, scope, label, chrome, 'reason')
        },
        // the rest only once tagged or picked
        {
            key: 'direction', info: 'parking_direction', primary: () => false,
            offered: (parked, scope) => parked && scope.get('orientation') !== 'parallel',
            draw: (parent, scope, label, chrome) => strictField(context, 'directions', parkingDirections)(parent, scope, label, chrome, 'direction')
        },
        {
            key: 'markings', info: 'parking_markings', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => strictField(context, 'yes_no', ['yes', 'no'])(parent, scope, label, chrome, 'markings')
        },
        {
            key: 'charge', info: 'parking_charge', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, [], t('_lanes.parking.charge_placeholder'))(parent, scope, label, chrome, 'charge')
        },
        {
            key: 'fee:conditional', info: 'parking_times', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => timesField(context, parent, scope, 'fee:conditional', label, chrome, titled('yes_no', ['yes', 'no']))
        },
        {
            key: 'maxstay:conditional', info: 'parking_times', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => timesField(context, parent, scope, 'maxstay:conditional', label, chrome,
                parkingMaxstays.map(value => ({ value, title: value })))
        },
        {
            key: 'access:conditional', info: 'parking_times', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => timesField(context, parent, scope, 'access:conditional', label, chrome,
                titled('access_values', parkingAccessValues))
        },
        {
            key: 'private', info: 'parking_private', primary: (parked, scope) => parked && scope.get('access') === 'private', offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, titled('private_values', parkingPrivateValues))(parent, scope, label, chrome, 'private')
        },
        {
            key: 'disabled', info: 'parking_disabled', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => strictField(context, 'disabled_values', ['designated', 'yes', 'no'])(parent, scope, label, chrome, 'disabled')
        },
        {
            key: 'authentication:disc', info: 'parking_disc', primary: () => false, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => strictField(context, 'yes_no', ['yes', 'no'])(parent, scope, label, chrome, 'authentication:disc')
        },
        {
            key: 'capacity', info: 'parking_capacity', primary: (parked, scope) => scope.area, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, [])(parent, scope, label, chrome, 'capacity')
        },
        {
            key: 'width', info: 'parking_width', primary: () => false, offered: (parked, scope) => parked && !scope.area,
            draw: (parent, scope, label, chrome) => comboField(context, ['2', '2.2', '2.5', '4.5', '5'].map(value => ({ value, title: `${value} m` })))(parent, scope, label, chrome, 'width')
        },
        {
            key: 'surface', info: 'parking_surface', primary: (parked, scope) => scope.area, offered: parkedOnly,
            draw: (parent, scope, label, chrome) => comboField(context, parkingSurfaces.map(value => ({ value })))(parent, scope, label, chrome, 'surface')
        },
        {
            key: 'staggered', info: 'parking_staggered', primary: () => false, offered: (parked, scope) => parked && !scope.area,
            draw: (parent, scope, label, chrome) => strictField(context, 'yes_no', ['yes', 'no'])(parent, scope, label, chrome, 'staggered')
        },
        {
            key: 'restriction:reason', info: 'parking_reason', primary: () => false,
            draw: (parent, scope, label, chrome) => comboField(context, titled('reasons', parkingReasons))(parent, scope, label, chrome, 'restriction:reason')
        }
    ];
}


/**
 * One parking's fields: those usually needed, those already tagged, and an "Add field" for the rest. For a side of a
 * road where nobody parks (`no`, or not tagged), only what says why: its restriction (drawn as yellow or red lines
 * along the kerb), at times too, and the reason.
 */
export function parkingDetails(context: iD.Context, parent: Div, scope: ParkingScope) {
    const position = scope.get('');
    const parked = scope.area || (!!position && parkedPositions.includes(position));
    const more: MoreField[] = [];
    for (const field of detailFields(context)) {
        const offered = field.offered ? field.offered(parked, scope) : true;
        const tagged = scope.get(field.key) !== undefined;
        if (!offered && !tagged) continue;
        const label = t(`_lanes.parking.fields.${field.key.replace(/:/g, '_')}`);
        const shownKey = `${scope.id}-${field.key}`;
        if (tagged || field.primary(parked, scope) || _shownDetails.has(shownKey)) {
            field.draw(parent, scope, label, scope.chrome(field.key, field.info));
        } else {
            more.push({
                id: field.key, title: label, show: () => {
                    _shownDetails.add(shownKey);
                    parent.selectAll('*').remove();
                    parkingDetails(context, parent, scope);
                }
            });
        }
    }
    moreFields(context, parent, scope.id, more);
}


/** A side's parking in a few words, for the title of its fields: where, how, and what it costs and for how long */
export function parkingSummary(scope: ParkingScope): string {
    const position = scope.get('');
    const parts: string[] = [];
    if (position) parts.push(t(`_lanes.roadside.values.${position}`, { default: position }).toLowerCase());
    const orientation = scope.get('orientation');
    if (orientation) parts.push(t(`_lanes.parking.orientations.${orientation}`, { default: orientation }).toLowerCase());
    const restriction = scope.get('restriction');
    if (restriction) parts.push(t(`_lanes.parking.restrictions.${restriction}`, { default: restriction }).toLowerCase());
    if (scope.get('restriction:conditional')) parts.push(t('_lanes.parking.summary.at_times'));
    const fee = scope.get('fee');
    if (fee === 'yes') parts.push(t('_lanes.parking.summary.pay'));
    if (fee === 'no') parts.push(t('_lanes.parking.summary.free'));
    const maxstay = scope.get('maxstay');
    if (maxstay) parts.push(shortDuration(maxstay));
    const zone = scope.get('zone');
    if (zone) parts.push(t('_lanes.parking.summary.zone', { zone }));
    return parts.join(', ');
}

/**
 * The parking fields of a side of a road, folded away under a title that sums them up (remembered, as iD's sections
 * are), so the Roadside section stays short until they are wanted
 */
export function parkingSideDetails(context: iD.Context, parent: Div, scope: ParkingScope, sideName: string) {
    const summary = parkingSummary(scope);
    const holder = parent.append('div').attr('class', `lane-parking-details lane-parking-details-${scope.id}`);
    holder.call((uiDisclosure(context, `lanes_${scope.id.replace(/-/g, '_')}_details`, false) as any)
        .label(() => t('_lanes.parking.details_title', { side: sideName }) + (summary ? `: ${summary}` : ''))
        .content((selection: Div) => {
            selection.selectAll('*').remove();
            parkingDetails(context, selection, scope);
            if (scope.get('') === 'separate') fieldNote(selection, t('_lanes.parking.separate_note'));
        }));
}
