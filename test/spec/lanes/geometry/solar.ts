import { streetGeometry } from '../../../../modules/lanes/geometry/street';

const m = 1 / 111320;
const mx = m / Math.cos(52.63 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [-1.13 + dx * mx, 52.63 + dy * m];
const pv = { power: 'generator', 'generator:source': 'solar', 'generator:method': 'photovoltaic' };

/** A closed way round the corners given in metres (east, north) */
function panels(corners: [number, number][], tags: Tags) {
    const nodes = corners.map((corner, i) => new iD.osmNode({ id: `n${i + 1}` as const, loc: at(...corner) }));
    const way = new iD.osmWay({ id: 'w1', nodes: [...nodes.map(n => n.id), nodes[0].id], tags });
    const graph = new iD.coreGraph([...nodes, way]);
    return streetGeometry([way], graph).areas;
}

describe('solar panels', () => {
    it('draws photovoltaic panels and thermal collectors, their rows along the area or across the way they face', () => {
        const [row] = panels([[0, 0], [40, 0], [40, 4], [0, 4]], pv);
        expect(row.kind).toBe('solar');
        // a long row running east
        expect(Math.abs(Math.sin(row.rows!))).toBeLessThan(0.05);
        // facing east, the rows run north-south whatever the area's shape
        const [facing] = panels([[0, 0], [40, 0], [40, 4], [0, 4]], { ...pv, 'generator:orientation': 'E' });
        expect(Math.abs(Math.cos(facing.rows!))).toBeLessThan(0.05);
        expect(panels([[0, 0], [10, 0], [10, 4], [0, 4]], { ...pv, 'generator:method': 'thermal' })[0].kind).toBe('solar_thermal');
        expect(panels([[0, 0], [10, 0], [10, 4], [0, 4]], { power: 'plant', 'plant:source': 'solar' })).toEqual([]);
    });

    it('draws a panel mapped as a node as big as its modules', () => {
        const node = new iD.osmNode({ id: 'n1', loc: at(0, 0), tags: { ...pv, 'generator:solar:modules': '12' } });
        const [panel] = streetGeometry([node], new iD.coreGraph([node])).areas;
        expect(panel).toMatchObject({ id: 'n1', kind: 'solar' });
        // 12 modules of 2 m², two to four deep
        const xs = panel.polygon.map(p => (p[0] - at(0, 0)[0]) / mx);
        const ys = panel.polygon.map(p => (p[1] - at(0, 0)[1]) / m);
        expect((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))).toBeCloseTo(24, 0);
    });
});
