import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiTooltip } from '../../ui/tooltip';
import { mphLimits, nationalTypes, samePick, ukSpeedTypeList, ukSpeedTypes, type SpeedPick, type UkSpeedType } from '../model/speed_limits';

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
function numberRoundel(svg: Selection, mph: number, minimum = false) {
    svg.append('circle').attr('r', 11.5).attr('class', minimum ? 'roundel-min-disc' : 'roundel-disc');
    if (!minimum) svg.append('circle').attr('r', 10).attr('class', 'roundel-ring');
    svg.append('text').attr('class', minimum ? 'roundel-number roundel-min-number' : 'roundel-number')
        .attr('text-anchor', 'middle').attr('dy', '0.36em')
        .attr('font-size', mph >= 100 ? 8.5 : 10.5).text(mph);
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
 * The roundel's picture: the number in a red ring, a UK limit type's sign, no limit as a dashed ring, or for a
 * minimum speed the number in white on a blue disc
 */
function drawRoundel(svg: d3.Selection<SVGSVGElement>, pick: SpeedPick, minimum = false) {
    if (pick.kind === 'type') {
        drawTypeSign(svg, pick.type);
        return;
    }
    svg.attr('viewBox', '-13 -13 26 26');
    if (pick.kind === 'none') {
        svg.append('circle').attr('r', 11).attr('class', 'roundel-none');
        svg.append('text').attr('class', 'roundel-none-text').attr('text-anchor', 'middle').attr('dy', '0.35em').text('—');
        return;
    }
    numberRoundel(svg, pick.mph, minimum);
}

/** The name of a pick, for its tooltip and screen readers */
export function speedPickLabel(pick: SpeedPick, minimum = false, noneLabel?: string): string {
    if (pick.kind === 'mph') return t(minimum ? '_lanes.speed.min_mph' : '_lanes.speed.mph', { n: pick.mph });
    if (pick.kind === 'type') return t(`_lanes.speed.types.${pick.type.replace('GB:', '')}`, { mph: ukSpeedTypes[pick.type].mph });
    return noneLabel ?? t(minimum ? '_lanes.speed.min_none' : '_lanes.speed.none');
}

export interface SpeedRoundelOptions {
    /** what is tagged now, highlighted; undefined when the selected lanes differ */
    current: SpeedPick | undefined;
    /** offer the UK limit types: national, motorway, restricted road and 20 zone (for a whole road, not a lane) */
    types?: boolean;
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
export function speedRoundels(parent: Selection, options: SpeedRoundelOptions) {
    const picks: SpeedPick[] = [
        ...mphLimits.map(mph => ({ kind: 'mph', mph } as SpeedPick)),
        ...(options.types ? ukSpeedTypeList.map(type => ({ kind: 'type', type } as SpeedPick)) : []),
        ...(options.none ? [{ kind: 'none' } as SpeedPick] : [])
    ];
    const size = options.size ?? 34;
    const row = parent.append('div').attr('class', 'speed-roundels' + (options.minimum ? ' speed-roundels-min' : '')).attr('role', 'radiogroup');
    for (const pick of picks) {
        const label = speedPickLabel(pick, options.minimum, options.noneLabel);
        const active = samePick(options.current, pick);
        const name = pick.kind === 'mph' ? pick.mph : pick.kind === 'type' ? pick.type.replace('GB:', '') : pick.kind;
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
