import { isTrafficIsland, islandSurface, overtakingBanned, roadMarkingStyle, isStreetParking, surfaceGroup } from '../../../../modules/lanes/model/street_features';
import { carriagewayAreaEdges, streetGeometry } from '../../../../modules/lanes/geometry/street';
import { parkingGeometry } from '../../../../modules/lanes/geometry/parking';
import { markingKind, roadMarkingGeometry, roadMarkingIDs } from '../../../../modules/lanes/geometry/road_marking';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';

const m = 1 / 111320;
const mx = m / Math.cos(52.95 * Math.PI / 180);
const origin: [number, number] = [-1.15, 52.95];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];


describe('carriageway area edges', () => {
    // a road area 40 m long and 10 m wide, its road running through the middle of its two short sides
    const area = [at(0, 0), at(40, 0), at(40, 10), at(0, 10), at(0, 0)];

    it('is the whole outline with no road meeting it', () => {
        expect(carriagewayAreaEdges(area, [], [], [])).toEqual([area]);
    });

    it('leaves the area open where a road crosses its edge', () => {
        const edges = carriagewayAreaEdges(area, [[at(-10, 5), at(50, 5)]], [], []);
        expect(edges).toEqual([[at(40, 10), at(0, 10)], [at(0, 0), at(40, 0)]]);
    });

    it('leaves the area open where a road ends on its edge', () => {
        const edges = carriagewayAreaEdges(area, [[at(-10, 5), at(0, 5)]], [], []);
        expect(edges).toEqual([[at(0, 0), at(40, 0), at(40, 10), at(0, 10)]]);
    });

    it('leaves the area open along a neighbouring carriageway area', () => {
        const neighbour = [at(40, 0), at(80, 0), at(80, 10), at(40, 10), at(40, 0)];
        const edges = carriagewayAreaEdges(area, [], [], [neighbour]);
        expect(edges).toEqual([[at(40, 10), at(0, 10), at(0, 0), at(40, 0)]]);
    });

    it('leaves the area open on a road drawn up to it', () => {
        const road = [at(30, -1), at(50, -1), at(50, 11), at(30, 11), at(30, -1)];
        const edges = carriagewayAreaEdges(area, [], [road], []);
        expect(edges).toEqual([[at(40, 10), at(0, 10), at(0, 0), at(40, 0)]]);
    });

    it('ignores roads away from the area', () => {
        expect(carriagewayAreaEdges(area, [[at(-10, 50), at(50, 50)]], [], [])).toEqual([area]);
    });
});


describe('overtaking', () => {
    it('is banned both ways by overtaking=no', () => {
        expect(overtakingBanned({ overtaking: 'no' }, 'forward')).toBe(true);
        expect(overtakingBanned({ overtaking: 'no' }, 'backward')).toBe(true);
        expect(overtakingBanned({ overtaking: 'no' }, 'both_ways')).toBe(true);
    });

    it('is allowed when untagged or allowed', () => {
        for (const tags of [{}, { overtaking: 'yes' }, { overtaking: 'both' }, { overtaking: 'caution' }] as Record<string, string>[]) {
            expect(overtakingBanned(tags, 'forward')).toBe(false);
            expect(overtakingBanned(tags, 'backward')).toBe(false);
        }
    });

    it('is banned for the other direction by overtaking=forward|backward', () => {
        expect(overtakingBanned({ overtaking: 'forward' }, 'forward')).toBe(false);
        expect(overtakingBanned({ overtaking: 'forward' }, 'backward')).toBe(true);
        expect(overtakingBanned({ overtaking: 'backward' }, 'forward')).toBe(true);
    });

    it('takes a direction\'s own tag first', () => {
        expect(overtakingBanned({ 'overtaking:forward': 'no' }, 'forward')).toBe(true);
        expect(overtakingBanned({ 'overtaking:forward': 'no' }, 'backward')).toBe(false);
        expect(overtakingBanned({ overtaking: 'no', 'overtaking:backward': 'yes' }, 'backward')).toBe(false);
    });
});


