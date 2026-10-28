import { t } from '../../core/localizer';
import { uiTooltip } from '../../ui/tooltip';

type Selection = d3.Selection<any>;

/** The speed limits a UK road can have, in mph, as roundels */
export const mphLimits = [10, 20, 30, 40, 50, 60, 70];

/** What a roundel picks: a limit in mph, the national speed limit (of a given type, or the road's), or no limit tagged */
export type SpeedPick = { kind: 'mph'; mph: number } | { kind: 'national'; type?: UkSpeedType } | { kind: 'none' };

/** The vehicles a lower limit applies to on a road with a national limit */
export type LowerLimitVehicles = 'towing_bus_hgv' | 'towing_hgv';

/**
 * UK limits set by the kind of road rather than a number on a sign (wiki: Key:maxspeed:type, United Kingdom):
 * the national speed limit on single and dual carriageways and motorways, with the lower limit for vehicles
 * towing caravans or trailers, buses and minibuses up to 12 m and HGVs, and restricted roads (30 mph, street lights)
 */
export const ukSpeedTypes = {
    'GB:nsl_single': { mph: 60, lower: { mph: 50, vehicles: 'towing_bus_hgv' as LowerLimitVehicles } },
    'GB:nsl_dual': { mph: 70, lower: { mph: 60, vehicles: 'towing_bus_hgv' as LowerLimitVehicles } },
    'GB:motorway': { mph: 70, lower: { mph: 60, vehicles: 'towing_hgv' as LowerLimitVehicles } },
    'GB:nsl_restricted': { mph: 30, lower: undefined }
};
export type UkSpeedType = keyof typeof ukSpeedTypes;
const isUkSpeedType = (value: string | undefined): value is UkSpeedType => !!value && Object.hasOwn(ukSpeedTypes, value);
/** The types that are the national speed limit (the white disc with a black band) */
const nationalTypes: UkSpeedType[] = ['GB:nsl_single', 'GB:nsl_dual', 'GB:motorway'];

/** A road's limit type, from `maxspeed:type`, or from `source:maxspeed` (the older key, still common) */
export function speedTypeOf(tags: Tags): UkSpeedType | undefined {
    const type = tags['maxspeed:type'];
    if (isUkSpeedType(type)) return type;
    const source = tags['source:maxspeed'];
    return isUkSpeedType(source) ? source : undefined;
}

/** A road's speed limit: its `maxspeed`, or the limit its type sets when no number is tagged */
export function roadMaxspeed(tags: Tags): string | undefined {
    const type = speedTypeOf(tags);
    if (type && (!tags.maxspeed || tags.maxspeed === 'national')) return `${ukSpeedTypes[type].mph} mph`;
    return tags.maxspeed;
}

/**
 * A speed limit value in mph: `30 mph` → 30. A bare number is km/h in OpenStreetMap (wiki: Key:maxspeed), so it is
 * converted; `none`, `walk` and the like give null.
 */
