import { t } from '../../core/localizer';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { uiSection } from '../../ui/section';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import { isLaneRoad } from '../core/roads';
import {
    parseLanes, laneRefsInWayOrder, laneCount, insertLane, removeLane, moveLane, setLaneValue, laneValue,
    turnValues, parseTurn, toggleTurn, parseChange, formatChange, laneDirections,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';

type Div = d3.Selection<HTMLDivElement>;

/** Lane types and the `*:lanes` keys that make them; general traffic clears all of them */
export const laneKindKeys: Record<string, string | null> = {
    general: null,
    bus: 'bus:lanes',
    psv: 'psv:lanes',
    taxi: 'taxi:lanes',
    hov: 'hov:lanes',
    bicycle: 'bicycle:lanes',
    pedestrian: 'foot:lanes'
};

/** Per-lane values edited as text in the inspector */
const textFields: { id: string; key: string }[] = [
    { id: 'maxspeed', key: 'maxspeed:lanes' },
    { id: 'minspeed', key: 'minspeed:lanes' },
    { id: 'destination', key: 'destination:lanes' },
    { id: 'destination_ref', key: 'destination:ref:lanes' },
    { id: 'access', key: 'access:lanes' },
    { id: 'width', key: 'width:lanes' },
    { id: 'maxwidth', key: 'maxwidth:lanes' },
    { id: 'maxheight', key: 'maxheight:lanes' },
    { id: 'surface', key: 'surface:lanes' }
];

const handledKeys = new Set([
    'turn:lanes', 'change:lanes', ...textFields.map(f => f.key),
    ...Object.values(laneKindKeys).filter((k): k is string => !!k)
]);

const directionGlyph: Record<LaneDirection, string> = { forward: '↑', backward: '↓', both_ways: '↕' };


/** The kind of lane, read back from the same keys the kind picker writes */
function kindOf(model: LaneModel, ref: LaneRef): string {
    for (const [kind, key] of Object.entries(laneKindKeys)) {
        if (key && laneValue(model, ref, key) === 'designated') return kind;
    }
    return 'general';
}


/** The "Lanes" section in iD's entity editor, shown for one selected road */
export function uiSectionLanes(context: iD.Context) {
    const state = laneState(context);
    let _entityIDs: string[] = [];

    const way = (): osmWay | undefined => {
        if (_entityIDs.length !== 1) return undefined;
        const entity = context.hasEntity(_entityIDs[0] as WayId);
        return isLaneRoad(entity) ? entity : undefined;
    };

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('lanes', context) as any)
        .label(() => t.append('_lanes.section.title'))
        .shouldDisplay(() => !!way())
        .disclosureContent(render);

    // keep the inspector in step with lanes picked on the map
    state.on('change.section', () => {
        if (way()) section.reRender();
    });


    function perform(wayID: WayId, change: (model: LaneModel) => LaneModel, annotation: string) {
        context.perform(actionChangeLanes(wayID, change), t(`_lanes.annotation.${annotation}`));
    }


    function render(selection: Div) {
        const road = way();
        selection.selectAll('*').remove();
        if (!road) return;

        const graph = context.graph();
        const model = parseLanes(road.tags, { driveSide: laneDriveSide(road, graph) });
        const wayID = road.id;
        const total = laneCount(model);

        // drop selected lanes that no longer exist
        const selected = (state.selected()?.wayID === wayID ? state.selected()!.refs : [])
            .filter(ref => model.lanes[ref.direction][ref.index]);

        const wrap = selection.append('div').attr('class', 'lanes-editor');

        /* summary */
        const summary = model.oneway
            ? t('_lanes.section.summary.oneway', { n: total })
            : t('_lanes.section.summary.twoway', { forward: model.lanes.forward.length, backward: model.lanes.backward.length }) +
              (model.lanes.both_ways.length ? ', ' + t('_lanes.section.summary.both_ways', { n: model.lanes.both_ways.length }) : '');
        wrap.append('p').attr('class', 'lanes-summary').text(summary);
        if (model.countSource === 'assumed') {
            wrap.append('p').attr('class', 'lanes-note assumed').text(t('_lanes.section.assumed'));
        }

        /* lane counts per direction */
        const groups: LaneDirection[] = model.oneway ? [model.oneway] : [...laneDirections];
        const counts = wrap.append('div').attr('class', 'lanes-counts');
        for (const direction of groups) {
            const n = model.lanes[direction].length;
            const row = counts.append('div').attr('class', `lanes-count-row lanes-count-${direction}`);
            row.append('span').attr('class', 'lanes-count-label')
                .text(model.oneway ? t('_lanes.section.counts.lanes') : t(`_lanes.section.counts.${direction}`));
            row.append('button').attr('class', 'lanes-count-remove')
                .attr('title', t('_lanes.section.counts.remove'))
                .attr('disabled', n === 0 || total <= 1 ? true : null)
                .text('−')
                .on('click', () => perform(wayID, m => removeLane(m, { direction, index: m.lanes[direction].length - 1 }), 'remove_lane'));
            row.append('span').attr('class', 'lanes-count-value').text(n);
            row.append('button').attr('class', 'lanes-count-add')
                .attr('title', t('_lanes.section.counts.add'))
                .text('+')
                .on('click', () => perform(wayID, m => insertLane(m, direction), 'add_lane'));
        }

        /* lane strip, left to right along the way */
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.section.strip_hint'));
        const strip = wrap.append('div').attr('class', 'lanes-strip');
        laneRefsInWayOrder(model).forEach((ref, i) => {
            const turns = parseTurn(laneValue(model, ref, 'turn:lanes'));
            const isSelected = selected.some(r => r.direction === ref.direction && r.index === ref.index);
            strip.append('button')
                .attr('class', `lanes-strip-lane lane-${kindOf(model, ref)} lane-${ref.direction}` + (isSelected ? ' selected' : ''))
                .attr('aria-pressed', isSelected)
                .attr('aria-label', `${i + 1}, ${t(`_lanes.direction.${ref.direction}`)}` +
                    (turns.length ? ', ' + turns.map(v => t(`_lanes.turn.${v}`, { default: v })).join(', ') : ''))
                .on('click', (event: MouseEvent) => {
                    if (event.shiftKey) state.toggle(wayID, ref);
                    else state.select(wayID, [ref]);
                })
                .call(button => {
                    button.append('span').attr('class', 'lane-glyph').text(directionGlyph[ref.direction]);
                    button.append('span').attr('class', 'lane-turns').text(turns.length ? turns.map(v => t(`_lanes.turn.${v}`, { default: v })).join(' + ') : ' ');
                });
        });

        /* issues with the lane tags */
        if (model.issues.length) {
            const issues = wrap.append('ul').attr('class', 'lanes-issues');
            for (const issue of model.issues) {
                issues.append('li').text(t(`_lanes.issue.${issue.code}`, {
                    key: issue.key ?? '', expected: issue.expected ?? '', actual: issue.actual ?? ''
                }));
            }
        }

        if (selected.length) renderInspector(wrap, model, wayID, selected);
    }


    function renderInspector(wrap: Div, model: LaneModel, wayID: WayId, refs: LaneRef[]) {
        const inspector = wrap.append('div').attr('class', 'lane-inspector');
        const order = laneRefsInWayOrder(model);
        const first = refs[0];

        inspector.append('h4').text(refs.length === 1
            ? t('_lanes.inspector.title', { n: order.findIndex(r => r.direction === first.direction && r.index === first.index) + 1, total: order.length }) +
              ' · ' + t(`_lanes.direction.${first.direction}`)
            : t('_lanes.inspector.title_multi', { n: refs.length }));

        // a value shared by all selected lanes, or undefined when they differ
        const shared = (key: string) => {
            const values = refs.map(ref => laneValue(model, ref, key));
            return values.every(v => v === values[0]) ? values[0] : undefined;
        };
        const readonly = (key: string) => !!model.keys[key]?.readonly;

        /* direction (two-way roads, one lane) */
        if (!model.oneway && refs.length === 1) {
            const row = inspector.append('div').attr('class', 'lane-row lane-direction');
            row.append('label').text(t('_lanes.inspector.direction'));
            const buttons = row.append('div').attr('class', 'lane-buttons');
            for (const direction of laneDirections) {
                buttons.append('button')
                    .attr('class', direction === first.direction ? 'active' : null)
                    .attr('aria-pressed', direction === first.direction)
                    .text(`${directionGlyph[direction]} ${t(`_lanes.direction.${direction}`)}`)
                    .on('click', () => {
                        if (direction === first.direction) return;
                        perform(wayID, m => moveLane(m, first, direction), 'move_lane');
                        const moved = parseLanes((context.entity(wayID) as osmWay).tags, { driveSide: model.driveSide });
                        state.select(wayID, [{ direction, index: moved.lanes[direction].length - 1 }]);
                    });
            }
        }

        /* turn arrows */
        const turnRow = inspector.append('div').attr('class', 'lane-row lane-turns');
        turnRow.append('label').text(t('_lanes.inspector.turn'));
        if (readonly('turn:lanes')) {
            turnRow.append('p').attr('class', 'lanes-note').text(t('_lanes.inspector.readonly', { key: 'turn:lanes' }));
        } else {
            const current = shared('turn:lanes');
            const active = current === undefined ? [] : parseTurn(current);
            const grid = turnRow.append('div').attr('class', 'lane-buttons turn-grid');
            for (const value of turnValues.filter(v => v !== 'none')) {
                grid.append('button')
                    .attr('class', `turn-${value}` + (active.includes(value) ? ' active' : ''))
                    .attr('aria-pressed', active.includes(value))
                    .text(t(`_lanes.turn.${value}`))
                    .on('click', () => perform(wayID, m => refs.reduce(
                        (acc, ref) => setLaneValue(acc, ref, 'turn:lanes', toggleTurn(laneValue(acc, ref, 'turn:lanes'), value)), m), 'turn'));
            }
        }

        /* lane change */
        if (!readonly('change:lanes')) {
            const current = shared('change:lanes');
            const change = (current !== undefined ? parseChange(current) : undefined) ?? { toLeft: true, toRight: true };
            const row = inspector.append('div').attr('class', 'lane-row lane-change');
            row.append('label').text(t('_lanes.inspector.change'));
            for (const side of ['toLeft', 'toRight'] as const) {
                const label = row.append('label').attr('class', 'lane-check');
                label.append('input').attr('type', 'checkbox')
                    .property('checked', change[side])
                    .property('indeterminate', current === undefined)
                    .on('change', function(this: HTMLInputElement) {
                        const checked = this.checked;
                        perform(wayID, m => refs.reduce((acc, ref) => {
                            const was = parseChange(laneValue(acc, ref, 'change:lanes')) ?? { toLeft: true, toRight: true };
                            return setLaneValue(acc, ref, 'change:lanes', formatChange({ ...was, [side]: checked }));
                        }, m), 'change');
                    });
                label.append('span').text(t(side === 'toLeft' ? '_lanes.inspector.change_left' : '_lanes.inspector.change_right'));
            }
        }

        /* lane type */
        const kinds = refs.map(ref => kindOf(model, ref));
        const kindRow = inspector.append('div').attr('class', 'lane-row lane-kind');
        kindRow.append('label').text(t('_lanes.inspector.kind'));
        const select = kindRow.append('select')
            .on('change', function(this: HTMLSelectElement) {
                const kind = this.value;
                perform(wayID, m => refs.reduce((acc, ref) => {
                    let next = acc;
                    for (const [k, key] of Object.entries(laneKindKeys)) {
                        if (!key || next.keys[key]?.readonly) continue;
                        const want = k === kind ? 'designated' : '';
                        if (laneValue(next, ref, key) !== want && (want || next.keys[key])) next = setLaneValue(next, ref, key, want);
                    }
                    return next;
                }, m), 'kind');
            });
        if (!kinds.every(k => k === kinds[0])) {
            select.append('option').attr('value', '').text(t('_lanes.inspector.mixed')).property('selected', true);
        }
        for (const kind of Object.keys(laneKindKeys)) {
            select.append('option').attr('value', kind).text(t(`_lanes.kind.${kind}`))
                .property('selected', kinds.every(k => k === kind));
        }

        /* per-lane text values */
        for (const field of textFields) {
            const row = inspector.append('div').attr('class', `lane-row lane-field lane-field-${field.id}`);
            row.append('label').attr('for', `lane-field-${field.id}`).text(t(`_lanes.field.${field.id}`));
            const value = shared(field.key);
            row.append('input')
                .attr('id', `lane-field-${field.id}`)
                .attr('type', 'text')
                .attr('placeholder', value === undefined ? t('_lanes.inspector.mixed') : null)
                .attr('title', readonly(field.key) ? t('_lanes.inspector.readonly', { key: field.key }) : null)
                .property('disabled', readonly(field.key))
                .property('value', value ?? '')
                .on('change', function(this: HTMLInputElement) {
                    const next = context.cleanTagValue(this.value.trim());
                    perform(wayID, m => setLaneValue(m, refs, field.key, next), 'value');
                });
        }

        /* other lane keys on the road, so nothing is hidden */
        const others = Object.values(model.keys).filter(key => !handledKeys.has(key.id));
        if (others.length) {
            inspector.append('h5').text(t('_lanes.inspector.other_keys'));
            for (const key of others) {
                const row = inspector.append('div').attr('class', 'lane-row lane-field');
                row.append('label').text(key.id);
                const value = shared(key.id);
                row.append('input').attr('type', 'text')
                    .property('disabled', key.readonly)
                    .attr('placeholder', value === undefined ? t('_lanes.inspector.mixed') : null)
                    .property('value', value ?? '')
                    .on('change', function(this: HTMLInputElement) {
                        const next = context.cleanTagValue(this.value.trim());
                        perform(wayID, m => setLaneValue(m, refs, key.id, next), 'value');
                    });
            }
        }

        /* remove */
        if (refs.length === 1 && laneCount(model) > 1) {
            inspector.append('button')
                .attr('class', 'lane-remove button-warning')
                .text(t('_lanes.inspector.remove'))
                .on('click', () => {
                    perform(wayID, m => removeLane(m, first), 'remove_lane');
                    state.clear();
                });
        }
    }


    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
