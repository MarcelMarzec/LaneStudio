import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiTooltip } from '../../ui/tooltip';
import { compactChoice } from './lane_fields';
import {
    isUkSpeedType, nationalTypes, parseSpeed, samePick, speedLimits, speedTypesFor, speedTypeValue, speedValues, ukSpeedTypes,
    type SpeedPick, type SpeedUnit, type UkSpeedType
} from '../model/speed_limits';

// the speed tag rules live in the model; the sidebar and the tool read them from here too
export * from '../model/speed_limits';

type Selection = d3.Selection<any>;

/** The national limit's white disc with a black band */
function nationalDisc(svg: Selection) {
    svg.append('circle').attr('r', 11.5).attr('class', 'roundel-disc');
    svg.append('path').attr('class', 'roundel-band').attr('d', 'M-8.5 4.8L4.8-8.5L8.5-4.8L-4.8 8.5Z');
    svg.append('circle').attr('r', 11.5).attr('class', 'roundel-edge');
}

/** A limit's number in a red ring, or for a minimum speed in white on a blue disc */
function numberRoundel(svg: Selection, n: number | string, minimum = false) {
    svg.append('circle').attr('r', 11.5).attr('class', minimum ? 'roundel-min-disc' : 'roundel-disc');
    if (!minimum) svg.append('circle').attr('r', 10).attr('class', 'roundel-ring');
    svg.append('text').attr('class', minimum ? 'roundel-number roundel-min-number' : 'roundel-number')
        .attr('text-anchor', 'middle').attr('dy', '0.36em')
        .attr('font-size', String(n).length >= 3 ? 8.5 : 10.5).text(n);
}

/**
 * A UK limit type as its sign, on a plate taller than a roundel: the national limit's disc over 60 or 70, a
 * motorway's blue sign over 70, a restricted road's 30 over a street lamp (its limit comes from the lighting), and
 * a 20 zone's roundel over ZONE
 */
function drawTypeSign(svg: d3.Selection<SVGSVGElement>, type: UkSpeedType) {
    svg.attr('viewBox', '-13 -13 26 36');
    const motorway = type === 'GB:motorway';
    svg.append('rect').attr('x', -12.5).attr('y', -12.5).attr('width', 25).attr('height', 35).attr('rx', 3)
        .attr('class', motorway ? 'roundel-plate roundel-plate-motorway' : 'roundel-plate');
    const caption = (text: string) => svg.append('text').attr('class', 'roundel-caption' + (motorway ? ' roundel-caption-motorway' : ''))
        .attr('text-anchor', 'middle').attr('y', 19.2).attr('font-size', text.length > 2 ? 5.2 : 8).text(text);
    if (motorway) {
        // the motorway symbol: a carriageway either side of the central reserve, under a bridge
        svg.append('path').attr('class', 'roundel-motorway-symbol')
            .attr('d', 'M-7 9L-2.2-4M7 9L2.2-4M0 9V5M0 2V-1M-8-6.5H8');
        caption(String(ukSpeedTypes[type].mph));
        return;
    }
    const sign = svg.append('g').attr('transform', 'scale(0.86) translate(0 -1)');
    if (nationalTypes.includes(type)) {
        nationalDisc(sign);
        caption(String(ukSpeedTypes[type].mph));
    } else {
        numberRoundel(sign, ukSpeedTypes[type].mph);
        if (type === 'GB:zone20') caption('ZONE');
        // a street lamp: restricted roads are 30 mph by their street lighting
        else svg.append('path').attr('class', 'roundel-lamp').attr('d', 'M-2 21.5V13.5Q-2 12 -0.5 12H3.5M2.2 12V13.6H4.8V12');
    }
}

/**
 * Another country's limit type: the limit it sets in a red ring (or as a value with no number), with the type's name
 * in small letters on a plate below it
 */
function drawCountryType(svg: d3.Selection<SVGSVGElement>, type: string) {
    svg.attr('viewBox', '-13 -13 26 36');
    svg.append('rect').attr('x', -12.5).attr('y', -12.5).attr('width', 25).attr('height', 35).attr('rx', 3).attr('class', 'roundel-plate');
    const sign = svg.append('g').attr('transform', 'scale(0.86) translate(0 -1)');
    const value = speedTypeValue(type);
    if (value === 'none' || value === 'walk') drawValue(sign, value);
    else numberRoundel(sign, value ? parseSpeed(value)?.n ?? '?' : '?');
    const name = type.split(':')[1].replace(/_/g, ' ');
    svg.append('text').attr('class', 'roundel-caption').attr('text-anchor', 'middle').attr('y', 19.2)
        // (sized to fit the plate's width)
        .style('font-size', `${Math.min(5.2, 40 / Math.min(name.length, 12)).toFixed(1)}px`).text(name.length > 12 ? name.slice(0, 11) + '…' : name);
}

