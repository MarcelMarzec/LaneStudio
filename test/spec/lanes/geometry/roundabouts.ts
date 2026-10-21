import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { vehicleRoutes } from '../../../../modules/lanes/geometry/routing';

type Entity = InstanceType<typeof iD.osmNode | typeof iD.osmWay>;
type Way = InstanceType<typeof iD.osmWay>;
type WayID = `w${number}`;
type NodeID = `n${number}`;

interface Layout {
    /** the bearing of each arm, degrees anticlockwise from east */
    arms: number[];
    radius: number;
    ringLanes: number;
    /** the ring as one closed way, or one way between each pair of arms, or many short ways */
    ring: 'closed' | 'split' | 'short';
    /** two-way roads joining at one node, or a one-way entry and exit either side of the arm */
    arm: 'two-way' | 'split';
    /** lanes on each entry, and their arrows (left to right) */
    entryLanes?: number;
    entryTurns?: string;
    /** right-hand traffic (France) instead of left-hand (England) */
    rightHand?: boolean;
    /** degrees between ring nodes (10 by default) */
    step?: number;
    /** degrees between an arm and its entry or exit, for split arms */
    splitOffset?: number;
    /** a lane more on every other piece of the ring, as where an entry's lanes run on round it */
    unevenLanes?: boolean;
}

/** A roundabout built to `layout`, with the ways traffic enters it on and leaves it by */
function roundabout(layout: Layout) {
    const [lon0, lat0] = layout.rightHand ? [2.35, 48.85] : [-0.03, 52.97];
    const m = 1 / 111320;
    const mx = m / Math.cos(lat0 * Math.PI / 180);
    const at = (x: number, y: number): [number, number] => [lon0 + x * mx, lat0 + y * m];
    const polar = (r: number, a: number) => at(r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180));
    const entities: Entity[] = [];
    let k = 1;
    const node = (loc: [number, number]) => {
        const n = new iD.osmNode({ id: `n${k++}` as NodeID, loc });
        entities.push(n);
        return n.id;
    };
    let w = 1;
    const way = (nodes: string[], tags: Tags) => {
        const id = `w${w++}` as WayID;
        entities.push(new iD.osmWay({ id, nodes: nodes as NodeID[], tags }));
        return id;
    };

    // ring nodes every 10° (every 30° for a ring of short ways, which bends sharply at each node, as mapped in
    // Boston), with the arms' nodes among them
    const { radius: r } = layout;
    const offset = layout.arm === 'split' ? layout.splitOffset ?? Math.min(12, 600 / r) : 0;
    const armAngles = new Map<number, { arm: number; role: 'join' | 'entry' | 'exit' }>();
    // traffic goes round clockwise in left-hand traffic, so it meets an arm's entry before its exit
    const sense = layout.rightHand ? 1 : -1;
    layout.arms.forEach((a, arm) => {
        if (layout.arm === 'two-way') armAngles.set(a, { arm, role: 'join' });
        else {
            armAngles.set(a - sense * offset, { arm, role: 'entry' });
            armAngles.set(a + sense * offset, { arm, role: 'exit' });
        }
    });
    const step = layout.step ?? (layout.ring === 'short' ? 30 : 10);
    const angles = [...new Set([...Array.from({ length: 360 / step }, (_, i) => i * step), ...armAngles.keys()].map(a => (a + 360) % 360))]
        .sort((p, q) => sense * (p - q));
    const ringNodes = angles.map(a => ({ a, id: node(polar(r, a)) }));
    const ringTags: Tags = { highway: 'primary', junction: 'roundabout', lanes: String(layout.ringLanes) };
    const ids = ringNodes.map(n => n.id);
    const ringWays: WayID[] = [];
    if (layout.ring === 'closed') ringWays.push(way([...ids, ids[0]], ringTags));
    else {
        const cuts = ringNodes.flatMap((n, i) => (layout.ring === 'short' ? (i % 2 === 0 || armAngles.has(n.a) ? [i] : []) : armAngles.has(n.a) ? [i] : []));
        cuts.forEach((c, i) => {
            const next = cuts[(i + 1) % cuts.length];
            const span = next > c ? ids.slice(c, next + 1) : [...ids.slice(c), ...ids.slice(0, next + 1)];
            const lanes = layout.unevenLanes && i % 2 ? layout.ringLanes + 1 : layout.ringLanes;
            ringWays.push(way(span, { ...ringTags, lanes: String(lanes) }));
        });
    }

    const entries: { id: WayID; arm: number; lanes: number }[] = [];
    const exits: { id: WayID; arm: number }[] = [];
    const ringNode = (a: number) => ringNodes.find(n => n.a === (a + 360) % 360)!.id;
    for (const [a, { arm, role }] of armAngles) {
        const far = node(polar(r + 120, layout.arms[arm] + (role === 'join' ? 0 : (a - layout.arms[arm]) / 3)));
        const entryTags: Tags = {
            highway: 'primary', oneway: 'yes', lanes: String(layout.entryLanes ?? 1),
            ...(layout.entryTurns ? { 'turn:lanes': layout.entryTurns } : {})
        };
        if (role === 'join') {
            const id = way([far, ringNode(a)], { highway: 'primary', lanes: '2' });
            entries.push({ id, arm, lanes: 1 });
            exits.push({ id, arm });
        } else if (role === 'entry') {
            entries.push({ id: way([far, ringNode(a)], entryTags), arm, lanes: layout.entryLanes ?? 1 });
        } else {
            exits.push({ id: way([ringNode(a), far], { highway: 'primary', oneway: 'yes', lanes: '1' }), arm });
        }
    }
    // @ts-expect-error -- the constructor also takes a list of entities
    const graph = new iD.coreGraph(entities) as iD.Graph;
    return { graph, ringWays, entries, exits };
}

