/** The speed limits a UK road can have, in mph */
export const mphLimits = [10, 20, 30, 40, 50, 60, 70];

/** The vehicles a lower limit applies to on a road with a national limit */
export type LowerLimitVehicles = 'towing_bus_hgv' | 'towing_hgv';

/**
 * UK limits set by the kind of road or zone rather than a number alone (wiki: Key:maxspeed:type, United Kingdom):
 * the national speed limit on single and dual carriageways and motorways, with the lower limit for vehicles towing
 * caravans or trailers, buses and minibuses up to 12 m and HGVs; restricted roads (30 mph, street lights); and
 * 20 mph zones, signed with ZONE under the roundel
 */
export const ukSpeedTypes = {
    'GB:nsl_single': { mph: 60, lower: { mph: 50, vehicles: 'towing_bus_hgv' as LowerLimitVehicles } },
    'GB:nsl_dual': { mph: 70, lower: { mph: 60, vehicles: 'towing_bus_hgv' as LowerLimitVehicles } },
    'GB:motorway': { mph: 70, lower: { mph: 60, vehicles: 'towing_hgv' as LowerLimitVehicles } },
    'GB:nsl_restricted': { mph: 30, lower: undefined },
    'GB:zone20': { mph: 20, lower: undefined }
};
export type UkSpeedType = keyof typeof ukSpeedTypes;
export const ukSpeedTypeList = Object.keys(ukSpeedTypes) as UkSpeedType[];
const isUkSpeedType = (value: string | undefined): value is UkSpeedType => !!value && Object.hasOwn(ukSpeedTypes, value);
/** The types that are the national speed limit (the white disc with a black band) */
export const nationalTypes: UkSpeedType[] = ['GB:nsl_single', 'GB:nsl_dual', 'GB:motorway'];

/** What a roundel picks: a limit in mph, a UK limit type (with its limit), or no limit tagged */
export type SpeedPick = { kind: 'mph'; mph: number } | { kind: 'type'; type: UkSpeedType } | { kind: 'none' };

/** Whether two picks are the same limit */
export const samePick = (a: SpeedPick | undefined, b: SpeedPick) =>
    !!a && a.kind === b.kind && (a.kind !== 'mph' || a.mph === (b as { mph: number }).mph) &&
    (a.kind !== 'type' || a.type === (b as { type: UkSpeedType }).type);

/**
 * A speed limit value in mph: `30 mph` → 30. A bare number is km/h in OpenStreetMap (wiki: Key:maxspeed), so it is
 * converted; `none`, `walk` and the like give null.
 */
export function mphOf(value: string | undefined): number | null {
    const match = (value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
    if (!match) return null;
    const n = Number(match[1]);
    return /mph/i.test(match[2] ?? '') ? n : Math.round(n / 1.609344);
}

/** A road's limit type, from `maxspeed:type`, or from `source:maxspeed` (the older key, still common) */
export function speedTypeOf(tags: Tags): UkSpeedType | undefined {
    const type = tags['maxspeed:type'];
    if (isUkSpeedType(type)) return type;
    const source = tags['source:maxspeed'];
    return isUkSpeedType(source) ? source : undefined;
}

/** A road's speed limit: its `maxspeed`, or the limit its type sets when no number is tagged */
export function roadMaxspeed(tags: Tags): string | undefined {
    const type = speedTypeOf(tags);
    if (type && (!tags.maxspeed || tags.maxspeed === 'national')) return `${ukSpeedTypes[type].mph} mph`;
    return tags.maxspeed;
}

/** The national limit a road has by its kind: a motorway's, a dual carriageway's (70 mph) or a single carriageway's */
function nationalTypeFor(tags: Tags): UkSpeedType {
    const dual = tags.dual_carriageway === 'yes' || (tags.oneway === 'yes' && /^(trunk|primary)$/.test(tags.highway ?? ''));
    return /^motorway(_link)?$/.test(tags.highway ?? '') ? 'GB:motorway' : dual ? 'GB:nsl_dual' : 'GB:nsl_single';
}

/** What a road's own tags say its limit is, as a roundel pick (`maxspeed=national` alone is read by the road's kind) */
export function roadSpeedPick(tags: Tags): SpeedPick {
    const type = speedTypeOf(tags);
    if (type) return { kind: 'type', type };
    if (tags.maxspeed === 'national') return { kind: 'type', type: nationalTypeFor(tags) };
    const mph = mphOf(tags.maxspeed);
    return mph === null ? { kind: 'none' } : { kind: 'mph', mph };
}

/** The tags without a UK limit type, in `maxspeed:type` or `source:maxspeed` */
function withoutSpeedType(tags: Tags): Tags {
    const next = { ...tags };
    if (isUkSpeedType(next['maxspeed:type'])) delete next['maxspeed:type'];
    if (isUkSpeedType(next['source:maxspeed'])) delete next['source:maxspeed'];
    return next;
}

/** A road's tags with a UK limit type set, and the limit it sets as `maxspeed`; none removes the type alone */
export function withSpeedType(tags: Tags, type: UkSpeedType | undefined): Tags {
    const next = withoutSpeedType(tags);
    if (type) {
        next.maxspeed = `${ukSpeedTypes[type].mph} mph`;
        next['maxspeed:type'] = type;
    }
    return next;
}

/**
 * A road's tags with a speed limit picked: a number in mph (dropping any limit type: a plain 20 is not a 20 zone), a
 * UK limit type with its limit, or no limit. The type is written as `maxspeed:type`, which the wiki prefers to
 * `source:maxspeed` in the UK.
 */
export function withRoadSpeed(tags: Tags, pick: SpeedPick): Tags {
    if (pick.kind === 'type') return withSpeedType(tags, pick.type);
    const next = withoutSpeedType(tags);
    if (pick.kind === 'none') delete next.maxspeed;
    else next.maxspeed = `${pick.mph} mph`;
    return next;
}

/** A road's tags with a minimum speed picked (`minspeed`), or none */
export function withRoadMinspeed(tags: Tags, pick: SpeedPick): Tags {
    const next = { ...tags };
    if (pick.kind === 'mph') next.minspeed = `${pick.mph} mph`;
    else delete next.minspeed;
    return next;
}
