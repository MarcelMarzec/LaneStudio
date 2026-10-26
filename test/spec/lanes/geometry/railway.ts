import { railGauge, railGeometry, railKind, trackShape } from '../../../../modules/lanes/geometry/railway';
import { polylineLength, metricFrame } from '../../../../modules/lanes/geometry/frame';

// London; 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(51.5 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-0.1 + dx * mx, 51.5 + dy * m];

type Way = InstanceType<typeof iD.osmWay>;

/** A straight railway 100 m long, west to east */
function track(tags: Tags) {
    const graph = new iD.coreGraph([
        new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(100, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags })
    ] as any) as iD.Graph;
    return { graph, way: graph.entity('w1') as Way };
}

/** How far a line lies from the way, in metres (+ north) */
const offsetOf = (line: [number, number][]) => {
    const frame = metricFrame(at(0, 0));
    return frame.toMetres(line[0])[1];
};

describe('railway track', () => {
    it('knows track from what has none', () => {
        expect(railKind({ railway: 'rail' })).toEqual({ kind: 'rail', status: 'active' });
        expect(railKind({ railway: 'subway' })).toEqual({ kind: 'subway', status: 'active' });
        expect(railKind({ railway: 'disused', 'disused:railway': 'tram' })).toEqual({ kind: 'tram', status: 'disused' });
        expect(railKind({ railway: 'construction', construction: 'light_rail' })).toEqual({ kind: 'light_rail', status: 'construction' });
        expect(railKind({ railway: 'rail', usage: 'tourism' })).toEqual({ kind: 'rail', status: 'preserved' });
        expect(railKind({ railway: 'abandoned' })).toEqual({ kind: 'rail', status: 'abandoned' });
        expect(railKind({ railway: 'platform' })).toBeNull();
    });

    it('lays rails at the gauge: standard gauge unless tagged, for main lines, the Underground and trams alike', () => {
        expect(railGauge({}, 'rail')).toBe(1.435);
        expect(railGauge({}, 'subway')).toBe(1.435);
        expect(railGauge({}, 'tram')).toBe(1.435);
        expect(railGauge({ gauge: '597' }, 'narrow_gauge')).toBe(0.597);
        expect(railGauge({ gauge: '1435;1000' }, 'rail')).toBe(1.435);
        expect(railGauge({}, 'miniature')).toBe(0.184);

        const { graph, way } = track({ railway: 'rail' });
        const shape = trackShape(way, graph, true)!;
        expect(shape.rails).toHaveLength(2);
        const [a, b] = shape.rails.map(offsetOf).sort((x, y) => x - y);
        expect(b - a).toBeCloseTo(1.435, 2);
        // concrete sleepers every 0.65 m, 2.6 m long, on a bed of ballast
        expect(shape.sleepers.length).toBeGreaterThan(140);
        expect(shape.sleepers.length).toBeLessThan(160);
        expect(shape.bed).toBeDefined();
    });

    it('lays several tracks side by side, with conductor rails where the line is electrified that way', () => {
        const { graph, way } = track({ railway: 'rail', tracks: '2', electrified: 'rail' });
        const shape = trackShape(way, graph, false)!;
        expect(shape.rails).toHaveLength(4);
        expect(shape.conductors).toHaveLength(2);
        // no sleepers when zoomed out
        expect(shape.sleepers).toHaveLength(0);
        const offsets = shape.rails.map(offsetOf).sort((x, y) => x - y);
        // track centres 1.435 + 1.9 m apart
        expect((offsets[2] + offsets[3]) / 2 - (offsets[0] + offsets[1]) / 2).toBeCloseTo(3.335, 2);

        const tube = track({ railway: 'subway', electrified: '4th_rail' });
        const tubeShape = trackShape(tube.way, tube.graph, false)!;
        // the Underground's fourth rail between the running rails, and a third rail outside them
        expect(tubeShape.conductors.map(offsetOf).map(o => Math.abs(o))).toEqual([expect.closeTo(0, 2), expect.closeTo(1.1275, 2)]);
    });

    it('sets tram rails in the road, without ballast or sleepers', () => {
        const { graph, way } = track({ railway: 'tram' });
        const shape = trackShape(way, graph, true)!;
        expect(shape.embedded).toBe(true);
        expect(shape.bed).toBeUndefined();
        expect(shape.sleepers).toHaveLength(0);
        expect(polylineLength(shape.rails[0].map(metricFrame(at(0, 0)).toMetres))).toBeCloseTo(100, 0);

        const reserved = track({ railway: 'tram', embedded: 'no' });
        expect(trackShape(reserved.way, reserved.graph, true)!.bed).toBeDefined();
    });

    it('draws only railways, faded in tunnels', () => {
        const { graph, way } = track({ railway: 'subway', tunnel: 'yes' });
        const road = new iD.osmWay({ id: 'w2', nodes: ['n1', 'n2'], tags: { highway: 'primary' } });
        const tracks = railGeometry([way, road], graph.replace(road), false);
        expect(tracks.map(t => t.id)).toEqual(['w1']);
        expect(tracks[0].covered).toBe(true);
    });
});
