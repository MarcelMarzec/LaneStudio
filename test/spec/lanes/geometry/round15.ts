import fs from 'node:fs';

import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { laneLayout } from '../../../../modules/lanes/geometry/layout';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

// near Skegness (left-hand traffic: roundabouts run clockwise); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);
const radius = (loc: [number, number]) => Math.hypot(...frame.toMetres(loc));

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
type Way = InstanceType<typeof iD.osmWay>;
type WayID = `w${number}`;

/**
 * A tight clockwise three-lane ring of radius 13 m, mapped as short ways of three nodes (as in Boston), with a
 * three-lane road entering it from the east
 */
function tightRing(ringTags: Tags = {}, off = 0) {
    const entities: Entity[] = [];
    let k = 1;
    const N = (x: number, y: number) => {
        const node = new iD.osmNode({ id: `n${k++}` as `n${number}`, loc: at(x, y) });
        entities.push(node);
        return node.id;
    };
    const r = 13;
    const angles = Array.from({ length: 12 }, (_, i) => 360 - i * 30);   // clockwise from the east
    const ids = angles.map(a => N(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)));
    const ring: WayID[] = [];
    for (let i = 0; i < 12; i += 2) {
        const id: WayID = `w${10 + i}`;
        ring.push(id);
        entities.push(new iD.osmWay({ id, nodes: [ids[i], ids[i + 1], ids[(i + 2) % 12]], tags: { highway: 'primary', junction: 'roundabout', lanes: '3', ...ringTags } }));
    }
    // `off` degrees from straight out, round towards where traffic comes from
    const a = off * Math.PI / 180;
    entities.push(new iD.osmWay({ id: 'w1', nodes: [N(r + 80 * Math.cos(a), 80 * Math.sin(a)), ids[0]], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }));
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities);
    const geometry = roadGeometry((['w1', ...ring] as WayID[]).map(id => graph.entity(id) as Way), graph);
    const outer = r + laneLayout(graph.entity('w10'), graph).total / 2;
    return { geometry, outer, node: ids[0], r };
}

describe('a tight roundabout mapped as many short ways', () => {
    it.each([0, 20, 40, 60, -20, -40])('stops a road joining it %d° off straight out clear of the ring', off => {
        const { geometry, outer, node, r } = tightRing({}, off);
        // each of the ring's short ways has its nodes to one side of the roundabout: its middle comes from the whole ring
        const piece = geometry.pieces.find(p => p.wayID === 'w1')!;
        for (const boundary of piece.boundaries) {
            const end = boundary[boundary.length - 1];
            expect(radius(end)).toBeGreaterThan(outer - 0.05);
        }
        const junction = geometry.junctions.find(j => j.nodeID === node)!;
        expect(junction.kind).toBe('flare');
        // the flare stays outside the ring's middle line
        for (const p of junction.polygons.flat()) expect(radius(p)).toBeGreaterThan(r - 0.5);
    });

    it('draws no lines on into a ring without painted lanes', () => {
        const marked = tightRing().geometry.connections.filter(c => c.kind === 'guide');
        const unmarked = tightRing({ lane_markings: 'no' }).geometry.connections.filter(c => c.kind === 'guide');
        expect(marked.length).toBeGreaterThan(0);
        expect(unmarked).toHaveLength(0);
    });
});


describe('the Liquorpond Street Roundabout, Boston (OpenStreetMap)', () => {
    // the ring as mapped: six short ways of two or three lanes, and the six one-way roads joining it
    function boston() {
        const data = JSON.parse(fs.readFileSync('test/spec/lanes/fixtures/boston_roundabout.json', 'utf8')) as {
            nodes: Record<string, [number, number]>;
            ways: { id: string; nodes: string[]; tags: Tags }[];
        };
        const entities = [
            ...Object.entries(data.nodes).map(([id, loc]) => new iD.osmNode({ id: id as `n${number}`, loc })),
            ...data.ways.map(w => new iD.osmWay({ id: w.id as `w${number}`, nodes: w.nodes as `n${number}`[], tags: w.tags }))
        ];
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const ways = data.ways.map(w => graph.entity(w.id as WayID) as Way);
        const ring = data.ways.filter(w => w.tags.junction === 'roundabout');
        const ringNodes = [...new Set(ring.flatMap(w => w.nodes))];
        const middle = ringNodes.map(id => data.nodes[id]).reduce((a, b) => [a[0] + b[0] / ringNodes.length, a[1] + b[1] / ringNodes.length], [0, 0]);
        return { data, graph, geometry: roadGeometry(ways, graph), ringNodes, frame: metricFrame(middle as [number, number]) };
    }

    it('stops every road joining the ring outside it, not on its middle lanes', () => {
        const { data, geometry, ringNodes, frame } = boston();
        const r = (loc: [number, number]) => Math.hypot(...frame.toMetres(loc));
        const sides = data.ways.filter(w => w.tags.junction !== 'roundabout');
        expect(sides).toHaveLength(6);
        for (const way of sides) {
            const atStart = ringNodes.includes(way.nodes[0]);
            const pieces = geometry.pieces.filter(p => p.wayID === way.id);
            const piece = atStart ? pieces[0] : pieces[pieces.length - 1];
            const node = atStart ? way.nodes[0] : way.nodes[way.nodes.length - 1];
            const ring = r(data.nodes[node]);
            // the ring's lanes reach about 5 m either side of its line: the road's lanes end beyond them
            for (const boundary of piece.boundaries) {
                const end = atStart ? boundary[0] : boundary[boundary.length - 1];
                expect(r(end)).toBeGreaterThan(ring + 3);
            }
        }
    });
});