describe('street feature tags', () => {
    it('recognises traffic islands mapped as areas', () => {
        expect(isTrafficIsland({ 'area:highway': 'traffic_island' })).toBe(true);
        expect(isTrafficIsland({ highway: 'traffic_island', area: 'yes' })).toBe(true);
        expect(isTrafficIsland({ traffic_calming: 'island', area: 'yes' })).toBe(true);
        expect(isTrafficIsland({ traffic_calming: 'island' })).toBe(false);
        expect(isTrafficIsland({ area: 'yes' })).toBe(false);
    });

    it('colours islands by surface, concrete when untagged', () => {
        expect(islandSurface({ landuse: 'grass' })).toBe('grass');
        expect(islandSurface({ surface: 'paving_stones' })).toBe('paving');
        expect(islandSurface({ surface: 'sett' })).toBe('sett');
        expect(islandSurface({ surface: 'asphalt' })).toBe('asphalt');
        expect(islandSurface({})).toBe('concrete');
    });

    it('reads stroke, colour, width, dashes and pattern of road markings', () => {
        expect(roadMarkingStyle({ road_marking: 'solid_line' })).toMatchObject({ lines: ['solid'], colour: 'white', width: 0.15 });
        expect(roadMarkingStyle({ road_marking: 'dashed_line' }).lines).toEqual(['dashed']);
        expect(roadMarkingStyle({ road_marking: 'solid_line', stroke: 'double_solid', colour: 'yellow' })).toMatchObject({ lines: ['solid', 'solid'], colour: 'yellow' });
        expect(roadMarkingStyle({ road_marking: 'solid_line', 'stroke:left': 'solid', 'stroke:right': 'dashed' }).lines).toEqual(['solid', 'dashed']);
        expect(roadMarkingStyle({ road_marking: 'stop_line', stroke: 'solid' }).width).toBe(0.3);
        expect(roadMarkingStyle({ road_marking: 'give_way', width: '0.5', dasharray: '0.6,0.3' })).toMatchObject({ lines: ['dashed'], width: 0.5, dash: [0.6, 0.3] });
        expect(roadMarkingStyle({ road_marking: 'restriction' }).pattern).toBe('hatch');
        expect(roadMarkingStyle({ road_marking: 'restriction', pattern: 'crosshatch' }).pattern).toBe('crosshatch');
    });

    it('groups surfaces by how they look', () => {
        expect(surfaceGroup('asphalt')).toBe('asphalt');
        expect(surfaceGroup('paving_stones')).toBe('paving');
        expect(surfaceGroup('cobblestone')).toBe('sett');
        expect(surfaceGroup('fine_gravel')).toBe('gravel');
        expect(surfaceGroup('dirt')).toBe('unpaved');
        expect(surfaceGroup('grass_paver')).toBe('grass');
        expect(surfaceGroup(undefined)).toBeUndefined();
        expect(surfaceGroup('lava')).toBeUndefined();
    });

    it('recognises street parking', () => {
        expect(isStreetParking({ amenity: 'parking', parking: 'street_side' })).toBe(true);
        expect(isStreetParking({ amenity: 'parking', parking: 'lane' })).toBe(true);
        expect(isStreetParking({ amenity: 'parking', parking: 'surface' })).toBe(false);
    });
});


describe('parkingGeometry', () => {
    function street(parkingTags: Tags, y0: number, y1: number) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'secondary', lanes: '2', 'width:lanes': '3|3' } }),
            new iD.osmNode({ id: 'n3', loc: at(30, y0) }),
            new iD.osmNode({ id: 'n4', loc: at(70, y0) }),
            new iD.osmNode({ id: 'n5', loc: at(70, y1) }),
            new iD.osmNode({ id: 'n6', loc: at(30, y1) }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4', 'n5', 'n6', 'n3'], tags: { amenity: 'parking', ...parkingTags } })
        ];
        const graph = new iD.coreGraph(entities);
        return parkingGeometry(entities.map(e => graph.entity(e.id)), graph);
    }

    it('joins a layby to the kerb of the nearest road, with its bays', () => {
        const [shape] = street({ parking: 'street_side', capacity: '5' }, 5, 7.5);
        expect(shape.roadID).toBe('w1');
        // the road is 6 m wide, so its north kerb is 3 m from the way; the layby starts at 5 m
        const frame = metricFrame(origin);
        const ys = shape.connector!.map(loc => frame.toMetres(loc)[1]).sort((a, b) => a - b);
        expect(shape.connector).toHaveLength(4);
        expect(ys[0]).toBeCloseTo(3, 1);
        expect(ys[3]).toBeCloseTo(5, 1);
        expect(shape.bays).toHaveLength(4);
    });

    it('does not join parking on the carriageway, or parking far from any road', () => {
        expect(street({ parking: 'lane' }, 1, 3)[0].connector).toBeNull();
        const far = street({ parking: 'street_side' }, 30, 35)[0];
        expect(far.roadID).toBeNull();
        expect(far.connector).toBeNull();
    });
});


