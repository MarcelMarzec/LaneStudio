import { laneLayout, stripOnCarriageway } from '../../../../modules/lanes/geometry/layout';
import { signalsKind, streetGeometry, ukControlledCrossing } from '../../../../modules/lanes/geometry/street';
import { laneSymbols } from '../../../../modules/lanes/geometry/lane_symbols';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { busValue } from '../../../../modules/lanes/core/roadside';
import { upgradeOldBusway } from '../../../../modules/lanes/model/kinds';
import { withCyclewayDetail } from '../../../../modules/lanes/ui/cycleway_fields';
import { laneRestrictions } from '../../../../modules/lanes/svg/lanes';
import { laneKindOf, parseLanes } from '../../../../modules/lanes/model';

// Leicester (left-hand traffic, UK markings) and Berlin (right-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const place = (origin: [number, number]) => {
    const mx = m / Math.cos(origin[1] * Math.PI / 180);
    return (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];
};
const uk = place([-1.13, 52.63]);
const germany = place([13.40, 52.52]);

function road(tags: Tags, at = uk, nodeTags: Record<number, Tags> = {}) {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(-60, 0), tags: nodeTags[0] ?? {} }),
        new iD.osmNode({ id: 'n2', loc: at(0, 0), tags: nodeTags[1] ?? {} }),
        new iD.osmNode({ id: 'n3', loc: at(60, 0), tags: nodeTags[2] ?? {} }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags })
    ];
    const graph = new iD.coreGraph(entities);
    return { graph, way: graph.entity('w1'), entities };
}


