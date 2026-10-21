import fs from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { select as d3_select } from 'd3-selection';

import { laneRouting } from '../../../../modules/lanes/core/lane_routing';
import { routingPanel } from '../../../../modules/lanes/ui/routing_panel';
import { uiToolLaneModes } from '../../../../modules/lanes/ui/tool_lane_modes';

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
        container.append('div').attr('class', 'main-content');
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

    it('lists the routes from the lane pinned, in the order and colours drawn', () => {
        const routing = laneRouting(context);
        routing.setActive(true);
        const panel = routingPanel(context);
        panel.show();
        const text = () => container.select('.lanes-routing-panel').text();
        expect(text()).toContain('Hover over a lane');

        routing.setPinned({ kind: 'lane', wayID: 'w1', ref: { direction: 'forward', index: 0 }, from: 0, to: 1 });
        const items = container.selectAll<HTMLLIElement, unknown>('.routing-list li').nodes().map(li => li.textContent ?? '');
        expect(items).toHaveLength(2);
        expect(items.some(item => item.includes('left onto North Road'))).toBe(true);
        expect(items.some(item => item.includes('ahead onto East Road'))).toBe(true);
        expect(text()).toContain('High Street, lane 1');
        expect(text()).toContain('arrows: left, through');
        expect(container.select('.routing-swatch').text()).toBe('1');

        // the vehicle buttons choose the vehicle
        const bus = container.selectAll<HTMLButtonElement, unknown>('.routing-vehicles button').nodes()[1];
        bus.click();
        expect(routing.profile()).toBe('bus');
        expect(container.selectAll('.routing-vehicles button.active').text()).toBe('Bus');
        panel.hide();
        expect(container.select('.lanes-routing-panel').empty()).toBe(true);
    });
});