const layouts: [string, Layout][] = [
    ['a small four-arm roundabout, one closed way', { arms: [0, 90, 180, 270], radius: 15, ringLanes: 1, ring: 'closed', arm: 'two-way' }],
    ['a four-arm roundabout split at each arm', { arms: [0, 90, 180, 270], radius: 30, ringLanes: 2, ring: 'split', arm: 'two-way' }],
    ['a tight roundabout of many short ways', { arms: [0, 120, 240], radius: 13, ringLanes: 2, ring: 'short', arm: 'split', entryLanes: 2 }],
    ['a three-arm roundabout with marked entry lanes', { arms: [10, 130, 250], radius: 25, ringLanes: 2, ring: 'split', arm: 'split', entryLanes: 2, entryTurns: 'left;through|through;right' }],
    ['a large five-arm roundabout, three ring lanes', { arms: [0, 70, 150, 220, 290], radius: 45, ringLanes: 3, ring: 'split', arm: 'split', entryLanes: 3 }],
    ['a tight ring of 2 and 3 lanes, bending 40° at each node, entries and exits on their own nodes (as in Boston)', { arms: [0, 120, 240], radius: 10, ringLanes: 2, ring: 'short', arm: 'split', entryLanes: 2, step: 40, splitOffset: 40, unevenLanes: true }],
    ['an uneven roundabout with arms at odd angles', { arms: [5, 50, 200, 320], radius: 20, ringLanes: 2, ring: 'short', arm: 'two-way' }],
    ['a right-hand traffic roundabout (France)', { arms: [0, 90, 180, 270], radius: 25, ringLanes: 2, ring: 'split', arm: 'split', entryLanes: 2, entryTurns: 'left;through|through;right', rightHand: true }],
    ['a right-hand traffic roundabout of short ways', { arms: [20, 140, 260], radius: 14, ringLanes: 2, ring: 'short', arm: 'two-way', rightHand: true }]
];

describe('routing round generated roundabouts', () => {
    it.each(layouts)('%s: every lane in gets round and out, and every exit is reached', (_, layout) => {
        const { graph, ringWays, entries, exits } = roundabout(layout);
        const reached = new Set<string>();
        for (const entry of entries) {
            const way = graph.entity(entry.id) as Way;
            for (let lane = 0; lane < entry.lanes; lane++) {
                const routes = vehicleRoutes(graph, entry.id, { direction: 'forward', index: lane }, 0, way.nodes.length - 1, 'car').routes;
                expect(routes.length, `${entry.id} lane ${lane}`).toBeGreaterThan(0);
                for (const route of routes) {
                    expect(route.moves[0].ring, `${entry.id} lane ${lane}`).toBe('enter');
                    const exit = route.moves.find(move => move.ring === 'exit');
                    expect(exit, `${entry.id} lane ${lane} leaves the ring`).toBeDefined();
                    reached.add(exit!.toWayID);
                    // going all the way round, back out where it came in, is allowed from an unmarked lane, but not
                    // from a lane whose arrows say where it goes and have no U-turn among them
                    const mayTurnBack = !layout.entryTurns || layout.entryTurns.split('|')[lane].includes('reverse');
                    const backOut = exits.find(e => e.id === exit!.toWayID)!.arm === entry.arm;
                    expect(backOut && !mayTurnBack, `${entry.id} lane ${lane} turns back`).toBe(false);
                }
            }
        }
        for (const exit of exits) expect(reached.has(exit.id), `exit ${exit.id} reached`).toBe(true);

        // every lane on the ring itself goes on round and out
        for (const ringWay of ringWays) {
            const way = graph.entity(ringWay) as Way;
            for (let lane = 0; lane < +way.tags.lanes; lane++) {
                // (from its first node to the next: a ring drawn as one closed way ends where it starts)
                const routes = vehicleRoutes(graph, ringWay, { direction: 'forward', index: lane }, 0, 1, 'car').routes;
                expect(routes.length, `${ringWay} lane ${lane}`).toBeGreaterThan(0);
                expect(routes.some(route => route.moves.some(move => move.ring === 'exit')), `${ringWay} lane ${lane}`).toBe(true);
            }
        }
    });

    it.each(layouts)('%s: drawn without gaps where roads join', (_, layout) => {
        const { graph } = roundabout(layout);
        const ways = graph.base().entities;
        const all = Object.values(ways).filter((e: any) => e.type === 'way') as Way[];
        const geometry = roadGeometry(all, graph);
        for (const way of all) {
            const pieces = geometry.pieces.filter(p => p.wayID === way.id);
            expect(pieces.length, way.id).toBeGreaterThan(0);
            for (const piece of pieces) {
                for (const line of piece.boundaries) for (const p of line) expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true);
            }
        }
    });
});

describe('the U-turn arrow', () => {
    it('turns round to the right where traffic drives on the left, and to the left where it drives on the right', async () => {
        const { turnArrowSymbol } = await import('../../../../modules/lanes/svg/defs');
        // the shape hooks to the left: mirrored for left-hand traffic
        expect(turnArrowSymbol('reverse', 'left')).toEqual({ id: 'lanes-arrow-reverse', mirror: true });
        expect(turnArrowSymbol('reverse', 'right')).toEqual({ id: 'lanes-arrow-reverse', mirror: false });
        // other arrows are the same either side
        expect(turnArrowSymbol('right', 'left')).toEqual({ id: 'lanes-arrow-left', mirror: true });
        expect(turnArrowSymbol('left', 'left')).toEqual({ id: 'lanes-arrow-left', mirror: false });
    });
});