describe('roadMarkingGeometry', () => {
    it('draws a double line either side of its way, areas with their pattern, and painted text', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(20, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { road_marking: 'solid_line', stroke: 'double_solid', colour: 'yellow' } }),
            new iD.osmNode({ id: 'n3', loc: at(0, 5) }),
            new iD.osmNode({ id: 'n4', loc: at(10, 5) }),
            new iD.osmNode({ id: 'n5', loc: at(10, 8) }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4', 'n5', 'n3'], tags: { road_marking: 'restriction', pattern: 'crosshatch' } }),
            new iD.osmNode({ id: 'n6', loc: at(5, -2), tags: { road_marking: 'text', inscription: 'SLOW' } })
        ];
        const graph = new iD.coreGraph(entities);
        const out = roadMarkingGeometry(entities.map(e => graph.entity(e.id)), graph);
        const frame = metricFrame(origin);
        expect(out.lines.map(l => frame.toMetres(l.line[0])[1])).toEqual([expect.closeTo(0.15, 2), expect.closeTo(-0.15, 2)]);
        expect(out.areas.map(a => [a.id, a.style.pattern, a.polygon.length])).toEqual([['w2', 'crosshatch', 3]]);
        expect(out.texts.map(t => t.text)).toEqual(['SLOW']);
    });

    /** A 20 m way running east with `tags`, and a road with a node tagged `nodeTags` */
    function marked(tags: Tags, nodeTags: Tags = {}) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(20, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags }),
            new iD.osmNode({ id: 'n3', loc: at(0, 10) }),
            new iD.osmNode({ id: 'n4', loc: at(10, 10), tags: nodeTags }),
            new iD.osmNode({ id: 'n5', loc: at(20, 10) }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4', 'n5'], tags: { highway: 'residential' } })
        ];
        const graph = new iD.coreGraph(entities);
        return roadMarkingGeometry(entities.map(e => graph.entity(e.id)), graph);
    }

    it('reads legacy values as the wiki\'s', () => {
        expect(['solid_stop_line', 'dash', 'gore_chevron', 'left', 'solid_road_edge'].map(markingKind))
            .toEqual(['stop_line', 'lane_divider', 'restriction', 'arrow', 'edge_line']);
        expect(marked({ road_marking: 'dash' }).lines[0].stroke).toBe('dashed');
        expect(marked({ road_marking: 'left' }).symbols[0].turns).toEqual(['left']);
    });

    it('draws an arrow mapped from its base to its tip, as long as its way, with each arrow value', () => {
        const out = marked({ road_marking: 'arrow', arrow: 'through;right' });
        expect(out.lines).toHaveLength(0);
        const arrow = out.symbols[0];
        expect([arrow.kind, arrow.turns, arrow.length]).toEqual(['arrow', ['through', 'right'], expect.closeTo(20, 1)]);
        // pointing east, the way it was drawn
        const frame = metricFrame(arrow.loc);
        expect(frame.toMetres(arrow.ahead)[0]).toBeCloseTo(1, 2);
    });

    it('draws shark\'s teeth pointing to the right of their line, and a zigzag line', () => {
        const teeth = marked({ road_marking: 'stop_line', stroke: 'sharks_teeth' }).shapes[0].polygons;
        expect(teeth.length).toBeGreaterThan(15);
        const frame = metricFrame(origin);
        // the way runs east: its right is south
        expect(frame.toMetres(teeth[0][2])[1]).toBeLessThan(-0.3);
        const zigzag = marked({ road_marking: 'lane_divider', stroke: 'zigzag' }).lines[0].line.map(frame.toMetres);
        expect(zigzag).toHaveLength(21);
        expect(zigzag[0][1]).toBeCloseTo(0.25, 2);
        expect(zigzag[1][1]).toBeCloseTo(-0.25, 2);
    });

    it('paints symbols on nodes: a cycle symbol, others by name, and a painted speed limit as its number', () => {
        const cycle = marked({}, { road_marking: 'symbol', symbol: 'bicycle' });
        expect(cycle.symbols.map(s => [s.id, s.kind, s.length])).toEqual([['n4', 'cycle', 2]]);
        expect(marked({}, { road_marking: 'symbol', symbol: 'bus' }).texts.map(t => t.text)).toEqual(['BUS']);
        expect(marked({}, { road_marking: 'traffic_sign', traffic_sign: 'GB:670[30]' }).texts.map(t => t.text)).toEqual(['30']);
        expect(roadMarkingIDs(cycle)).toEqual({ ways: [], nodes: ['n4'] });
    });
});


