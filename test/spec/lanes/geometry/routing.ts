import { describeMove, restrictionAt, vehicleRoutes, viaWayRestriction, walkable, walkingRoutes } from '../../../../modules/lanes/geometry/routing';

// near Skegness (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [0.30 + dx * mx, 53.17 + dy * m];

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay | typeof iD.osmRelation>;
const graphOf = (entities: Entity[]) => {
    // @ts-expect-error -- the constructor also takes a list of entities
    return new iD.coreGraph(entities) as iD.Graph;
};

/**
 * A crossroads: a one-way approach from the west (w1, its lanes tagged `turns`) and three roads out of it,
 * east (w2, ahead), north (w3, left) and south (w4, right)
 */
function crossroads(approach: Tags, extra: Entity[] = [], east: Tags = {}) {
    return graphOf([
        new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(100, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }), new iD.osmNode({ id: 'n4', loc: at(0, -100) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', oneway: 'yes', ...approach } }),
        new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', ...east } }),
        new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'primary', lanes: '2' } }),
        new iD.osmWay({ id: 'w4', nodes: ['n0', 'n4'], tags: { highway: 'primary', lanes: '2' } }),
        ...extra
    ]);
}
const firstRoads = (graph: iD.Graph, lane: number, profile: 'car' | 'bus' | 'bicycle' | 'hgv' = 'car', wayID = 'w1') =>
    vehicleRoutes(graph, wayID as `w${number}`, { direction: 'forward', index: lane }, 0, 1, profile).routes.map(r => r.moves[0]?.toWayID).sort();


