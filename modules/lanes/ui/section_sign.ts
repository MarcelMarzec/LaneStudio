import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { NodeId } from '../../osm';
import type { osmNode } from '../../osm/node';
import { uiSection } from '../../ui/section';
import { laneTools } from '../core/lane_tools';
import { speedNumber } from '../geometry/signs';
import { signCode, signNameKey, signsWithValue, turnedRound, ukSignCodes, withSignCode } from '../model/signs';
import { drawFace } from '../svg/signs';
import type { InfoTopic } from './field_info';
import { fieldNote, fieldShell, laneField, tagChrome } from './lane_fields';

type Div = d3.Selection<HTMLDivElement>;

/** Whether a node is a traffic sign, message sign or enforcement camera */
export function signKind(node: osmNode, graph: iD.Graph): 'sign' | 'message' | 'camera' | null {
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

        const annotation = t('_lanes.annotation.sign');
        if (kind === 'sign' || kind === 'message') {
            const { code, value } = signCode(tags);
            const current = kind === 'message' ? 'message' : code;
            const { wrap: body } = fieldShell(wrap, {
                ...tagChrome(context, n.id, ['traffic_sign'], annotation, 'sign'),
                id: 'sign-type', label: t('_lanes.signs.type'), wrapClass: 'lane-field-body'
            });
            const grid = body.append('div').attr('class', 'lane-buttons sign-grid');
            for (const choice of [...ukSignCodes, 'message'] as string[]) {
                const name = t(`_lanes.signs.names.${signNameKey(choice)}`);
                const button = grid.append('button')
                    .attr('type', 'button')
                    .attr('class', choice === current ? 'active' : null)
                    .attr('aria-pressed', choice === current)
                    .attr('aria-label', name)
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
                fieldNote(body, t('_lanes.signs.other', { code: tags.traffic_sign }));
            }

            // any sign code, as it is tagged (the pictures are UK signs)
            laneField(context, wrap, {
                ...tagChrome(context, n.id, ['traffic_sign'], annotation, 'sign'),
                id: 'sign-code', label: t('_lanes.signs.code'), value: tags.traffic_sign ?? '',
                suggestions: [...ukSignCodes, 'variable_message'].map(v => ({ value: v })),
                onChange: v => change(n, { ...tags, traffic_sign: v || undefined } as Tags)
            });

            // the number on the sign: a speed limit is the node's maxspeed, others go in brackets
            if (code === 'GB:670') {
                valueField(wrap, 'sign-limit', t('_lanes.signs.limit'), speedNumber(tags.maxspeed) ?? value, 'sign_value', v => {
                    const next = withSignCode(tags, code);
                    if (v) next.maxspeed = `${v} mph`;
                    else delete next.maxspeed;
                    change(n, next);
                });
            } else if (signsWithValue.has(code)) {
                valueField(wrap, 'sign-value', t('_lanes.signs.value'), value, 'sign_value', v => change(n, withSignCode(tags, code, v)));
            }
        }

        if (kind === 'camera') {
            valueField(wrap, 'camera-limit', t('_lanes.signs.camera_limit'), speedNumber(tags.maxspeed) ?? '', 'camera', v => {
                const next = { ...tags };
                if (v) next.maxspeed = `${v} mph`;
                else delete next.maxspeed;
                change(n, next);
            });
        }

        // the way it faces: a compass bearing, or turned round
        const facingKey = tags['traffic_sign:direction'] !== undefined && tags.direction === undefined ? 'traffic_sign:direction'
            : tags['camera:direction'] !== undefined && tags.direction === undefined ? 'camera:direction' : 'direction';
        const facing = tags[facingKey];
        const { wrap: facingWrap } = fieldShell(wrap, {
            ...tagChrome(context, n.id, [facingKey], annotation, 'sign_direction'),
            id: 'sign-facing', label: t('_lanes.signs.facing_label'), labelFor: 'lane-field-sign-facing', wrapClass: 'form-field-input-text lane-sign-facing'
        });
        facingWrap.append('input').attr('type', 'text').attr('id', 'lane-field-sign-facing').attr('class', 'sign-value')
            .attr('placeholder', t('_lanes.signs.facing_placeholder'))
            .property('value', facing ?? '')
            .on('change', function(this: HTMLInputElement) {
                const v = context.cleanTagValue(this.value.trim());
                if (v === (facing ?? '')) return;
                const next = { ...tags };
                if (v) next[facingKey] = v;
                else delete next[facingKey];
                change(n, next);
            });
        facingWrap.append('button').attr('type', 'button').attr('class', 'form-field-button sign-turn')
            .attr('disabled', facing ? null : true)
            .attr('title', t('_lanes.signs.turn'))
            .text(t('_lanes.signs.turn'))
            .on('click', () => change(n, turnedRound(tags)));
        fieldNote(wrap, t('_lanes.signs.facing_hint'));
    }

    function valueField(wrap: Div, id: string, label: string, value: string, info: InfoTopic, set: (v: string) => void) {
        laneField(context, wrap, {
            info, id, label, value, suggestions: [], present: !!value, onRemove: () => set(''),
            onChange: v => set(v)
        });
    }

    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
