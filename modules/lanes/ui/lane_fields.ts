import * as countryCoder from '@rapideditor/country-coder';

import { actionChangeTags } from '../../actions/change_tags';
import type { coreGraph } from '../../core/graph';
import { t, localizer } from '../../core/localizer';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { uiCombobox } from '../../ui/combobox';
import { utilGetSetValue, utilNoAuto } from '../../util';
import { parseTurn, splitLaneValue, type LaneDirection } from '../model';
import { turnArrowSymbol } from '../svg/defs';
import { fieldInfoPageName, fieldInfoUrl, type InfoTopic } from './field_info';

type Selection = d3.Selection<any>;


/* ---------- the parts every field has: iD's label row, bin, undo and i buttons ---------- */

/**
 * What a field shows in its label row, as iD's own fields do: the bin when its tags are there (it removes them), the
 * undo button when they changed since the last save (it puts them back), and the i button, which opens a short
 * overview of the topic with a link to its wiki page
 */
export interface FieldChrome {
    info?: InfoTopic;
    present?: boolean;
    onRemove?: () => void;
    modified?: boolean;
    onRevert?: () => void;
}

export interface FieldShellOptions extends FieldChrome {
    /** a CSS-safe id for the field */
    id: string;
    label: string;
    /** the id of the input the label is for */
    labelFor?: string;
    /** extra classes for the input wrap: `lane-field-body` for anything but a single input */
    wrapClass?: string;
}

// the overviews open, by field, so they stay open as the sidebar redraws after an edit
const _openInfo = new Set<string>();

/**
 * A field laid out like iD's (see `.form-field` in iD's css/80_app.css): the label row with its buttons, a wrap for
 * the input or anything else the field holds, and the overview the i button opens. Returns the field and the wrap.
 */
export function fieldShell(parent: Selection, options: FieldShellOptions): { field: Selection; wrap: Selection } {
    const field = parent.append('div')
        .attr('class', `form-field lane-form-field form-field-lane-${options.id}`)
        .classed('present', !!options.present && !!options.onRemove)
        .classed('modified', !!options.modified && !!options.onRevert);
    const label = field.append('label').attr('class', 'field-label').attr('for', options.labelFor ?? null);
    const text = label.append('span').attr('class', 'label-text');
    text.append('span').attr('class', 'label-textvalue').text(options.label);
    text.append('span').attr('class', 'label-textannotation');

    const button = (cls: string, title: string, icon: string, click: () => void) => label.append('button')
        .attr('class', cls)
        .attr('type', 'button')
        .attr('title', title)
        .attr('aria-label', `${title}: ${options.label}`)
        .call(svgIcon(icon) as any)
        .on('click', (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            click();
        });
    if (options.onRemove) button('remove-icon', t('icons.remove'), '#iD-operation-delete', options.onRemove);
    if (options.onRevert) {
        button('modified-icon', t('icons.undo'), localizer.textDirection() === 'rtl' ? '#iD-icon-redo' : '#iD-icon-undo', options.onRevert);
    }

    const wrap = field.append('div').attr('class', 'form-field-input-wrap' + (options.wrapClass ? ` ${options.wrapClass}` : ''));

    if (options.info) {
        const reference = fieldReference(options.info, options.id);
        field.call(reference.body);
        label.call(reference.button);
    }
    return { field, wrap };
}

/**
 * The i button of a field and the overview it opens, as iD's tag reference is laid out (`.tag-reference-button`,
 * `.tag-reference-body`): a short overview of the topic and a link to its wiki page. It is used by Lane Studio's own
 * fields and, through iD's `referenceComponent`, by its fields in iD's Fields section. `key` keeps it open across redraws.
 */