/** A value with no number: no limit as the end of limits' disc with its band, walking pace as a walker on a disc */
function drawValue(svg: Selection, value: string) {
    if (value === 'none') {
        nationalDisc(svg);
        return;
    }
    svg.append('circle').attr('r', 11.5).attr('class', 'roundel-disc');
    svg.append('circle').attr('r', 10).attr('class', 'roundel-ring');
    svg.append('text').attr('class', 'roundel-number').attr('text-anchor', 'middle').attr('dy', '0.36em').attr('font-size', 6.5).text('walk');
}

/**
 * The roundel's picture: the number in a red ring, a limit type's sign, no limit (`none`) or walking pace, no limit
 * tagged as a dashed ring, or for a minimum speed the number in white on a blue disc
 */
function drawRoundel(svg: d3.Selection<SVGSVGElement>, pick: SpeedPick, minimum = false) {
    if (pick.kind === 'type') {
        if (isUkSpeedType(pick.type)) drawTypeSign(svg, pick.type);
        else drawCountryType(svg, pick.type);
        return;
    }
    svg.attr('viewBox', '-13 -13 26 26');
    if (pick.kind === 'none') {
        svg.append('circle').attr('r', 11).attr('class', 'roundel-none');
        svg.append('text').attr('class', 'roundel-none-text').attr('text-anchor', 'middle').attr('dy', '0.35em').text('—');
        return;
    }
    if (pick.kind === 'value') {
        drawValue(svg, pick.value);
        return;
    }
    numberRoundel(svg, pick.n, minimum);
}

/** A speed with its unit, for labels: `30 mph`, `50 km/h` */
export const speedText = (n: number, unit: SpeedUnit) => t(unit === 'mph' ? '_lanes.speed.mph' : '_lanes.speed.kmh', { n });

/** The name of a pick, for its tooltip and screen readers */
export function speedPickLabel(pick: SpeedPick, minimum = false, noneLabel?: string): string {
    if (pick.kind === 'speed') return minimum ? t('_lanes.speed.min_speed', { speed: speedText(pick.n, pick.unit) }) : speedText(pick.n, pick.unit);
    if (pick.kind === 'value') return t(`_lanes.speed.values.${pick.value}`);
    if (pick.kind === 'type') {
        if (isUkSpeedType(pick.type)) return t(`_lanes.speed.types.${pick.type.replace('GB:', '')}`, { mph: ukSpeedTypes[pick.type].mph });
        const [country, name] = pick.type.split(':');
        const value = speedTypeValue(pick.type);
        const speed = value ? parseSpeed(value) : null;
        return t('_lanes.speed.country_type', {
            name: t(`_lanes.speed.type_names.${name}`, { default: name.replace(/_/g, ' ') }), country,
            limit: speed ? speedText(speed.n, speed.unit) : value ? t(`_lanes.speed.values.${value}`, { default: value }) : pick.type
        });
    }
    return noneLabel ?? t(minimum ? '_lanes.speed.min_none' : '_lanes.speed.none');
}

export interface SpeedRoundelOptions {
    /** what is tagged now, highlighted; undefined when the selected lanes differ */
    current: SpeedPick | undefined;
    /** the unit the limits offered are in (mph unless given) */
    unit?: SpeedUnit;
    /**
     * offer the limit types of the road's country (`country`): the UK's national, motorway, restricted road and 20
     * zone, or the urban, rural, motorway… limits the wiki lists for others; and no limit (`none`) and walking pace
     */
    types?: boolean;
    /** the country the road is in, as its ISO code, for its limit types */
    country?: string;
    /** minimum speeds: blue roundels */
    minimum?: boolean;
    /** offer "no limit tagged" to clear it */
    none?: boolean;
    /** what clearing it means here, when not "no speed limit tagged" (a lane with none follows its road) */
    noneLabel?: string;
    /** the button size in pixels */
    size?: number;
    onPick: (pick: SpeedPick) => void;
}

/**
 * A row of speed limit roundels, as on UK signs: click one to set the limit; the one tagged now is highlighted
 */
/** The picks offered: the limits in the unit, the country's limit types and the values with no number, and none */
function offeredPicks(options: SpeedRoundelOptions): SpeedPick[] {
    const unit = options.unit ?? 'mph';
    return [
        ...speedLimits[unit].map(n => ({ kind: 'speed', n, unit } as SpeedPick)),
        ...(options.types ? speedTypesFor(options.country).map(type => ({ kind: 'type', type } as SpeedPick)) : []),
        ...(options.types && !options.minimum ? speedValues.map(value => ({ kind: 'value', value } as SpeedPick)) : []),
        ...(options.none ? [{ kind: 'none' } as SpeedPick] : [])
    ];
}

