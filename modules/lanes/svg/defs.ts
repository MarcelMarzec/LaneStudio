import { speedPatternClasses, type SpeedTypeKind } from '../core/lane_speed';
import { markingColourValues } from './street';

/**
 * SVG symbols and patterns for the lanes layer.
 * Turn arrows are drawn pointing up in a box from (-9,-12) to (9,12); right-hand arrows are the
 * left-hand ones mirrored, so each shape is drawn once.
 */

interface ArrowShape {
    stem: string;
    head: string;
}

// Every arrow shares one stem from (0,10) up to (0,1) and branches from its top, so combined values
// such as `left;through` overlap into one arrow instead of side-by-side copies.
const stem = 'M0 10V1';
const arrowShapes: Record<string, ArrowShape> = {
    through: { stem: `${stem}M0 1V-6`, head: 'M-3.2 -6L0 -11.5L3.2 -6Z' },
    left: { stem: `${stem}M0 1Q0 -5 -4.5 -5`, head: 'M-4.5 -8.2L-9.5 -5L-4.5 -1.8Z' },
    slight_left: { stem: `${stem}M0 1L-4.2 -4.2`, head: 'M-1.9 -6.5L-7.8 -7.8L-6.5 -1.9Z' },
    sharp_left: { stem: `${stem}M0 1V-3L-4.5 1.5`, head: 'M-2.4 3.6L-8 5L-6.6 -0.6Z' },
    reverse: { stem: `${stem}M0 1V-4Q0 -8 -3.5 -8Q-7 -8 -7 -4V1.5`, head: 'M-10 1.5L-7 7L-4 1.5Z' },
    merge_to_left: { stem: `${stem}M0 1V-1L-6 -7V-8.5`, head: 'M-9 -8.5L-6 -13L-3 -8.5Z' },
    // a lane shifting sideways: straight on, stepping one lane over
    slide_left: { stem: `${stem}M0 1V0L-5 -5V-6`, head: 'M-8.2 -6L-5 -11.5L-1.8 -6Z' },
    // left at the junction after next: straight past a side road (the stub), then left
    next_left: { stem: `${stem}M0 3H3M0 1V-3Q0 -8 -4.5 -8`, head: 'M-4.5 -11.2L-9.5 -8L-4.5 -4.8Z' }
};

/**
 * The symbol for one `turn` value, and whether to mirror it: right-hand turns, and a U-turn (`reverse`)
 * where traffic drives on the left, which turns round to the right, across the centre of the road
 */
export function turnArrowSymbol(value: string, driveSide: 'left' | 'right' = 'right'): { id: string; mirror: boolean } | undefined {
    const right = value.replace(/right/, 'left');
    const mirror = value === 'reverse' ? driveSide === 'left' : value !== right;
    return arrowShapes[right] ? { id: `lanes-arrow-${right}`, mirror } : undefined;
}

