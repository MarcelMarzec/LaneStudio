import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { waterGeometry } from '../../../../modules/lanes/geometry/water';
import { stretchIntoJunction, worksGeometry } from '../../../../modules/lanes/geometry/works';
import { asBuiltFeature, constructionHighway, futureFeature } from '../../../../modules/lanes/core/lifecycle';
import { builtHighway, isLaneRoad } from '../../../../modules/lanes/core/roads';
import { validationLaneTags } from '../../../../modules/lanes/validations/lane_tags';

/*
 * Water (wiki: Key:waterway, Key:water) and building work (wiki: Key:construction), on made-up features near the
 * Spalding Bypass services being built (w1563755167)
 */

type V = [number, number];
const m = 1 / 111320;
const lon0 = -0.125;
const lat0 = 52.7967;
const mx = m / Math.cos(lat0 * Math.PI / 180);
const at = (x: number, y: number): V => [lon0 + x * mx, lat0 + y * m];
const node = (id: string, x: number, y: number, tags: Tags = {}) => new iD.osmNode({ id: id as `n${number}`, loc: at(x, y), tags });
const way = (id: string, nodes: string[], tags: Tags) => new iD.osmWay({ id: id as `w${number}`, nodes: nodes as `n${number}`[], tags });
const frame = metricFrame(at(0, 0));
const metres = (locs: V[]) => locs.map(frame.toMetres);
/** A shape's extent across x and along y, in metres */
const extent = (locs: V[]) => {
    const p = metres(locs);
    const xs = p.map(q => q[0]);
    const ys = p.map(q => q[1]);
    return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
};

