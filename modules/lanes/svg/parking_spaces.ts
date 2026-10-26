import type { Projection } from '../../geo/raw_mercator';
import type { CarParkShape, ParkingSpaceShape } from '../geometry/parking_spaces';
import { attrChanged, joinPaths, pathFor, pxPerMetre } from './street';

type Group = d3.Selection<SVGGElement>;

/** The symbols painted in bays, drawn in a 10 × 10 box: a wheelchair (disabled bays) and a bolt (charging) */
const symbols: Partial<Record<ParkingSpaceShape['kind'], string>> = {
    disabled: 'M4.2 1.6a1.1 1.1 0 1 0 0.01 0M4.2 3.4v3h3.2l1.3 2.6M6.6 5.1a2.8 2.8 0 1 1-4.4 2.4',
    charging: 'M6 0.8 2.6 5.6h2.6L4 9.2l3.6-5h-2.6z'
};

/**
 * Car parks and the parking spaces mapped in them: the car park's surface, each bay with the lines painted round it
 * (open on the side it is driven into from), coloured by its kind, with its symbol painted in it
 */
export function drawParkingSpaces(group: (name: string) => Group, spaces: ParkingSpaceShape[], carParks: CarParkShape[],
    projection: Projection, markings: boolean) {
    const path = pathFor(projection);
    joinPaths(group('car-parks'), carParks, d => d.id, d => `car-park ${d.id}`, d => path(d.polygon, true));
    joinPaths(group('parking-spaces'), spaces.flatMap(space => [
        { key: space.id, cls: `parking-space parking-space-${space.kind} ${space.id}`, d: path(space.polygon, true) },
        ...(markings ? [{ key: `${space.id}-lines`, cls: `parking-space-lines parking-space-${space.kind}`, d: space.lines.map(line => path(line, false)).join('') }] : [])
    ]), d => d.key, d => d.cls, d => d.d);

    // each symbol 1.6 m across, standing upright on screen
    const ppm = pxPerMetre(projection, spaces[0]?.middle);
    const size = 1.6 * ppm / 10;
    const marked = markings && size * 10 >= 8 ? spaces.filter(space => symbols[space.kind]) : [];
    const glyphs = group('parking-space-symbols').selectAll<SVGPathElement, ParkingSpaceShape>('path').data(marked, d => d.id);
    glyphs.exit().remove();
    glyphs.enter().append('path')
        .merge(glyphs)
        .each(attrChanged('class', d => `parking-space-symbol parking-space-symbol-${d.kind}`))
        .each(attrChanged('d', d => symbols[d.kind]!))
        .each(attrChanged('transform', d => {
            const [x, y] = projection(d.middle);
            return `translate(${(x - 5 * size).toFixed(1)},${(y - 5 * size).toFixed(1)}) scale(${size.toFixed(3)})`;
        }));
}