describe('roadside detail', () => {
    it('draws a cycle lane\'s buffer, line, direction, separation and colour', () => {
        const { graph, way } = road({ highway: 'tertiary', 'cycleway:left': 'lane', 'cycleway:left:buffer': '0.8', 'cycleway:left:lane': 'advisory',
            'cycleway:left:oneway': '-1', 'cycleway:left:separation': 'bollard', 'cycleway:left:surface:colour': 'green' });
        const [buffer, lane] = laneLayout(way, graph).roadside.left;
        expect(buffer).toMatchObject({ kind: 'cycle_buffer', width: 0.8 });
        expect(lane.cycle).toEqual({ lane: 'advisory', travel: 'backward', separation: 'bollard', colour: 'green' });
        expect(stripOnCarriageway(buffer)).toBe(true);
    });

    it('lets a cycle lane follow the traffic beside it, and an old contraflow lane go against it', () => {
        // UK, two-way: traffic going along the way keeps to its left
        const two = road({ highway: 'tertiary', 'cycleway:both': 'lane' });
        const layout = laneLayout(two.way, two.graph);
        expect(layout.roadside.left[0].cycle!.travel).toBe('forward');
        expect(layout.roadside.right[0].cycle!.travel).toBe('backward');
        const contra = road({ highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' });
        expect(laneLayout(contra.way, contra.graph).roadside.right[0].cycle!.travel).toBe('backward');
    });

    it('draws a pedestrian lane on the road, a pavement\'s surface and kerb, and a bus bay', () => {
        const { graph, way } = road({ highway: 'residential', 'sidewalk:left': 'lane', 'sidewalk:right': 'yes',
            'sidewalk:right:surface': 'paving_stones', 'sidewalk:right:kerb': 'lowered', bus_bay: 'right' });
        const layout = laneLayout(way, graph);
        expect(layout.roadside.left[0]).toMatchObject({ kind: 'sidewalk_lane', width: 1.5 });
        expect(stripOnCarriageway(layout.roadside.left[0])).toBe(true);
        expect(layout.roadside.right.map(s => s.kind)).toEqual(['bus_bay', 'sidewalk']);
        expect(layout.roadside.right[1]).toMatchObject({ surface: 'paving', kerb: 'lowered' });
    });

    it('reads bus lanes tagged the old way, unless the lanes have one', () => {
        expect(busValue({ busway: 'lane' }, 'left', null, null)).toBe('lane');
        expect(busValue({ busway: 'lane', oneway: 'yes' }, 'right', 'left', 'right')).toBeUndefined();
        expect(busValue({ highway: 'busway', busway: 'lane' }, 'left', null, null)).toBeUndefined();
        const old = road({ highway: 'primary', 'busway:left': 'lane' });
        expect(laneLayout(old.way, old.graph).roadside.left[0]).toMatchObject({ kind: 'bus_lane' });
        const both = road({ highway: 'primary', lanes: '3', 'lanes:forward': '2', 'busway:left': 'lane', 'bus:lanes:forward': 'designated|' });
        expect(laneLayout(both.way, both.graph).roadside.left.some(s => s.kind === 'bus_lane')).toBe(false);
    });

    it('upgrades an old bus lane to a lane of its own on the kerb side', () => {
        const model = parseLanes({ highway: 'primary', lanes: '2' }, { driveSide: 'left' });
        const next = upgradeOldBusway(model, ['left']);
        expect(next.lanes.forward.length).toBe(2);
        expect(laneKindOf(next, { direction: 'forward', index: 0 })).toBe('bus');
        const right = upgradeOldBusway(parseLanes({ highway: 'primary', lanes: '2' }, { driveSide: 'right' }), ['right']);
        expect(laneKindOf(right, { direction: 'forward', index: 1 })).toBe('bus');
    });

    it('writes a cycleway detail on its own side, splitting one set on both', () => {
        expect(withCyclewayDetail({ 'cycleway:both:width': '1.5' }, 'left', 'width', '2'))
            .toEqual({ 'cycleway:left:width': '2', 'cycleway:right:width': '1.5' });
        expect(withCyclewayDetail({ 'cycleway:left:lane': 'advisory' }, 'left', 'lane', undefined)).toEqual({});
    });
});


describe('symbols along lanes', () => {
    const symbolsOf = (tags: Tags, at = uk) => {
        const { graph, entities } = road(tags, at);
        const pieces = roadGeometry(entities.filter(e => e.type === 'way') as never[], graph).pieces;
        return laneSymbols(pieces, id => (graph.entity(id as never) as { tags: Tags }).tags, graph, () => at === uk);
    };

    it('puts cycle symbols in cycle lanes, sharrows in shared lanes and BUS LANE in UK bus lanes', () => {
        const kinds = (tags: Tags, at = uk) => new Set(symbolsOf(tags, at).symbols.map(s => s.kind));
        expect(kinds({ highway: 'tertiary', 'cycleway:left': 'lane' })).toContain('cycle');
        expect(kinds({ highway: 'tertiary', 'cycleway:left': 'shared_lane' })).toContain('sharrow');
        expect(kinds({ highway: 'primary', oneway: 'yes', lanes: '2', 'bus:lanes': 'designated|' })).toContain('bus_lane_text');
        expect(kinds({ highway: 'primary', oneway: 'yes', lanes: '2', 'bus:lanes': 'designated|' }, germany)).not.toContain('bus_lane_text');
        expect(kinds({ highway: 'busway', oneway: 'yes' })).not.toContain('bus_lane_text');
    });

    it('marks a UK bus bay with its BUS STOP box', () => {
        const { boxes, symbols } = symbolsOf({ highway: 'primary', bus_bay: 'left' });
        expect(boxes.length).toBeGreaterThan(0);
        expect(symbols.some(s => s.kind === 'bus_stop_text')).toBe(true);
    });
});


describe('UK crossings and other node markings', () => {
    it('knows which crossings have a controlled area', () => {
        expect(ukControlledCrossing({ highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' })).toBe('zebra');
        expect(ukControlledCrossing({ highway: 'crossing', crossing_ref: 'puffin' })).toBe('signals');
        expect(ukControlledCrossing({ highway: 'crossing', crossing: 'unmarked' })).toBeNull();
        expect(ukControlledCrossing({ highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'dots' })).toBeNull();
    });

    it('draws zig-zags, give way lines and Belisha beacons at a UK zebra, not elsewhere', () => {
        const zebra = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' };
        const at = (place2: typeof uk) => {
            const { graph, entities } = road({ highway: 'tertiary', lanes: '2' }, place2, { 1: zebra });
            return streetGeometry(entities, graph);
        };
        const gb = at(uk);
        // both kerbs and the centre line, on each approach
        expect(gb.markings.filter(mk => mk.kind === 'zigzag').length).toBe(6);
        expect(gb.markings.filter(mk => mk.kind === 'give_way_line').length).toBe(2);
        expect(gb.symbols.filter(s => s.kind === 'belisha').length).toBe(2);
        const de = at(germany);
        expect(de.markings.some(mk => mk.kind === 'zigzag')).toBe(false);
    });

    it('stops the zig-zags short of a junction', () => {
        const zebra = { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' };
        const entities = [
            new iD.osmNode({ id: 'n1', loc: uk(-60, 0) }),
            new iD.osmNode({ id: 'n2', loc: uk(0, 0), tags: zebra }),
            new iD.osmNode({ id: 'n3', loc: uk(8, 0) }),
            new iD.osmNode({ id: 'n4', loc: uk(60, 0) }),
            new iD.osmNode({ id: 'n5', loc: uk(8, 40) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4'], tags: { highway: 'tertiary', lanes: '2' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n5'], tags: { highway: 'residential' } })
        ];
        const geometry = streetGeometry(entities, new iD.coreGraph(entities));
        // 8 m to the junction: too short for two marks on that side, so only the other side's three lines
        expect(geometry.markings.filter(mk => mk.kind === 'zigzag').length).toBe(3);
    });

    it('lays tactile paving at both ends, red at signals', () => {
        const { graph, entities } = road({ highway: 'tertiary', lanes: '2' }, uk, { 1: { highway: 'crossing', crossing: 'traffic_signals', tactile_paving: 'yes' } });
        const tactile = streetGeometry(entities, graph).markings.filter(mk => mk.kind === 'tactile');
        expect(tactile.map(mk => mk.variant)).toEqual(['red', 'red']);
    });

    it('draws an advanced stop line with its box and cycle symbol', () => {
        const { graph, entities } = road({ highway: 'primary', lanes: '2' }, uk, { 1: { cycleway: 'asl', direction: 'forward' } });
        const geometry = streetGeometry(entities, graph);
        expect(geometry.markings.filter(mk => mk.key.includes('asl')).map(mk => mk.kind).sort()).toEqual(['asl_box', 'stop_line', 'stop_line']);
        expect(geometry.symbols.some(s => s.kind === 'cycle')).toBe(true);
    });

    it('tells signal heads apart, and gives flashing amber signals no stop line', () => {
        expect(signalsKind({ traffic_signals: 'blinker' })).toBe('signals_blinker');
        expect(signalsKind({ traffic_signals: 'signal' })).toBe('signals');
        const { graph, entities } = road({ highway: 'primary', lanes: '2' }, uk, { 1: { highway: 'traffic_signals', traffic_signals: 'blinker' } });
        const geometry = streetGeometry(entities, graph);
        expect(geometry.markings.some(mk => mk.kind === 'signal_line')).toBe(false);
        expect(geometry.symbols.map(s => s.kind)).toContain('signals_blinker');
    });

    it('draws a multipolygon area with its holes', () => {
        const ring = (id: `w${number}`, pts: [number, number][], first: number) => {
            const nodes = pts.map((p, i) => new iD.osmNode({ id: `n${first + i}`, loc: uk(...p) }));
            return { nodes, way: new iD.osmWay({ id, nodes: [...nodes.map(n => n.id), nodes[0].id] }) };
        };
        const outer = ring('w10', [[0, 0], [40, 0], [40, 30], [0, 30]], 10);
        const inner = ring('w11', [[10, 10], [30, 10], [30, 20], [10, 20]], 20);
        const relation = new iD.osmRelation({ id: 'r1', tags: { type: 'multipolygon', 'area:highway': 'traffic_island' },
            members: [{ id: 'w10', type: 'way', role: 'outer' }, { id: 'w11', type: 'way', role: 'inner' }] });
        const entities = [...outer.nodes, outer.way, ...inner.nodes, inner.way, relation];
        const area = streetGeometry(entities, new iD.coreGraph(entities)).areas.find(a => a.id === 'r1');
        expect(area).toMatchObject({ kind: 'island' });
        expect(area!.rings!.length).toBe(1);
    });
});


describe('lane labels', () => {
    it('names a lane\'s restrictions', () => {
        // (the words come from the strings file, not loaded here: their keys show)
        const words = laneRestrictions({ 'hgv:lanes': 'no', 'maxheight:lanes': '4.2', 'maxweight:lanes': '7.5' });
        // (the strings may or may not be loaded, depending on the tests run before)
        expect(words[0]).toMatch(/no_hgv|no HGV/);
        expect(words.slice(1)).toEqual(['↕ 4.2', '7.5 t']);
        expect(laneRestrictions({ 'hgv:lanes': 'designated' })[0]).toMatch(/labels\.hgv|HGV lane/);
        expect(laneRestrictions({})).toEqual([]);
    });
});
