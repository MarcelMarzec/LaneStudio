import { t } from '../../core/localizer';
import { uiTooltip } from '../../ui/tooltip';

type Selection = d3.Selection<any>;

/** The speed limits a UK road can have, in mph, as roundels */
export const mphLimits = [10, 20, 30, 40, 50, 60, 70];

/** What a roundel picks: a limit in mph, the national speed limit, or no limit tagged */
export type SpeedPick = { kind: 'mph'; mph: number } | { kind: 'national' } | { kind: 'none' };

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

/** The roundel's picture: the number in a red ring, or the national limit's white disc with a black band */
function drawRoundel(svg: d3.Selection<SVGSVGElement>, pick: SpeedPick) {
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
    svg.append('circle').attr('r', 11.5).attr('class', 'roundel-disc');
    svg.append('circle').attr('r', 10).attr('class', 'roundel-ring');
    svg.append('text').attr('class', 'roundel-number').attr('text-anchor', 'middle').attr('dy', '0.36em')
        .attr('font-size', pick.mph >= 100 ? 8.5 : 10.5).text(pick.mph);
}

export interface SpeedRoundelOptions {
    /** what is tagged now, highlighted; undefined when the selected lanes differ */
    current: SpeedPick | undefined;
    /** offer the national speed limit (for a whole road, not a lane) */
    national?: boolean;
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
    const row = parent.append('div').attr('class', 'speed-roundels').attr('role', 'radiogroup');
    for (const pick of picks) {
        const label = pick.kind === 'mph' ? t('_lanes.speed.mph', { n: pick.mph }) :
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
        drawRoundel(svg, pick);
    }
    return row;
}

/** What a road's own tags say its limit is, as a roundel pick */
export function roadSpeedPick(tags: Tags): SpeedPick {
    if (/^GB:nsl_/.test(tags['maxspeed:type'] ?? '') || tags.maxspeed === 'national') return { kind: 'national' };
    const mph = mphOf(tags.maxspeed);
    return mph === null ? { kind: 'none' } : { kind: 'mph', mph };
}

/**
 * A road's tags with a speed limit picked: a number in mph, the national speed limit (60 mph on a single carriageway,
 * 70 mph on a dual carriageway, with `maxspeed:type=GB:nsl_single|nsl_dual`), or no limit
 */
export function withRoadSpeed(tags: Tags, pick: SpeedPick): Tags {
    const next = { ...tags };
    const national = /^GB:nsl_/.test(next['maxspeed:type'] ?? '');
    if (pick.kind === 'none') {
        delete next.maxspeed;
        if (national) delete next['maxspeed:type'];
    } else if (pick.kind === 'national') {
        const dual = next.dual_carriageway === 'yes' || (next.oneway === 'yes' && /^(trunk|primary)$/.test(next.highway ?? ''));
        next.maxspeed = dual ? '70 mph' : '60 mph';
        next['maxspeed:type'] = dual ? 'GB:nsl_dual' : 'GB:nsl_single';
    } else {
        next.maxspeed = `${pick.mph} mph`;
        if (national) delete next['maxspeed:type'];
    }
    return next;
}
