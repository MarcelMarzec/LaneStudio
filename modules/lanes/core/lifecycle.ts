/*
 * Features being built (wiki: Key:construction, Lifecycle prefix). The wiki's two ways: `<key>=construction` +
 * `construction=<value>` for roads, railways, buildings and land use; for anything else the lifecycle prefix,
 * `construction:<key>=<value>` (`construction:amenity=parking`). Two common mistakes are read as what they mean,
 * and the Lane tags rule offers their fix (validations/lane_tags.ts): `amenity=construction` + `construction=parking`
 * (wiki: Tag:landuse=construction lists amenity=construction as a mistake), and a `service=*` value as the road type
 * of `highway=construction` (`construction=drive-through`).
 */

/** The keys Key:construction documents `<key>=construction` + `construction=<value>` for */
export const constructionKeys = new Set(['highway', 'railway', 'building', 'landuse']);

/** Main feature keys whose features may be tagged as being built with the lifecycle prefix */
export const lifecycleKeys = [
    'amenity', 'leisure', 'shop', 'tourism', 'man_made', 'power', 'aeroway', 'waterway', 'office', 'craft',
    'healthcare', 'emergency', 'public_transport', 'barrier', 'sport', 'historic', 'military'
];

/** `service=*` values (wiki: Key:service) sometimes given as the road type of `highway=construction` */
export const serviceValues = new Set(['drive-through', 'parking_aisle', 'driveway', 'alley', 'emergency_access']);

/** Other spellings Tag:highway=construction accepts for a road type (`footpath` for footway, `minor` for unclassified) */
const highwayAlternatives: Record<string, string> = { footpath: 'footway', minor: 'unclassified' };

/** The road type `highway=construction` + `construction=<value>` will be: a `service=*` value is a service road */
export function constructionHighway(value: string | undefined): string | undefined {
    if (!value || value === 'yes') return undefined;
    if (serviceValues.has(value)) return 'service';
    return highwayAlternatives[value] ?? value;
}

/**
 * A feature being built other than a road, railway, building or site: its key and value once built, from the
 * lifecycle prefix, or the mistaken `<key>=construction` + `construction=<value>`
 */
export function futureFeature(tags: Tags): { key: string; value: string; mistaken: boolean } | null {
    for (const key of lifecycleKeys) {
        const value = tags[`construction:${key}`];
        if (value && value !== 'no' && !tags[key]) return { key, value, mistaken: false };
    }
    for (const key of lifecycleKeys) {
        if (tags[key] === 'construction' && tags.construction && tags.construction !== 'yes') return { key, value: tags.construction, mistaken: true };
    }
    return null;
}

/** The tags a feature being built will have: `construction:amenity=parking` (or the mistake) reads as `amenity=parking` */
export function asBuiltFeature(tags: Tags): Tags {
    const future = futureFeature(tags);
    return future ? { ...tags, [future.key]: future.value } : tags;
}

/** A building being built (wiki: Tag:building=construction, or the lifecycle prefix `construction:building=*`) */
export const isBuildingUnderConstruction = (tags: Tags) =>
    tags.building === 'construction' || (!tags.building && !!tags['construction:building'] && tags['construction:building'] !== 'no');

/** A construction site (wiki: Tag:landuse=construction) */
export const isConstructionSite = (tags: Tags) => tags.landuse === 'construction';

/** Roadworks on a road that stays open (wiki: Key:construction, `construction=minor` on the road's own `highway=*`) */
export const hasRoadworks = (tags: Tags) => tags.construction === 'minor' && tags.highway !== 'construction';