export function fieldReference(topic: InfoTopic, key: string) {
    let _button: Selection | null = null;
    let _body: Selection | null = null;
    const show = () => {
        const open = _openInfo.has(key);
        _body?.classed('expanded', open);
        _button?.attr('aria-expanded', open).classed('active', open);
    };
    const reference = {
        button(selection: Selection) {
            let button = selection.selectAll<HTMLButtonElement, unknown>('.tag-reference-button').data([0]);
            button = button.enter().append('button')
                .attr('class', 'tag-reference-button')
                .attr('type', 'button')
                .attr('title', t('icons.information'))
                .attr('aria-label', t('icons.information'))
                .call(svgIcon('#iD-icon-inspect') as any)
                .merge(button as any);
            button.on('click', (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                (event.currentTarget as HTMLElement).blur();
                if (_openInfo.has(key)) _openInfo.delete(key);
                else _openInfo.add(key);
                show();
            });
            _button = button;
            show();
        },
        body(selection: Selection) {
            let body = selection.selectAll<HTMLDivElement, string>('.tag-reference-body').data([topic], d => d);
            body.exit().remove();
            const enter = body.enter().append('div').attr('class', 'tag-reference-body lane-field-info');
            enter.append('p').attr('class', 'tag-reference-description').append('span').text(t(`_lanes.info.${topic}`));
            enter.append('a').attr('class', 'tag-reference-link')
                .attr('target', '_blank').attr('rel', 'noopener noreferrer')
                .attr('href', fieldInfoUrl(topic))
                .call(svgIcon('#iD-icon-out-link', 'inline') as any)
                .append('span').text(t('_lanes.info_link', { page: fieldInfoPageName(topic) }));
            body = enter.merge(body as any);
            _body = body;
            show();
        },
        showing(val?: boolean) {
            if (val === undefined) return _openInfo.has(key);
            if (!val) _openInfo.delete(key);
            show();
            return reference;
        }
    };
    return reference;
}

/**
 * The bin and undo buttons of a field that edits whole tags of one feature: present while any of its keys is tagged,
 * changed while any differs from the last save; the bin removes them and undo puts the saved values back, each one
 * undo step. `keys` names the keys, or picks them from the feature's tags.
 */
export function tagChrome(context: iD.Context, entityID: string, keys: string[] | ((key: string) => boolean), annotation: string,
    info?: InfoTopic): FieldChrome {
    const entity = context.hasEntity(entityID as OsmEntity['id']);
    if (!entity) return { info };
    const base = context.graph().base().entities[entityID as OsmEntity['id']] as OsmEntity | undefined;
    const pick = (tags: Tags) => typeof keys === 'function' ? Object.keys(tags).filter(keys) : keys;
    const own = pick(entity.tags);
    const all = [...new Set([...own, ...(base ? pick(base.tags) : [])])];
    const present = own.some(key => entity.tags[key] !== undefined);
    const modified = all.some(key => entity.tags[key] !== base?.tags[key]);
    const write = (fill: (key: string) => string | undefined) => {
        const next = { ...entity.tags };
        for (const key of all) {
            const value = fill(key);
            if (value === undefined) delete next[key];
            else next[key] = value;
        }
        context.perform(actionChangeTags(entityID as OsmEntity['id'], next), annotation);
    };
    return {
        info,
        present,
        onRemove: () => write(() => undefined),
        modified,
        onRevert: () => write(key => base?.tags[key])
    };
}

/** An option for `moreFields`: a field that is left out until it is tagged or picked */
export interface MoreField {
    id: string;
    title: string;
    show: () => void;
}

/**
 * iD's "Add field:" dropdown, for the fields of a section that are left out until they are tagged or picked, so the
 * sidebar shows what is there and what is usually needed
 */
export function moreFields(context: iD.Context, parent: Selection, id: string, items: MoreField[]) {
    if (!items.length) return;
    const more = parent.append('div').attr('class', `more-fields lane-more-fields lane-more-fields-${id}`).append('label');
    more.append('span').text(t('inspector.add_fields'));
    const titles = items.map(item => item.title);
    const input = more.append('input')
        .attr('class', 'value')
        .attr('type', 'text')
        .attr('placeholder', titles.slice(0, 3).join(', ') + (titles.length > 3 ? '…' : ''))
        .call(utilNoAuto as any);
    input.call((uiCombobox(context, `lane-more-${id}`) as any)
        .data(items.map(item => ({ value: item.title, title: item.title, item })))
        .minItems(1)
        .on('accept', (d: { item: MoreField } | undefined) => {
            if (d?.item) d.item.show();
        }));
    return more;
}


export interface LaneFieldOptions extends FieldChrome {
    /** a CSS-safe id for the field */
    id: string;
    label: string;
    /** shared value of the selected lanes; undefined when they differ */
    value: string | undefined;
    suggestions: { value: string; title?: string }[];
    /**
     * only the suggestions can be picked, from a list that can't be typed in (as iD's fields with a fixed set of
     * values); the input shows each one's title, and an empty value is offered as `emptyTitle`
     */
    strict?: boolean;
    emptyTitle?: string;
    /** the hint shown while it is empty, when not the first suggestions (as iD's fields) */
    placeholder?: string;
    disabled?: boolean;
    disabledReason?: string;
    onChange: (value: string) => void;
}

