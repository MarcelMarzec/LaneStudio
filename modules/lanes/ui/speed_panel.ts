import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { colouredLimits, laneSpeed, speedClassOf, type SpeedClass } from '../core/lane_speed';
import { isLaneRoad } from '../core/roads';
import { samePick, speedRoundels } from './speed_roundels';

type Div = d3.Selection<HTMLDivElement>;

const roadName = (way: osmWay) => way.tags.name ?? way.tags.ref ?? (way.tags.highway ?? '').replace(/_/g, ' ');

/**
 * The Speed Limit tool's panel, in the sidebar in place of the feature search while the tool is on: the limit to
 * apply, the colours on the map with how many roads in view have each, and the roads in view with no limit
 */
export function speedPanel(context: iD.Context) {
    const speed = laneSpeed(context);
    let _body: Div | null = null;
    let _frame = 0;

    function panel(selection: Div) {
        const header = selection.append('div').attr('class', 'header fillL');
        header.append('button')
            .attr('class', 'close')
            .attr('title', t('_lanes.routing.close'))
            .on('click', () => context.enter(modeBrowse(context) as any))
            .call(svgIcon('#iD-icon-close', ''));
        header.append('h2').text(t('_lanes.speed_tool.title'));
        _body = selection.append('div').attr('class', 'body')
            .append('div').attr('class', 'lanes-routing-sidebar lanes-speed-sidebar') as unknown as Div;
        render();
    }

    function render() {
        const body = _body;
        if (!body) return;
        body.selectAll('*').remove();

        const pick = body.append('div').attr('class', 'routing-section');
        pick.append('h4').text(t('_lanes.speed_tool.apply'));
        speedRoundels(pick, {
            current: speed.picked() ?? undefined, national: true, none: true, noneLabel: t('_lanes.speed_tool.remove'),
            // clicking the picked limit again lets go of it
            onPick: next => speed.setPicked(samePick(speed.picked() ?? undefined, next) ? null : next)
        });
        pick.append('p').attr('class', 'routing-hint')
            .text(t(speed.picked() ? '_lanes.speed_tool.hint_picked' : '_lanes.speed_tool.hint'));

        // the roads in view, by the limit they are coloured with
        const graph = context.graph();
        const map = context.map();
        const roads = context.history().intersects(map.extent()).filter(isLaneRoad) as osmWay[];
        const counts = new Map<SpeedClass, number>();
        for (const road of roads) {
            const cls = speedClassOf(undefined, road);
            counts.set(cls, (counts.get(cls) ?? 0) + 1);
        }
        const legend = body.append('div').attr('class', 'routing-section');
        legend.append('h4').text(t('_lanes.speed_tool.key'));
        const list = legend.append('ul').attr('class', 'speed-key');
        const classes: SpeedClass[] = [...colouredLimits, 'other', 'missing'];
        for (const cls of classes) {
            const item = list.append('li').classed('none-in-view', !counts.get(cls));
            item.append('span').attr('class', `speed-swatch speed-${cls}`);
            item.append('span').attr('class', 'speed-key-label')
                .text(typeof cls === 'number' ? t('_lanes.speed.mph', { n: cls }) : t(`_lanes.speed_tool.${cls}`));
            item.append('span').attr('class', 'speed-key-count').text(t('_lanes.speed_tool.roads', { n: counts.get(cls) ?? 0 }));
        }

        // roads with no limit, one line per road name (a road is often many ways): click one to go to it
        const missing = new Map<string, osmWay[]>();
        for (const road of roads) {
            if (speedClassOf(undefined, road) !== 'missing') continue;
            const name = roadName(road) || road.id;
            missing.set(name, [...(missing.get(name) ?? []), road]);
        }
        if (missing.size) {
            const total = [...missing.values()].reduce((n, ways) => n + ways.length, 0);
            const section = body.append('div').attr('class', 'routing-section');
            section.append('h4').text(t('_lanes.speed_tool.missing_title', { n: total }));
            const items = section.append('ul').attr('class', 'speed-missing-list');
            const named = [...missing.entries()].sort((a, b) => b[1].length - a[1].length);
            for (const [name, ways] of named.slice(0, 12)) {
                const button = items.append('li').append('button')
                    .attr('class', 'speed-missing-road')
                    .on('click', () => (map as any).zoomToEase(ways.map(way => graph.entity(way.id))));
                button.append('span').text(name);
                if (ways.length > 1) button.append('span').attr('class', 'speed-key-count').text(t('_lanes.speed_tool.ways', { n: ways.length }));
            }
            if (named.length > 12) items.append('li').attr('class', 'routing-hint').text(t('_lanes.speed_tool.more', { n: named.length - 12 }));
        }
    }

    // the counts follow the map as it moves and the data as it is edited (at most once a frame)
    const later = () => {
        cancelAnimationFrame(_frame);
        _frame = requestAnimationFrame(render);
    };

    return {
        panel,
        render,
        show() {
            const sidebar = (context.ui() as any).sidebar;
            sidebar.show(panel);
            sidebar.expand?.();
            speed.on('change.speed-panel', render);
            context.history().on('change.speed-panel', later);
            context.map().on('move.speed-panel', later);
        },
        hide() {
            cancelAnimationFrame(_frame);
            speed.on('change.speed-panel', null);
            context.history().on('change.speed-panel', null);
            context.map().on('move.speed-panel', null);
            (context.ui() as any).sidebar.hide();
            _body = null;
        }
    };
}