describe('water', () => {
    /** A watercourse running north from (0, 0) to (0, 100), with a node in the middle */
    const course = (tags: Tags, middle: Tags = {}) => {
        const entities = [node('n1', 0, 0), node('n2', 0, 50, middle), node('n3', 0, 100), way('w1', ['n1', 'n2', 'n3'], tags)];
        return { entities, graph: new iD.coreGraph(entities) };
    };

    it('draws watercourses at their width: a UK default per kind, or width=*', () => {
        for (const [tags, width] of [
            [{ waterway: 'ditch' }, 1], [{ waterway: 'drain' }, 2], [{ waterway: 'stream' }, 1.5], [{ waterway: 'river' }, 10],
            [{ waterway: 'canal' }, 12], [{ waterway: 'river', width: '25' }, 25]
        ] as [Tags, number][]) {
            const { entities, graph } = course(tags);
            const [channel] = waterGeometry(entities, graph).channels;
            expect(extent(channel.polygon).x, JSON.stringify(tags)).toBeCloseTo(width, 1);
            expect(channel.banks).toHaveLength(2);
        }
    });

    it('marks culverts and pressurised pipes as covered, and water that dries up as intermittent', () => {
        const culvert = course({ waterway: 'ditch', tunnel: 'culvert', layer: '-1' });
        expect(waterGeometry(culvert.entities, culvert.graph).channels[0].covered).toBe(true);
        const pipe = course({ waterway: 'pressurised' });
        expect(waterGeometry(pipe.entities, pipe.graph).channels[0].covered).toBe(true);
        const dry = course({ waterway: 'stream', intermittent: 'yes' });
        expect(waterGeometry(dry.entities, dry.graph).channels[0].intermittent).toBe(true);
    });

    it('leaves a watercourse out where its own water is mapped as an area, drawing the area', () => {
        // a river area over the northern half: the river is drawn only south of it
        const entities = [
            node('n1', 0, 0), node('n2', 0, 50), node('n3', 0, 100), way('w1', ['n1', 'n2', 'n3'], { waterway: 'river' }),
            node('a1', -20, 40), node('a2', 20, 40), node('a3', 20, 120), node('a4', -20, 120),
            way('w2', ['a1', 'a2', 'a3', 'a4', 'a1'], { natural: 'water', water: 'river' })
        ];
        const water = waterGeometry(entities, new iD.coreGraph(entities));
        expect(water.areas.map(a => [a.id, a.kind])).toEqual([['w2', 'river']]);
        expect(water.channels).toHaveLength(1);
        expect(extent(water.channels[0].polygon).y).toBeCloseTo(50, 0);
    });

    it('reads the deprecated waterway=riverbank and landuse=reservoir as water areas', () => {
        for (const tags of [{ waterway: 'riverbank' }, { landuse: 'reservoir' }, { natural: 'water', water: 'pond', intermittent: 'yes' }] as Tags[]) {
            const entities = [node('a1', 0, 0), node('a2', 10, 0), node('a3', 10, 10), node('a4', 0, 10), way('w2', ['a1', 'a2', 'a3', 'a4', 'a1'], tags)];
            expect(waterGeometry(entities, new iD.coreGraph(entities)).areas, JSON.stringify(tags)).toHaveLength(1);
        }
    });

    it('lays weirs, lock gates, waterfalls, rapids and gates across the watercourse at its node', () => {
        const kinds = (waterway: string) => {
            const { entities, graph } = course({ waterway: 'canal' }, { waterway });
            return waterGeometry(entities, graph).features.map(f => f.kind);
        };
        expect(kinds('weir')).toEqual(['rapids', 'weir']);
        expect(kinds('lock_gate')).toEqual(['lock_gate', 'lock_gate']);
        expect(kinds('waterfall')).toEqual(['rapids', 'lip']);
        expect(kinds('rapids')).toEqual(['rapids']);
        expect(kinds('sluice_gate')).toEqual(['gate']);
        expect(kinds('debris_screen')).toEqual(['screen']);
        // a weir spans the canal's 12 m, and more
        const { entities, graph } = course({ waterway: 'canal' }, { waterway: 'weir' });
        const weir = waterGeometry(entities, graph).features.find(f => f.kind === 'weir')!;
        expect(extent(weir.points).x).toBeGreaterThan(12);
    });

    it('spans a lock gate from bank to bank of the lock chamber mapped round it, not the canal\'s default width', () => {
        // a 6 m lock chamber (water=lock) on a canal (12 m untagged), as Bottisham Lock on the Cam
        const entities = [
            node('n1', 0, 0), node('n2', 0, 50, { waterway: 'lock_gate' }), node('n3', 0, 100), way('w1', ['n1', 'n2', 'n3'], { waterway: 'canal' }),
            node('a1', -3, 20), node('a2', 3, 20), node('a3', 3, 80), node('a4', -3, 80),
            way('w2', ['a1', 'a2', 'a3', 'a4', 'a1'], { natural: 'water', water: 'lock' })
        ];
        const gates = waterGeometry(entities, new iD.coreGraph(entities)).features.filter(f => f.kind === 'lock_gate');
        const xs = gates.flatMap(g => metres(g.points).map(p => p[0]));
        expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(8);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(6);
    });

    it('draws a dam mapped as a line along its crest', () => {
        const entities = [node('n1', 0, 0), node('n2', 50, 0), way('w1', ['n1', 'n2'], { waterway: 'dam' })];
        const [dam] = waterGeometry(entities, new iD.coreGraph(entities)).features;
        expect(dam.kind).toBe('dam');
        expect(extent(dam.points).y).toBeCloseTo(4, 1);
    });
});