/**
 * A field's placeholder as iD's combo fields have it: the first few suggestions, then an ellipsis
 * ("Yes, No, Separate…"), or iD's "Multiple values" when the selected lanes differ
 */
export function fieldPlaceholder(suggestions: { value: string; title?: string }[], mixed = false, given?: string): string {
    if (mixed) return t('inspector.multiple_values');
    const text = given ?? suggestions.map(s => s.title ?? s.value).filter(v => v && v.length < 20).slice(0, 3).join(', ');
    return !text || /(…|\.\.\.)$/.test(text) ? text : `${text}…`;
}

/**
 * A field laid out like iD's own preset fields: a label row and an input with iD's combobox,
 * which suggests values as you type, or (strict) a dropdown of fixed choices.
 * Without its own `onRemove`, the bin empties the field.
 */
export function laneField(context: iD.Context, parent: Selection, options: LaneFieldOptions) {
    const { field, wrap } = fieldShell(parent, {
        id: options.id,
        label: options.label,
        labelFor: `lane-field-${options.id}`,
        info: options.info,
        present: options.present ?? (options.value === undefined || !!options.value),
        onRemove: options.disabled ? undefined : options.onRemove ?? (() => options.onChange('')),
        modified: options.modified,
        onRevert: options.onRevert
    });
    laneInput(context, wrap, options);
    return field;
}

/** The input of a lane field, with its combobox, in a wrap of iD's (a field's, or a row of a two-sided field's) */
export function laneInput(context: iD.Context, wrap: Selection, options: Omit<LaneFieldOptions, 'label'>) {
    // in a strict field the input shows a choice's title, and the value written is the choice's
    const choices = options.strict
        ? [{ value: '', title: options.emptyTitle ?? '' }, ...options.suggestions].filter(c => c.value || c.title)
        : options.suggestions;
    const shown = (value: string | undefined) =>
        options.strict && value ? choices.find(c => c.value === value)?.title ?? value : value ?? '';
    const valueOf = (text: string) => {
        if (!options.strict) return text;
        const choice = choices.find(c => (c.title ?? c.value) === text || c.value === text);
        return choice ? choice.value : text;
    };

    const input = wrap.append('input')
        .attr('type', 'text')
        .attr('id', `lane-field-${options.id}`)
        .attr('class', 'lane-field-input')
        .attr('placeholder', fieldPlaceholder(options.suggestions, options.value === undefined, options.placeholder) || null)
        .attr('title', options.disabled ? options.disabledReason ?? null : null)
        .attr('readonly', options.strict ? 'readonly' : null)
        .property('disabled', !!options.disabled)
        .call(utilNoAuto as any);
    utilGetSetValue(input as any, shown(options.value));

    if (!options.disabled && choices.length) {
        input.call((uiCombobox(context, `lane-${options.id}`) as any)
            // a title (a value with its unit) is what the list shows; the value is what is written
            .data(choices.map(s => ({
                value: options.strict ? s.title ?? s.value : s.value,
                title: s.title ?? s.value,
                display: s.title ? (label: Selection) => label.text(s.title!) : undefined
            })))
            .minItems(1), wrap);
    }

    // a pick fires change, then blur as the sidebar redraws: write each new value once
    let written = options.value ?? '';
    const change = function(this: HTMLInputElement) {
        const value = valueOf(context.cleanTagValue((utilGetSetValue(input as any) as string).trim()));
        if (value === written) return;
        written = value;
        options.onChange(value);
    };
    input.on('change', change).on('blur', change);
    return input;
}

export interface SidedFieldRow extends Omit<LaneFieldOptions, 'label' | keyof FieldChrome> {
    /** the row's label: the side */
    label: string;
}

/**
 * A field with one dropdown per side, laid out as iD's own two-sided fields (such as its cycle lane field): the
 * field's label, then a row for each side with its label beside its dropdown
 */
export function sidedField(context: iD.Context, parent: Selection, id: string, label: string, rows: SidedFieldRow[], chrome: FieldChrome = {}) {
    const { field, wrap } = fieldShell(parent, {
        ...chrome, id, label, labelFor: `lane-field-${rows[0]?.id}`, wrapClass: 'form-field-input-directionalcombo'
    });
    sidedRows(context, wrap, rows);
    return field;
}

