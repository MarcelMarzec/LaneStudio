import type { coreGraph } from '../../core/graph';
import type { OsmEntity } from '../../osm';
import type { osmNode } from '../../osm/node';
import { laneDriveSide } from '../core/drive_side';
import { isLaneRoad } from '../core/roads';
import { parseLanes } from '../model';
import type { osmWay } from '../../osm/way';
import { signKind } from './section_sign';
import { featureKind } from './section_street_feature';

/*
 * One field per tag: iD's preset fields for the tags Lane Studio's own sections edit are left out of iD's Fields
 * section (and its "Add field" list) while Lane Studio's section for that feature is shown. With several features
 * selected, which Lane Studio's sections don't edit, iD's fields are kept, so they can still be set on many at once.
 */

/** The tags Lane Studio's sections edit for a road: lane counts, speed limits, pavements, cycleways, parking, hard shoulders, overtaking */
export const laneStudioRoadKeys = new Set([
    'lanes', 'maxspeed', 'minspeed',
    'sidewalk', 'sidewalk:both', 'sidewalk:left', 'sidewalk:right',
    'cycleway', 'cycleway:both', 'cycleway:left', 'cycleway:right',
    'parking:both', 'parking:left', 'parking:right',
    'parking:both:orientation', 'parking:left:orientation', 'parking:right:orientation',
    'shoulder', 'overtaking', 'active_traffic_management'
]);

/** …for street parking mapped on its own, a traffic island, a sign and a camera */
const featureKeys = {
    parking: new Set(['parking', 'orientation', 'capacity', 'access', 'fee', 'charge', 'surface', 'maxstay']),
    island: new Set(['surface']),
    road_marking: new Set<string>(),
    sign: new Set(['traffic_sign', 'direction']),
    message: new Set(['traffic_sign', 'direction']),
    camera: new Set(['direction', 'maxspeed'])
};

/** The keys Lane Studio's sections edit for the selected feature, or none */
export function laneStudioKeysFor(entityIDs: string[], graph: coreGraph): Set<string> {
    if (entityIDs.length !== 1) return new Set();
    const entity = graph.hasEntity(entityIDs[0] as OsmEntity['id']);
    if (!entity) return new Set();
    if (isLaneRoad(entity)) return laneStudioRoadKeys;
    const street = featureKind(entity);
    if (street) return featureKeys[street];
    const sign = entity.type === 'node' ? signKind(entity as osmNode, graph) : null;
    return sign ? featureKeys[sign] : new Set();
}

/**
 * iD's preset field filter: false for a field whose tags are all edited by Lane Studio for the feature (in its own
 * fields among iD's, or its own section), and for Lane Studio's centre line on a one-way road
 */
export function laneStudioFieldFilter(field: { id?: string; key?: string; keys?: string[] }, entityIDs: string[], graph: coreGraph): boolean {
    if (field.id?.startsWith('lanes/')) {
        if (field.id !== 'lanes/centre_line' || entityIDs.length !== 1) return true;
        const road = graph.hasEntity(entityIDs[0] as OsmEntity['id']);
        if (!isLaneRoad(road)) return true;
        const model = parseLanes(road.tags, { driveSide: laneDriveSide(road as osmWay, graph) });
        return !model.oneway;
    }
    const covered = laneStudioKeysFor(entityIDs, graph);
    if (!covered.size) return true;
    const keys = [field.key, ...(field.keys ?? [])].filter((key): key is string => !!key);
    return !keys.length || !keys.every(key => covered.has(key));
}
