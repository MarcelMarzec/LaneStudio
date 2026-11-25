import { actionDeleteRelation } from '../../actions/delete_relation';
import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import { modeSelect } from '../../modes/select';
import type { NodeId, RelationId } from '../../osm';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { svgIcon } from '../../svg/icon';
import { utilDisplayLabel } from '../../util/utilDisplayLabel';
import { actionConnectLanes, actionDeclareConnectivity, type ConnectChange } from '../actions/connect_lanes';
import { laneConnectivity } from '../core/lane_connectivity';
import {
    connectivityProblems, laneLinksAt, resolveConnectivity, respot, sameAsDefault, spotAt, type LaneLink, type LaneSpot
} from '../geometry/connectivity';
import { connectivityLane, type LaneRef } from '../model';
import { linkFrom } from '../svg/connectivity';

type Div = d3.Selection<HTMLDivElement>;

/** A lane as the panel names it: its number as the `connectivity` tag counts it, from the driver's left */
const laneName = (ref: LaneRef) => ref.direction === 'both_ways' ? t('_lanes.connectivity.lane_bw')
    : t('_lanes.connectivity.lane', { n: connectivityLane(ref) });

/** The connections from a lane, at each junction it arrives at, by the road (and relation) they lead into */
export function linksByRoad(graph: iD.Graph, spot: LaneSpot): { key: string; links: LaneLink[] }[] {
    const nodes = spot.ref.direction === 'both_ways' ? [spot.to, spot.from] : [spot.to];
    const groups = new Map<string, LaneLink[]>();
    for (const nodeID of nodes) {
        for (const link of laneLinksAt(graph, nodeID).filter(l => linkFrom(l, spot))) {
            const key = `${link.nodeID}-${link.to.wayID}-${link.toNodeID}-${link.relationID ?? ''}`;
            groups.set(key, [...(groups.get(key) ?? []), link]);
        }
    }
    return [...groups].map(([key, links]) => ({ key, links }));
}

/**
 * The Connectivity tool's panel, in the sidebar in place of the feature search while the tool is on: what to do, the
 * colours on the map (each can be hidden), the connections of the lane picked or pointed at, road by road, with
 * buttons to change them, and the connectivity relations in view with problems
 */
