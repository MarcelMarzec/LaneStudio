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

/**
 * The `highway=*` type a way is, or will be once built: a road under construction is tagged
 * `highway=construction` + `construction=<type>`, or carries its type in the `construction:highway=*`
 * lifecycle prefix (wiki: Tag:highway=construction, Lifecycle prefix)
 */
export function builtHighway(tags: Tags): string | undefined {
    if (tags.highway === 'construction') return tags.construction && tags.construction !== 'yes' ? tags.construction : undefined;
    return tags.highway ?? tags['construction:highway'];
}

/** A road or path being built */
export function isUnderConstruction(tags: Tags): boolean {
    return tags.highway === 'construction' || (!tags.highway && !!tags['construction:highway']);
}

/** The tags with `highway` set to the type the way will be once built */
export function asBuilt(tags: Tags): Tags {
    const highway = builtHighway(tags);
    return isUnderConstruction(tags) && highway ? { ...tags, highway } : tags;
}

export function isLaneRoad(entity: OsmEntity | undefined): entity is osmWay {
    if (!entity || entity.type !== 'way') return false;
    const way = entity as osmWay;
    return laneRoadHighways.has(builtHighway(way.tags) ?? '') && !way.isArea() && way.nodes.length > 1;
}
