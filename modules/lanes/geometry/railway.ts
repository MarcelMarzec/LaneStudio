import type { Vec2 } from '../../geo/vector';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import { isCovered } from './structures';
import { add, metricFrame, offsetPolyline, pointAlong, polylineLength, rightNormal, scale } from './frame';

/** The kinds of railway drawn as track */
export type RailKind = 'rail' | 'light_rail' | 'subway' | 'tram' | 'narrow_gauge' | 'miniature' | 'funicular' | 'monorail';

export interface TrackShape {
    id: string;
    kind: RailKind;
    /**
     * in use, out of use, being built, or kept as a heritage line; or only its course left (`abandoned`, `razed`) or
     * planned (`proposed`), drawn as the trackbed's outline without track
     */
    status: 'active' | 'disused' | 'construction' | 'preserved' | 'abandoned' | 'proposed';
    /** rails set in the road surface (most tram lines): no ballast or sleepers, drawn over the road */
    embedded: boolean;
    /** in a tunnel or under a roof: drawn faded */
    covered: boolean;
    /** the track gauge, in metres (between the rails' inner faces) */
    gauge: number;
    /** the ballast the sleepers lie on, the whole width of all the tracks */
    bed?: Vec2[];
    sleepers: Vec2[][];
    /** the running rails' centre lines */
    rails: Vec2[][];
    /** third or fourth (conductor) rails of lines electrified that way */
    conductors: Vec2[][];
}

