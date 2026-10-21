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
    merge_to_left: { stem: `${stem}M0 1V-1L-6 -7V-8.5`, head: 'M-9 -8.5L-6 -13L-3 -8.5Z' }
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
