import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { uiSection } from '../../ui/section';
import { isLaneRoad } from '../core/roads';
import type { LaneModel } from '../model';

/*
 * What Lane Studio's sidebar sections for a selected road share: finding the road, a section laid out and folding
 * away as iD's own sections do, and the fields shown on demand (picked from "Add field" or the + menu, until the
 * road is left) so a section shows what is tagged and what is usually needed, not every field it could.
 */

type Div = d3.Selection<HTMLDivElement>;

/** The one road selected, when Lane Studio edits its lanes */
export function selectedLaneRoad(context: iD.Context, entityIDs: string[]): osmWay | undefined {
    if (entityIDs.length !== 1) return undefined;
    const entity = context.hasEntity(entityIDs[0] as WayId);
    return isLaneRoad(entity) ? entity : undefined;
}

const _shown = new Map<string, Set<string>>();
const _changes = d3_dispatch('change');

/** Whether a field was picked to show on a road (from "Add field" or the + menu) */
export function isShownOnDemand(wayID: string, field: string): boolean {
    return !!_shown.get(wayID)?.has(field);
}

/** Shows a field on a road until another road is picked, and redraws Lane Studio's sections */
export function showOnDemand(wayID: string, field: string) {
    for (const id of [..._shown.keys()]) if (id !== wayID) _shown.delete(id);
    const set = _shown.get(wayID) ?? new Set<string>();
    set.add(field);
    _shown.set(wayID, set);
    _changes.call('change');
}

/** Called when a field is shown on demand, so every section can redraw */
export function onShownChange(name: string, listener: () => void) {
    _changes.on(`change.${name}`, listener);
}

export interface RoadSectionOptions {
    id: string;
    label: () => string;
    /** whether the section shows for this road (it is a lane road already) */
    shows?: (road: osmWay) => boolean;
    render: (selection: Div, road: osmWay) => void;
    /** work to do whenever the section is drawn, folded away or not (the look-ahead corridor on the map) */
    always?: (road: osmWay | undefined) => void;
    expandedByDefault?: boolean;
}

/** A sidebar section for the selected road, as iD's: a title that folds it away, remembered across selections */
export function roadSection(context: iD.Context, options: RoadSectionOptions) {
    let _entityIDs: string[] = [];
    const road = () => {
        const way = selectedLaneRoad(context, _entityIDs);
        return way && (!options.shows || options.shows(way)) ? way : undefined;
    };
    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection(options.id, context) as any)
        .label(options.label)
        .shouldDisplay(() => {
            options.always?.(road());
            return !!road();
        })
        .expandedByDefault(options.expandedByDefault ?? true)
        .disclosureContent((selection: Div) => {
            selection.selectAll('*').remove();
            const way = road();
            if (way) options.render(selection, way);
        });

    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };
    section.road = road;
    onShownChange(options.id, () => {
        if (selectedLaneRoad(context, _entityIDs)) section.reRender();
    });
    return section;
}

/** The side of the way a lane direction's traffic keeps to: forward lanes keep to the way's left where traffic drives on the left */
export function sideOfDirection(model: LaneModel, direction: 'forward' | 'backward'): 'left' | 'right' {
    const forwardSide = model.driveSide === 'left' ? 'left' : 'right';
    return direction === 'forward' ? forwardSide : (forwardSide === 'left' ? 'right' : 'left');
}

/**
 * Where a lane goes when one is added at a side of the way, beside the kerb: its direction (on a one-way road, the
 * road's), and its index, 0 being the driver's leftmost (the driver's left is the way's left going forward)
 */
export function kerbLaneAt(model: LaneModel, side: 'left' | 'right'): { direction: 'forward' | 'backward'; index: number } {
    const direction: 'forward' | 'backward' = model.oneway === 'backward' ? 'backward' : model.oneway === 'forward' ? 'forward'
        : sideOfDirection(model, 'forward') === side ? 'forward' : 'backward';
    const driversLeft = direction === 'forward' ? 'left' : 'right';
    return { direction, index: side === driversLeft ? 0 : model.lanes[direction].length };
}
