import { isTrafficIsland, islandSurface, roadMarkingStyle, isStreetParking } from '../../../../modules/lanes/model/street_features';
import { parkingGeometry } from '../../../../modules/lanes/geometry/parking';
import { roadMarkingGeometry } from '../../../../modules/lanes/geometry/road_marking';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';

const m = 1 / 111320;
const mx = m / Math.cos(52.95 * Math.PI / 180);
const origin: [number, number] = [-1.15, 52.95];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];


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
        // @ts-expect-error -- the constructor also takes a list of entities
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
        // @ts-expect-error -- the constructor also takes a list of entities
        const graph = new iD.coreGraph(entities);
        const out = roadMarkingGeometry(entities.map(e => graph.entity(e.id)), graph);
        const frame = metricFrame(origin);
        expect(out.lines.map(l => frame.toMetres(l.line[0])[1])).toEqual([expect.closeTo(0.15, 2), expect.closeTo(-0.15, 2)]);
        expect(out.areas.map(a => [a.id, a.style.pattern, a.polygon.length])).toEqual([['w2', 'crosshatch', 3]]);
        expect(out.texts.map(t => t.text)).toEqual(['SLOW']);
    });
});
