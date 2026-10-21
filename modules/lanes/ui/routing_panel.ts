import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
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

/**
 * The Routing tool's panel, over the top left of the map: the vehicle, and the routes from the lane or footway
 * the pointer is over, in the same colours as on the map, with where traffic comes from and the ways it may not take.
 */
export function routingPanel(context: iD.Context) {
    const routing = laneRouting(context);
    let panel: Div | null = null;

    function render() {
        if (!panel) return;
        const graph = context.graph();
        panel.selectAll('*').remove();

        const head = panel.append('div').attr('class', 'routing-head');
        head.append('h3').text(t('_lanes.routing.title'));
        head.append('button').attr('class', 'routing-close').attr('title', t('_lanes.routing.close')).text('×')
            .on('click', () => context.enter(modeBrowse(context) as any));

        const vehicles = panel.append('div').attr('class', 'routing-vehicles').attr('role', 'radiogroup')
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
            panel.append('p').attr('class', 'routing-hint').text(t('_lanes.routing.hint'));
            return;
        }
        if (routing.pinned()) panel.append('p').attr('class', 'routing-pinned').text(t('_lanes.routing.pinned'));

        if (found.kind === 'walk') {
            const { result } = found;
            panel.append('h4').text(t('_lanes.routing.walk_title', { road: roadName(graph, found.focus.wayID) }));
            panel.append('p').text(t('_lanes.routing.walk_reach', { n: result.reach, streets: result.reached.join(', ') || '—' }));
            panel.append('p').text(t('_lanes.routing.walk_crossings', { n: result.crossings.length }));
            return;
        }

        const { focus, result } = found;
        const way = graph.entity(focus.wayID) as osmWay;
        const lane = context.graph() && laneArrows(way, focus.ref.direction, focus.ref.index);
        const title = panel.append('h4').text(t('_lanes.routing.from', { road: roadName(graph, focus.wayID), lane: focus.ref.index + 1 }));
        if (lane) title.append('span').attr('class', 'routing-arrows').text(` (${t('_lanes.routing.lane_arrows', { arrows: lane })})`);

        panel.append('div').attr('class', 'routing-label').text(t('_lanes.routing.routes'));
        const list = panel.append('ol').attr('class', 'routing-list');
        if (!result.routes.length) list.append('li').text(t('_lanes.routing.none'));
        result.routes.forEach((route, i) => {
            const item = list.append('li');
            item.append('span').attr('class', 'routing-swatch').style('background', routeColours[i % routeColours.length]).text(i + 1);
            item.append('span').attr('class', 'routing-words').text(routeWords(route, graph));
            const end = route.end === 'limit' ? '' : `, ${t(`_lanes.routing.ends.${route.end}`)}`;
            item.append('span').attr('class', 'routing-length').text(` ${t('_lanes.routing.length', { n: Math.round(route.length) })}${end}`);
        });

        if (result.incoming.length) {
            panel.append('div').attr('class', 'routing-label').text(t('_lanes.routing.incoming'));
            const names = [...new Set(result.incoming.map(r => roadName(graph, r.runs[0].wayID)))];
            panel.append('p').attr('class', 'routing-incoming').text(names.join(', '));
        }
        if (result.blocked.length) {
            panel.append('div').attr('class', 'routing-label').text(t('_lanes.routing.blocked'));
            const blocked = panel.append('ul').attr('class', 'routing-blocked');
            for (const b of result.blocked) {
                blocked.append('li').text(`${roadName(graph, b.toWayID)}: ${b.reason.replace(/_/g, ' ')}`);
            }
        }
    }

    function laneArrows(way: osmWay, direction: string, index: number): string {
        const key = way.tags['turn:lanes'] !== undefined && direction !== 'both_ways' && !way.tags[`turn:lanes:${direction}`]
            ? 'turn:lanes' : `turn:lanes:${direction}`;
        const slot = (way.tags[key] ?? '').split('|')[index] ?? '';
        return parseTurn(slot).map(v => v.replace(/_/g, ' ')).join(', ');
    }

    return {
        show() {
            if (!panel) {
                panel = context.container().select('.main-content').append('div')
                    .attr('class', 'lanes-routing-panel') as unknown as Div;
            }
            routing.on('change.routing-panel', render);
            context.history().on('change.routing-panel', render);
            render();
        },
        hide() {
            routing.on('change.routing-panel', null);
            context.history().on('change.routing-panel', null);
            panel?.remove();
            panel = null;
        }
    };
}

