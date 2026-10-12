/**
 * SVG symbols and patterns for the lanes layer.
 * Turn arrows are drawn pointing up in a box from (-9,-12) to (9,12); right-hand arrows are the
 * left-hand ones mirrored, so each shape is drawn once.
 */

interface ArrowShape {
    stem: string;
    head: string;
}

const arrowShapes: Record<string, ArrowShape> = {
    through: { stem: 'M0 10V-5', head: 'M-3.5 -5L0 -11L3.5 -5Z' },
    left: { stem: 'M1.5 10V0Q1.5 -5 -3 -5', head: 'M-3 -8.5L-8.5 -5L-3 -1.5Z' },
    slight_left: { stem: 'M1.5 10V1L-3.5 -4', head: 'M-1 -6.3L-6.5 -7L-5.8 -1.5Z' },
    sharp_left: { stem: 'M2 10V-3L-3.5 2.5', head: 'M-1.2 4.8L-6.5 5.5L-5.8 0.2Z' },
    reverse: { stem: 'M3 10V-3Q3 -8 -0.5 -8Q-4 -8 -4 -3V1', head: 'M-7.2 1L-4 7L-0.8 1Z' },
    merge_to_left: { stem: 'M3 10V4L-3 -2V-5', head: 'M-6.5 -5L-3 -11L0.5 -5Z' }
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
        // styled with attributes: page CSS does not reach reliably into `<use>` copies
        symbol.append('path').attr('class', 'arrow-stem').attr('d', shape.stem)
            .attr('fill', 'none').attr('stroke', '#fff').attr('stroke-width', 1.6)
            .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
        symbol.append('path').attr('class', 'arrow-head').attr('d', shape.head)
            .attr('fill', '#fff').attr('stroke', 'none');
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
