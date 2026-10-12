import type { OsmEntity } from '../../osm';
import type { osmWay } from '../../osm/way';

/** `highway=*` values that carry motor traffic lanes, so Lane Studio draws and edits their lanes */
export const laneRoadHighways = new Set([
    'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link',
    'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential',
    'living_street', 'service', 'road', 'busway', 'track'
]);

/** Roads where pavements are expected, so an untagged side is shown as unknown */
export const sidewalkExpectedHighways = new Set([
    'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street'
]);

export function isLaneRoad(entity: OsmEntity | undefined): entity is osmWay {
    if (!entity || entity.type !== 'way') return false;
    const way = entity as osmWay;
    return laneRoadHighways.has(way.tags.highway ?? '') && !way.isArea() && way.nodes.length > 1;
}