const kinds = new Set<RailKind>(['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'miniature', 'funicular', 'monorail']);

/**
 * Gauges (mm) when a way has no `gauge` tag. Great Britain's main lines, the London Underground, light rail and
 * tram lines are all standard gauge, 1435 mm (the Underground's smaller "tube gauge" is the size of its trains and
 * tunnels, not its track); Britain's narrow gauge lines are mostly about 600 mm, miniature lines 7¼ in (184 mm).
 */
const defaultGauge: Record<RailKind, number> = {
    rail: 1435, light_rail: 1435, subway: 1435, tram: 1435, funicular: 1435, narrow_gauge: 600, miniature: 184,
    // a monorail's beam, about as wide as a standard gauge track
    monorail: 1435
};

/** A track's kind and status from its tags; none for what has no track (abandoned, razed, platforms…) */
export function railKind(tags: Tags): { kind: RailKind; status: TrackShape['status'] } | null {
    const railway = tags.railway ?? '';
    const heritage = tags.usage === 'tourism' || tags['railway:preserved'] === 'yes';
    if (kinds.has(railway as RailKind)) return { kind: railway as RailKind, status: heritage ? 'preserved' : 'active' };
    if (railway === 'preserved') return { kind: 'rail', status: 'preserved' };
    const was = (value: string | undefined) => kinds.has(value as RailKind) ? value as RailKind : 'rail';
    if (railway === 'disused') return { kind: was(tags['disused:railway']), status: 'disused' };
    if (railway === 'construction') return { kind: was(tags.construction ?? tags['construction:railway']), status: 'construction' };
    if (railway === 'abandoned' || railway === 'razed') return { kind: was(tags['abandoned:railway'] ?? tags['razed:railway']), status: 'abandoned' };
    if (railway === 'proposed') return { kind: was(tags.proposed ?? tags['proposed:railway']), status: 'proposed' };
    return null;
}

/** The track gauge in metres: the first value of `gauge` (mm), else the kind's usual gauge */
export function railGauge(tags: Tags, kind: RailKind): number {
    const tagged = tags.gauge === 'standard' ? 1435 : parseFloat((tags.gauge ?? '').split(';')[0]);
    const mm = Number.isFinite(tagged) && tagged > 100 && tagged < 3000 ? tagged : defaultGauge[kind];
    return mm / 1000;
}

const cache = new WeakMap<osmWay, { nodes: OsmEntity[]; sleepers: boolean; shape: TrackShape }>();

/**
 * A railway way's track: ballast, sleepers and rails, at its gauge. `tracks=n` lays n tracks side by side, 1.9 m
 * apart (Britain's "six-foot" between them, for standard gauge). Sleepers are left out when `sleepers` is false
 * (zoomed out, where they would be too small to see).
 */
export function trackShape(way: osmWay, graph: coreGraph, sleepers: boolean): TrackShape | null {
    const what = railKind(way.tags);
    if (!what || way.nodes.length < 2) return null;
    const nodes = way.nodes.map(id => graph.entity(id));
    const cached = cache.get(way);
    if (cached && cached.sleepers === sleepers && cached.nodes.length === nodes.length && cached.nodes.every((n, i) => n === nodes[i])) {
        return cached.shape;
    }

    const tags = way.tags;
    const { kind, status } = what;
    const gauge = railGauge(tags, kind);
    // trams run in the road unless tagged otherwise; other lines are embedded only when tagged so
    const embedded = tags.embedded === 'yes' || tags.embedded === 'partial' || (kind === 'tram' && tags.embedded !== 'no');
    const frame = metricFrame((nodes[0] as osmNode).loc);
    const points = nodes.map(node => frame.toMetres((node as osmNode).loc));

    // sizes scale with the gauge (a standard gauge sleeper is 2.6 m long, laid every 0.65 m)
    const k = Math.min(1, Math.max(0.35, gauge / 1.435));
    const sleeperLength = gauge * 1.81;
    const spacing = gauge + 1.9;
    const count = Math.max(1, Math.min(8, parseInt(tags.tracks ?? '1', 10) || 1));
    const centres = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
    const at = (offset: number) => offsetPolyline(points, points.map(() => offset));

    // only a course left or planned: the trackbed's outline; a monorail: its beam
    const courseOnly = status === 'abandoned' || status === 'proposed';
    const beam = kind === 'monorail';
    const rails = courseOnly || beam ? [] : centres.flatMap(c => [at(c - gauge / 2), at(c + gauge / 2)]);
    const conductors: Vec2[][] = [];
    for (const c of courseOnly || beam ? [] : centres) {
        // third rail beside the track (Britain's south: 750 V DC); fourth rail in the middle and beside (the Underground)
        if (tags.electrified === 'rail') conductors.push(at(c + gauge / 2 + 0.41));
        if (tags.electrified === '4th_rail') conductors.push(at(c), at(c - gauge / 2 - 0.41));
    }

    let bed: Vec2[] | undefined;
    const ties: Vec2[][] = [];
    if (beam) {
        bed = [...at(centres[0] - 0.4), ...at(centres[centres.length - 1] + 0.4).reverse()];
    } else if (!embedded) {
        const half = sleeperLength / 2 + 0.5 * k;
        const left = at(centres[0] - half);
        const right = at(centres[centres.length - 1] + half);
        bed = [...left, ...right.reverse()];
        if (sleepers && !courseOnly) {
            const length = polylineLength(points);
            const step = 0.65 * k;
            const width = 0.26 * k;
            for (let s = step / 2; s + width < length; s += step) {
                const a = pointAlong(points, s);
                const b = pointAlong(points, s + width);
                const na = rightNormal(a.direction);
                const nb = rightNormal(b.direction);
                for (const c of centres) {
                    ties.push([
                        add(a.point, scale(na, c - sleeperLength / 2)), add(b.point, scale(nb, c - sleeperLength / 2)),
                        add(b.point, scale(nb, c + sleeperLength / 2)), add(a.point, scale(na, c + sleeperLength / 2))
                    ]);
                }
            }
        }
    }

    const shape: TrackShape = {
        id: way.id, kind, status, embedded, covered: isCovered(tags), gauge,
        bed: bed?.map(frame.toLoc),
        sleepers: ties.map(tie => tie.map(frame.toLoc)),
        rails: rails.map(rail => rail.map(frame.toLoc)),
        conductors: conductors.map(rail => rail.map(frame.toLoc))
    };
    cache.set(way, { nodes, sleepers, shape });
    return shape;
}

/** The tracks of the railways among `entities` */
export function railGeometry(entities: OsmEntity[], graph: coreGraph, sleepers: boolean): TrackShape[] {
    const tracks: TrackShape[] = [];
    for (const entity of entities) {
        if (entity.type !== 'way' || !entity.tags.railway) continue;
        const shape = trackShape(entity as osmWay, graph, sleepers);
        if (shape) tracks.push(shape);
    }
    return tracks;
}
