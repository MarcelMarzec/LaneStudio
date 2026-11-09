import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { edgesAndGapsAt, roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { roadMarkingGeometry } from '../../../../modules/lanes/geometry/road_marking';

// Leicester (left-hand traffic); 1 m ≈ 1/111320° of latitude. The road runs east, so its right is south.
const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-1.13 + dx * mx, 52.63 + dy * m];

/** A one-way road 400 m long running east, and a painted area given by (east, north) corners in metres */
function scene(roadTags: Tags, corners: [number, number][], areaTags: Tags) {
    const entities: any[] = [
        new iD.osmNode({ id: 'n1', loc: at(-200, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(200, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: roadTags })
    ];
    const ids = corners.map((corner, i) => {
        const id = `n${100 + i}` as const;
        entities.push(new iD.osmNode({ id, loc: at(...corner) }));
        return id;
    });
    entities.push(new iD.osmWay({ id: 'w2', nodes: [...ids, ids[0]], tags: areaTags }));
    const graph = new iD.coreGraph(entities);
    const way = graph.entity('w1');
    const roads = roadGeometry([way], graph, [], [], [graph.entity('w2')]);
    return { graph, way, layout: laneLayout(way, graph), visual: roads.visuals.get('w1'), roads };
}

/** A box from 60 m before the middle to 60 m after it, between `south` and `north` metres */
const box = (south: number, north: number): [number, number][] => [[-60, south], [60, south], [60, north], [-60, north]];
const hatched = { road_marking: 'restriction', pattern: 'stripes' };

describe('lanes parting round painted areas', () => {
    it('parts the lanes round a hatched box between them, as wide as it is mapped, and joins them again past it', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '3' };
        const plain = scene(tags, box(-60, -59), hatched);
        const between = plain.layout.edges[2];   // the boundary between the second and third lanes
        const { layout, visual } = scene(tags, box(-between - 0.75, -between + 0.75), hatched);
        expect(visual?.parts).toHaveLength(1);
        expect(visual!.parts![0].edge).toBe(2);

        const middle = edgesAndGapsAt(layout, visual!, 200, 400);
        expect(middle.gaps).toHaveLength(1);
        expect(middle.gaps[0].left).toBeCloseTo(between - 0.75, 1);
        expect(middle.gaps[0].right).toBeCloseTo(between + 0.75, 1);
        // the lanes keep their widths: the road is wider by the box
        expect(middle.edges[3] - middle.edges[0]).toBeCloseTo(layout.total + 1.5, 1);
        expect(middle.edges[1] - middle.edges[0]).toBeCloseTo(layout.edges[1] - layout.edges[0], 1);

        const before = edgesAndGapsAt(layout, visual!, 20, 400);
        expect(before.gaps).toHaveLength(0);
        before.edges.forEach((e, k) => expect(e).toBeCloseTo(layout.edges[k], 3));
    });

    it('moves a road away from chevrons beside it reaching towards another road, squeezing its hard shoulder out', () => {
        const tags = { highway: 'motorway', oneway: 'yes', lanes: '3' };
        const plain = scene(tags, box(60, 61), hatched);
        const kerb = -plain.layout.edges[0];   // the left kerb, north of the way line
        // chevrons over the left lane by 1 m, reaching 8 m past the kerb
        const { layout, visual } = scene(tags, box(kerb - 1, kerb + 8), { road_marking: 'restriction', pattern: 'chevron' });
        expect(visual!.parts![0].edge).toBe(0);
        const middle = edgesAndGapsAt(layout, visual!, 200, 400);
        expect(middle.edges[0]).toBeCloseTo(layout.edges[0] + 1, 1);
        expect(middle.room.left).toBeCloseTo(0, 1);
    });

    it('pulls a road in to meet chevrons standing off its kerb, less as the gap grows, not at all far off', () => {
        const tags = { highway: 'motorway_link', oneway: 'yes', lanes: '1' };
        const kerb = -scene(tags, box(60, 61), hatched).layout.edges[0];
        const chevrons = { road_marking: 'restriction', pattern: 'chevron' };
        const moved = (gap: number) => {
            const { layout, visual } = scene(tags, box(kerb + gap, kerb + gap + 8), chevrons);
            if (!visual?.parts) return null;
            const middle = edgesAndGapsAt(layout, visual, 200, 400);
            return { by: layout.edges[0] - middle.edges[0], room: middle.room.left };
        };
        // the area is north, on the road's left: the road moves left (north) to meet it, its shoulder squeezed out
        expect(moved(2)!.by).toBeCloseTo(2, 1);
        expect(moved(2)!.room).toBeCloseTo(0, 1);
        expect(moved(5)!.by).toBeCloseTo(2, 1);
        expect(moved(7)).toBeNull();
    });

    it('leaves a box junction across the road and a keep-clear marking at the kerb painted on the lanes', () => {
        const tags = { highway: 'primary', oneway: 'yes', lanes: '2' };
        expect(scene(tags, box(-6, 6), { road_marking: 'restriction', pattern: 'crosshatch', colour: 'yellow' }).visual?.parts).toBeUndefined();
        const plain = scene(tags, box(60, 61), hatched);
        const kerb = -plain.layout.edges[0];
        expect(scene(tags, box(kerb - 1.5, kerb), hatched).visual?.parts).toBeUndefined();
    });

    it('turns chevrons to point back at the traffic coming towards them', () => {
        const { graph } = scene({ highway: 'motorway', oneway: 'yes', lanes: '2' }, box(10, 20), { road_marking: 'restriction', pattern: 'chevron' });
        const [area] = roadMarkingGeometry([graph.entity('w1'), graph.entity('w2')], graph).areas;
        expect(area.stripes!.length).toBeGreaterThan(10);
        // traffic runs east: each bar runs from its point (upstream, west) on down the road
        for (const bar of area.stripes!) expect(bar[0][0]).toBeLessThan(bar[1][0]);

        const against = scene({ highway: 'motorway', oneway: '-1', lanes: '2' }, box(10, 20), { road_marking: 'gore_chevron' });
        const [reversed] = roadMarkingGeometry([against.graph.entity('w1'), against.graph.entity('w2')], against.graph).areas;
        for (const bar of reversed.stripes!) expect(bar[0][0]).toBeGreaterThan(bar[1][0]);
    });
});