describe('routes through a junction', () => {
    const marked = { lanes: '3', 'turn:lanes': 'left|through|right' };

    it('follows each lane\'s turn arrows', () => {
        const graph = crossroads(marked);
        expect(firstRoads(graph, 0)).toEqual(['w3']);
        expect(firstRoads(graph, 1)).toEqual(['w2']);
        expect(firstRoads(graph, 2)).toEqual(['w4']);
        const left = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1).routes[0];
        expect(left.moves[0].turn).toBe('left');
        expect(left.runs[0]).toMatchObject({ wayID: 'w1', from: 0, to: 1 });
    });

    it('lets unmarked lanes turn to their own side, or go ahead', () => {
        const graph = crossroads({ lanes: '2' });
        expect(firstRoads(graph, 0)).toEqual(['w2', 'w3']);
        expect(firstRoads(graph, 1)).toEqual(['w2', 'w4']);
    });

    it('keeps out of turns a restriction bans, unless it excepts the vehicle', () => {
        const restriction = (tags: Tags) => new iD.osmRelation({
            id: 'r1', tags: { type: 'restriction', ...tags },
            members: [{ id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w3', type: 'way', role: 'to' }]
        });
        const banned = crossroads(marked, [restriction({ restriction: 'no_left_turn', except: 'bicycle' })]);
        expect(firstRoads(banned, 0)).toEqual([]);
        const result = vehicleRoutes(banned, 'w1', { direction: 'forward', index: 0 }, 0, 1);
        expect(result.blocked.map(b => [b.toWayID, b.reason])).toEqual([['w3', 'no_left_turn']]);
        expect(firstRoads(banned, 0, 'bicycle')).toEqual(['w3']);
        expect(restrictionAt(banned, banned.entity('w1') as InstanceType<typeof iD.osmWay>, 'n0', banned.entity('w2') as InstanceType<typeof iD.osmWay>, 'car')).toBeNull();
        // only_straight_on bans every other way
        const only = crossroads({ lanes: '2' }, [new iD.osmRelation({
            id: 'r1', tags: { type: 'restriction', restriction: 'only_straight_on' },
            members: [{ id: 'w1', type: 'way', role: 'from' }, { id: 'n0', type: 'node', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }]
        })]);
        expect(firstRoads(only, 0)).toEqual(['w2']);
    });

    it('keeps vehicles out of lanes and roads closed to them', () => {
        // the road ahead's left lane is a bus lane: a car goes into the other lane, a bus may use it
        // (a lane added ahead is added at the kerb, so the approach lines up with the right-hand lane: the bus lane)
        const bus = crossroads({ lanes: '1' }, [], { 'bus:lanes': '|designated' });
        const car = vehicleRoutes(bus, 'w1', { direction: 'forward', index: 0 }, 0, 1, 'car').routes.find(r => r.moves[0].toWayID === 'w2')!;
        expect(car.runs[1].enter.index).toBe(0);
        const onBus = vehicleRoutes(bus, 'w1', { direction: 'forward', index: 0 }, 0, 1, 'bus').routes.find(r => r.moves[0].toWayID === 'w2')!;
        expect(onBus.runs[1].enter.index).toBe(1);
        // a low bridge ahead stops a lorry, not a car
        const low = crossroads({ lanes: '1' }, [], { maxheight: '3.5' });
        expect(firstRoads(low, 0, 'car')).toContain('w2');
        expect(firstRoads(low, 0, 'hgv')).not.toContain('w2');
        expect(vehicleRoutes(low, 'w1', { direction: 'forward', index: 0 }, 0, 1, 'hgv').blocked[0].reason).toBe('height limit 3.5 m');
        // no cycling on a motorway
        const motorway = crossroads({ lanes: '1' }, [], { highway: 'motorway' });
        expect(firstRoads(motorway, 0, 'bicycle')).not.toContain('w2');
    });

    it('shows where traffic in a lane comes from', () => {
        const graph = crossroads({ lanes: '1' });
        const result = vehicleRoutes(graph, 'w3', { direction: 'forward', index: 0 }, 0, 1);
        // from the west, turning left, and from the south, ahead
        expect(result.incoming.map(r => r.runs[0].wayID).sort()).toEqual(['w1', 'w4']);
        expect(result.incoming.find(r => r.runs[0].wayID === 'w1')!.runs[0]).toMatchObject({ from: 0, to: 1 });
    });
});


describe('restrictions via ways', () => {
    /**
     * A dual carriageway: eastbound w1 on the north, westbound w2 on the south, a gap between them (w3) where a
     * U-turn would go, and a side road south (w4) off the westbound carriageway at the gap
     */
    function dual(restriction?: Tags) {
        return graphOf([
            new iD.osmNode({ id: 'n11', loc: at(-100, 6) }), new iD.osmNode({ id: 'n10', loc: at(0, 6) }), new iD.osmNode({ id: 'n12', loc: at(100, 6) }),
            new iD.osmNode({ id: 'n22', loc: at(100, -6) }), new iD.osmNode({ id: 'n20', loc: at(0, -6) }), new iD.osmNode({ id: 'n21', loc: at(-100, -6) }),
            new iD.osmNode({ id: 'n31', loc: at(0, -100) }),
            new iD.osmWay({ id: 'w1', nodes: ['n11', 'n10', 'n12'], tags: { highway: 'trunk', oneway: 'yes', lanes: '1', name: 'Sleaford Road' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n22', 'n20', 'n21'], tags: { highway: 'trunk', oneway: 'yes', lanes: '1', name: 'Sleaford Road' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n10', 'n20'], tags: { highway: 'tertiary', lanes: '2' } }),
            new iD.osmWay({ id: 'w4', nodes: ['n20', 'n31'], tags: { highway: 'tertiary', lanes: '2' } }),
            ...(restriction ? [new iD.osmRelation({
                id: 'r1', tags: { type: 'restriction', ...restriction },
                members: [{ id: 'w1', type: 'way', role: 'from' }, { id: 'w3', type: 'way', role: 'via' }, { id: 'w2', type: 'way', role: 'to' }]
            })] : [])
        ]);
    }
    const second = (graph: iD.Graph) => vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1)
        .routes.filter(r => r.moves[0].toWayID === 'w3').map(r => r.moves[1]?.toWayID).sort();

    it('turns back through the gap where nothing bans it', () => {
        expect(second(dual())).toEqual(['w2', 'w4']);
    });

    it('keeps out of a U-turn banned via the gap, and says so', () => {
        const graph = dual({ restriction: 'no_u_turn' });
        expect(second(graph)).toEqual(['w4']);
        const result = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1);
        expect(result.blocked.map(b => [b.toWayID, b.reason])).toEqual([['w2', 'no_u_turn']]);
        // only from the restriction's from-road: coming from elsewhere through the gap is not banned
        expect(viaWayRestriction(graph, ['w4', 'w3'], graph.entity('w2') as InstanceType<typeof iD.osmWay>, 'car')).toBeNull();
        expect(viaWayRestriction(graph, ['w1', 'w3'], graph.entity('w2') as InstanceType<typeof iD.osmWay>, 'car')).toBe('no_u_turn');
    });

    it('sends traffic only to the to-road of an only_ restriction via a way, unless it excepts the vehicle', () => {
        const graph = dual({ restriction: 'only_u_turn', except: 'psv' });
        expect(second(graph)).toEqual(['w2']);
        const bus = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1, 'bus')
            .routes.filter(r => r.moves[0].toWayID === 'w3').map(r => r.moves[1]?.toWayID).sort();
        expect(bus).toEqual(['w2', 'w4']);
    });
});