export function connectivityPanel(context: iD.Context) {
    const state = laneConnectivity(context);
    let _body: Div | null = null;
    let _frame = 0;

    function panel(selection: Div) {
        const header = selection.append('div').attr('class', 'header fillL');
        header.append('button')
            .attr('class', 'close')
            .attr('title', t('_lanes.routing.close'))
            .on('click', () => context.enter(modeBrowse(context) as any))
            .call(svgIcon('#iD-icon-close', ''));
        header.append('h2').text(t('_lanes.connectivity.title'));
        _body = selection.append('div').attr('class', 'body')
            .append('div').attr('class', 'lanes-routing-sidebar lanes-connectivity-sidebar') as unknown as Div;
        render();
    }

    const roadName = (wayID: string) => {
        const way = context.hasEntity(wayID as osmWay['id']);
        return way ? utilDisplayLabel(way, context.graph()) || wayID : wayID;
    };

    function perform(action: ReturnType<typeof actionConnectLanes>) {
        const picked = state.picked();
        context.perform(action, t('_lanes.annotation.connect'));
        // (a road split at the junction keeps the lane picked on one of its halves)
        if (picked) state.setPicked(respot(context.graph(), picked));
        render();
    }

    function render() {
        const body = _body;
        if (!body) return;
        body.selectAll('*').remove();
        const graph = context.graph();
        const picked = state.picked();
        const focus = picked ?? state.hovered();

        const intro = body.append('div').attr('class', 'routing-section');
        intro.append('p').attr('class', 'routing-hint').text(t(picked ? '_lanes.connectivity.hint_picked' : '_lanes.connectivity.hint'));

        // the colours on the map, each a switch
        const key = body.append('div').attr('class', 'routing-section');
        key.append('h4').text(t('_lanes.connectivity.key'));
        const list = key.append('ul').attr('class', 'speed-key connectivity-key');
        const rows: { id: 'default' | 'declared'; on: boolean; set: (on: boolean) => void }[] = [
            { id: 'default', on: state.showDefault(), set: on => state.setShowDefault(on) },
            { id: 'declared', on: state.showDeclared(), set: on => state.setShowDeclared(on) }
        ];
        for (const row of rows) {
            const label = list.append('li').append('label').attr('class', 'connectivity-key-row');
            label.append('input').attr('type', 'checkbox').property('checked', row.on)
                .on('change', (event: Event) => row.set((event.target as HTMLInputElement).checked));
            label.append('span').attr('class', `connectivity-swatch ${row.id}`);
            label.append('span').attr('class', 'speed-key-label').text(t(`_lanes.connectivity.${row.id}`));
        }
        const optional = list.append('li').append('span').attr('class', 'connectivity-key-row');
        optional.append('span').attr('class', 'connectivity-swatch optional');
        optional.append('span').attr('class', 'speed-key-label').text(t('_lanes.connectivity.optional'));

        if (focus) renderLane(body, focus, !!picked);
        renderRelations(body, graph);
    }

    /** The lane's connections, road by road */
    function renderLane(body: Div, spot: LaneSpot, picked: boolean) {
        const graph = context.graph();
        const section = body.append('div').attr('class', 'routing-section connectivity-lane');
        section.append('h4').text(t('_lanes.connectivity.from', { lane: laneName(spot.ref), road: roadName(spot.wayID) }));
        const groups = linksByRoad(graph, spot);
        if (!groups.length) {
            section.append('p').attr('class', 'routing-hint').text(t('_lanes.connectivity.none'));
            return;
        }
        for (const { links } of groups) {
            const first = links[0];
            const group = section.append('div').attr('class', 'connectivity-group');
            const title = group.append('div').attr('class', 'connectivity-group-title');
            title.append('span').attr('class', `connectivity-swatch ${first.declared ? 'declared' : 'default'}`);
            title.append('span').attr('class', 'connectivity-road')
                .text(t(first.viaWays ? '_lanes.connectivity.into_via' : '_lanes.connectivity.into', { road: roadName(first.to.wayID) }));
            const relation = first.relationID ? graph.hasEntity(first.relationID) as osmRelation | undefined : undefined;
            // (a relation added in this edit, by clicking a lane, is said to be new and not saved, so it is not taken for
            // one already on the map)
            group.append('p').attr('class', 'routing-hint connectivity-source').text(!relation ? t('_lanes.connectivity.worked_out')
                : relation.isNew() ? t('_lanes.connectivity.declared_new', { value: relation.tags.connectivity ?? '' })
                    : t('_lanes.connectivity.declared_by', { id: relation.id.slice(1), value: relation.tags.connectivity ?? '' }));
            if (relation?.tags['connectivity:conditional']) {
                group.append('p').attr('class', 'routing-hint').text(t('_lanes.connectivity.conditional', { value: relation.tags['connectivity:conditional'] }));
            }

            const fromSpot = spotAt(graph, first.from, first.nodeID, true);
            const items = group.append('ul').attr('class', 'routing-list connectivity-list');
            for (const link of links) {
                const item = items.append('li').classed('optional', link.optional);
                item.append('span').attr('class', 'connectivity-pair')
                    .text(t('_lanes.connectivity.pair', { from: laneName(link.from.ref), to: laneName(link.to.ref) }));
                const toSpot = spotAt(graph, link.to, link.toNodeID, false);
                if (!picked || !fromSpot || !toSpot) continue;
                const change = (next: ConnectChange) => perform(actionConnectLanes(fromSpot, link.nodeID as NodeId, toSpot, next));
                item.append('button').attr('type', 'button').attr('class', 'connectivity-change')
                    .attr('aria-pressed', link.optional)
                    .classed('active', link.optional)
                    .attr('title', t('_lanes.connectivity.lane_change_tip'))
                    .text(t('_lanes.connectivity.lane_change'))
                    .on('click', () => change(link.optional ? 'default' : 'optional'));
                item.append('button').attr('type', 'button').attr('class', 'connectivity-remove')
                    .attr('title', t('_lanes.connectivity.remove'))
                    .call(svgIcon('#iD-operation-delete'))
                    .on('click', () => change('none'));
            }

            const buttons = group.append('div').attr('class', 'connectivity-actions');
            if (relation) {
                if (sameAsDefault(graph, relation)) {
                    group.insert('p', '.connectivity-actions').attr('class', 'routing-hint connectivity-note')
                        .text(t('_lanes.connectivity.same_as_default'));
                }
                buttons.append('button').attr('type', 'button').attr('class', 'button-secondary')
                    .text(t('_lanes.connectivity.select_relation'))
                    .on('click', () => context.enter(modeSelect(context, [relation.id])));
                buttons.append('button').attr('type', 'button').attr('class', 'button-secondary')
                    .text(t('_lanes.connectivity.reset'))
                    .attr('title', t('_lanes.connectivity.reset_tip'))
                    .on('click', () => perform(actionDeleteRelation(relation.id as RelationId, true)));
            } else if (picked && fromSpot && !first.viaWays) {
                const toSpot = spotAt(graph, first.to, first.toNodeID, false);
                if (toSpot) {
                    buttons.append('button').attr('type', 'button').attr('class', 'button-secondary')
                        .text(t('_lanes.connectivity.declare'))
                        .attr('title', t('_lanes.connectivity.declare_tip'))
                        .on('click', () => perform(actionDeclareConnectivity(fromSpot, first.nodeID, toSpot)));
                }
            }
        }
    }

    // the relations in view and their problems, worked out again only when the map data or the view changes (not as
    // the pointer moves from lane to lane)
    let _checked: { graph: iD.Graph; view: string; relations: osmRelation[]; problems: { relation: osmRelation; problems: string[] }[] } | null = null;

    /** The connectivity relations in view, and those with problems, each to select */
    function renderRelations(body: Div, graph: iD.Graph) {
        const view = context.map().extent().toParam();
        if (!_checked || _checked.graph !== graph || _checked.view !== view) {
            const inView = context.history().intersects(context.map().extent())
                .filter(entity => entity.type === 'relation' && entity.tags.type === 'connectivity') as osmRelation[];
            _checked = {
                graph, view, relations: inView,
                problems: inView.map(relation => ({ relation, problems: connectivityProblems(graph, relation) as string[] })).filter(x => x.problems.length)
            };
        }
        const { relations, problems } = _checked;
        const section = body.append('div').attr('class', 'routing-section');
        section.append('h4').text(t('_lanes.connectivity.in_view', { n: relations.length }));
        if (!problems.length) {
            section.append('p').attr('class', 'routing-hint').text(t(relations.length ? '_lanes.connectivity.all_fine' : '_lanes.connectivity.no_relations'));
            return;
        }
        const items = section.append('ul').attr('class', 'speed-missing-list connectivity-problems');
        for (const { relation, problems: codes } of problems.slice(0, 12)) {
            const button = items.append('li').append('button')
                .attr('class', 'speed-missing-road connectivity-problem')
                .on('click', () => context.enter(modeSelect(context, [relation.id])));
            const r = resolveConnectivity(graph, relation);
            button.append('span').text('problem' in r ? t('_lanes.connectivity.relation', { id: relation.id.slice(1) })
                : t('_lanes.connectivity.relation_roads', { from: roadName(r.from.id), to: roadName(r.to.id) }));
            button.append('span').attr('class', 'speed-key-count').text(codes.map(code => t(`_lanes.connectivity.problems.${code}`)).join('; '));
        }
        if (problems.length > 12) items.append('li').attr('class', 'routing-hint').text(t('_lanes.speed_tool.more', { n: problems.length - 12 }));
    }

    // the panel follows the lane in focus, the edits and the map as it moves (at most once a frame)
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
            state.on('change.connectivity-panel', later);
            context.history().on('change.connectivity-panel', later);
            context.map().on('move.connectivity-panel', later);
        },
        hide() {
            cancelAnimationFrame(_frame);
            state.on('change.connectivity-panel', null);
            context.history().on('change.connectivity-panel', null);
            context.map().on('move.connectivity-panel', null);
            (context.ui() as any).sidebar.hide();
            _body = null;
        }
    };
}
