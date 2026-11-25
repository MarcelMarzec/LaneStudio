import type { Projection } from '../../geo/raw_mercator';
import type { Vec2 } from '../../geo/vector';
import type { WorksShape } from '../geometry/works';
import { joinPaths, pathFor } from './street';

type Group = d3.Selection<SVGGElement>;

/**
 * Building work: construction sites (a sandy ground behind a mesh fence) under the roads; scaffolding round buildings
 * going up and works stripes over other features being built, over the car parks and roads; cones over the road
 */
export function drawWorks(group: (name: string) => Group, works: WorksShape[], projection: Projection) {
    const path = pathFor(projection);
    const rings = (shape: WorksShape) => [shape.points, ...(shape.rings ?? [])].map((ring: Vec2[]) => path(ring, true)).join('');
    const sites = works.filter(w => w.kind === 'site');
    joinPaths(group('works-sites'), sites.flatMap(site => [
        { key: site.key, cls: `works-site lanes-landuse ${site.id}`, d: rings(site) },
        { key: `${site.key}-fence`, cls: `works-fence lanes-landuse ${site.id}`, d: rings(site) }
    ]), d => d.key, d => d.cls, d => d.d);
    joinPaths(group('works-areas'), works.filter(w => w.kind === 'building' || w.kind === 'area'),
        d => d.key, d => (d.kind === 'building' ? `works-scaffold ${d.id}` : `works-area ${d.id}`), rings);
    joinPaths(group('works-cones'), works.filter(w => w.kind === 'cone'), d => d.key, d => `works-cone ${d.id}`, d => path(d.points, true));
}