describe('routes round a roundabout', () => {
    // a clockwise ring of radius 30 m with two-way roads joining it from the south, west, north and east;
    // the south road's lanes in to the ring are tagged `turns`
    function roundabout(turns: string) {
        const entities: Entity[] = [];
        let k = 1;
        const N = (x: number, y: number) => {
            const node = new iD.osmNode({ id: `n${k++}` as `n${number}`, loc: at(x, y) });
            entities.push(node);
            return node.id;
        };
        const r = 30;
        const angles = Array.from({ length: 12 }, (_, i) => 330 - i * 30);   // clockwise
        const ids = new Map(angles.map(a => [a, N(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180))]));
        const list = angles.map(a => ids.get(a)!);
        entities.push(new iD.osmWay({ id: 'w0', nodes: [...list, list[0]], tags: { highway: 'primary', junction: 'roundabout', lanes: '2' } }));
        for (const [id, angle] of [['w1', 270], ['w2', 180], ['w3', 90], ['w4', 0]] as const) {
            const outer = N(150 * Math.cos(angle * Math.PI / 180), 150 * Math.sin(angle * Math.PI / 180));
            entities.push(new iD.osmWay({
                id, nodes: [outer, ids.get(angle)!],
                tags: { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1', ...(id === 'w1' ? { 'turn:lanes:forward': turns } : {}) }
            }));
        }
        return graphOf(entities);
    }
    const exits = (graph: iD.Graph, lane: number) => vehicleRoutes(graph, 'w1', { direction: 'forward', index: lane }, 0, 1)
        .routes.map(route => route.moves.find(m => m.ring === 'exit')).filter(Boolean).map(m => `${m!.exit}:${m!.toWayID}`).sort();

    it('takes each lane to the exits its arrows point to, counting them', () => {
        const graph = roundabout('left|through;right');
        // from the south: west is the first exit (left), north the second (ahead), east the third (right)
        expect(exits(graph, 0)).toEqual(['1:w2']);
        expect(exits(graph, 1)).toEqual(['2:w3', '3:w4']);
    });

    it('lets unmarked lanes leave by any exit, all the way round included', () => {
        const graph = roundabout('');
        expect(exits(graph, 0)).toEqual(['1:w2', '2:w3', '3:w4', '4:w1']);
    });

    it('describes leaving by an exit with its number', () => {
        const graph = roundabout('');
        const route = vehicleRoutes(graph, 'w1', { direction: 'forward', index: 0 }, 0, 1).routes.find(r => r.moves.some(m => m.ring === 'exit' && m.exit === 2))!;
        const exit = route.moves.find(m => m.ring === 'exit')!;
        expect(describeMove(exit, graph).turn).toBe('2nd exit');
        expect(describeMove(route.moves[0], graph).turn).toBe('enter the roundabout');
    });
});


describe('walking', () => {
    it('knows which ways people walk along', () => {
        const way = (tags: Tags) => new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags });
        expect(walkable(way({ highway: 'footway' }))).toBe(true);
        expect(walkable(way({ highway: 'residential' }))).toBe(true);
        expect(walkable(way({ highway: 'primary', sidewalk: 'both' }))).toBe(true);
        expect(walkable(way({ highway: 'primary' }))).toBe(false);
        expect(walkable(way({ highway: 'primary', sidewalk: 'separate' }))).toBe(false);
        expect(walkable(way({ highway: 'motorway', foot: 'yes' }))).toBe(false);
        expect(walkable(way({ highway: 'footway', access: 'private' }))).toBe(false);
    });

    it('reaches along paths and across crossings, as far as the walk allows', () => {
        // a footway east, a crossing node, a footway on; and a path off it the far side of 300 m
        const graph = graphOf([
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(50, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(60, 0), tags: { highway: 'crossing' } }), new iD.osmNode({ id: 'n4', loc: at(120, 0) }),
            new iD.osmNode({ id: 'n5', loc: at(420, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3', 'n4'], tags: { highway: 'footway', name: 'Park Walk' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n4', 'n5'], tags: { highway: 'path', name: 'Long Path' } })
        ]);
        const walk = walkingRoutes(graph, 'w1', 250);
        expect(walk.crossings).toHaveLength(1);
        expect(walk.reached).toEqual(expect.arrayContaining(['Park Walk', 'Long Path']));
        // the long path is walked only part way: 250 m on from the end of the start way, 50 m east
        const path = walk.segments.find(s => s.wayID === 'w3')!;
        const metresEast = (path.points[1][0] - 0.30) / mx;
        expect(metresEast).toBeGreaterThan(295);
        expect(metresEast).toBeLessThan(305);
    });
});
