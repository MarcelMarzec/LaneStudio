import * as countryCoder from '@rapideditor/country-coder';

import type { coreGraph } from '../../core/graph';
import { t } from '../../core/localizer';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { uiCombobox } from '../../ui/combobox';
import { utilGetSetValue, utilNoAuto } from '../../util';
import { parseTurn, splitLaneValue, type LaneDirection } from '../model';
import { turnArrowSymbol } from '../svg/defs';

type Selection = d3.Selection<any>;

export interface LaneFieldOptions {
    /** a CSS-safe id for the field */
    id: string;
    label: string;
    /** shared value of the selected lanes; undefined when they differ */
    value: string | undefined;
    suggestions: { value: string; title?: string }[];
    disabled?: boolean;
    disabledReason?: string;
    onChange: (value: string) => void;
}

/**
 * A field laid out like iD's own preset fields: a label row and an input with iD's combobox,
 * which suggests values as you type.
 */
export function laneField(context: iD.Context, parent: Selection, options: LaneFieldOptions) {
    const field = parent.append('div').attr('class', `form-field lane-form-field form-field-lane-${options.id}`);
    const label = field.append('label').attr('class', 'field-label').attr('for', `lane-field-${options.id}`);
    label.append('span').attr('class', 'label-text')
        .append('span').attr('class', 'label-textvalue').text(options.label);

    const wrap = field.append('div').attr('class', 'form-field-input-wrap');
    const input = wrap.append('input')
        .attr('type', 'text')
        .attr('id', `lane-field-${options.id}`)
        .attr('class', 'lane-field-input')
        .attr('placeholder', options.value === undefined ? t('_lanes.inspector.mixed') : null)
        .attr('title', options.disabled ? options.disabledReason ?? null : null)
        .property('disabled', !!options.disabled)
        .call(utilNoAuto as any);
    utilGetSetValue(input as any, options.value ?? '');

    if (!options.disabled && options.suggestions.length) {
        input.call((uiCombobox(context, `lane-${options.id}`) as any)
            // a title (a value with its unit) is what the list shows; the value is what is written
            .data(options.suggestions.map(s => ({
                value: s.value,
                title: s.title ?? s.value,
                display: s.title ? (label: Selection) => label.text(s.title!) : undefined
            })))
            .minItems(1), field);
    }

    const change = function(this: HTMLInputElement) {
        const value = context.cleanTagValue((utilGetSetValue(input as any) as string).trim());
        if (value === (options.value ?? '')) return;
        options.onChange(value);
    };
    input.on('change', change).on('blur', change);
    return field;
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
export function laneArrowIcon(selection: Selection, turnSlot: string, direction: LaneDirection | 'travel', size = 26) {
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
            const symbol = turnArrowSymbol(value);
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
 * when it may not, and an arrow moving over it to that side
 */
export function laneChangeIcon(selection: Selection, toLeft: boolean, allowed: boolean, size = 24) {
    const svg = selection.append('svg')
        .attr('class', 'lane-change-icon')
        .attr('width', size)
        .attr('height', size)
        .attr('viewBox', '-12 -12 24 24');
    const g = svg.append('g').attr('transform', toLeft ? null : 'scale(-1,1)');
    g.append('path').attr('d', 'M-4 -11V11')
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 2)
        .attr('stroke-dasharray', allowed ? '3.5 2.5' : null);
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