/** The rows of a two-sided field: each side's label beside its dropdown, as in iD's cycle lane field */
export function sidedRows(context: iD.Context, wrap: Selection, rows: SidedFieldRow[]) {
    const list = wrap.append('ul').attr('class', 'rows rows-table');
    for (const row of rows) {
        const item = list.append('li').attr('class', 'labeled-input');
        item.append('div').attr('class', 'label').text(row.label);
        laneInput(context, item.append('div').attr('class', 'form-field-input-wrap'), row);
    }
    return list;
}

/**
 * A row of toggle buttons in a field, as iD's radio fields offer choices: icons or text, the one tagged now pressed.
 * A pick that is already pressed does nothing; `onPick` writes the new one.
 */
export function choiceButtons<T extends string>(wrap: Selection, choices: { value: T; label: string; icon?: (button: Selection) => void;
    disabled?: boolean; tip?: string }[], current: T | undefined, onPick: (value: T) => void) {
    const row = wrap.append('div').attr('class', 'lane-buttons lane-choice-buttons').attr('role', 'group');
    for (const choice of choices) {
        const pressed = choice.value === current;
        const button = row.append('button')
            .attr('type', 'button')
            .attr('class', `lane-choice lane-choice-${choice.value}` + (pressed ? ' active' : '') + (choice.icon ? ' lane-choice-icon' : ''))
            .attr('aria-pressed', pressed)
            .attr('aria-label', choice.label)
            .attr('title', choice.tip ?? choice.label)
            .attr('disabled', choice.disabled ? true : null)
            .on('click', () => {
                if (!pressed) onPick(choice.value);
            });
        if (choice.icon) choice.icon(button);
        else button.text(choice.label);
    }
    return row;
}

/** A note under a field, in iD's quiet text */
export function fieldNote(parent: Selection, text: string, cls = '') {
    return parent.append('p').attr('class', 'lanes-note' + (cls ? ` ${cls}` : '')).text(text);
}


/* ---------- suggestions ---------- */

const accessValues = ['yes', 'no', 'designated', 'permissive', 'destination', 'delivery', 'private', 'customers', 'permit'];
const surfaceValues = ['asphalt', 'concrete', 'concrete:plates', 'paving_stones', 'sett', 'unhewn_cobblestone', 'compacted', 'fine_gravel', 'gravel', 'grass_paver'];
const widthValues = ['2.5', '2.75', '3', '3.25', '3.5', '3.65', '3.75', '4'];
const limitValues = { maxwidth: ['2', '2.1', '2.2', '2.3', '2.5', '3'], maxheight: ['2.1', '3', '3.5', '4', '4.5', '5'] };
/** Width and height limits as posted in feet and inches where roads are signed in mph */
const imperialLimits = { maxwidth: ['6\'6"', '7\'0"', '7\'6"'], maxheight: ['7\'0"', '12\'0"', '13\'0"', '14\'6"', '16\'6"'] };
/** Common weight limits in tonnes */
const weightValues = ['3.5', '7.5', '16', '18', '44'];

