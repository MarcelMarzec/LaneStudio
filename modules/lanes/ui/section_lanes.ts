import { t } from '../../core/localizer';
import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { actionChangeTags } from '../../actions/change_tags';
import { uiSection } from '../../ui/section';
import { utilHighlightEntities } from '../../util';
import {
    parallelWays, isSidewalkWay, isKerbWay, sidewalkValue, withSidewalk, cyclewayValue, withCycleway
} from '../core/roadside';
import { markingTypes, type MarkingType } from '../model/markings';
import { actionChangeLanes } from '../actions/change_lanes';
import { laneDriveSide } from '../core/drive_side';
import { laneState } from '../core/lane_state';
import { laneTools } from '../core/lane_tools';
import { isLaneRoad } from '../core/roads';
import {
    parseLanes, laneRefsInWayOrder, laneCount, insertLane, removeLane, moveLane, setLaneValue, laneValue,
    turnValues, parseTurn, toggleTurn, parseChange, formatChange, laneDirections,
    laneKindKeys, laneKindOf, setLaneKind,
    type LaneDirection, type LaneModel, type LaneRef
} from '../model';

type Div = d3.Selection<HTMLDivElement>;

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

/** What the Paint tool can write */
const paintKeys = [
    { key: 'kind', label: 'inspector.kind' },
    { key: 'turn:lanes', label: 'inspector.turn' },
    { key: 'change:lanes', label: 'inspector.change' },
    { key: 'maxspeed:lanes', label: 'field.maxspeed' },
    { key: 'access:lanes', label: 'field.access' },
    { key: 'surface:lanes', label: 'field.surface' },
    { key: 'width:lanes', label: 'field.width' }
];

const paintChoices: Record<string, { value: string; label: string }[]> = {
    'kind': Object.keys(laneKindKeys).map(kind => ({ value: kind, label: `_lanes.kind.${kind}` })),
    'turn:lanes': turnValues.map(value => ({ value, label: `_lanes.turn.${value}` })),
    'change:lanes': ['yes', 'no', 'not_left', 'not_right'].map(value => ({ value, label: `_lanes.change.${value}` }))
};

const directionGlyph: Record<LaneDirection, string> = { forward: '↑', backward: '↓', both_ways: '↕' };


