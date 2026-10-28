import type { coreGraph } from '../../core/graph';
import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import { brandLogo, brandOf, requestBrandLogos } from '../core/brand_logos';
import { attrChanged, withIdState } from './street';

type Group = d3.Selection<SVGGElement>;

/** Where a branded feature's logo stands: a point where it is, an area in its middle (its outline's centroid) */
function logoPlace(entity: OsmEntity, graph: coreGraph, projection: Projection): Vec2 | null {
    if (entity.type === 'node') {
        // a node on a way (an entrance, a vertex) keeps iD's own drawing
        return graph.parentWays(entity).length ? null : projection((entity as osmNode).loc as Vec2) as Vec2;
    }
    if (entity.type !== 'way' || !(entity as osmWay).isClosed()) return null;
    const ring = (entity as osmWay).nodes.slice(0, -1).map(id => projection((graph.entity(id) as osmNode).loc as Vec2) as Vec2);
    let area = 0;
    let x = 0;
    let y = 0;
    ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const cross = p[0] * q[1] - q[0] * p[1];
        area += cross;
        x += (p[0] + q[0]) * cross;
        y += (p[1] + q[1]) * cross;
    });
    if (Math.abs(area) < 1e-6) return null;
    return [x / (3 * area), y / (3 * area)];
}

/**
 * Brand logos in place of iD's point markers and area icons, for features tagged `brand:wikidata=*` whose brand has
 * a logo on Wikidata: the logo on a white tile, which selects and highlights the feature as its marker does. Logos
 * not yet looked up are asked for; until one arrives (or where a brand has none) iD's own marker stays. Returns the
 * features drawn with a logo.
 */
export function drawBrandLogos(group: Group, entities: OsmEntity[], graph: coreGraph, projection: Projection, show: boolean): Set<string> {
    const branded = show ? entities.filter(entity => !!brandOf(entity.tags)) : [];
    requestBrandLogos(branded.map(entity => brandOf(entity.tags)!));
    const data = branded.flatMap(entity => {
        const url = brandLogo(brandOf(entity.tags)!);
        const at = url ? logoPlace(entity, graph, projection) : null;
        // (iD's select and hover behaviours read the feature from `properties.entity`)
        return url && at ? [{ id: entity.id, url, at, properties: { entity } }] : [];
    });

    const tiles = group.selectAll<SVGGElement, typeof data[number]>('g.brand-logo').data(data, d => d.id);
    tiles.exit().remove();
    const enter = tiles.enter().append('g');
    enter.append('rect').attr('class', 'brand-logo-tile').attr('x', -17).attr('y', -17).attr('width', 34).attr('height', 34).attr('rx', 7);
    enter.append('image').attr('x', -15).attr('y', -15).attr('width', 30).attr('height', 30)
        .attr('preserveAspectRatio', 'xMidYMid meet');
    const all = enter.merge(tiles)
        .each(attrChanged('class', function(d) { return withIdState(this, `brand-logo ${d.id}`); }))
        .each(attrChanged('transform', d => `translate(${d.at[0].toFixed(1)},${d.at[1].toFixed(1)})`));
    // (select passes each tile's current feature down to the shapes that are clicked)
    all.select('rect');
    all.select('image').each(attrChanged('href', d => d.url));
    return new Set(data.map(d => d.id));
}
