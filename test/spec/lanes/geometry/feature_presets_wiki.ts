import fs from 'node:fs';
import { load } from 'js-yaml';
import { featurePresets, markingPresets, unhiddenPresets } from '../../../../modules/lanes/core/preset_fields';
import { barrierWidths, lineBarriers, postBarriers, streetGeometry } from '../../../../modules/lanes/geometry/street';
import { kerbKind, streetParkingValues } from '../../../../modules/lanes/model/street_features';

const idPresets = JSON.parse(fs.readFileSync('node_modules/@openstreetmap/id-tagging-schema/dist/presets.json', 'utf8'));
const deprecated: { old: Tags }[] = JSON.parse(fs.readFileSync('node_modules/@openstreetmap/id-tagging-schema/dist/deprecated.json', 'utf8'));

// Nottingham; 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(52.95 * Math.PI / 180);
const origin: [number, number] = [-1.15, 52.95];
const at = (dx: number, dy: number): [number, number] => [origin[0] + dx * mx, origin[1] + dy * m];

/** What a node tagged `tags` in the middle of a two-lane road draws */
function onRoad(tags: Tags) {
    const entities = [
        new iD.osmNode({ id: 'n1', loc: at(0, 0) }),
        new iD.osmNode({ id: 'n2', loc: at(50, 0), tags }),
        new iD.osmNode({ id: 'n3', loc: at(100, 0) }),
        new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2', 'n3'], tags: { highway: 'residential', lanes: '2' } })
    ];
    const graph = new iD.coreGraph(entities);
    return streetGeometry(entities.map(e => graph.entity(e.id)), graph).markings;
}

describe('features as the wiki documents them', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as any).en;

    it('has a named, searchable preset for each feature iD has none for, showing the fields of iD\'s like it', () => {
        for (const [id, preset] of Object.entries(featurePresets)) {
            expect(strings.fields[preset.strings]?.name, id).toBeTruthy();
            expect(strings.fields[preset.strings]?.terms, id).toBeTruthy();
            expect(idPresets[preset.like], id).toBeTruthy();
            // it adds its own tags, and iD has no preset of its own for them
            for (const [key, value] of Object.entries(preset.tags)) expect(preset.addTags?.[key] ?? value, id).toBe(value);
            const iDs = Object.entries(idPresets).filter(([, p]: [string, any]) => p.searchable !== false &&
                JSON.stringify(p.tags) === JSON.stringify(preset.tags));
            expect(iDs.map(([i]) => i), id).toEqual([]);
        }
        expect(Object.keys(featurePresets).filter(id => id in markingPresets)).toEqual([]);
        for (const id of unhiddenPresets) expect(idPresets[id], id).toBeTruthy();
    });

    it('never writes a tag iD or the wiki deprecates', () => {
        for (const [id, preset] of Object.entries(featurePresets)) {
            const tags = preset.addTags ?? preset.tags;
            const old = deprecated.find(d => Object.entries(d.old).every(([k, v]) => tags[k] !== undefined && (v === '*' || tags[k] === v)));
            expect(old, id).toBeUndefined();
        }
        const values = Object.values(featurePresets).map(p => p.tags.barrier ?? p.tags['area:highway']).filter(Boolean);
        for (const discouraged of ['sliding_gate', 'wire_fence', 'railing', 'emergency']) expect(values).not.toContain(discouraged);
    });

    it('draws every barrier it has a preset for', () => {
        for (const preset of Object.values(featurePresets)) {
            const value = preset.tags.barrier;
            if (!value) continue;
            const drawn = preset.geometry.includes('line') && !preset.geometry.includes('vertex') ? barrierWidths[value] !== undefined
                : lineBarriers.has(value) || !!postBarriers[value] || barrierWidths[value] !== undefined;
            expect(drawn, value).toBe(true);
        }
        expect(onRoad({ barrier: 'delineators' }).filter(mk => mk.kind === 'barrier_post').length).toBeGreaterThan(3);
        expect(onRoad({ barrier: 'bump_gate' }).map(mk => mk.kind)).toContain('barrier_line');
    });

    it('draws every kind of traffic calming the wiki lists, not as a plain band', () => {
        for (const preset of Object.values(featurePresets)) {
            const value = preset.tags.traffic_calming;
            if (!value) continue;
            const drawn = onRoad({ traffic_calming: value }).filter(mk => mk.kind === 'calming').map(mk => mk.variant);
            expect(drawn.length, value).toBeGreaterThan(0);
            expect(drawn, value).not.toContain('band');
        }
        const variants = (value: string) => onRoad({ traffic_calming: value }).filter(mk => mk.kind === 'calming').map(mk => mk.variant);
        expect(variants('choked_cushion')).toEqual(['cushion', 'cushion', 'tooth', 'tooth', 'buildout', 'buildout']);
        expect(variants('painted_island')).toEqual(['painted_island']);
        expect(variants('flexible_delineator')).toEqual(['delineator']);
        expect(variants('markings')).toEqual(['paint', 'paint', 'paint']);
    });

    it('joins every kind of street parking the wiki lists to its road', () => {
        const values = Object.values(featurePresets).filter(p => p.tags.amenity === 'parking').map(p => p.tags.parking);
        expect(values).toHaveLength(5);
        for (const value of values) expect(streetParkingValues as readonly string[], value).toContain(value);
    });

    it('reads a kerb\'s height as the wiki gives it', () => {
        expect(['raised', 'lowered', 'flush', 'rolled', 'no', 'yes'].map(kerbKind)).toEqual(['raised', 'lowered', 'flush', 'rolled', 'no', 'raised']);
        expect(['0.12', '4 cm', '4_cm', '6"', '0.02', '0'].map(kerbKind)).toEqual(['raised', 'raised', 'raised', 'raised', 'lowered', 'flush']);
    });
});
