import { actionChangeTags } from '../../actions/change_tags';
import { localizer, t } from '../../core/localizer';
import { presetManager } from '../../presets';

/** Lane Studio's own field: whether a crossing has traffic signals (`crossing:signals`), which iD has no field for */
export const crossingSignalsField = 'lanes/crossing_signals';

/** Lane Studio's presets for hatching and chevrons painted on the road (wiki: Key:road_marking), which iD has none for */
export const paintedAreaPreset = 'lanes/road_marking/restriction';
export const chevronAreaPreset = 'lanes/road_marking/restriction/chevron';

interface MarkingPreset {
    /** its string key in `_lanes.fields` (`name` and `terms`) */
    strings: string;
    tags: Record<string, string>;
    /** tags added with it beyond `tags`: the wiki's example for the marking */
    addTags?: Record<string, string>;
    geometry: string[];
    icon: string;
}

// an area painted on the road: a closed way is an area by `area=yes` (iD reads `road_marking` as a line)
const area = { area: 'yes' };

/**
 * Every road marking the wiki documents (Key:road_marking), so Add Point, Add Line and Add Area find each one, tagged
 * as the wiki's examples tag it. iD has no road marking presets; their stroke, pattern, arrow, symbol, text and colour
 * are set in Lane Studio's Painted marking section.
 */
export const markingPresets: Record<string, MarkingPreset> = {
    'lanes/road_marking/lane_divider': { strings: 'lane_divider', tags: { road_marking: 'lane_divider' }, geometry: ['line'], icon: 'iD-other-line' },
    'lanes/road_marking/edge_line': { strings: 'edge_line', tags: { road_marking: 'edge_line' }, geometry: ['line'], icon: 'iD-other-line' },
    'lanes/road_marking/stop_line': { strings: 'stop_line', tags: { road_marking: 'stop_line' }, geometry: ['line', 'vertex'], icon: 'temaki-stop' },
    'lanes/road_marking/stop_line/sharks_teeth': {
        strings: 'sharks_teeth', tags: { road_marking: 'stop_line', stroke: 'sharks_teeth' }, geometry: ['line'], icon: 'temaki-yield'
    },
    'lanes/road_marking/crossing_edge': {
        strings: 'crossing_edge', tags: { road_marking: 'crossing_edge' }, geometry: ['line'], icon: 'temaki-crossing_markings-ladder'
    },
    'lanes/road_marking/arrow': { strings: 'arrow', tags: { road_marking: 'arrow' }, geometry: ['line'], icon: 'temaki-chicane_arrow' },
    [paintedAreaPreset]: {
        strings: 'painted_area', tags: { road_marking: 'restriction' },
        addTags: { ...area, road_marking: 'restriction', pattern: 'stripes', stroke: 'solid', colour: 'white' }, geometry: ['area'], icon: 'maki-triangle-stroked'
    },
    [chevronAreaPreset]: {
        strings: 'chevron_area', tags: { road_marking: 'restriction', pattern: 'chevron' },
        addTags: { ...area, road_marking: 'restriction', pattern: 'chevron', stroke: 'solid', colour: 'white' }, geometry: ['area'], icon: 'maki-triangle'
    },
    'lanes/road_marking/restriction/junction': {
        strings: 'box_junction', tags: { road_marking: 'restriction', reason: 'junction' },
        addTags: { ...area, road_marking: 'restriction', pattern: 'crosshatch', reason: 'junction', colour: 'yellow' }, geometry: ['area'], icon: 'temaki-junction'
    },
    'lanes/road_marking/restriction/bus_stop': {
        strings: 'bus_stop_marking', tags: { road_marking: 'restriction', reason: 'bus_stop' },
        addTags: { ...area, road_marking: 'restriction', pattern: 'zigzag', reason: 'bus_stop' }, geometry: ['area'], icon: 'roentgen-bus_stop_sign'
    },
    'lanes/road_marking/restriction/x': {
        strings: 'crossed_area', tags: { road_marking: 'restriction', pattern: 'x' },
        addTags: { ...area, road_marking: 'restriction', pattern: 'x' }, geometry: ['area'], icon: 'maki-roadblock'
    },
    'lanes/road_marking/crossing': {
        strings: 'crossing_marking', tags: { road_marking: 'crossing' }, addTags: { ...area, road_marking: 'crossing' }, geometry: ['area'],
        icon: 'temaki-pedestrian_crosswalk'
    },
    'lanes/road_marking/text': { strings: 'painted_text', tags: { road_marking: 'text' }, geometry: ['point', 'vertex'], icon: 'fas-sign-hanging' },
    'lanes/road_marking/symbol': { strings: 'painted_symbol', tags: { road_marking: 'symbol' }, geometry: ['point', 'vertex'], icon: 'maki-bicycle' },
    'lanes/road_marking/traffic_sign': {
        strings: 'painted_sign', tags: { road_marking: 'traffic_sign' }, geometry: ['point', 'vertex'], icon: 'fas-triangle-exclamation'
    }
};

