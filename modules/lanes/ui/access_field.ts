import { dispatch as d3_dispatch } from 'd3-dispatch';
import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiCombobox } from '../../ui/combobox';
import { utilGetSetValue, utilNoAuto } from '../../util';
import {
    accessDefaultRows, accessFor, accessModes, accessParts, accessSizeOrder, accessValuesFor, impliedAccess, taggedAccessKeys,
    type AccessSuffix
} from '../model/access';

type Selection = d3.Selection<any>;

/*
 * iD's Allowed Access field, as Lane Studio draws it (wiki: Key:access): a row for each of the preset's transport modes
 * (all, foot, motor vehicles, bicycles, horses), and for every other access key tagged, each with the values the wiki
 * lists for it and what they mean; the value a mode gets from the keys above it as its placeholder (an HGV row shows
 * the motor vehicle value). "Add access type" adds a row for any mode the wiki lists, or for one direction of a mode
 * already shown (`hgv:forward`) or its conditional restriction (`hgv:conditional`). iD's markup and combobox throughout.
 */

const suffixName: Record<Exclude<AccessSuffix, ''>, string> = {
    ':forward': 'forward', ':backward': 'backward', ':conditional': 'conditional',
    ':forward:conditional': 'forward_conditional', ':backward:conditional': 'backward_conditional'
};

/** A mode's name (`hgv` → Heavy goods vehicles) */
export const accessModeName = (mode: string) => t(`_lanes.access_field.modes.${mode.replace(/:/g, '_')}`);

/**
 * The compass point a way heads towards, from its first node to its last (`north_east`), or null when not one way: the
 * direction `:forward` keys are for (`:backward`, the opposite one)
 */
export function wayHeading(loc: (id: string) => [number, number] | undefined, nodes: string[] | undefined): string | null {
    const [a, b] = nodes?.length ? [loc(nodes[0]), loc(nodes[nodes.length - 1])] : [undefined, undefined];
    if (!a || !b || (a[0] === b[0] && a[1] === b[1])) return null;
    const east = (b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180);
    const angle = (Math.atan2(east, b[1] - a[1]) * 180 / Math.PI + 360) % 360;
    return ['north', 'north_east', 'east', 'south_east', 'south', 'south_west', 'west', 'north_west'][Math.round(angle / 45) % 8];
}

const opposite = (heading: string) => {
    const points = ['north', 'north_east', 'east', 'south_east', 'south', 'south_west', 'west', 'north_west'];
    return points[(points.indexOf(heading) + 4) % 8];
};

/**
 * An access key's name: its mode's, with the direction or condition it is for; a direction by the compass point it
 * heads to when the way is known (`hgv:forward` on a way drawn north-east: HGVs heading north-east)
 */
export function accessKeyName(key: string, heading: string | null = null): string {
    const parts = accessParts(key);
    if (!parts) return key;
    const mode = accessModeName(parts.mode);
    if (!parts.suffix) return mode;
    const direction = parts.suffix.startsWith(':forward') ? heading : parts.suffix.startsWith(':backward') && heading ? opposite(heading) : null;
    if (direction) {
        return t(`_lanes.access_field.suffix.${parts.suffix.endsWith(':conditional') ? 'heading_conditional' : 'heading'}`,
            { mode, heading: t(`_lanes.access_field.compass.${direction}`) });
    }
    return t(`_lanes.access_field.suffix.${suffixName[parts.suffix]}`, { mode });
}

/** What a direction or condition row is for, in words (shown under it in "Add access type") */
function accessKeyDescription(key: string): string | undefined {
    const parts = accessParts(key);
    if (!parts?.suffix) return undefined;
    const kind = parts.suffix.startsWith(':forward') ? 'forward' : parts.suffix.startsWith(':backward') ? 'backward' : 'conditional';
    return t(`_lanes.access_field.suffix_help.${kind}`, { key });
}

/** Where a key sorts: everyone first, then the biggest vehicles down to people on foot; a mode's directions and conditions after it */
function sizeRank(key: string): number {
    const parts = accessParts(key);
    if (!parts) return 1e6;
    const at = accessSizeOrder.indexOf(parts.mode);
    const order: AccessSuffix[] = ['', ':forward', ':backward', ':conditional', ':forward:conditional', ':backward:conditional'];
    return (at < 0 ? accessSizeOrder.length : at) * 10 + order.indexOf(parts.suffix);
}

/** Examples of conditional values offered (wiki: Conditional restrictions) */
const conditionalExamples = ['no @ (Mo-Fr 07:00-19:00)', 'destination @ (weight>7.5)', 'delivery @ (Mo-Sa 07:00-10:00)', 'yes @ (Su)'];