export function svgLaneDefs(defs: d3.Selection<SVGDefsElement>) {
    for (const [name, shape] of Object.entries(arrowShapes)) {
        const symbol = defs.append('symbol')
            .attr('id', `lanes-arrow-${name}`)
            .attr('class', 'lanes-arrow-symbol')
            .attr('overflow', 'visible');
        // styled with attributes (page CSS does not reach reliably into `<use>` copies), in
        // currentColor: white on the map, darker where the sidebar needs it
        symbol.append('path').attr('class', 'arrow-stem').attr('d', shape.stem)
            .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.6)
            .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
        symbol.append('path').attr('class', 'arrow-head').attr('d', shape.head)
            .attr('fill', 'currentColor').attr('stroke', 'none');
    }

    // direction of travel on one-way roads: slimmer than turn arrows, drawn smaller and fainter
    const travel = defs.append('symbol').attr('id', 'lanes-arrow-travel').attr('overflow', 'visible');
    travel.append('path').attr('d', 'M0 9V-3')
        .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.4).attr('stroke-linecap', 'round');
    travel.append('path').attr('d', 'M-3.2 -2L0 -9.5L3.2 -2Z').attr('fill', 'currentColor');

    // the cycle symbol painted in cycle lanes (TSRGD diagram 1057): a bicycle seen from the side, front wheel ahead (up),
    // in a box 20 units long
    const cycle = (id: string, y: number, k: number) => {
        const s = defs.append('symbol').attr('id', id).attr('overflow', 'visible');
        const g = s.append('g').attr('transform', `translate(0,${y}) scale(${k})`)
            .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.2).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
        g.append('circle').attr('cx', 0).attr('cy', -5.5).attr('r', 4);
        g.append('circle').attr('cx', 0).attr('cy', 5.5).attr('r', 4);
        g.append('path').attr('d', 'M0 5.5L-2.6 0L0 -5.5M-2.6 0H1.6L0 5.5M1.6 0L2.6 -3.4M-3.2 1.8H-1.4M2 -3.6H3.4');
        return s;
    };
    cycle('lanes-cycle', 0, 0.85);
    // pictograms painted on the road (`road_marking=symbol`, the wiki's generic `symbol=*` terms), facing up the way they
    // are read, in a box 20 units long, drawn in currentColor (the marking's colour)
    const pictogram = (name: string, draw: (g: d3.Selection<SVGGElement>) => void) => {
        const g = defs.append('symbol').attr('id', `lanes-marking-${name}`).attr('overflow', 'visible').append('g')
            .attr('fill', 'none').attr('stroke', 'currentColor').attr('stroke-width', 1.4).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
        draw(g as any);
    };
    // a person walking
    pictogram('pedestrian', g => {
        g.append('circle').attr('cx', 0).attr('cy', -8).attr('r', 1.8);
        g.append('path').attr('d', 'M0 -5V3L-3 10M0 3L3 10M-4 -1L0 -4L4 -1');
    });
    // the wheelchair symbol
    pictogram('wheelchair', g => {
        g.append('circle').attr('cx', 1).attr('cy', -8).attr('r', 1.8);
        g.append('path').attr('d', 'M1 -5V2H6L8 8M-3 -1A5.5 5.5 0 1 0 6 6');
    });
    // a high-occupancy vehicle lane's diamond
    pictogram('hov', g => g.append('path').attr('d', 'M0 -10L4.5 0L0 10L-4.5 0Z'));
    // an aeroplane, nose ahead
    pictogram('airport', g => g.append('path').attr('d', 'M0 -10V8M-9 1L0 -3L9 1M-4 9L0 7L4 9'));
    // the motorway symbol: a bridge over a road
    pictogram('motorway', g => g.append('path').attr('d', 'M-7 10L-2 -4M7 10L2 -4M0 10V7M0 4V1M-9 -6H9'));

    // a shared lane (sharrow): a cycle symbol with two chevrons ahead of it
    cycle('lanes-sharrow', 3, 0.6).append('path').attr('d', 'M-4 -5L0 -8.5L4 -5M-4 -9L0 -12.5L4 -9')
        .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.3).attr('stroke-linejoin', 'round');

    // give-way triangle painted on the road: its base faces the line ahead, its tip the driver
    defs.append('symbol').attr('id', 'lanes-giveway').attr('overflow', 'visible')
        .append('path').attr('d', 'M-7 -10L7 -10L0 10Z')
        .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 2).attr('stroke-linejoin', 'round');

    // traffic signal head
    const signals = defs.append('symbol').attr('id', 'lanes-signals').attr('overflow', 'visible');
    signals.append('rect').attr('x', -4).attr('y', -10).attr('width', 8).attr('height', 20).attr('rx', 2)
        .attr('fill', '#222').attr('stroke', '#fff').attr('stroke-width', 1);
    for (const [cy, colour] of [[-6, '#e33'], [0, '#fb3'], [6, '#3c5']] as const) {
        signals.append('circle').attr('cx', 0).attr('cy', cy).attr('r', 2.2).attr('fill', colour);
    }

    // other signal heads: flashing amber, lane control (a green arrow over a red cross), emergency (two red lamps)
    const head = (id: string, lamps: [number, string][]) => {
        const s = defs.append('symbol').attr('id', id).attr('overflow', 'visible');
        s.append('rect').attr('x', -4).attr('y', -10).attr('width', 8).attr('height', 20).attr('rx', 2)
            .attr('fill', '#222').attr('stroke', '#fff').attr('stroke-width', 1);
        for (const [cy, colour] of lamps) s.append('circle').attr('cx', 0).attr('cy', cy).attr('r', 2.4).attr('fill', colour);
        return s;
    };
    head('lanes-signals-blinker', [[0, '#fb3']]);
    head('lanes-signals-emergency', [[-4, '#e33'], [4, '#e33']]);
    const control = defs.append('symbol').attr('id', 'lanes-signals-lane-control').attr('overflow', 'visible');
    control.append('rect').attr('x', -7).attr('y', -7).attr('width', 14).attr('height', 14).attr('rx', 1.5)
        .attr('fill', '#222').attr('stroke', '#fff').attr('stroke-width', 1);
    control.append('path').attr('d', 'M0 4V-4M-3 -1L0 -4L3 -1').attr('fill', 'none').attr('stroke', '#3c5').attr('stroke-width', 1.6);

    // a Belisha beacon seen from above: an amber globe on a black and white post
    const beacon = defs.append('symbol').attr('id', 'lanes-belisha').attr('overflow', 'visible');
    beacon.append('circle').attr('r', 9).attr('fill', '#f5a623').attr('stroke', '#1b1b1b').attr('stroke-width', 2);
    beacon.append('circle').attr('r', 4).attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.5);

    // street furniture, 20 units across: a lamp and its pool of light, a bus stop flag, a bus shelter, a convex mirror,
    // a milestone
    const lamp = defs.append('symbol').attr('id', 'lanes-street-lamp').attr('overflow', 'visible');
    lamp.append('circle').attr('r', 10).attr('fill', 'rgba(255, 214, 110, 0.22)');
    lamp.append('circle').attr('r', 3).attr('fill', '#ffe9a8').attr('stroke', '#3a3a3a').attr('stroke-width', 1);
    const busStop = defs.append('symbol').attr('id', 'lanes-bus-stop').attr('overflow', 'visible');
    busStop.append('circle').attr('r', 9).attr('fill', '#d6342c').attr('stroke', '#fff').attr('stroke-width', 2);
    busStop.append('rect').attr('x', -9).attr('y', -2.6).attr('width', 18).attr('height', 5.2).attr('fill', '#fff');
    busStop.append('text').attr('text-anchor', 'middle').attr('dominant-baseline', 'central').attr('font-size', 4.6)
        .attr('font-weight', 700).attr('fill', '#d6342c').text('BUS');
    const shelter = defs.append('symbol').attr('id', 'lanes-bus-shelter').attr('overflow', 'visible');
    shelter.append('rect').attr('x', -10).attr('y', -4).attr('width', 20).attr('height', 8).attr('rx', 1)
        .attr('fill', 'rgba(160, 200, 230, 0.55)').attr('stroke', '#e8eef4').attr('stroke-width', 1.2);
    const mirror = defs.append('symbol').attr('id', 'lanes-traffic-mirror').attr('overflow', 'visible');
    mirror.append('circle').attr('r', 9).attr('fill', '#b9c4cf').attr('stroke', '#f08a24').attr('stroke-width', 3);
    mirror.append('path').attr('d', 'M-4 -3A5 5 0 0 1 3 -5').attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.5);
    const milestone = defs.append('symbol').attr('id', 'lanes-milestone').attr('overflow', 'visible');
    milestone.append('path').attr('d', 'M-7 10V-4Q-7 -10 0 -10Q7 -10 7 -4V10Z').attr('fill', '#cfcfc8').attr('stroke', '#55554f').attr('stroke-width', 1.4);

    // fills for painted areas (road_marking with pattern=*), one per colour: patterns take their
    // colours from where they are defined, not from the shape that uses them
    for (const [colourName, colour] of Object.entries(markingColourValues)) {
        const pattern = (name: string, size: number, rotate = 0) => defs.append('pattern')
            .attr('id', `lanes-pattern-${name}-${colourName}`)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', size)
            .attr('height', size)
            .attr('patternTransform', rotate ? `rotate(${rotate})` : null);
        const stroke = (g: d3.Selection<SVGElement>, d: string, width = 2) =>
            g.append('path').attr('d', d).attr('fill', 'none').attr('stroke', colour).attr('stroke-width', width);
        stroke(pattern('hatch', 10, 45) as any, 'M0 0V10', 2.5);
        stroke(pattern('crosshatch', 10, 45) as any, 'M0 0V10M0 0H10', 2);
        stroke(pattern('chevron', 14) as any, 'M0 10L7 3L14 10', 2.5);
        stroke(pattern('zigzag', 12) as any, 'M0 9L6 3L12 9', 1.5);
        pattern('dots', 8).append('circle').attr('cx', 4).attr('cy', 4).attr('r', 1.6).attr('fill', colour);
        pattern('chessboard', 12).append('path').attr('d', 'M0 0H6V6H0ZM6 6H12V12H6Z').attr('fill', colour);
    }

    // the Speed Limit tool's colours with a pattern over them where the limit is set by its type rather than a
    // number alone: diagonal black bands for the national limit (as on its sign), blue stripes for a motorway,
    // white dots for a 20 zone and fine cross-hatching for a restricted road
    for (const cls of speedPatternClasses) {
        const pattern = (kind: SpeedTypeKind, size: number, rotate = 0) => {
            const p = defs.append('pattern')
                .attr('id', `lanes-speed-${kind}-${cls}`)
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('width', size)
                .attr('height', size)
                .attr('patternTransform', rotate ? `rotate(${rotate})` : null);
            // (the colour is the tool's, set in 40_routing.css)
            p.append('rect').attr('width', size).attr('height', size).style('fill', `var(--speed-${cls})`);
            return p;
        };
        pattern('national', 10, 45).append('rect').attr('width', 3).attr('height', 10).attr('fill', 'rgba(0, 0, 0, 0.5)');
        pattern('motorway', 10, 45).append('rect').attr('width', 3).attr('height', 10).attr('fill', '#1d5bbf');
        pattern('zone', 8).append('circle').attr('cx', 4).attr('cy', 4).attr('r', 1.5).attr('fill', 'rgba(255, 255, 255, 0.85)');
        pattern('restricted', 8, 45).append('path').attr('d', 'M0 0V8M0 0H8')
            .attr('fill', 'none').attr('stroke', 'rgba(0, 0, 0, 0.45)').attr('stroke-width', 1.5);
    }

    // surface textures seen from above: paving slabs, setts, gravel
    const texture = (name: string, size: number, back: string) => {
        const p = defs.append('pattern')
            .attr('id', `lanes-texture-${name}`)
            .attr('patternUnits', 'userSpaceOnUse')
            .attr('width', size)
            .attr('height', size);
        p.append('rect').attr('width', size).attr('height', size).attr('fill', back);
        return p;
    };
    texture('paving', 12, 'rgb(200, 185, 160)')
        .append('path').attr('d', 'M0 0.5H12M0 6.5H12M0.5 0V6M6.5 6V12')
        .attr('fill', 'none').attr('stroke', 'rgb(140, 125, 100)').attr('stroke-width', 1);
    texture('sett', 6, 'rgb(120, 110, 100)')
        .append('path').attr('d', 'M0 0.5H6M0 3.5H6M0.5 0V3M3.5 3V6')
        .attr('fill', 'none').attr('stroke', 'rgb(70, 62, 55)').attr('stroke-width', 0.8);
    const gravel = texture('gravel', 9, 'rgb(170, 160, 140)');
    for (const [cx, cy, r] of [[2, 2, 0.9], [6.5, 3.5, 0.7], [4, 7, 0.8], [8, 8, 0.6]]) {
        gravel.append('circle').attr('cx', cx).attr('cy', cy).attr('r', r).attr('fill', 'rgb(120, 108, 90)');
    }

    // shared foot and cycle paths: footway and cycleway colours in diagonal bands
    const shared = defs.append('pattern')
        .attr('id', 'lanes-shared-path')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 12)
        .attr('height', 12)
        .attr('patternTransform', 'rotate(45)');
    shared.append('rect').attr('width', 6).attr('height', 12).attr('fill', 'rgba(225, 215, 195, 0.6)');
    shared.append('rect').attr('x', 6).attr('width', 6).attr('height', 12).attr('fill', 'rgba(40, 150, 90, 0.5)');

    // work stripes over roads and paths under construction: yellow and black
    const works = defs.append('pattern')
        .attr('id', 'lanes-works')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 12)
        .attr('height', 12)
        .attr('patternTransform', 'rotate(45)');
    works.append('rect').attr('width', 6).attr('height', 12).attr('fill', '#f2c400');
    works.append('rect').attr('x', 6).attr('width', 6).attr('height', 12).attr('fill', '#1c1c1c');

    // variable-access lanes (a running hard shoulder): the lane colour with amber stripes
    const variable = defs.append('pattern')
        .attr('id', 'lanes-variable')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 14)
        .attr('height', 14)
        .attr('patternTransform', 'rotate(45)');
    variable.append('rect').attr('width', 14).attr('height', 14).attr('fill', 'rgb(90, 96, 106)');
    variable.append('rect').attr('width', 3).attr('height', 14).attr('fill', 'rgb(240, 170, 40)');

    // the face of a variable message sign: amber dots on black
    const dots = defs.append('pattern')
        .attr('id', 'lanes-message-dots')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 3)
        .attr('height', 3);
    dots.append('circle').attr('cx', 1.5).attr('cy', 1.5).attr('r', 0.7).attr('fill', 'rgb(255, 176, 0)');

    // hatching for unknown or restricted space
    const hatch = defs.append('pattern')
        .attr('id', 'lanes-hatch')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 6)
        .attr('height', 6)
        .attr('patternTransform', 'rotate(45)');
    hatch.append('rect').attr('width', 6).attr('height', 6).attr('class', 'hatch-back');
    hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6).attr('class', 'hatch-line');

    // diamonds for HOV lanes, which are marked with a diamond on the road
    const hov = defs.append('pattern')
        .attr('id', 'lanes-hov')
        .attr('patternUnits', 'userSpaceOnUse')
        .attr('width', 10)
        .attr('height', 10);
    hov.append('rect').attr('width', 10).attr('height', 10).attr('class', 'hov-back');
    hov.append('path').attr('d', 'M5 1L9 5L5 9L1 5Z').attr('class', 'hov-diamond');
}
