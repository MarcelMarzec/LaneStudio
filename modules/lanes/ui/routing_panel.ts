import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { laneRouting, routeColours, routesFor } from '../core/lane_routing';
import { describeMove, routingProfiles, type Route, type RoutingProfile } from '../geometry/routing';
import { parseTurn } from '../model';

type Div = d3.Selection<HTMLDivElement>;

const roadName = (graph: iD.Graph, wayID: string) => {
    const way = graph.hasEntity(wayID as osmWay['id']) as osmWay | undefined;
    return way?.tags.name ?? way?.tags.ref ?? (way?.tags.footway ?? way?.tags.highway)?.replace(/_/g, ' ') ?? t('_lanes.routing.unnamed');
};

/** A route in words: its turns, going round a roundabout left out (the exit says it) */
function routeWords(route: Route, graph: iD.Graph): string {
    return route.moves.filter(move => move.ring !== 'round').map(move => {
        const { turn, road } = describeMove(move, graph);
        return move.ring === 'enter' ? turn : `${turn} onto ${road}`;
    }).join(' → ') || roadName(graph, route.runs[0].wayID);
}

/** The arrows of a lane, from the way's tags, in words */
function laneArrows(way: osmWay, direction: string, index: number): string {
    const key = way.tags['turn:lanes'] !== undefined && direction !== 'both_ways' && !way.tags[`turn:lanes:${direction}`]
        ? 'turn:lanes' : `turn:lanes:${direction}`;
    const slot = (way.tags[key] ?? '').split('|')[index] ?? '';
    return parseTurn(slot).map(v => v.replace(/_/g, ' ')).join(', ');
}

/**
 * The Routing tool's panel, in the sidebar in place of the feature search while the tool is on, built like iD's
 * own sidebar panels: the vehicle, and the routes from the lane or footway the pointer is over, in the colours
 * drawn on the map, with where traffic comes from and the ways it may not take.
 */
export function routingPanel(context: iD.Context) {
    const routing = laneRouting(context);
    let _body: Div | null = null;

    /** The sidebar component: iD's header with a close button, and a body re-rendered as the routes change */
    function panel(selection: Div) {
        const header = selection.append('div').attr('class', 'header fillL');
        header.append('button')
            .attr('class', 'close')
            .attr('title', t('_lanes.routing.close'))
            .on('click', () => context.enter(modeBrowse(context) as any))
            .call(svgIcon('#iD-icon-close', ''));
        header.append('h2').text(t('_lanes.routing.title'));
        _body = selection.append('div').attr('class', 'body')
            .append('div').attr('class', 'lanes-routing-sidebar') as unknown as Div;
        render();
    }

    function render() {
        const body = _body;
        if (!body) return;
        const graph = context.graph();
        body.selectAll('*').remove();

        const vehicle = body.append('div').attr('class', 'routing-section');
        vehicle.append('h4').text(t('_lanes.routing.vehicle'));
        const vehicles = vehicle.append('div').attr('class', 'lane-buttons routing-vehicles').attr('role', 'radiogroup')
            .attr('aria-label', t('_lanes.routing.vehicle'));
        for (const profile of Object.keys(routingProfiles) as RoutingProfile[]) {
            vehicles.append('button')
                .attr('role', 'radio')
                .attr('aria-checked', routing.profile() === profile)
                .classed('active', routing.profile() === profile)
                .text(t(`_lanes.routing.profiles.${profile}`))
                .on('click', () => routing.setProfile(profile));
        }

        const found = routesFor(graph, routing.focus(), routing.profile());
        if (!found) {
            body.append('p').attr('class', 'routing-hint').text(t('_lanes.routing.hint'));
            return;
        }
        const routes = body.append('div').attr('class', 'routing-section');
        if (routing.pinned()) routes.append('p').attr('class', 'routing-hint').text(t('_lanes.routing.pinned'));

        if (found.kind === 'walk') {
            const { result } = found;
            routes.append('h4').text(t('_lanes.routing.walk_title', { road: roadName(graph, found.focus.wayID) }));
            routes.append('p').text(t('_lanes.routing.walk_reach', { n: result.reach, streets: result.reached.join(', ') || '—' }));
            routes.append('p').text(t('_lanes.routing.walk_crossings', { n: result.crossings.length }));
            return;
        }

        const { focus, result } = found;
        const way = graph.entity(focus.wayID) as osmWay;
        const arrows = laneArrows(way, focus.ref.direction, focus.ref.index);
        const title = routes.append('h3').text(t('_lanes.routing.from', { road: roadName(graph, focus.wayID), lane: focus.ref.index + 1 }));
        if (arrows) title.append('span').attr('class', 'routing-arrows').text(` (${t('_lanes.routing.lane_arrows', { arrows })})`);

        routes.append('h4').text(t('_lanes.routing.routes'));
        const list = routes.append('ol').attr('class', 'routing-list');
        if (!result.routes.length) list.append('li').attr('class', 'routing-none').text(t('_lanes.routing.none'));
        result.routes.forEach((route, i) => {
            const item = list.append('li');
            item.append('span').attr('class', 'routing-swatch').style('background', routeColours[i % routeColours.length]).text(i + 1);
            item.append('span').attr('class', 'routing-words').text(routeWords(route, graph));
            const end = route.end === 'limit' ? '' : `, ${t(`_lanes.routing.ends.${route.end}`)}`;
            item.append('span').attr('class', 'routing-length').text(`${t('_lanes.routing.length', { n: Math.round(route.length) })}${end}`);
        });

        if (result.incoming.length) {
            const incoming = body.append('div').attr('class', 'routing-section');
            incoming.append('h4').text(t('_lanes.routing.incoming'));
            const names = [...new Set(result.incoming.map(r => roadName(graph, r.runs[0].wayID)))];
            incoming.append('p').attr('class', 'routing-incoming').text(names.join(', '));
        }
        if (result.blocked.length) {
            const blocked = body.append('div').attr('class', 'routing-section');
            blocked.append('h4').text(t('_lanes.routing.blocked'));
            const items = blocked.append('ul').attr('class', 'routing-blocked');
            for (const b of result.blocked) {
                items.append('li').text(`${roadName(graph, b.toWayID)}: ${b.reason.replace(/_/g, ' ')}`);
            }
        }
    }

    return {
        /** the component for iD's sidebar, rendered into the selection given */
        panel,
        /** puts the panel in the sidebar, in place of the feature search, and opens the sidebar if it is closed */
        show() {
            const sidebar = (context.ui() as any).sidebar;
            sidebar.show(panel);
            sidebar.expand?.();
            routing.on('change.routing-panel', render);
            context.history().on('change.routing-panel', render);
        },
        /** gives the sidebar back to the feature search */
        hide() {
            routing.on('change.routing-panel', null);
            context.history().on('change.routing-panel', null);
            (context.ui() as any).sidebar.hide();
            _body = null;
        }
    };
}
