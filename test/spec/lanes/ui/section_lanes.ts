import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import type { Mode } from '../../../../modules/core/context';

import { laneState } from '../../../../modules/lanes/core/lane_state';
import { fieldPlaceholder } from '../../../../modules/lanes/ui/lane_fields';
import { uiSectionLanes } from '../../../../modules/lanes/ui/section_lanes';

// stand-ins for iD's modes, which need a rendered map
const selectMode = (ids: string[]) => ({ id: 'select', enter() {}, exit() {}, selectedIDs: () => ids }) as unknown as Mode;
const browseMode = { id: 'browse', enter() {}, exit() {} } as unknown as Mode;

describe('Lane Studio sidebar', () => {
    let context: iD.Context;
    let selection: d3.Selection<HTMLDivElement>;

    beforeAll(async () => {
        // load Lane Studio's English strings the way the app does, without the network
        const cache: any = iD.fileFetcher.cache();
        cache.locales_index_lanes = { en: { rtl: false, pct: 1 } };
        cache.locale_lanes_en = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
        iD.localizer.addLocaleDir('lanes', 'locales/lanes');
        await iD.localizer.ensureLoaded();
    });

    beforeEach(() => {
        context = iD.coreContext().assetPath('../dist/').init();
        selection = d3_select(document.createElement('div'));
        context.history().merge([
            new iD.osmNode({ id: 'n1', loc: [13.40, 52.52] }),
            new iD.osmNode({ id: 'n2', loc: [13.401, 52.52] }),
            new iD.osmNode({ id: 'n3', loc: [13.40, 52.521] }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n2'], tags: { highway: 'primary', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '1' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n1', 'n3'], tags: { highway: 'footway' } })
        ]);
    });

    function render(ids: string[]) {
        const section = uiSectionLanes(context);
        section.entityIDs(ids);
        selection.call(section.render);
        return section;
    }

    it('shows only for one selected road', () => {
        render(['w2']);
        expect(selection.select('.lanes-editor').empty()).toBe(true);
        render(['w1']);
        expect(selection.selectAll('.lanes-strip-lane').size()).toBe(3);
        expect(selection.select('.lanes-summary').text()).toContain('2');
    });

    it('adds a lane with one undoable edit', () => {
        render(['w1']);
        selection.select('.lanes-count-backward .lanes-count-add').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' });
        context.undo();
        expect(context.entity('w1').tags.lanes).toBe('3');
    });

    it('edits the selected lane through the inspector', () => {
        context.enter(selectMode(['w1']));
        laneState(context).select('w1', [{ direction: 'forward', index: 1 }]);
        render(['w1']);
        expect(selection.select('.lane-inspector').empty()).toBe(false);

        selection.select('.turn-grid button.turn-right').dispatch('click');
        expect(context.entity('w1').tags['turn:lanes:forward']).toBe('none|right');

        const kind = selection.select<HTMLInputElement>('#lane-field-kind');
        kind.property('value', 'Bus lane').dispatch('change');
        expect(context.entity('w1').tags['bus:lanes:forward']).toBe('|designated');
    });

    it('sets the whole road\'s limit, a UK limit type and its minimum speed from signs', () => {
        render(['w1']);
        selection.select('.road-limits .speed-roundel-nsl_dual').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ maxspeed: '70 mph', 'maxspeed:type': 'GB:nsl_dual' });

        render(['w1']);
        expect(selection.select('.speed-roundel-nsl_dual').classed('active')).toBe(true);
        expect(selection.select('.speed-lower').text()).toContain('60 mph');
        selection.select('.road-limits .speed-roundel-zone20').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ maxspeed: '20 mph', 'maxspeed:type': 'GB:zone20' });

        render(['w1']);
        selection.select('.road-limits .speed-roundels-min .speed-roundel-40').dispatch('click');
        expect(context.entity('w1').tags.minspeed).toBe('40 mph');
    });

    it('picks roadside features per side from dropdowns, as one edit each', () => {
        render(['w1']);
        // the rows are named by the traffic beside them (driving on the left: forward is the way's left)
        expect(selection.selectAll('.form-field-lane-roadside-sidewalk .labeled-input .label').nodes().map((n: any) => n.textContent))
            .toEqual(['Forward', 'Backward']);
        const left = selection.select<HTMLInputElement>('#lane-field-roadside-sidewalk-left');
        expect(left.attr('placeholder')).toBe('Yes, No, Mapped separately…');
        const edits = context.history().difference().summary().length;
        left.property('value', 'Yes').dispatch('change').dispatch('blur');
        expect(context.entity('w1').tags['sidewalk:left']).toBe('yes');
        context.undo();
        expect(context.entity('w1').tags['sidewalk:left']).toBeUndefined();
        expect(context.history().difference().summary().length).toBe(edits);
    });

    it('gives dropdowns iD\'s placeholders', () => {
        expect(fieldPlaceholder([{ value: '3.5', title: '3.5 t' }, { value: '7.5', title: '7.5 t' }, { value: '16' }, { value: '18' }])).toBe('3.5 t, 7.5 t, 16…');
        expect(fieldPlaceholder([{ value: 'yes' }], true)).toBe(iD.localizer.t('inspector.multiple_values'));
        expect(fieldPlaceholder([], false, 'Place names…')).toBe('Place names…');
    });

    it('sets selected lanes\' speeds in a box like the road\'s, and goes back to the whole road', () => {
        context.enter(selectMode(['w1']));
        const state = laneState(context);
        state.select('w1', [{ direction: 'forward', index: 0 }]);
        render(['w1']);
        expect(selection.select('.lane-limits').empty()).toBe(false);
        selection.select('.lane-limits .speed-roundels:not(.speed-roundels-min) .speed-roundel-40').dispatch('click');
        expect(context.entity('w1').tags['maxspeed:lanes:forward']).toBe('40 mph|');
        // the road's limit types are offered for lanes too
        render(['w1']);
        selection.select('.lane-limits .speed-roundel-nsl_single').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ 'maxspeed:lanes:forward': '60 mph|', 'maxspeed:type:lanes:forward': 'GB:nsl_single|' });
        render(['w1']);
        expect(selection.select('.lane-limits .speed-lower').empty()).toBe(false);
        selection.select('.lane-limits-road').dispatch('click');
        expect(state.selected()).toBeNull();
    });

    it('clears selected lanes when the road is deselected', () => {
        const state = laneState(context);
        context.enter(selectMode(['w1']));
        state.select('w1', [{ direction: 'forward', index: 0 }]);
        expect(state.isSelected('w1', { direction: 'forward', index: 0 })).toBe(true);
        context.enter(browseMode);
        expect(state.selected()).toBeNull();
    });
});
