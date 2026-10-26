import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';

// near Skegness (left-hand traffic: roundabouts run clockwise); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const origin: [number, number] = [0.30, 53.17];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
const frame = metricFrame(origin);
const metres = (loc: [number, number]) => frame.toMetres(loc);
const distance = (a: [number, number], b: [number, number]) => Math.hypot(metres(a)[0] - metres(b)[0], metres(a)[1] - metres(b)[1]);

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay | typeof iD.osmRelation>;

function geometryOf(entities: Entity[]) {
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities);
    return roadGeometry(entities.filter(e => e.type === 'way').map(e => graph.entity(e.id)), graph);
}

/** A clockwise two-lane ring of radius 25 m round the origin, and a road `w2` joining it at 10°, `off` degrees from straight out */
function ringWithRoad(off: number, tags: Tags) {
    const entities: Entity[] = [];
    let k = 1;
    const N = (x: number, y: number) => {
        const node = new iD.osmNode({ id: `n${k++}` as `n${number}`, loc: at(x, y) });
        entities.push(node);
        return node.id;
    };
    const r = 25;
    const angles = [...new Set([10, ...Array.from({ length: 24 }, (_, i) => i * 15)])].sort((a, b) => b - a);
    const ids = new Map(angles.map(a => [a, N(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180))]));
    const list = angles.map(a => ids.get(a)!);
    entities.push(new iD.osmWay({ id: 'w1', nodes: [...list, list[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }));
    const a = (10 + off) * Math.PI / 180;
    const start = [r * Math.cos(10 * Math.PI / 180), r * Math.sin(10 * Math.PI / 180)];
    entities.push(new iD.osmWay({ id: 'w2', nodes: [ids.get(10)!, N(start[0] + 90 * Math.cos(a), start[1] + 90 * Math.sin(a))], tags }));
    const geometry = geometryOf(entities);
    return geometry.connections.filter(c => c.nodeID === ids.get(10) && c.kind === 'guide');
}


describe('guide lines onto and off a roundabout', () => {
    it('guides each lane entering a roundabout into the ring, along its edges but not the kerb', () => {
        // w2 runs out from the ring: oneway=-1 is an entry. Its two lanes join the ring's two: the line between
        // them carries on between the ring's lanes, the nearside edge runs along the kerb (no line), and the
        // offside edge crosses the ring to its inner edge (Round 14)
        expect(ringWithRoad(0, { highway: 'primary', lanes: '2', oneway: '-1' })).toHaveLength(2);
        expect(ringWithRoad(-40, { highway: 'primary', lanes: '2', oneway: '-1' })).toHaveLength(2);
        // one lane joins the ring's outer lane: a line along its inner edge, into the line between the ring's lanes
        expect(ringWithRoad(0, { highway: 'primary', lanes: '1', oneway: '-1' })).toHaveLength(1);
    });

    it('peels the outer lanes of the ring off into an exit leaving at a shallow angle', () => {
        // -65° leaves 25° off the ring's direction: a one-lane exit takes the outer lane, with a line along its
        // inner edge (its outer edge is the kerb)
        const guides = ringWithRoad(-65, { highway: 'primary', lanes: '1', oneway: 'yes' });
        expect(guides).toHaveLength(1);
        // the lines run from the ring into the exit, so each is a few metres long at least
        for (const guide of guides) expect(distance(guide.line[0], guide.line[guide.line.length - 1])).toBeGreaterThan(3);
        // an exit straight out from the ring has the ring's edge line across it instead
        expect(ringWithRoad(0, { highway: 'primary', lanes: '1', oneway: 'yes' })).toHaveLength(0);
    });
});


describe('lane connections', () => {
    // a one-lane road joining a three-lane one-way road, connected `connectivity`
    function joined(connectivity: string) {
        const geometry = geometryOf([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n2', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }), new iD.osmNode({ id: 'n4', loc: at(-80, 40) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', oneway: 'yes', lanes: '3' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n4', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '1' } }),
            new iD.osmRelation({ id: 'r1', tags: { type: 'connectivity', connectivity }, members: [
                { id: 'w3', type: 'way', role: 'from' }, { id: 'n2', type: 'node', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }
            ] })
        ]);
        const relation = geometry.connections.find(c => c.kind === 'relation')!;
        const start = relation.line[0];
        // the guide lines of the connected lane: they start beside the relation's line, at the joining road's end
        const guides = geometry.connections.filter(c => c.kind === 'guide' && !c.inferred && distance(c.line[0], start) < 3);
        return { relation, guides };
    }

    it('guides connected lanes along their edges, not down the middle', () => {
        const { relation, guides } = joined('1:1');
        expect(guides).toHaveLength(2);
        // where they reach w2 (running east), half a lane (3.65 m on a primary road) either side of the lane's centre
        const centre = metres(relation.line[relation.line.length - 1])[1];
        const offsets = guides.map(g => metres(g.line[g.line.length - 1])[1] - centre).sort((a, b) => a - b);
        expect(offsets[0]).toBeCloseTo(-1.825, 1);
        expect(offsets[1]).toBeCloseTo(1.825, 1);
    });

    it('moves the guide lines to the lanes the connection leads to', () => {
        const ends = (connectivity: string) => joined(connectivity).guides.map(g => metres(g.line[g.line.length - 1])[1]).sort((a, b) => a - b);
        const first = ends('1:1');
        const third = ends('1:3');
        // two lanes further across (w2 runs east, so across is north–south)
        expect(Math.abs(first[0] - third[0])).toBeGreaterThan(5);
    });
});


describe('turn arrows at stop lines', () => {
    // a three-lane one-way road with turn lanes up to a crossroads, with traffic signals 30 m before it
    function approach(signalTags: Tags, crossing = false) {
        const geometry = geometryOf([
            new iD.osmNode({ id: 'n1', loc: at(-200, 0) }), new iD.osmNode({ id: 'n5', loc: at(-30, 0), tags: { highway: 'traffic_signals', ...signalTags } }),
            new iD.osmNode({ id: 'n7', loc: at(-34, 0), tags: crossing ? { highway: 'crossing', crossing: 'traffic_signals' } : {} }),
            new iD.osmNode({ id: 'n2', loc: at(0, 0) }), new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmNode({ id: 'n4', loc: at(0, 100) }), new iD.osmNode({ id: 'n6', loc: at(0, -100) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n7', 'n5', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '3', 'turn:lanes': 'left|through|right' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3'], tags: { highway: 'primary', lanes: '2' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n4', 'n2', 'n6'], tags: { highway: 'primary', lanes: '2' } })
        ]);
        const arrows = geometry.pieces.filter(p => p.wayID === 'w1').flatMap(p => p.arrows);
        // the arrows nearest the junction, one per lane: how far along the road (x) each stands
        return [0, 1, 2].map(lane => Math.max(...arrows.filter(a => a.lane === lane).map(a => metres(a.loc)[0])));
    }

    it('stands the arrows of all lanes level, just behind the line', () => {
        for (const x of approach({ 'traffic_signals:direction': 'forward' })) {
            expect(x).toBeLessThan(-32);
            expect(x).toBeGreaterThan(-37);
        }
    });

    it('stands them behind a pedestrian crossing just before the line', () => {
        // the crossing is 4 m before the line, about 3 m wide: the arrows are clear of it
        for (const x of approach({ 'traffic_signals:direction': 'forward' }, true)) {
            expect(x).toBeLessThan(-38);
            expect(x).toBeGreaterThan(-43);
        }
    });

    it('leaves the arrows where they were for signals facing the other way', () => {
        for (const x of approach({ 'traffic_signals:direction': 'backward' })) expect(x).toBeGreaterThan(-25);
    });
});