describe('streetGeometry surfaces and paths', () => {
    it('draws a road mapped as an area as carriageway, and splits segregated foot and cycle paths', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(20, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(20, 30) }),
            new iD.osmNode({ id: 'n4', loc: at(0, 30) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4', 'n1'], tags: { highway: 'service', area: 'yes', surface: 'concrete' } }),
            new iD.osmNode({ id: 'n5', loc: at(0, 50) }),
            new iD.osmNode({ id: 'n6', loc: at(40, 50) }),
            new iD.osmWay({ id: 'w2', nodes: ['n5', 'n6'], tags: { highway: 'cycleway', foot: 'designated', segregated: 'yes', surface: 'asphalt' } }),
            new iD.osmNode({ id: 'n7', loc: at(0, 60) }),
            new iD.osmNode({ id: 'n8', loc: at(40, 60) }),
            new iD.osmWay({ id: 'w3', nodes: ['n7', 'n8'], tags: { highway: 'path', foot: 'designated', bicycle: 'designated' } })
        ];
        const graph = new iD.coreGraph(entities);
        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        expect(street.areas.map(a => [a.id, a.kind, a.surface])).toEqual([['w1', 'carriageway', 'concrete']]);
        const segregated = street.paths.find(p => p.id === 'w2')!;
        expect([segregated.use, segregated.surface, !!segregated.footHalf, !!segregated.divider]).toEqual(['segregated', 'asphalt', true, true]);
        expect(street.paths.find(p => p.id === 'w3')!.use).toBe('shared');
    });
});


describe('streetGeometry: traffic calming', () => {
    function calming(tags: Tags) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(50, 0), tags }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential', lanes: '2' } })
        ];
        const graph = new iD.coreGraph(entities);
        return streetGeometry(entities.map(e => graph.entity(e.id)), graph).markings.filter(m => m.kind === 'calming').map(m => m.variant);
    }

    it('draws each kind as built, with a triangle on each lane\'s ramp', () => {
        expect(calming({ traffic_calming: 'hump' })).toEqual(['hump', 'tooth', 'tooth']);
        expect(calming({ traffic_calming: 'table' })).toEqual(['table', 'tooth', 'tooth']);
        expect(calming({ traffic_calming: 'cushion' })).toEqual(['cushion', 'cushion', 'tooth', 'tooth']);
        expect(calming({ traffic_calming: 'rumble_strip' })).toHaveLength(6);
        expect(calming({ traffic_calming: 'chicane' })).toEqual(['buildout', 'buildout']);
        expect(calming({ traffic_calming: 'choked_table' })).toEqual(['table', 'tooth', 'tooth', 'buildout', 'buildout']);
        expect(calming({ traffic_calming: 'island' })).toEqual(['island']);
        expect(calming({ traffic_calming: 'choker;cushion' })).toContain('buildout');
        // one direction only: one lane's hump and triangle
        expect(calming({ traffic_calming: 'hump', direction: 'forward' })).toEqual(['hump', 'tooth']);
    });
});


describe('streetGeometry: a stop line painted on a node', () => {
    it('draws road_marking=stop_line across the lanes it faces, with no STOP painted before it', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(50, 0), tags: { road_marking: 'stop_line', direction: 'forward' } }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential', lanes: '2' } })
        ];
        const graph = new iD.coreGraph(entities);
        const street = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        expect(street.markings.filter(m => m.nodeID === 'n2').map(m => m.kind)).toEqual(['stop_line']);
        expect(street.symbols.filter(s => s.key.startsWith('n2'))).toHaveLength(0);
    });
});