/** The "Lanes" section in iD's entity editor, shown for one selected road */
export function uiSectionLanes(context: iD.Context) {
    const state = laneState(context);
    const tools = laneTools(context);
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
    tools.on('change.section', () => {
        if (way()) section.reRender();
    });
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

        renderTools(wrap);

        /* lane strip, left to right along the way */
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.section.strip_hint'));
        const strip = wrap.append('div').attr('class', 'lanes-strip');
        laneRefsInWayOrder(model).forEach((ref, i) => {
            const turns = parseTurn(laneValue(model, ref, 'turn:lanes'));
            const isSelected = selected.some(r => r.direction === ref.direction && r.index === ref.index);
            strip.append('button')
                .attr('class', `lanes-strip-lane lane-${laneKindOf(model, ref)} lane-${ref.direction}` + (isSelected ? ' selected' : ''))
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
        renderRoadside(wrap, road);
    }


    /** Pavements and cycleways per side, with what separately mapped ways and kerbs suggest */
    function renderRoadside(wrap: Div, road: osmWay) {
        const graph = context.graph();
        const tags = road.tags;
        const box = wrap.append('div').attr('class', 'lanes-roadside');
        box.append('h4').text(t('_lanes.roadside.title'));
        box.append('p').attr('class', 'lanes-note').text(t('_lanes.roadside.hint'));

        const extent = road.extent(graph).padByMeters(25);
        const nearby = context.history().intersects(extent);
        const sidewalks = parallelWays(road, graph, nearby, isSidewalkWay);
        const kerbs = parallelWays(road, graph, nearby, isKerbWay, 1, 15);

        const retag = (next: Tags) => context.perform(actionChangeTags(road.id, next), t('_lanes.annotation.roadside'));

        for (const side of ['left', 'right'] as const) {
            const row = box.append('div').attr('class', 'lane-row lanes-roadside-side');
            row.append('label').text(t(`_lanes.roadside.${side}`));
            const grid = row.append('div').attr('class', 'lanes-roadside-grid');

            const pick = (label: string, values: string[], current: string | undefined, write: (v: string | undefined) => Tags) => {
                grid.append('span').text(t(`_lanes.roadside.${label}`));
                const select = grid.append('select')
                    .on('change', function(this: HTMLSelectElement) { retag(write(this.value || undefined)); });
                select.append('option').attr('value', '').text(t('_lanes.roadside.unknown')).property('selected', !current);
                for (const value of values) {
                    select.append('option').attr('value', value)
                        .text(t(`_lanes.roadside.values.${value}`, { default: value }))
                        .property('selected', value === current);
                }
                if (current && !values.includes(current)) {
                    select.append('option').attr('value', current).text(current).property('selected', true);
                }
            };
            pick('sidewalk', ['yes', 'no', 'separate'], sidewalkValue(tags, side), v => withSidewalk(tags, side, v));
            pick('cycleway', ['no', 'lane', 'track', 'shared_lane', 'separate'], cyclewayValue(tags, side), v => withCycleway(tags, side, v));

            // separately mapped pavement on this side?
            const found = sidewalks[side][0];
            const current = sidewalkValue(tags, side);
            if (found && current !== 'separate') {
                const sideName = t(`_lanes.roadside.${side}`).toLowerCase();
                const note = box.append('p').attr('class', 'lanes-note lanes-suggestion');
                note.text(current === 'yes'
                    ? t('_lanes.roadside.double_mapped', { side: sideName })
                    : t('_lanes.roadside.separate_found', { side: sideName }));
                note.append('button').text(t('_lanes.roadside.use_separate'))
                    .on('click', () => retag(withSidewalk(tags, side, 'separate')))
                    .on('mouseenter', () => utilHighlightEntities([found.way.id], true, context))
                    .on('mouseleave', () => utilHighlightEntities([found.way.id], false, context));
            }
        }

        // kerb to kerb width from mapped kerbs on both sides
        const left = kerbs.left[0];
        const right = kerbs.right[0];
        if (left && right) {
            const width = Math.round((right.offset - left.offset) * 10) / 10;
            const tagged = parseFloat(tags.width ?? '');
            const note = box.append('p').attr('class', 'lanes-note lanes-suggestion')
                .text(t('_lanes.roadside.kerb_width', { width: String(width) }) + ' ');
            if (Math.abs(tagged - width) >= 0.3 || Number.isNaN(tagged)) {
                note.append('button').text(t('_lanes.roadside.set_width', { width: String(width) }))
                    .on('click', () => retag({ ...tags, width: String(width) }));
            }
        }

        // traffic islands on the road
        const islands = nearby.filter(e => e.type === 'way' &&
            (e.tags['area:highway'] === 'traffic_island' || e.tags.traffic_calming === 'island') &&
            road.extent(graph).intersects(e.extent(graph)));
        if (islands.length) {
            box.append('p').attr('class', 'lanes-note').text(t('_lanes.roadside.islands', { n: islands.length }));
        }
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
        const kinds = refs.map(ref => laneKindOf(model, ref));
        const kindRow = inspector.append('div').attr('class', 'lane-row lane-kind');
        kindRow.append('label').text(t('_lanes.inspector.kind'));
        const select = kindRow.append('select')
            .on('change', function(this: HTMLSelectElement) {
                const kind = this.value;
                perform(wayID, m => setLaneKind(m, refs, kind), 'kind');
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

        /* reorder within the direction (left and right as seen by its drivers) */
        if (refs.length === 1 && model.lanes[first.direction].length > 1) {
            const row = inspector.append('div').attr('class', 'lane-row lane-order');
            row.append('label').text(t('_lanes.inspector.order'));
            const buttons = row.append('div').attr('class', 'lane-buttons');
            const count = model.lanes[first.direction].length;
            for (const [by, label] of [[-1, 'move_left'], [1, 'move_right']] as const) {
                const to = first.index + by;
                buttons.append('button')
                    .attr('disabled', to < 0 || to >= count ? true : null)
                    .text(t(`_lanes.inspector.${label}`))
                    .on('click', () => {
                        perform(wayID, m => moveLane(m, first, first.direction, to), 'move_lane');
                        state.select(wayID, [{ direction: first.direction, index: to }]);
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


    /** Select, Paint and Width tool buttons, and the paint palette */
    function renderTools(wrap: Div) {
        const tool = tools.tool();
        const bar = wrap.append('div').attr('class', 'lane-buttons lanes-tools');
        for (const id of ['select', 'paint', 'width', 'marking'] as const) {
            bar.append('button')
                .attr('class', `lanes-tool-${id}` + (tool === id ? ' active' : ''))
                .attr('aria-pressed', tool === id)
                .attr('title', t(`_lanes.tools.${id}_tip`))
                .text(t(`_lanes.tools.${id}`))
                .on('click', () => tools.setTool(id));
        }
        if (tool === 'width') {
            wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.tools.width_hint'));
        }
        if (tool === 'marking') {
            const select = wrap.append('select').attr('class', 'lanes-marking-type')
                .on('change', function(this: HTMLSelectElement) { tools.setMarking(this.value as MarkingType); });
            for (const type of markingTypes.filter(v => v !== 'none')) {
                select.append('option').attr('value', type).text(t(`_lanes.markings.types.${type}`))
                    .property('selected', type === tools.marking());
            }
            wrap.append('p').attr('class', 'lanes-note')
                .text(t('_lanes.markings.placing', { type: t(`_lanes.markings.types.${tools.marking()}`) }));
        }
        if (tool !== 'paint') return;

        const paint = tools.paint();
        const palette = wrap.append('div').attr('class', 'lanes-palette');
        const keySelect = palette.append('select').attr('class', 'lanes-palette-key')
            .on('change', function(this: HTMLSelectElement) {
                const key = this.value;
                const value = key === 'kind' ? 'bus' : key === 'turn:lanes' ? 'left' : key === 'change:lanes' ? 'no' : '';
                tools.setPaint({ key, value });
            });
        for (const key of paintKeys) {
            keySelect.append('option').attr('value', key.key).text(t(`_lanes.${key.label}`))
                .property('selected', key.key === paint.key);
        }

        const choices = paintChoices[paint.key];
        if (choices) {
            const valueSelect = palette.append('select').attr('class', 'lanes-palette-value')
                .on('change', function(this: HTMLSelectElement) { tools.setPaint({ key: paint.key, value: this.value }); });
            for (const choice of choices) {
                valueSelect.append('option').attr('value', choice.value).text(t(choice.label))
                    .property('selected', choice.value === paint.value);
            }
        } else {
            palette.append('input').attr('type', 'text').attr('class', 'lanes-palette-value')
                .property('value', paint.value)
                .on('change', function(this: HTMLInputElement) {
                    tools.setPaint({ key: paint.key, value: context.cleanTagValue(this.value.trim()) });
                });
        }
        wrap.append('p').attr('class', 'lanes-note').text(t('_lanes.tools.paint_hint'));
    }


    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
