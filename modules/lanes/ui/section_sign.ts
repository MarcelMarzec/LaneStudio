import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { NodeId } from '../../osm';
import type { osmNode } from '../../osm/node';
import { uiSection } from '../../ui/section';
import { laneTools } from '../core/lane_tools';
import { speedNumber } from '../geometry/signs';
import { signCode, signNameKey, signsWithValue, turnedRound, ukSignCodes, withSignCode } from '../model/signs';
import { drawFace } from '../svg/signs';

type Div = d3.Selection<HTMLDivElement>;

/** Whether a node is a traffic sign, message sign or enforcement camera */
function signKind(node: osmNode, graph: iD.Graph): 'sign' | 'message' | 'camera' | null {
    const tags = node.tags;
    if (tags.highway === 'speed_camera') return 'camera';
    const device = graph.parentRelations(node).some(r =>
        r.tags.type === 'enforcement' && r.members.some(m => m.id === node.id && m.role === 'device'));
    if (device && !tags.traffic_sign) return 'camera';
    if (tags.traffic_sign === 'variable_message') return 'message';
    return tags.traffic_sign ? 'sign' : null;
}

/**
 * "Traffic sign" in the sidebar for a sign, message sign or camera: which sign it is (picked from
 * drawings), the number on it, the speed a camera enforces, and turning it to face the other way.
 */
export function uiSectionSign(context: iD.Context) {
    const tools = laneTools(context);
    let _entityIDs: string[] = [];

    const node = (): osmNode | undefined => {
        if (_entityIDs.length !== 1) return undefined;
        const entity = context.hasEntity(_entityIDs[0] as NodeId);
        if (!entity || entity.type !== 'node') return undefined;
        return signKind(entity as osmNode, context.graph()) ? entity as osmNode : undefined;
    };

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('lanes-sign', context) as any)
        .label(() => {
            const n = node();
            return t.append(n && signKind(n, context.graph()) === 'camera' ? '_lanes.signs.camera_title' : '_lanes.signs.title');
        })
        .shouldDisplay(() => !!node())
        .disclosureContent(render);

    tools.on('change.sign', () => {
        if (node()) section.reRender();
    });

    function change(n: osmNode, tags: Tags) {
        context.perform(actionChangeTags(n.id, tags), t('_lanes.annotation.sign'));
    }

    function render(selection: Div) {
        selection.selectAll('*').remove();
        const n = node();
        if (!n) return;
        const tags = n.tags;
        const kind = signKind(n, context.graph());
        const wrap = selection.append('div').attr('class', 'lanes-editor sign-editor');

        if (kind === 'sign' || kind === 'message') {
            const { code, value } = signCode(tags);
            const current = kind === 'message' ? 'message' : code;
            const row = wrap.append('div').attr('class', 'lane-row');
            row.append('label').text(t('_lanes.signs.type'));
            const grid = row.append('div').attr('class', 'lane-buttons sign-grid');
            for (const choice of [...ukSignCodes, 'message'] as string[]) {
                const name = t(`_lanes.signs.names.${signNameKey(choice)}`);
                const button = grid.append('button')
                    .attr('class', choice === current ? 'active' : null)
                    .attr('aria-pressed', choice === current)
                    .attr('title', choice === 'message' ? name : `${name} (${choice})`)
                    .on('click', () => {
                        if (choice === current) return;
                        if (choice === 'message') change(n, { ...tags, traffic_sign: 'variable_message' });
                        else change(n, withSignCode(kind === 'message' ? { ...tags, traffic_sign: '' } : tags, choice));
                    });
                const svg = button.append('svg').attr('width', 28).attr('height', 28).attr('viewBox', '-14 -14 28 28');
                const g = svg.append('g') as unknown as d3.Selection<SVGGElement>;
                if (choice === 'message') {
                    g.append('rect').attr('x', -13).attr('y', -7).attr('width', 26).attr('height', 14).attr('rx', 1)
                        .attr('fill', '#141414').attr('stroke', '#777');
                    g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 6)
                        .attr('fill', '#f2c400').text('VMS');
                } else {
                    drawFace(g, 11, { code: choice });
                }
            }
            if (kind === 'sign' && !(ukSignCodes as readonly string[]).includes(code)) {
                wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.signs.other', { code: tags.traffic_sign }));
            }

            // the number on the sign: a speed limit is the node's maxspeed, others go in brackets
            if (code === 'GB:670') {
                valueField(wrap, t('_lanes.signs.limit'), speedNumber(tags.maxspeed) ?? value, v => {
                    const next = withSignCode(tags, code);
                    if (v) next.maxspeed = `${v} mph`;
                    else delete next.maxspeed;
                    change(n, next);
                });
            } else if (signsWithValue.has(code)) {
                valueField(wrap, t('_lanes.signs.value'), value, v => change(n, withSignCode(tags, code, v)));
            }
        }

        if (kind === 'camera') {
            valueField(wrap, t('_lanes.signs.camera_limit'), speedNumber(tags.maxspeed) ?? '', v => {
                const next = { ...tags };
                if (v) next.maxspeed = `${v} mph`;
                else delete next.maxspeed;
                change(n, next);
            });
        }

        const facing = tags.direction ?? tags['traffic_sign:direction'] ?? tags['camera:direction'];
        const row = wrap.append('div').attr('class', 'lane-row');
        row.append('label').text(t('_lanes.signs.facing', { direction: facing ?? t('_lanes.signs.unknown') }));
        row.append('button').attr('class', 'sign-turn')
            .attr('disabled', facing ? null : true)
            .text(t('_lanes.signs.turn'))
            .on('click', () => change(n, turnedRound(tags)));
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.signs.facing_hint'));
    }

    function valueField(wrap: Div, label: string, value: string, set: (v: string) => void) {
        const row = wrap.append('div').attr('class', 'lane-field');
        row.append('label').text(label);
        row.append('input').attr('type', 'text').attr('class', 'sign-value')
            .property('value', value)
            .on('change', function(this: HTMLInputElement) {
                const v = context.cleanTagValue(this.value.trim());
                if (v !== value) set(v);
            });
    }

    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