/** A pick's name in CSS classes */
const pickName = (pick: SpeedPick) => (pick.kind === 'speed' ? String(pick.n) : pick.kind === 'type' ? pick.type.replace(':', '-')
    : pick.kind === 'value' ? pick.value : pick.kind);

export function speedRoundels(parent: Selection, options: SpeedRoundelOptions) {
    const picks = offeredPicks(options);
    const size = options.size ?? 34;
    const row = parent.append('div').attr('class', 'speed-roundels' + (options.minimum ? ' speed-roundels-min' : '')).attr('role', 'radiogroup');
    for (const pick of picks) {
        const label = speedPickLabel(pick, options.minimum, options.noneLabel);
        const active = samePick(options.current, pick);
        const name = pickName(pick);
        const button = row.append('button')
            .attr('class', 'speed-roundel' + (active ? ' active' : '') + ` speed-roundel-${name}` + (pick.kind === 'type' ? ' speed-roundel-type' : ''))
            .attr('role', 'radio')
            .attr('aria-checked', active)
            .attr('aria-label', label)
            .on('click', () => options.onPick(pick))
            // (kept inside the sidebar or panel, as iD keeps its own tooltips inside their pane)
            .call((uiTooltip() as any).title(() => label).placement('top')
                .scrollContainer(function(this: HTMLElement) { return d3_select(this.closest('.sidebar') ?? this.parentElement); }));
        const svg = button.append('svg').attr('width', size)
            .attr('height', pick.kind === 'type' ? Math.round(size * 36 / 26) : size) as d3.Selection<SVGSVGElement>;
        drawRoundel(svg, pick, options.minimum);
    }
    return row;
}


/** A pick as a choice's value: `speed:30:mph`, `type:GB:nsl_single`, `value:none` or `none` */
const pickKey = (pick: SpeedPick) => (pick.kind === 'speed' ? `speed:${pick.n}:${pick.unit}` : pick.kind === 'type' ? `type:${pick.type}`
    : pick.kind === 'value' ? `value:${pick.value}` : 'none');
function keyPick(key: string): SpeedPick {
    if (key.startsWith('speed:')) {
        const [, n, unit] = key.split(':');
        return { kind: 'speed', n: Number(n), unit: unit as SpeedUnit };
    }
    if (key.startsWith('type:')) return { kind: 'type', type: key.slice(5) };
    if (key.startsWith('value:')) return { kind: 'value', value: key.slice(6) as 'none' | 'walk' };
    return { kind: 'none' };
}

/**
 * A speed limit picked in one compact row (as the sidebar's fields have it): the roundel of the limit chosen now and a
 * dropdown of every roundel, limit type and value. A typed number is in the unit used there (`25`), or in the unit
 * typed with it (`25 mph`, `40 km/h`), so limits no roundel shows can be set; `nsl`, `national`, `urban`, `motorway`,
 * `zone` and the like find the limit types.
 */
export function speedChoice(context: iD.Context, parent: Selection, id: string, options: SpeedRoundelOptions) {
    const unit = options.unit ?? 'mph';
    const picks = offeredPicks(options);
    // a limit tagged that no roundel shows is offered too, so it shows as chosen
    if (options.current && options.current.kind !== 'none' && !picks.some(p => samePick(p, options.current!))) picks.unshift(options.current);
    const terms = (pick: SpeedPick): string[] => {
        if (pick.kind === 'speed') return [String(pick.n), `${pick.n}${pick.unit === 'mph' ? 'mph' : 'km/h'}`];
        if (pick.kind === 'none') return ['none', 'no limit'];
        if (pick.kind === 'value') return pick.value === 'none' ? ['none', 'unlimited', 'no limit'] : ['walk', 'walking pace'];
        const short = pick.type.split(':')[1];
        return [pick.type, short, short.replace(/_/g, ' '), ...(short.startsWith('nsl') ? ['nsl', 'national'] : []),
            ...(short.startsWith('zone') ? ['zone', `${short.slice(4)} zone`] : [])];
    };
    return compactChoice(context, parent, {
        id,
        choices: picks.map(pick => ({
            value: pickKey(pick),
            label: speedPickLabel(pick, options.minimum, options.noneLabel),
            terms: terms(pick),
            icon: (box: Selection) => drawRoundel(box.append('svg').attr('width', 22)
                .attr('height', pick.kind === 'type' ? 30 : 22) as d3.Selection<SVGSVGElement>, pick, options.minimum)
        })),
        current: options.current ? pickKey(options.current) : undefined,
        custom: text => {
            const m = text.trim().match(/^(\d{1,3})\s*(mph|km\/h|kmh|kph)?$/i);
            if (!m) return undefined;
            const typed: SpeedUnit = m[2] ? (/mph/i.test(m[2]) ? 'mph' : 'km/h') : unit;
            return `speed:${Number(m[1])}:${typed}`;
        },
        onPick: key => options.onPick(keyPick(key))
    });
}