describe('streetGeometry: rounded path ends', () => {
    it('rounds a footway\'s free ends, and not a crossing\'s', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(40, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'footway' } }),
            new iD.osmNode({ id: 'n3', loc: at(0, 20) }),
            new iD.osmNode({ id: 'n4', loc: at(0, 30) }),
            new iD.osmWay({ id: 'w2', nodes: ['n3', 'n4'], tags: { highway: 'footway', footway: 'crossing' } })
        ];
        const graph = new iD.coreGraph(entities);
        const { paths } = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        // two straight sides of two points each, and a half circle at each end
        expect(paths.find(p => p.id === 'w1')!.polygon.length).toBeGreaterThan(8);
        expect(paths.find(p => p.id === 'w2')!.polygon.length).toBe(4);
    });
});


describe('streetGeometry: forward, backward or both', () => {
    function build(tags: Tags) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(50, 0), tags }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'unclassified', lanes: '2' } })
        ];
        const graph = new iD.coreGraph(entities);
        return streetGeometry(entities.map(e => graph.entity(e.id)), graph);
    }

    it('draws a crossing\'s signals, traffic calming and a passing place for the direction tagged, or both', () => {
        const signals = (tags: Tags) => build({ highway: 'crossing', crossing: 'traffic_signals', ...tags }).symbols.filter(s => s.kind === 'signals').length;
        expect(signals({})).toBe(2);
        expect(signals({ direction: 'forward' })).toBe(1);
        expect(signals({ direction: 'both' })).toBe(2);
        const humps = (tags: Tags) => build({ traffic_calming: 'hump', ...tags }).markings.filter(m => m.variant === 'tooth').length;
        expect(humps({})).toBe(2);
        expect(humps({ direction: 'backward' })).toBe(1);
        const bays = (tags: Tags) => build({ highway: 'passing_place', ...tags }).surfaces.filter(s => s.kind === 'passing_place_surface').length;
        expect(bays({ direction: 'forward' })).toBe(1);
        expect(bays({ direction: 'both' })).toBe(2);
        const lines = (tags: Tags) => build({ highway: 'give_way', ...tags }).markings.filter(m => m.kind === 'give_way_line').length;
        expect(lines({ direction: 'forward' })).toBeLessThan(lines({ direction: 'both' }));
    });
});


describe('streetGeometry: emergency bays', () => {
    function surfaceOf(wayTags: Tags, nodeTags: Tags) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(100, 0), tags: { highway: 'emergency_bay', ...nodeTags } }),
            new iD.osmNode({ id: 'n3', loc: at(200, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: wayTags })
        ];
        const graph = new iD.coreGraph(entities);
        const { surfaces } = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        return surfaces.find(s => s.kind === 'emergency_bay_surface');
    }
    const farthest = (points: [number, number][]) => Math.max(...points.map(p => Math.abs(p[1] - origin[1]) / m));

    it('lies past the assumed hard shoulder of a motorway', () => {
        const road = { highway: 'motorway', oneway: 'yes', lanes: '2' };
        const beside = surfaceOf({ ...road, shoulder: 'no' }, {})!;
        const past = surfaceOf(road, {})!;
        expect(farthest(past.points as [number, number][]) - farthest(beside.points as [number, number][])).toBeCloseTo(2.5, 1);
    });

    it('goes on the side tagged', () => {
        const road = { highway: 'primary', lanes: '2' };
        const side = (tags: Tags) => Math.sign(surfaceOf(road, tags)!.points[2][1] - origin[1]);
        expect(side({ direction: 'forward' })).toBe(-side({ direction: 'backward' }));
    });
});


describe('streetGeometry: passing places', () => {
    it('widens the road into a bay on the side tagged, or both', () => {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(50, 0), tags: { highway: 'passing_place', direction: 'forward' } }),
            new iD.osmNode({ id: 'n3', loc: at(100, 0), tags: { highway: 'passing_place' } }),
            new iD.osmNode({ id: 'n4', loc: at(150, 0) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4'], tags: { highway: 'unclassified', lanes: '1' } })
        ];
        const graph = new iD.coreGraph(entities);
        const { surfaces } = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        const bays = surfaces.filter(s => s.kind === 'passing_place_surface');
        expect(bays.filter(s => s.nodeID === 'n2')).toHaveLength(1);
        expect(bays.filter(s => s.nodeID === 'n3')).toHaveLength(2);
        // forward, driving on the left (Nottingham): beside eastbound traffic, north of the way
        const north = bays.find(s => s.nodeID === 'n2')!.points.map(p => (p[1] - origin[1]) / m);
        expect(Math.max(...north)).toBeGreaterThan(2);
    });
});


