import fs from 'node:fs';

import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { outsideLines, outsidePolygons } from '../../../../modules/lanes/svg/lanes';

type Way = InstanceType<typeof iD.osmWay>;

/** A one-way pair splitting off a service road by a turning circle mapped as an area (Bo'ness, Carriden Industrial Estate) */
function boness() {
    const data = JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/bo_ness_turning_circle.json', 'utf8')) as {
        nodes: Record<string, [number, number]>;
        nodeTags: Record<string, Tags>;
        ways: { id: string; nodes: string[]; tags: Tags }[];
    };
    const entities = [
        ...Object.entries(data.nodes).map(([id, loc]) => new iD.osmNode({ id: id as `n${number}`, loc, tags: data.nodeTags[id] ?? {} })),
        ...data.ways.map(w => new iD.osmWay({ id: w.id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags }))
    ];
    const graph = new iD.coreGraph(entities) as iD.Graph;
    return { data, graph };
}

describe('a one-way pair splitting off a service road (Bo\'ness)', () => {
    it('draws each one-way road where it is mapped, not shifted to line up with a lane of the road it splits from', () => {
        const { data, graph } = boness();
        const roads = data.ways.filter(w => w.tags.highway).map(w => graph.entity(w.id as `w${number}`) as Way);
        const { visuals } = roadGeometry(roads, graph);
        for (const id of ['w1579904688', 'w1579904690']) {
            const visual = visuals.get(id);
            expect(visual?.start ?? 0).toBe(0);
            expect(visual?.end ?? 0).toBe(0);
            expect((visual?.bends ?? []).every(([, shift]) => shift === 0)).toBe(true);
        }
    });
});

describe('a road running into its own road area', () => {
    const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];

    it('keeps the stretch of its surface outside the area', () => {
        const parts = outsidePolygons([[5, 4], [20, 4], [20, 6], [5, 6]], [square]);
        expect(parts).toHaveLength(1);
        const xs = parts[0].map(p => p[0]);
        expect(Math.min(...xs)).toBeCloseTo(10);
        expect(Math.max(...xs)).toBeCloseTo(20);
        expect(outsidePolygons([[2, 2], [8, 2], [8, 8]], [square])).toHaveLength(0);
    });

    it('cuts its kerbs where they cross the area\'s outline', () => {
        const lines = outsideLines([[5, 4], [20, 4]], [square]);
        expect(lines).toHaveLength(1);
        expect(lines[0][0][0]).toBeCloseTo(10);
        expect(lines[0][lines[0].length - 1][0]).toBeCloseTo(20);
        expect(outsideLines([[1, 1], [9, 9]], [square])).toHaveLength(0);
    });
});
