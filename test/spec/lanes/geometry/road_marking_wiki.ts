import fs from 'node:fs';
import { load } from 'js-yaml';
import { markingPresets } from '../../../../modules/lanes/core/preset_fields';
import { roadMarkingGeometry } from '../../../../modules/lanes/geometry/road_marking';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { arrowValues, patternValues, roadMarkingValues, strokeValues, symbolValues } from '../../../../modules/lanes/model/street_features';

// Nottingham; 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.95 * Math.PI / 180);
const origin: [number, number] = [-1.15, 52.95];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];

/** A closed area 12 m long (east) and 3 m wide with `tags`, a 6 m way east with `lineTags`, and a node with `nodeTags` */
function marked(tags: Tags, lineTags: Tags = {}, nodeTags: Tags = {}) {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(0, 0) }), new iD.osmNode({ id: 'n2', loc: at(12, 0) }),
        new iD.osmNode({ id: 'n3', loc: at(12, 3) }), new iD.osmNode({ id: 'n4', loc: at(0, 3) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3', 'n4', 'n1'], tags }),
        new iD.osmNode({ id: 'n5', loc: at(0, 10) }), new iD.osmNode({ id: 'n6', loc: at(6, 10) }),
        new iD.osmWay({ id: 'w2', nodes: ['n5', 'n6'], tags: lineTags }),
        new iD.osmNode({ id: 'n7', loc: at(3, 20), tags: nodeTags })
    ];
    const graph = new iD.coreGraph(entities);
    return roadMarkingGeometry(entities.map(e => graph.entity(e.id)), graph);
}

describe('road markings as the wiki documents them (Key:road_marking)', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as any).en;

    it('can find every road marking the wiki lists in Add Point, Add Line or Add Area, tagged with its value', () => {
        const presets = Object.values(markingPresets);
        for (const value of roadMarkingValues) {
            expect(presets.some(p => p.tags.road_marking === value), value).toBe(true);
        }
        for (const [id, preset] of Object.entries(markingPresets)) {
            expect(strings.fields[preset.strings]?.name, id).toBeTruthy();
            expect(strings.fields[preset.strings]?.terms, id).toBeTruthy();
            // the wiki's values only, and areas closed as areas
            expect((roadMarkingValues as readonly string[]).includes(preset.tags.road_marking), id).toBe(true);
            expect(!preset.geometry.includes('area') || preset.addTags?.area === 'yes', id).toBe(true);
        }
    });

    it('offers the wiki\'s values of every key first', () => {
        expect(strokeValues.slice(0, 6)).toEqual(['solid', 'dashed', 'double_solid', 'double_dashed', 'sharks_teeth', 'zigzag']);
        expect(patternValues.slice(0, 8)).toEqual(['stripes', 'crosshatch', 'x', 'chevron', 'zigzag', 'chessboard', 'solid', 'none']);
        expect(symbolValues).toEqual(['bicycle', 'pedestrian', 'hov', 'airport', 'wheelchair', 'motorway']);
        for (const value of ['left', 'through', 'right', 'through;right', 'left;right', 'merge_to_left', 'reverse', 'no_u_turn', 'no_right_turn']) {
            expect(arrowValues as readonly string[], value).toContain(value);
        }
        for (const value of patternValues) expect(strings.street_feature.patterns[value], value).toBeTruthy();
    });

    it('draws pattern=x as a cross from corner to corner, and pattern=zigzag as a zigzag from end to end', () => {
        const cross = marked({ road_marking: 'restriction', pattern: 'x', area: 'yes' }).areas[0].stripes!;
        expect(cross).toHaveLength(2);
        const frame = metricFrame(origin);
        // each bar runs the area's length
        for (const bar of cross) {
            const xs = bar.map(p => frame.toMetres(p)[0]);
            expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(11);
        }
        const zigzag = marked({ road_marking: 'restriction', pattern: 'zigzag', area: 'yes' }).areas[0].stripes!;
        expect(zigzag.length).toBeGreaterThan(3);
    });

    it('draws banned turns, every symbol the wiki names, and a painted speed limit in a ring', () => {
        expect(marked({}, { road_marking: 'arrow', arrow: 'no_right_turn' }).symbols[0].turns).toEqual(['no_right_turn']);
        for (const symbol of symbolValues) {
            const out = marked({}, {}, { road_marking: 'symbol', symbol });
            expect(out.symbols.map(s => s.kind), symbol).toEqual([symbol === 'bicycle' ? 'cycle' : symbol]);
            expect(out.texts, symbol).toHaveLength(0);
        }
        const sign = marked({}, {}, { road_marking: 'traffic_sign', traffic_sign: 'GB:670[40]' }).texts[0];
        expect([sign.text, sign.ring]).toEqual(['40', true]);
    });
});
