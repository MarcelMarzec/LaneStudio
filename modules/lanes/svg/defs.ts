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

/** The symbol for one `turn` value, and whether to mirror it (right-hand turns) */
export function turnArrowSymbol(value: string): { id: string; mirror: boolean } | undefined {
    const right = value.replace(/right/, 'left');
    const mirror = value !== right;
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
