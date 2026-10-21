import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import { laneRouting } from '../../../../modules/lanes/core/lane_routing';
import { routingPanel } from '../../../../modules/lanes/ui/routing_panel';
import { uiToolLaneModes } from '../../../../modules/lanes/ui/tool_lane_modes';
import { isDrag } from '../../../../modules/lanes/core/mode_routing';
import { metricFrame } from '../../../../modules/lanes/geometry/frame';
import { roadGeometry } from '../../../../modules/lanes/geometry/road_geometry';
import { laneUnder } from '../../../../modules/lanes/svg/routing';

// near Skegness (left-hand traffic); 1 m ≈ 1/111320° of latitude
const m = 1 / 111320;
const mx = m / Math.cos(53.17 * Math.PI / 180);
const at = (dx: number, dy: number): [number, number] => [0.30 + dx * mx, 53.17 + dy * m];

describe('Lane Studio routing tool', () => {
    let context: iD.Context;
    let container: d3.Selection<HTMLDivElement>;

    beforeAll(async () => {
        const cache: any = iD.fileFetcher.cache();
        cache.locales_index_lanes = { en: { rtl: false, pct: 1 } };
        cache.locale_lanes_en = loadYaml(fs.readFileSync('data/lanes.yaml', 'utf8'));
        iD.localizer.addLocaleDir('lanes', 'locales/lanes');
        await iD.localizer.ensureLoaded();
    });

    beforeEach(() => {
        context = iD.coreContext().assetPath('../dist/').init();
        container = d3_select(document.createElement('div'));
        (context as any).container(container);
        // a road splitting at a junction: ahead east, left north (the approach's left lane), right south
        context.history().merge([
            new iD.osmNode({ id: 'n1', loc: at(-100, 0) }), new iD.osmNode({ id: 'n0', loc: at(0, 0) }),
            new iD.osmNode({ id: 'n2', loc: at(100, 0) }), new iD.osmNode({ id: 'n3', loc: at(0, 100) }), new iD.osmNode({ id: 'n4', loc: at(0, -100) }),
            new iD.osmWay({ id: 'w1', nodes: ['n1', 'n0'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', 'turn:lanes': 'left;through|right', name: 'High Street' } }),
            new iD.osmWay({ id: 'w2', nodes: ['n0', 'n2'], tags: { highway: 'primary', oneway: 'yes', lanes: '2', name: 'East Road' } }),
            new iD.osmWay({ id: 'w3', nodes: ['n0', 'n3'], tags: { highway: 'primary', lanes: '2', name: 'North Road' } }),
            new iD.osmWay({ id: 'w4', nodes: ['n0', 'n4'], tags: { highway: 'primary', lanes: '2', name: 'South Road' } })
        ]);
    });

    afterEach(() => laneRouting(context).setActive(false));

    it('puts Selection and Routing in the top bar, Selection on to begin with', () => {
        const bar = d3_select(document.createElement('div'));
        uiToolLaneModes(context).render(bar as any);
        const buttons = bar.selectAll<HTMLButtonElement, unknown>('button.lanes-mode-button').nodes();
        expect(buttons.map(b => b.textContent)).toEqual(['Selection', 'Routing']);
        expect(buttons.map(b => b.classList.contains('active'))).toEqual([true, false]);
        laneRouting(context).setActive(true);
        expect(buttons.map(b => b.classList.contains('active'))).toEqual([false, true]);
        expect(container.classed('lanes-routing')).toBe(true);
    });

    it('lists the routes from the lane pinned in the sidebar, in place of the feature search', () => {
        const routing = laneRouting(context);
        routing.setActive(true);
        // iD's sidebar, standing in for the rendered one: the panel replaces what it shows
        const sidebarNode = d3_select(document.createElement('div'));
        const sidebar = (context.ui() as any).sidebar;
        let expanded = false;
        sidebar.show = (component: any) => {
            sidebarNode.selectAll('*').remove();
            component(sidebarNode.append('div').attr('class', 'sidebar-component'));
        };
        sidebar.hide = () => sidebarNode.selectAll('*').remove();
        sidebar.expand = () => { expanded = true; };

        const panel = routingPanel(context);
        panel.show();
        expect(expanded).toBe(true);
        // built like iD's own sidebar panels: a header with a close button, then the body
        expect(sidebarNode.select('.header h2').text()).toBe('Routing');
        expect(sidebarNode.select('.header button.close').empty()).toBe(false);
        const text = () => sidebarNode.select('.body').text();
        expect(text()).toContain('Hover over a lane');

        routing.setPinned({ kind: 'lane', wayID: 'w1', ref: { direction: 'forward', index: 0 }, from: 0, to: 1 });
        const items = sidebarNode.selectAll<HTMLLIElement, unknown>('.routing-list li').nodes().map(li => li.textContent ?? '');
        expect(items).toHaveLength(2);
        expect(items.some(item => item.includes('left onto North Road'))).toBe(true);
        expect(items.some(item => item.includes('ahead onto East Road'))).toBe(true);
        expect(text()).toContain('High Street, lane 1');
        expect(text()).toContain('arrows: left, through');
        expect(sidebarNode.select('.routing-swatch').text()).toBe('1');

        // the vehicle buttons choose the vehicle
        const bus = sidebarNode.selectAll<HTMLButtonElement, unknown>('.routing-vehicles button').nodes()[1];
        bus.click();
        expect(routing.profile()).toBe('bus');
        expect(sidebarNode.selectAll('.routing-vehicles button.active').text()).toBe('Bus');
        // leaving gives the sidebar back
        panel.hide();
        expect(sidebarNode.select('.sidebar-component').empty()).toBe(true);
    });

    it('finds the lane under the pointer from the lanes drawn, or a road\'s nearest lane', () => {
        const graph = context.graph();
        const { pieces } = roadGeometry(['w1', 'w2', 'w3', 'w4'].map(id => graph.entity(id as `w${number}`) as InstanceType<typeof iD.osmWay>), graph);
        // a screen 1 pixel to the metre, north up
        const frame = metricFrame(at(0, 0));
        const project = (loc: [number, number]): [number, number] => {
            const p = frame.toMetres(loc);
            return [p[0], -p[1]];
        };
        // High Street runs east to the junction: its left lane (lane 1) is the north one, its way line between the lanes
        const north = laneUnder(pieces, graph, project, [-50, -1.8]);
        expect(north).toMatchObject({ kind: 'lane', wayID: 'w1', ref: { direction: 'forward', index: 0 }, from: 0, to: 1 });
        expect(laneUnder(pieces, graph, project, [-50, 1.8])).toMatchObject({ wayID: 'w1', ref: { index: 1 } });
        // a few pixels beyond the kerb still finds the lane; far from any road finds nothing
        expect(laneUnder(pieces, graph, project, [-50, -9])).toMatchObject({ wayID: 'w1', ref: { index: 0 } });
        expect(laneUnder(pieces, graph, project, [-50, -40])).toBeNull();
        // given the road (its line under the pointer), its nearest lane however far
        expect(laneUnder(pieces, graph, project, [-50, -40], Infinity, 'w1')).toMatchObject({ wayID: 'w1', ref: { index: 0 } });
    });

    it('tells a click from the end of a drag', () => {
        expect(isDrag([100, 100], [102, 101])).toBe(false);
        expect(isDrag([100, 100], [140, 60])).toBe(true);
        expect(isDrag(null, [140, 60])).toBe(false);
    });
});