describe('building work', () => {
    const square = (id: string, tags: Tags, x = 0) => [
        node(`${id}a`, x, 0), node(`${id}b`, x + 20, 0), node(`${id}c`, x + 20, 20), node(`${id}d`, x, 20),
        way(id, [`${id}a`, `${id}b`, `${id}c`, `${id}d`, `${id}a`], tags)
    ];

    it('reads what is being built, and the two mistakes as what they mean', () => {
        expect(futureFeature({ 'construction:amenity': 'parking' })).toEqual({ key: 'amenity', value: 'parking', mistaken: false });
        expect(futureFeature({ amenity: 'construction', construction: 'parking' })).toEqual({ key: 'amenity', value: 'parking', mistaken: true });
        expect(asBuiltFeature({ amenity: 'construction', construction: 'parking', parking: 'surface' }).amenity).toBe('parking');
        expect(futureFeature({ highway: 'construction', construction: 'primary' })).toBeNull();
        expect(constructionHighway('drive-through')).toBe('service');
        expect(constructionHighway('footpath')).toBe('footway');
        // the drive-through being built at the Spalding Bypass services (w1563755154) is a service road
        expect(builtHighway({ highway: 'construction', construction: 'drive-through', service: 'drive-through' })).toBe('service');
    });

    it('draws sites, buildings going up and other features being built', () => {
        const entities = [
            ...square('w1', { landuse: 'construction' }),
            ...square('w2', { building: 'construction', construction: 'retail' }, 30),
            ...square('w3', { amenity: 'construction', construction: 'parking' }, 60),
            ...square('w4', { 'construction:leisure': 'playground' }, 90),
            ...square('w5', { landuse: 'grass' }, 120)
        ];
        const works = worksGeometry(entities, new iD.coreGraph(entities), []);
        expect(works.map(w => [w.id, w.kind])).toEqual([['w1', 'site'], ['w2', 'building'], ['w3', 'area'], ['w4', 'area']]);
    });

    it('puts cones along both kerbs of roadworks on a road that stays open', () => {
        const entities = [node('n1', 0, 0), node('n2', 60, 0), way('w1', ['n1', 'n2'], { highway: 'residential', construction: 'minor' })];
        const graph = new iD.coreGraph(entities);
        const roads = roadGeometry(entities.filter(isLaneRoad), graph);
        const cones = worksGeometry(entities, graph, roads.pieces).filter(w => w.kind === 'cone');
        expect(cones.length).toBeGreaterThanOrEqual(16);
        // and none on a road without roadworks
        const quiet = [node('n1', 0, 0), node('n2', 60, 0), way('w1', ['n1', 'n2'], { highway: 'residential' })];
        const quietGraph = new iD.coreGraph(quiet);
        expect(worksGeometry(quiet, quietGraph, roadGeometry(quiet.filter(isLaneRoad), quietGraph).pieces)).toEqual([]);
    });

    it('finds the stretch of a road being built pulled back into a junction with a road in use', () => {
        // a service road being built off a road in use, as w1563755167 off Fulney Lane North, Spalding
        const entities = [
            node('n1', -60, 0), node('n0', 0, 0), node('n2', 60, 0), node('n3', 0, -40),
            way('w1', ['n1', 'n0', 'n2'], { highway: 'residential', lanes: '2' }),
            way('w2', ['n0', 'n3'], { highway: 'construction', construction: 'service', lanes: '2' })
        ];
        const graph = new iD.coreGraph(entities);
        const roads = roadGeometry(entities.filter(isLaneRoad), graph);
        const piece = roads.pieces.find(p => p.wayID === 'w2')!;
        const stretch = stretchIntoJunction(piece, 'n0', graph)!;
        expect(stretch).not.toBeNull();
        // from the node down to where the road is drawn, across its width
        const size = extent(stretch);
        expect(size.y).toBeGreaterThan(1);
        expect(size.x).toBeCloseTo(piece.layout.total, 0);
    });

    it('flags the two mistakes, and fixes them to the wiki tags', () => {
        const check = (tags: Tags) => {
            const entities = [node('n1', 0, 0), node('n2', 30, 0), node('n3', 30, 30), way('w1', ['n1', 'n2', 'n3', 'n1'], tags)];
            const context = iD.coreContext().assetPath('../dist/').init();
            for (const entity of entities) context.perform(iD.actionAddEntity(entity));
            const issues = validationLaneTags(context)(context.entity('w1' as `w${number}`), context.graph())
                .filter(i => i.subtype?.startsWith('construction'));
            expect(issues).toHaveLength(1);
            issues[0].dynamicFixes!(context)[0].onClick!(context, () => {});
            return { subtype: issues[0].subtype, tags: context.entity('w1' as `w${number}`).tags };
        };
        expect(check({ amenity: 'construction', construction: 'parking', parking: 'surface' }))
            .toEqual({ subtype: 'construction_key', tags: { 'construction:amenity': 'parking', parking: 'surface' } });
        expect(check({ highway: 'construction', construction: 'drive-through', service: 'drive-through' }))
            .toEqual({ subtype: 'construction_service', tags: { highway: 'construction', construction: 'service', service: 'drive-through' } });
        expect(check({ highway: 'construction', construction: 'parking_aisle' }).tags)
            .toEqual({ highway: 'construction', construction: 'service', service: 'parking_aisle' });
    });
});