/** A feet-and-inches value (`14'6"`) in metres */
function feetToMetres(value: string): number | null {
    const m = value.match(/^(\d+)'(?:(\d+)")?$/);
    return m ? (parseInt(m[1], 10) * 12 + parseInt(m[2] ?? '0', 10)) * 0.0254 : null;
}

/** Width or height limits with their units: metres, and feet and inches in mph countries */
function limitSuggestions(key: 'maxwidth' | 'maxheight', way: osmWay, graph: coreGraph): { value: string; title: string }[] {
    const metric = limitValues[key].map(value => ({ value, title: `${value} m` }));
    if (!usesMph(way, graph)) return metric;
    return [...metric, ...imperialLimits[key].map(value => ({ value, title: `${value} (${feetToMetres(value)!.toFixed(2)} m)` }))];
}

function usesMph(way: osmWay, graph: coreGraph): boolean {
    const node = graph.hasEntity(way.nodes[Math.floor(way.nodes.length / 2)]) as osmNode | undefined;
    return node ? countryCoder.roadSpeedUnit(node.loc) === 'mph' : false;
}

/** Speed values in the units used where the road is */
function speedValues(way: osmWay, graph: coreGraph): string[] {
    return usesMph(way, graph)
        ? [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70].map(v => `${v} mph`)
        : [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map(String);
}

/** Values of a lane key already used on this and nearby roads, most common first */
function nearbyValues(context: iD.Context, way: osmWay, base: string): string[] {
    const graph = context.graph();
    const counts = new Map<string, number>();
    const extent = way.extent(graph).padByMeters(500);
    for (const entity of context.history().intersects(extent)) {
        if (entity.type !== 'way') continue;
        for (const [key, value] of Object.entries(entity.tags)) {
            if (key !== base && !key.startsWith(`${base}:lanes`) && !key.startsWith(`${base}:`)) continue;
            if (base === 'destination' && key.startsWith('destination:') && !key.startsWith('destination:lanes')) continue;
            for (const slot of splitLaneValue(value)) {
                for (const part of slot.split(';')) {
                    const v = part.trim();
                    if (v && v !== 'none') counts.set(v, (counts.get(v) ?? 0) + 1);
                }
            }
        }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 30);
}

/** Suggestions for a lane key: fixed lists for known keys, values seen nearby for the rest */
export function laneSuggestions(context: iD.Context, way: osmWay, key: string): { value: string; title?: string }[] {
    const base = key.replace(/:lanes.*$/, '');
    const graph = context.graph();
    let values: string[];
    switch (base) {
        case 'maxspeed':
        case 'minspeed': values = speedValues(way, graph); break;
        case 'access':
        case 'motor_vehicle':
        case 'vehicle':
        case 'bus':
        case 'psv':
        case 'hgv':
        case 'bicycle': values = accessValues; break;
        case 'surface': values = surfaceValues; break;
        case 'width': values = widthValues; break;
        case 'maxwidth':
        case 'maxheight': return limitSuggestions(base, way, graph);
        case 'maxweight': return weightValues.map(value => ({ value, title: `${value} t` }));
        case 'destination': values = nearbyValues(context, way, 'destination'); break;
        case 'destination:ref': values = [...new Set([...nearbyValues(context, way, 'destination:ref'), ...nearbyValues(context, way, 'ref')])]; break;
        default: values = nearbyValues(context, way, base);
    }
    return values.map(value => ({ value }));
}


/* ---------- arrows for the sidebar ---------- */

/**
 * Draws a lane's turn arrows with the same symbols as the map, pointing the way its traffic travels
 * as seen looking along the road: up for forward lanes, down for backward lanes, both for centre lanes.
 */
export function laneArrowIcon(selection: Selection, turnSlot: string, direction: LaneDirection | 'travel', size = 26,
    driveSide: 'left' | 'right' = 'right') {
    const svg = selection.append('svg')
        .attr('class', 'lane-arrow-icon')
        .attr('width', size)
        .attr('height', size)
        .attr('viewBox', '-13 -13 26 26');
    const values = parseTurn(turnSlot);
    const draw = (rotation: number, opacity: number) => {
        const g = svg.append('g').attr('transform', `rotate(${rotation})`).attr('opacity', opacity);
        if (!values.length) {
            // no arrows painted: a plain stem shows the direction of travel
            g.append('path').attr('d', 'M0 10V-8M-3 -5L0 -9L3 -5').attr('class', 'lane-arrow-none')
                .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.4).attr('opacity', 0.5);
            return;
        }
        for (const value of values) {
            const symbol = turnArrowSymbol(value, driveSide);
            if (!symbol) continue;
            g.append('use').attr('href', `#${symbol.id}`).attr('transform', symbol.mirror ? 'scale(-1,1)' : null);
        }
    };
    if (direction === 'backward') draw(180, 1);
    else if (direction === 'both_ways') {
        draw(0, 1);
        draw(180, 0.55);
    } else draw(0, 1);
    return svg;
}


/**
 * A lane change button's icon: a lane line beside the lane, dashed when traffic may cross it and solid
 * when it may not, and an arrow moving over it to that side. Beside the centre line the line is double (overtaking);
 * beside the kerb it is the kerb, with nothing to move into.
 */
export function laneChangeIcon(selection: Selection, toLeft: boolean, allowed: boolean, size = 24, beside: 'lane' | 'centre' | 'kerb' = 'lane') {
    const svg = selection.append('svg')
        .attr('class', `lane-change-icon lane-change-icon-${beside}`)
        .attr('width', size)
        .attr('height', size)
        .attr('viewBox', '-12 -12 24 24');
    const g = svg.append('g').attr('transform', toLeft ? null : 'scale(-1,1)');
    const line = (x: number, dashed: boolean, width = 2) => g.append('path').attr('d', `M${x} -11V11`)
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', width)
        .attr('stroke-dasharray', dashed ? '3.5 2.5' : null);
    if (beside === 'kerb') {
        line(-4, false, 3.5);
        return svg;
    }
    if (beside === 'centre') {
        line(-5.5, allowed, 1.6);
        line(-2.5, allowed, 1.6);
    } else line(-4, allowed);
    g.append('path').attr('d', 'M6 10C6 2 2 -3 -8 -5M-8 -5L-4 -9M-8 -5L-4 -1')
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.8)
        .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
        .attr('opacity', allowed ? 1 : 0.45);
    if (!allowed) {
        // a cross over the arrow where it would meet the line
        g.append('path').attr('d', 'M-8 -2L-1 5M-1 -2L-8 5')
            .attr('stroke', '#d6342c').attr('stroke-width', 2).attr('stroke-linecap', 'round');
    }
    return svg;
}


