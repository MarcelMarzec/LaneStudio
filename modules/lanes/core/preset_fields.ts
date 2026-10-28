import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { presetManager } from '../../presets';

/** Lane Studio's own field: whether a crossing has traffic signals (`crossing:signals`), which iD has no field for */
export const crossingSignalsField = 'lanes/crossing_signals';

/**
 * Adds the fields Lane Studio's drawing reads to iD's presets, so everything about a road feature is set in its
 * fields (the Road markings section that did this is gone):
 * - every crossing: Traffic signals (`crossing:signals`)
 * - every kind of traffic calming: its Type, as a dropdown, and Direction Affected (`direction=*`)
 * - a passing place: Direction Affected, the side it is on (forward, backward or both)
 */
export function laneStudioPresetFields() {
    presetManager.ensureLoaded().then(() => {
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
            if (tags.highway === 'passing_place') add(fields, 'direction_vertex');
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