describe('streetGeometry: highway areas (area:highway)', () => {
    // a 6 m × 12 m rectangle with the given tags
    function areaOf(id: number, tags: Tags, dx = 0) {
        const nodes = [[0, 0], [6, 0], [6, 12], [0, 12]].map(([x, y], i) => new iD.osmNode({ id: `n${id * 10 + i}`, loc: at(dx + x, y) }));
        return [...nodes, new iD.osmWay({ id: `w${id}`, nodes: [...nodes.map(n => n.id), nodes[0].id], tags })];
    }

    it('draws each kind of highway area', () => {
        const entities = [
            ...areaOf(1, { 'area:highway': 'emergency' }),
            ...areaOf(2, { 'area:highway': 'footway', footway: 'crossing', 'crossing:markings': 'zebra' }, 20),
            ...areaOf(3, { 'area:highway': 'cycleway', cycleway: 'crossing' }, 40),
            ...areaOf(4, { 'area:highway': 'turning_circle' }, 60),
            ...areaOf(5, { 'area:highway': 'primary', junction: 'yes' }, 80),
            ...areaOf(6, { 'area:highway': 'steps' }, 100),
            ...areaOf(7, { 'area:highway': 'verge' }, 120)
        ];
        const graph = new iD.coreGraph(entities);
        const { areas } = streetGeometry(entities.map(e => graph.entity(e.id)), graph);
        expect(areas.map(a => [a.id, a.kind])).toEqual([
            ['w1', 'hatched'], ['w2', 'crossing'], ['w3', 'cycle_crossing'], ['w4', 'carriageway'], ['w5', 'carriageway'], ['w6', 'pavement'], ['w7', 'other']
        ]);
        // a zebra's bars, half a metre wide every metre along its 12 m length (the way people walk)
        const zebra = areas.find(a => a.id === 'w2')!;
        expect(zebra.stripes!.length).toBeGreaterThanOrEqual(12);
        expect(areas.find(a => a.id === 'w3')!.stripes).toBeUndefined();
    });
});


describe('streetGeometry: mini-roundabouts, turning circles, barriers, speed limits', () => {
    function build(extra: InstanceType<typeof iD.osmNode | typeof iD.osmWay>[] = []) {
        const entities = [
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(-50, 0) }),
            new iD.osmNode({ id: 'n3', loc: at(0, 0), tags: { highway: 'mini_roundabout' } }),
            new iD.osmNode({ id: 'n4', loc: at(100, 0) }),
            new iD.osmNode({ id: 'n5', loc: at(0, -80), tags: { highway: 'turning_circle', diameter: '16' } }),
            new iD.osmNode({ id: 'n6', loc: at(0, -40), tags: { barrier: 'bollard' } }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'tertiary', lanes: '2', 'width:lanes': '3|3', maxspeed: '40 mph' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n2', 'n3', 'n4'], tags: { highway: 'tertiary', lanes: '2', 'width:lanes': '3|3', maxspeed: '30 mph' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n3', 'n6', 'n5'], tags: { highway: 'residential', lanes: '2', 'width:lanes': '3|3' } }),
            ...extra
        ];
        const graph = new iD.coreGraph(entities);
        return streetGeometry(entities.map(e => graph.entity(e.id)), graph);
    }

    it('draws a mini-roundabout with its circle, centre disc and a give way on each approach', () => {
        const street = build();
        expect(street.surfaces.map(s => s.kind)).toContain('mini_roundabout_surface');
        expect(street.markings.filter(m => m.kind === 'mini_roundabout')).toHaveLength(1);
        // three arms (west, east, south), each with one lane approaching
        expect(street.markings.filter(m => m.nodeID === 'n3' && m.kind === 'give_way_line')).toHaveLength(3);
    });

    it('puts bollards across the road', () => {
        const street = build();
        expect(street.markings.filter(m => m.kind === 'barrier_post' && m.variant === 'bollard').length).toBeGreaterThanOrEqual(3);
    });

    it('paints the new speed limit where it changes, in both directions', () => {
        const street = build();
        const limits = street.symbols.filter(s => s.kind === 'speed_limit');
        // entering w2 eastbound: 30; entering w1 westbound: 40; none where a limit appears from nothing (w3)
        expect(limits.map(s => s.text).sort()).toEqual(['30', '40']);
    });
});