export interface CompactChoice<T extends string> {
    value: T;
    label: string;
    /** draws the choice's picture (a roundel, a centre line) into a small box */
    icon?: (box: Selection) => void;
    /** other words that pick it when typed (`30`, `nsl`) */
    terms?: string[];
}

/**
 * A choice made in one compact row, in place of a row of buttons: the picture of what is chosen now, and iD's
 * combobox showing its name, listing every choice with its picture. Typing completes a choice's name; what is typed is
 * matched to a choice by its name, value or terms (case aside), else by the one name it starts, else by `custom`
 * (a typed number becoming a speed). Anything else puts back what was there.
 */
export function compactChoice<T extends string>(context: iD.Context, wrap: Selection, options: {
    id: string;
    choices: CompactChoice<T>[];
    /** chosen now; undefined when nothing is (or the selection differs) */
    current: T | undefined;
    placeholder?: string;
    custom?: (text: string) => T | undefined;
    onPick: (value: T) => void;
}) {
    const row = wrap.append('div').attr('class', `lane-compact-choice lane-compact-${options.id}`);
    const chosen = options.choices.find(c => c.value === options.current);
    const iconBox = row.append('span').attr('class', 'lane-compact-icon').attr('aria-hidden', 'true');
    if (chosen?.icon) chosen.icon(iconBox);
    else iconBox.classed('empty', true);

    const input = row.append('input')
        .attr('type', 'text')
        .attr('id', `lane-field-${options.id}`)
        .attr('class', 'lane-field-input lane-compact-input')
        .attr('placeholder', options.placeholder ?? fieldPlaceholder(options.choices.map(c => ({ value: c.value, title: c.label }))))
        .call(utilNoAuto as any);
    utilGetSetValue(input as any, chosen?.label ?? '');

    const options_ = options.choices.map(c => ({
        value: c.label,
        title: c.label,
        words: [c.label, c.value, ...(c.terms ?? [])].map(word => word.toLowerCase()),
        display: (label: Selection) => {
            const box = label.append('span').attr('class', 'lane-compact-option-icon');
            c.icon?.(box);
            label.append('span').text(c.label);
        }
    }));
    // typed text finds a choice by its name, tag value or terms (`nsl`, `30`), whole words first
    const matching = (typed: string) => {
        const lower = typed.trim().toLowerCase();
        if (!lower) return options_;
        const exact = options_.filter(o => o.words.includes(lower));
        return [...exact, ...options_.filter(o => !exact.includes(o) && o.words.some(word => word.includes(lower)))];
    };
    const combobox = (uiCombobox(context, `lane-compact-${options.id}`) as any)
        .fetcher((typed: string, done: (results: typeof options_) => void) => done(matching(typed)))
        .caseSensitive(false)
        .minItems(1);
    input.call(combobox, row);

    // the typed text's choice: one it names exactly, else a custom value (`25 mph`), else the first one listed
    const pick = (text: string): T | undefined => {
        const lower = text.trim().toLowerCase();
        if (!lower) return undefined;
        const listed = matching(lower);
        const exact = listed.find(o => o.words.includes(lower));
        const custom = exact ? undefined : options.custom?.(text.trim());
        if (custom) return custom;
        const found = exact ?? listed[0];
        return found ? options.choices[options_.indexOf(found)].value : undefined;
    };
    let written = options.current;
    const change = () => {
        const value = pick(utilGetSetValue(input as any) as string);
        if (value === undefined) {
            utilGetSetValue(input as any, chosen?.label ?? '');
            return;
        }
        if (value === written) return;
        written = value;
        options.onPick(value);
    };
    // the combobox stops the browser's change event on Return, and says so with accept
    combobox.on('accept', change);
    input.on('change', change).on('blur', change);
    return row;
}
