import fs from 'node:fs';
import { roadGeometry, edgesAt } from '../../../../modules/lanes/geometry/road_geometry';
import { metricFrame, pointAlong, polylineLength } from '../../../../modules/lanes/geometry/frame';

/** The M5 at junction 14's exit (n225587), with the chevrons mapped between the motorway and the slip road (w1576739014) */
function m5(withChevrons: boolean) {
    const data = JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/m5_diverge.json', 'utf8')) as {
        nodes: Record<string, { loc: [number, number]; tags: Tags }>; ways: Record<string, { nodes: string[]; tags: Tags }>;
    };
    const entities: any[] = [
        ...Object.entries(data.nodes).map(([id, n]) => new iD.osmNode({ id: id as `n${number}`, loc: n.loc, tags: n.tags })),
        ...Object.entries(data.ways).map(([id, w]) => new iD.osmWay({ id: id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags }))
    ];
    const chevrons: [number, number][] = [[-2.4352059, 51.6540019], [-2.4352498, 51.6540404], [-2.4354299, 51.6539172], [-2.4356341, 51.6537737],
        [-2.4359724, 51.653543], [-2.4356151, 51.6537672], [-2.4353952, 51.6538951]];
    if (withChevrons) {
        chevrons.forEach((loc, i) => entities.push(new iD.osmNode({ id: `n${900 + i}` as `n${number}`, loc })));
        entities.push(new iD.osmWay({ id: 'w900', nodes: [...chevrons.map((_, i) => `n${900 + i}` as `n${number}`), 'n900'],
            tags: { area: 'yes', road_marking: 'restriction', pattern: 'chevron', stroke: 'solid' } }));
    }
    const graph = new iD.coreGraph(entities) as any;
    const roads = ['w315021126', 'w23658069'].map(id => graph.entity(id as `w${number}`));
    return { graph, geometry: roadGeometry(roads, graph, [], [], withChevrons ? [graph.entity('w900')] : []) };
}

describe('slip roads drawn beside the main road', () => {
    it('keeps a slip road\'s lane drawing away from the motorway steadily, without bowing out and back', () => {
        for (const withChevrons of [false, true]) {
            const { graph, geometry } = m5(withChevrons);
            const slip = graph.entity('w23658069');
            const visual = geometry.visuals.get('w23658069')!;
            const frame = metricFrame(graph.entity(slip.first()).loc);
            const line = slip.nodes.map((id: string) => frame.toMetres(graph.entity(id).loc));
            const total = polylineLength(line);
            const main = graph.entity('w315021126');
            const mainLine = main.nodes.map((id: string) => frame.toMetres(graph.entity(id).loc));
            // the drawn lane's centre, and how far it is from the motorway's line, every 5 m for the first 200 m
            const layout = geometry.pieces.find(p => p.wayID === 'w23658069')!.layout;
            const distances: number[] = [];
            for (let s = 0; s <= Math.min(200, total); s += 5) {
                const at = pointAlong(line, s);
                const e = edgesAt(layout, visual, s, total);
                const centre = (e[0] + e[1]) / 2;
                const p: [number, number] = [at.point[0] + at.direction[1] * centre, at.point[1] - at.direction[0] * centre];
                distances.push(Math.min(...mainLine.slice(0, -1).map((a: number[], i: number) => {
                    const b = mainLine[i + 1];
                    const d = [b[0] - a[0], b[1] - a[1]];
                    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1])));
                    return Math.hypot(a[0] + d[0] * t - p[0], a[1] + d[1] * t - p[1]);
                })));
            }
            // it never comes back towards the motorway once it has drawn away; with the chevrons, only as far as their
            // mapped edge (a few tens of centimetres nearer the motorway than the lane is drawn)
            const back = withChevrons ? 0.4 : 0.05;
            for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeGreaterThan(Math.max(...distances.slice(0, i)) - back);
        }
    });

    it('leaves out the motorway\'s hard shoulder beside the slip lane until the slip road has drawn away', () => {
        const { geometry } = m5(false);
        const squeeze = geometry.visuals.get('w315021126')?.squeeze;
        expect(squeeze).toHaveLength(1);
        // the slip road leaves on the left (the hard shoulder's side in Britain), and runs beside it for some way
        expect(squeeze![0].side).toBe('left');
        expect(squeeze![0].to - squeeze![0].from).toBeGreaterThan(20);
    });
});