/** The field type, in place of iD's `access` type */
export function uiFieldLanesAccess(field: any, context: iD.Context) {
    const dispatch = d3_dispatch('change');
    let _wrap: Selection | null = null;
    let _tags: Record<string | symbol, any> = {};
    // modes added with "Add access type", shown until another feature is selected
    let _added: string[] = [];
    let _entityIDs: string[] = [];
    let _shown: string[] = [];
    let _addOptions: ReturnType<typeof addOptions> = [];

    /** All the tags of the selection: one feature's, or each of several */
    const allTags = (): Tags[] => (_tags[Symbol.for('allTags')] as Tags[] | undefined) ?? [_tags as Tags];

    /** The rows: everyone, HGVs, cars, bicycles and pedestrians, every access key tagged on any selected feature, and those added */
    function rowKeys(): string[] {
        const tagged = new Set(allTags().flatMap(taggedAccessKeys));
        const keys = [...new Set<string>([...accessDefaultRows, ...tagged, ..._added])];
        return keys.sort((a, b) => sizeRank(a) - sizeRank(b));
    }

    /** The way the field is for, when one way is selected: the compass point it heads to */
    function heading(): string | null {
        const way = _entityIDs.length === 1 ? context.hasEntity(_entityIDs[0] as any) as any : undefined;
        if (way?.type !== 'way') return null;
        return wayHeading(id => (context.hasEntity(id as any) as any)?.loc, way.nodes);
    }

    function valueOptions(key: string) {
        const parts = accessParts(key);
        if (parts?.suffix.endsWith(':conditional')) {
            return conditionalExamples.map(value => ({ value, title: t('_lanes.access_field.conditional_example') }));
        }
        return accessValuesFor(parts?.mode ?? key).map(value => ({
            value,
            title: t(`_lanes.access_field.values.${value}`),
            description: t(`_lanes.access_field.values.${value}`)
        }));
    }

    function change(this: HTMLInputElement, _event: Event, key: string) {
        const value = context.cleanTagValue(utilGetSetValue(d3_select(this)) as string);
        // don't override several values with a blank one
        if (!value && typeof _tags[key] !== 'string') return;
        if ((value || undefined) === _tags[key]) return;
        dispatch.call('change', this, { [key]: value || undefined });
    }

    function render() {
        const wrap = _wrap;
        if (!wrap) return;
        let list = wrap.selectAll<HTMLUListElement, unknown>('ul.rows').data([0]);
        list = list.enter().append('ul').attr('class', 'rows lanes-access-rows').merge(list as any) as any;

        const items = list.selectAll<HTMLLIElement, string>('li.labeled-input').data(rowKeys(), d => d);
        items.exit().remove();
        const enter = items.enter().insert('li', 'li.lanes-access-add')
            .attr('class', d => `labeled-input preset-access-${d.replace(/:/g, '-')}`);
        enter.append('div')
            .attr('class', 'label preset-label-access')
            .attr('title', d => d)
            .text(d => accessKeyName(d, heading()));
        enter.append('div')
            .attr('class', 'preset-input-access-wrap')
            .append('input')
            .attr('type', 'text')
            .attr('class', d => `preset-input-access preset-input-access-${d.replace(/:/g, '-')}`)
            .attr('aria-label', d => accessKeyName(d, heading()))
            .call(utilNoAuto as any)
            .each(function(this: HTMLInputElement, d) {
                // (the combobox stops the browser's change event on Return, and says so with accept)
                const accept = change.bind(this);
                d3_select(this).call((uiCombobox(context, `access-${d.replace(/:/g, '-')}`) as any)
                    .data(valueOptions(d)).caseSensitive(false)
                    .on('accept', () => accept(new Event('change'), d)), d3_select(this.parentNode!.parentNode as Element));
            })
            .on('change', change)
            .on('blur', change);
        items.merge(enter).order();
        // the add row stays last (moved only when a row is added after it: moving it would blur its input as it is typed in)
        const addRow = list.select<HTMLLIElement>('li.lanes-access-add').node();
        if (addRow && addRow.nextSibling) list.node()!.appendChild(addRow);

        // "Add access type": any mode not shown, or a direction or condition of one shown
        const add = list.selectAll<HTMLLIElement, unknown>('li.lanes-access-add').data([0]);
        const addEnter = add.enter().append('li').attr('class', 'lanes-access-add');
        addEnter.append('input')
            .attr('type', 'text')
            .attr('class', 'lanes-access-add-input')
            .attr('placeholder', t('_lanes.access_field.add_placeholder'))
            .attr('aria-label', t('_lanes.access_field.add'))
            .call(utilNoAuto as any);
        _shown = rowKeys();
        _addOptions = addOptions(_shown);
        // (made once: the options are looked up as they stand when typed)
        addEnter.select<HTMLInputElement>('input').each(function(this: HTMLInputElement) {
            const input = d3_select(this);
            const combobox = (uiCombobox(context, 'access-add') as any)
                .fetcher((typed: string, done: (results: typeof _addOptions) => void) => {
                    const lower = typed.trim().toLowerCase();
                    if (!lower) return done(_addOptions);
                    // the mode typed exactly first (`horse`: Horses before Horse-drawn carriages), then names starting with it
                    const rank = (o: typeof _addOptions[number]) => (o.accessKey === lower || o.value.toLowerCase() === lower ? 0
                        : o.words.some(word => word.startsWith(lower)) ? 1 : 2);
                    done(_addOptions.filter(o => o.words.some(word => word.includes(lower))).sort((a, b) => rank(a) - rank(b)));
                })
                .caseSensitive(false)
                .minItems(1);
            input.call(combobox, d3_select(this.parentNode as Element));
            const pick = () => {
                const typed = (utilGetSetValue(input as any) as string).trim();
                if (!typed) return;
                const lower = typed.toLowerCase();
                const found = _addOptions.find(o => o.value.toLowerCase() === lower || o.accessKey === lower);
                const key = found?.accessKey ?? (accessParts(typed) ? typed : undefined);
                utilGetSetValue(input as any, '');
                if (!key || _shown.includes(key)) return;
                _added = [..._added, key];
                render();
                access.tags(_tags);
                // (querySelector: d3's select would give the input the field's datum in place of its key)
                (_wrap?.node() as HTMLElement | null)?.querySelector<HTMLInputElement>(`input.preset-input-access-${key.replace(/:/g, '-')}`)?.focus();
            };
            combobox.on('accept', pick);
            input.on('change', pick);
        });
    }

    /** What "Add access type" offers, biggest first: each mode not shown; a direction or condition of each shown */
    function addOptions(shown: string[]) {
        const towards = heading();
        const modes = accessModes.map(mode => mode.key).filter(key => !shown.includes(key));
        const variants = shown.filter(key => accessParts(key)?.suffix === '').flatMap(key =>
            ([':forward', ':backward', ':conditional'] as const).map(suffix => `${key}${suffix}`).filter(variant => !shown.includes(variant)));
        return [...modes, ...variants].sort((a, b) => sizeRank(a) - sizeRank(b)).map(key => {
            const name = accessKeyName(key, towards);
            const description = accessKeyDescription(key);
            return {
                // (not `key`: iD's combobox would complete typed text to it)
                accessKey: key,
                value: name,
                title: key,
                words: [name.toLowerCase(), key, key.replace(/[_:]/g, ' '), ...(description ? [description.toLowerCase()] : [])],
                display: (selection: Selection) => {
                    selection.append('span').text(name);
                    selection.append('span').attr('class', 'lanes-access-option-note').text(` ${key}`);
                },
                description
            };
        });
    }

    const access: any = (selection: Selection) => {
        let wrap = selection.selectAll<HTMLDivElement, unknown>('.form-field-input-wrap').data([0]);
        wrap = wrap.enter().append('div')
            .attr('class', `form-field-input-wrap form-field-input-${field.type} lanes-access-field`)
            .merge(wrap as any) as any;
        _wrap = wrap;
        render();
    };

    access.tags = (tags: Record<string | symbol, any>) => {
        const before = rowKeys().join();
        _tags = tags;
        if (rowKeys().join() !== before) render();
        const items = _wrap?.selectAll<HTMLInputElement, string>('.preset-input-access');
        if (!items) return access;
        const placeholders = (key: string) => [...new Set(allTags().map(each => placeholderFor(each, key)))];
        (utilGetSetValue as any)(items, (key: string) => (typeof tags[key] === 'string' ? tags[key] : ''))
            .classed('mixed', (key: string) => Array.isArray(tags[key]) || placeholders(key).length > 1)
            .attr('title', (key: string) => (Array.isArray(tags[key]) ? tags[key].filter(Boolean).join('\n') : null))
            .attr('placeholder', (key: string) => {
                const values = placeholders(key);
                return values.length === 1 ? values[0] : t('inspector.multiple_values');
            });
        return access;
    };

    /** A row's placeholder: what the mode gets from the keys above it, or from the kind of road or barrier */
    function placeholderFor(tags: Tags, key: string): string {
        const parts = accessParts(key);
        if (!parts) return field.placeholder();
        if (parts.suffix.endsWith(':conditional')) return t('_lanes.access_field.conditional_placeholder');
        const direction = parts.suffix === ':forward' ? 'forward' : parts.suffix === ':backward' ? 'backward' : undefined;
        if (tags[key]) return tags[key];
        return accessFor(tags, parts.mode, direction)?.value ?? impliedAccess(tags, parts.mode) ?? field.placeholder();
    }

    access.entityIDs = (ids: string[]) => {
        if (ids.join() !== _entityIDs.join()) _added = [];
        _entityIDs = ids;
        return access;
    };

    access.focus = () => {
        (_wrap?.node() as HTMLElement | null)?.querySelector<HTMLInputElement>('.preset-input-access')?.focus();
    };

    access.on = (name: string, listener: any) => {
        dispatch.on(name as 'change', listener);
        return access;
    };

    return access;
}
