import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import type { Mode } from '../../../../modules/core/context';

import { laneState } from '../../../../modules/lanes/core/lane_state';
import { fieldPlaceholder } from '../../../../modules/lanes/ui/lane_fields';
import { laneStudioCrossingSignals } from '../../../../modules/lanes/core/preset_fields';
import { uiSectionLanes } from '../../../../modules/lanes/ui/section_lanes';
import { arrangeFields, laneStudioRoadFields } from '../../../../modules/lanes/ui/road_fields';
import { laneStudioFieldFilter } from '../../../../modules/lanes/ui/field_filter';
import { fieldInfoPages } from '../../../../modules/lanes/ui/field_info';
import { openRoadsideMenu, closeRoadsideMenu } from '../../../../modules/lanes/ui/roadside_menu';

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

    /** Draws one of Lane Studio's road fields, as iD's Fields section does: the field, then its tags */
    function renderField(type: string, ids = ['w1']) {
        laneStudioRoadFields();
        selection.selectAll('*').remove();
        const impl = (iD.uiFields as any)[type]({ id: type }, context);
        impl.entityIDs(ids);
        impl(selection);
        impl.tags(context.entity(ids[0] as iD.OsmEntity['id']).tags);
        return impl;
    }

    it('shows only for one selected road', () => {
        render(['w2']);
        expect(selection.select('.lanes-editor').empty()).toBe(true);
        render(['w1']);
        expect(selection.selectAll('.lanes-strip-lane').size()).toBe(3);
    });

    it('gives every Lane Studio field iD\'s label row, with an i button opening an overview and its wiki link', () => {
        render(['w1']);
        const tools = selection.select('.form-field-lane-tools');
        expect(tools.select('.field-label .label-textvalue').text()).toBe('Tool');
        tools.select('.tag-reference-button').dispatch('click');
        const body = tools.select('.tag-reference-body');
        expect(body.classed('expanded')).toBe(true);
        expect(body.select('.tag-reference-link').attr('href')).toBe('https://wiki.openstreetmap.org/wiki/Lanes');
        expect(body.select('.tag-reference-description').text()).toContain('Paint');
        tools.select('.tag-reference-button').dispatch('click');
    });

    it('has an overview for every topic', () => {
        const strings: any = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
        for (const topic of Object.keys(fieldInfoPages)) expect(strings.en.info[topic], topic).toBeTruthy();
    });

    it('adds a lane with one undoable edit', () => {
        renderField('lanes_counts');
        // the count and its − and + on one line, as iD's number fields
        expect(selection.selectAll('.lanes-count-backward input, .lanes-count-backward button').size()).toBe(3);
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
        renderField('lanes_maxspeed');
        selection.select('.speed-roundel-nsl_dual').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ maxspeed: '70 mph', 'maxspeed:type': 'GB:nsl_dual' });

        renderField('lanes_maxspeed');
        expect(selection.select('.speed-roundel-nsl_dual').classed('active')).toBe(true);
        expect(selection.select('.speed-lower').text()).toContain('60 mph');
        selection.select('.speed-roundel-zone20').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ maxspeed: '20 mph', 'maxspeed:type': 'GB:zone20' });

        renderField('lanes_minspeed');
        selection.select('.speed-roundels-min .speed-roundel-40').dispatch('click');
        expect(context.entity('w1').tags.minspeed).toBe('40 mph');
    });

    it('picks roadside features per side from dropdowns, as one edit each', () => {
        renderField('lanes_sidewalk');
        // the rows are named by the traffic beside them (driving on the left: forward is the way's left)
        expect(selection.selectAll('.labeled-input .label').nodes().map((n: any) => n.textContent)).toEqual(['Forward', 'Backward']);
        const left = selection.select<HTMLInputElement>('#lane-field-roadside-sidewalk-left');
        expect(left.attr('placeholder')).toBe('Yes, No, Mapped separately…');
        const edits = context.history().difference().summary().length;
        left.property('value', 'Yes').dispatch('change').dispatch('blur');
        expect(context.entity('w1').tags['sidewalk:left']).toBe('yes');
        context.undo();
        expect(context.entity('w1').tags['sidewalk:left']).toBeUndefined();
        expect(context.history().difference().summary().length).toBe(edits);
    });

    it('tags the centre line, and lets a lane beside it overtake or not', () => {
        renderField('lanes_centre_line');
        selection.select('.lane-choice-no_both').dispatch('click');
        expect(context.entity('w1').tags.overtaking).toBe('no');
        renderField('lanes_centre_line');
        selection.select('.lane-choice-dashed').dispatch('click');
        expect(context.entity('w1').tags.overtaking).toBe('yes');

        // driving on the right (the road is in Berlin), the outer forward lane has the kerb on its right and a forward
        // lane on its left; the inner one has the centre line on its left
        context.enter(selectMode(['w1']));
        laneState(context).select('w1', [{ direction: 'forward', index: 1 }]);
        render(['w1']);
        expect(selection.select('.change-toRight').classed('change-beside-kerb')).toBe(true);
        expect(selection.select('.change-toRight').property('disabled')).toBe(true);
        expect(selection.select('.change-toLeft').classed('change-beside-lane')).toBe(true);
        laneState(context).select('w1', [{ direction: 'forward', index: 0 }]);
        render(['w1']);
        expect(selection.select('.change-toLeft').classed('change-beside-centre')).toBe(true);
        selection.select('.change-toLeft').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ 'overtaking:forward': 'no' });
        expect(context.entity('w1').tags['change:lanes:forward']).toBeUndefined();
    });

    it('sets street parking per side, with its details folded under each side', () => {
        context.perform(iD.actionChangeTags('w1', { ...context.entity('w1').tags, 'parking:both': 'lane', 'parking:both:fee': 'yes' }), 'test');
        renderField('lanes_parking');
        expect(selection.selectAll('.lane-parking-details').size()).toBe(2);
        expect(selection.select('.lane-parking-details summary').text()).toContain('pay');
    });

    it('opens the roadside menu and adds no-waiting lines to a side as one edit', () => {
        context.container(d3_select(document.body).append('div') as any);
        openRoadsideMenu(context, { wayID: 'w1' as any, side: 'right', at: [10, 10] });
        const menu = d3_select(context.container().node()).select('.lanes-roadside-menu');
        expect(menu.empty()).toBe(false);
        menu.select('.lanes-roadside-menu-item-no_waiting').dispatch('click');
        menu.select('.lanes-roadside-menu-apply').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ 'parking:right': 'no', 'parking:right:restriction': 'no_parking' });
        expect(d3_select(context.container().node()).select('.lanes-roadside-menu').empty()).toBe(true);
        closeRoadsideMenu();
    });

    it('puts Lane Studio\'s road fields among iD\'s, in place of iD\'s for the same tags', () => {
        const fields = ['name', 'oneway', 'maxspeed', 'lanes', 'surface', 'access'];
        const more = ['cycleway', 'sidewalk', 'parking/side/parking', 'parking/side/orientation', 'lit', 'width'];
        arrangeFields(fields, more, 'residential');
        expect(fields).toEqual(['name', 'oneway', 'lanes/counts', 'lanes/centre_line', 'lanes/maxspeed', 'surface', 'access',
            'lanes/sidewalk', 'lanes/parking']);
        expect(more).toEqual(['lit', 'width', 'lanes/minspeed', 'lanes/shoulder', 'lanes/cycleway']);
        const motorway = ['name', 'ref_road_number', 'oneway_yes', 'maxspeed', 'lanes', 'surface'];
        arrangeFields(motorway, ['minspeed'], 'motorway');
        expect(motorway).toEqual(['name', 'ref_road_number', 'oneway_yes', 'lanes/counts', 'lanes/maxspeed', 'lanes/minspeed', 'surface',
            'lanes/shoulder', 'lanes/managed']);
    });

    it('leaves out iD\'s fields for tags Lane Studio edits, with one road selected', () => {
        const graph = context.graph();
        expect(laneStudioFieldFilter({ id: 'maxspeed', key: 'maxspeed' }, ['w1'], graph)).toBe(false);
        expect(laneStudioFieldFilter({ id: 'sidewalk', key: 'sidewalk:both', keys: ['sidewalk:left', 'sidewalk:right'] }, ['w1'], graph)).toBe(false);
        expect(laneStudioFieldFilter({ id: 'surface', key: 'surface' }, ['w1'], graph)).toBe(true);
        expect(laneStudioFieldFilter({ id: 'lanes/maxspeed', keys: ['maxspeed'] }, ['w1'], graph)).toBe(true);
        // several roads: iD's fields stay, so they can be set on all of them
        expect(laneStudioFieldFilter({ id: 'maxspeed', key: 'maxspeed' }, ['w1', 'w2'], graph)).toBe(true);
    });

    it('gives dropdowns iD\'s placeholders', () => {
        expect(fieldPlaceholder([{ value: '3.5', title: '3.5 t' }, { value: '7.5', title: '7.5 t' }, { value: '16' }, { value: '18' }])).toBe('3.5 t, 7.5 t, 16…');
        expect(fieldPlaceholder([{ value: 'yes' }], true)).toBe(iD.localizer.t('inspector.multiple_values'));
        expect(fieldPlaceholder([], false, 'Place names…')).toBe('Place names…');
    });

    it('sets selected lanes\' speeds from roundels, and goes back to the whole road', () => {
        context.enter(selectMode(['w1']));
        const state = laneState(context);
        state.select('w1', [{ direction: 'forward', index: 0 }]);
        render(['w1']);
        const speed = () => selection.select('.form-field-lane-lane-maxspeed');
        expect(speed().empty()).toBe(false);
        speed().select('.speed-roundel-40').dispatch('click');
        expect(context.entity('w1').tags['maxspeed:lanes:forward']).toBe('40 mph|');
        // the road's limit types are offered for lanes too
        render(['w1']);
        speed().select('.speed-roundel-nsl_single').dispatch('click');
        expect(context.entity('w1').tags).toMatchObject({ 'maxspeed:lanes:forward': '60 mph|', 'maxspeed:type:lanes:forward': 'GB:nsl_single|' });
        render(['w1']);
        expect(selection.select('.lane-inspector .speed-lower').empty()).toBe(false);
        // its bin lets go of the lanes' own limit
        speed().select('.remove-icon').dispatch('click');
        expect(context.entity('w1').tags['maxspeed:lanes:forward']).toBeUndefined();
        render(['w1']);
        selection.select('.lane-inspector-road').dispatch('click');
        expect(state.selected()).toBeNull();
    });

    it('makes a crossing with traffic signals when its signals are ticked, in one undo step', () => {
        laneStudioCrossingSignals(context);
        context.history().merge([new iD.osmNode({ id: 'n9', loc: [13.4005, 52.52], tags: { highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' } })]);
        const tick = (value: string) => context.perform(iD.actionChangeTags('n9', { ...context.entity('n9').tags, 'crossing:signals': value }), 'Changed tags.');
        tick('yes');
        expect(context.entity('n9').tags).toMatchObject({ crossing: 'traffic_signals', 'crossing:signals': 'yes' });
        tick('no');
        expect(context.entity('n9').tags.crossing).toBe('uncontrolled');
        context.undo();
        context.undo();
        expect(context.entity('n9').tags).toEqual({ highway: 'crossing', crossing: 'uncontrolled', 'crossing:markings': 'zebra' });
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