export function mphOf(value: string | undefined): number | null {
    const match = (value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return /mph/i.test(match[2] ?? '') ? n : Math.round(n / 1.609344);
}

/**
 * The roundel's picture: the number in a red ring, the national limit's white disc with a black band, or for a
 * minimum speed the number in white on a blue disc
 */
function drawRoundel(svg: d3.Selection<SVGSVGElement>, pick: SpeedPick, minimum = false) {
    svg.attr('viewBox', '-13 -13 26 26');
    if (pick.kind === 'national') {
        svg.append('circle').attr('r', 11.5).attr('class', 'roundel-disc');
        svg.append('path').attr('class', 'roundel-band').attr('d', 'M-8.5 4.8L4.8-8.5L8.5-4.8L-4.8 8.5Z');
        svg.append('circle').attr('r', 11.5).attr('class', 'roundel-edge');
        return;
    }
    if (pick.kind === 'none') {
        svg.append('circle').attr('r', 11).attr('class', 'roundel-none');
        svg.append('text').attr('class', 'roundel-none-text').attr('text-anchor', 'middle').attr('dy', '0.35em').text('—');
        return;
    }
    svg.append('circle').attr('r', 11.5).attr('class', minimum ? 'roundel-min-disc' : 'roundel-disc');
    if (!minimum) svg.append('circle').attr('r', 10).attr('class', 'roundel-ring');
    svg.append('text').attr('class', minimum ? 'roundel-number roundel-min-number' : 'roundel-number').attr('text-anchor', 'middle').attr('dy', '0.36em')
        .attr('font-size', pick.mph >= 100 ? 8.5 : 10.5).text(pick.mph);
}

export interface SpeedRoundelOptions {
    /** what is tagged now, highlighted; undefined when the selected lanes differ */
    current: SpeedPick | undefined;
    /** offer the national speed limit (for a whole road, not a lane) */
    national?: boolean;
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

/** Whether two picks are the same limit */
export const samePick = (a: SpeedPick | undefined, b: SpeedPick) =>
    !!a && a.kind === b.kind && (a.kind !== 'mph' || a.mph === (b as { mph: number }).mph);

/**
 * A row of speed limit roundels, as on UK signs: click one to set the limit; the one tagged now is highlighted
 */
export function speedRoundels(parent: Selection, options: SpeedRoundelOptions) {
    const picks: SpeedPick[] = [
        ...mphLimits.map(mph => ({ kind: 'mph', mph } as SpeedPick)),
        ...(options.national ? [{ kind: 'national' } as SpeedPick] : []),
        ...(options.none ? [{ kind: 'none' } as SpeedPick] : [])
    ];
    const size = options.size ?? 34;
    const row = parent.append('div').attr('class', 'speed-roundels' + (options.minimum ? ' speed-roundels-min' : '')).attr('role', 'radiogroup');
    for (const pick of picks) {
        const label = pick.kind === 'mph' ? t(options.minimum ? '_lanes.speed.min_mph' : '_lanes.speed.mph', { n: pick.mph }) :
            pick.kind === 'none' && options.noneLabel ? options.noneLabel : t(`_lanes.speed.${pick.kind}`);
        const active = samePick(options.current, pick);
        const button = row.append('button')
            .attr('class', 'speed-roundel' + (active ? ' active' : '') + ` speed-roundel-${pick.kind === 'mph' ? pick.mph : pick.kind}`)
            .attr('role', 'radio')
            .attr('aria-checked', active)
            .attr('aria-label', label)
            .on('click', () => options.onPick(pick))
            .call((uiTooltip() as any).title(() => label).placement('top'));
        const svg = button.append('svg').attr('width', size).attr('height', size) as d3.Selection<SVGSVGElement>;
        drawRoundel(svg, pick, options.minimum);
    }
    return row;
}

/** What a road's own tags say its limit is, as a roundel pick */
export function roadSpeedPick(tags: Tags): SpeedPick {
    const type = speedTypeOf(tags);
    if ((type && nationalTypes.includes(type)) || tags.maxspeed === 'national') return { kind: 'national' };
    const mph = mphOf(roadMaxspeed(tags));
    return mph === null ? { kind: 'none' } : { kind: 'mph', mph };
}

/** The tags without a UK limit type, in `maxspeed:type` or `source:maxspeed` */
function withoutSpeedType(tags: Tags): Tags {
    const next = { ...tags };
    if (isUkSpeedType(next['maxspeed:type'])) delete next['maxspeed:type'];
    if (isUkSpeedType(next['source:maxspeed'])) delete next['source:maxspeed'];
    return next;
}

/**
 * A road's tags with a speed limit picked: a number in mph, the national speed limit, or no limit. The national
 * limit keeps the road's type, or is a motorway's, a dual carriageway's (70 mph) or a single carriageway's (60 mph)
 * by the road; a number keeps a type that sets the same limit (30 mph on a restricted road), and drops any other.
 * The type is written as `maxspeed:type`, which the wiki prefers to `source:maxspeed` in the UK.
 */
export function withRoadSpeed(tags: Tags, pick: SpeedPick): Tags {
    const type = speedTypeOf(tags);
    if (pick.kind === 'none') {
        const next = withoutSpeedType(tags);
        delete next.maxspeed;
        return next;
    }
    if (pick.kind === 'national') {
        const dual = tags.dual_carriageway === 'yes' || (tags.oneway === 'yes' && /^(trunk|primary)$/.test(tags.highway ?? ''));
        const chosen = pick.type ?? (type && nationalTypes.includes(type) ? type :
            /^motorway(_link)?$/.test(tags.highway ?? '') ? 'GB:motorway' : dual ? 'GB:nsl_dual' : 'GB:nsl_single');
        return withSpeedType(tags, chosen);
    }
    const next = type && ukSpeedTypes[type].mph === pick.mph ? { ...tags } : withoutSpeedType(tags);
    next.maxspeed = `${pick.mph} mph`;
    return next;
}

/** A road's tags with a UK limit type set, and the limit it sets as `maxspeed`; none removes the type alone */
export function withSpeedType(tags: Tags, type: UkSpeedType | undefined): Tags {
    const next = withoutSpeedType(tags);
    if (type) {
        next.maxspeed = `${ukSpeedTypes[type].mph} mph`;
        next['maxspeed:type'] = type;
    }
    return next;
}

/** A road's tags with a minimum speed picked (`minspeed`), or none */
export function withRoadMinspeed(tags: Tags, pick: SpeedPick): Tags {
    const next = { ...tags };
    if (pick.kind === 'mph') next.minspeed = `${pick.mph} mph`;
    else delete next.minspeed;
    return next;
}