/**
 * Adds the road marking presets (`markingPresets`), named in iD's tagging strings so Add Point, Add Line and Add Area's
 * search finds them like iD's own
 */
function addPaintedAreaPreset() {
    presetManager.merge({
        presets: Object.fromEntries(Object.entries(markingPresets).map(([id, p]) => [id, {
            tags: p.tags, addTags: p.addTags ?? p.tags, geometry: p.geometry, icon: p.icon, fields: []
        }]))
    } as any);
    localizer.mergeStrings('tagging', 'en', {
        presets: {
            presets: Object.fromEntries(Object.entries(markingPresets).map(([id, p]) => [id, {
                name: t(`_lanes.fields.${p.strings}.name`), terms: t(`_lanes.fields.${p.strings}.terms`)
            }]))
        }
    });
}

/**
 * Adds the fields Lane Studio's drawing reads to iD's presets, so everything about a road feature is set in its
 * fields (the Road markings section that did this is gone):
 * - every crossing: Traffic signals (`crossing:signals`)
 * - every kind of traffic calming: its Type, as a dropdown, and Direction Affected (`direction=*`)
 * - a passing place or emergency bay: Direction Affected, the side it is on (forward, backward or both)
 */
export function laneStudioPresetFields() {
    Promise.all([presetManager.ensureLoaded(), localizer.ensureLoaded()]).then(() => {
        addPaintedAreaPreset();
        presetManager.merge({ fields: { [crossingSignalsField]: { key: 'crossing:signals', type: 'check', label: 'Traffic signals' } } });
        const signals = presetManager.field(crossingSignalsField);
        if (signals) {
            signals.label = () => t.append('_lanes.fields.crossing_signals');
            signals.title = () => t('_lanes.fields.crossing_signals');
        }
        const add = (fields: string[], id: string, after?: string) => {
            if (fields.includes(id)) return;
            const at = after ? fields.indexOf(after) : -1;
            if (at >= 0) fields.splice(at + 1, 0, id);
            else fields.push(id);
        };
        for (const preset of presetManager.collection as any[]) {
            const tags = preset.tags ?? {};
            const fields: string[] | undefined = preset.originalFields;
            if (!fields || preset.suggestion) continue;
            const crossing = tags.highway === 'crossing' || tags.footway === 'crossing' || tags.cycleway === 'crossing' || tags.path === 'crossing';
            if (crossing && tags.crossing !== 'informal') add(fields, crossingSignalsField, fields.find(f => f.startsWith('crossing/markings')) ?? 'crossing');
            if (tags.traffic_calming) {
                if (!fields.includes('traffic_calming')) fields.unshift('traffic_calming');
                add(fields, 'direction_vertex');
            }
            if (tags.highway === 'passing_place' || tags.highway === 'emergency_bay') add(fields, 'direction_vertex');
        }
    }).catch(() => { /* without presets there are no fields to add to */ });
}

/**
 * Keeps a crossing's type with its signals: ticking Traffic signals (`crossing:signals=yes`) makes it a crossing with
 * traffic signals (`crossing=traffic_signals`, so iD shows that preset), and unticking it makes a signalled crossing an
 * uncontrolled one again (unmarked, with `crossing:markings=no`), in the same undo step as the tick
 */
export function laneStudioCrossingSignals(context: iD.Context) {
    let busy = false;
    context.history().on('change.lanes-crossing-signals', (difference?: any) => {
        if (busy || !difference) return;
        const edits: [iD.OsmEntity['id'], Tags][] = [];
        for (const entity of difference.modified() as iD.OsmEntity[]) {
            const tags = entity.tags;
            const crossing = tags.highway === 'crossing' || tags.footway === 'crossing' || tags.cycleway === 'crossing' || tags.path === 'crossing';
            if (!crossing) continue;
            if (tags['crossing:signals'] === 'yes' && tags.crossing !== 'traffic_signals') {
                edits.push([entity.id, { ...tags, crossing: 'traffic_signals' }]);
            } else if (tags['crossing:signals'] === 'no' && tags.crossing === 'traffic_signals') {
                edits.push([entity.id, { ...tags, crossing: tags['crossing:markings'] === 'no' ? 'unmarked' : 'uncontrolled' }]);
            }
        }
        if (!edits.length) return;
        busy = true;
        try {
            const annotation = context.history().undoAnnotation() ?? '';
            context.replace((graph: any) => edits.reduce((g, [id, tags]) => actionChangeTags(id, tags)(g), graph), annotation);
        } finally {
            busy = false;
        }
    });
}
