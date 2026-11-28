/**
 * Speed limits as OpenStreetMap tags them (wiki: Key:maxspeed): a number in km/h, or with its unit (`30 mph`,
 * `10 knots`); `none` (no limit, as on some German motorways) or `walk` (walking pace); or the limit a type of road
 * or zone sets by law, `CC:type` (`PL:urban`, `GB:nsl_single`), in `maxspeed:type`, `source:maxspeed` or, in Romania
 * and Russia, `maxspeed` itself.
 */

/** The units a speed is shown and tagged in: mph where signs are in mph (the UK, the US…), else km/h */
export type SpeedUnit = 'mph' | 'km/h';

/** The limits offered for each unit: the UK's limits in mph, and the common ones in km/h */
export const speedLimits: Record<SpeedUnit, number[]> = {
    mph: [10, 20, 30, 40, 50, 60, 70],
    'km/h': [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140]
};
/** The speed limits a UK road can have, in mph */
export const mphLimits = speedLimits.mph;

/** Advisory speeds offered (wiki: Key:maxspeed:advisory, posted on a plate below a warning sign) */
export const advisoryLimits: Record<SpeedUnit, number[]> = {
    mph: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
    'km/h': [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
};

/** A speed and the unit it is in */
export interface Speed {
    n: number;
    unit: SpeedUnit;
}

/**
 * A speed value as tagged: a bare number is km/h (wiki: Key:maxspeed), else its unit (`mph`, `km/h`, `kmh`, `kph`, or
 * `knots`, read as km/h); `none`, `walk`, a type and the like give null
 */
export function parseSpeed(value: string | undefined): Speed | null {
    const match = (value ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph|knots)?$/i);
    if (!match) return null;
    const n = Number(match[1]);
    const unit = (match[2] ?? '').toLowerCase();
    if (unit === 'mph') return { n, unit: 'mph' };
    if (unit === 'knots') return { n: Math.round(n * 1.852), unit: 'km/h' };
    return { n, unit: 'km/h' };
}

/** A speed value in a unit, converted where it is tagged in the other (`80` in mph: 50); null where it is no number */
export function speedIn(value: string | undefined, unit: SpeedUnit): number | null {
    const speed = parseSpeed(value);
    if (!speed) return null;
    if (speed.unit === unit) return speed.n;
    return Math.round(unit === 'mph' ? speed.n / 1.609344 : speed.n * 1.609344);
}

/** A speed limit value in mph: `30 mph` → 30, a bare number (km/h) converted */
export const mphOf = (value: string | undefined) => speedIn(value, 'mph');

/** A speed as it is tagged: a bare number in km/h, `N mph` in mph */
export const formatSpeed = (n: number, unit: SpeedUnit) => (unit === 'mph' ? `${n} mph` : String(n));

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
export const isUkSpeedType = (value: string | undefined): value is UkSpeedType => !!value && Object.hasOwn(ukSpeedTypes, value);
/** The types that are the national speed limit (the white disc with a black band) */
export const nationalTypes: UkSpeedType[] = ['GB:nsl_single', 'GB:nsl_dual', 'GB:motorway'];

/**
 * The limits other countries' road and zone types set by law, in km/h, as the wiki's Key:maxspeed lists them
 * (its table of implicit values); `walk` and `none` where the law sets no number
 */
const countryTypeTable: Record<string, Record<string, string>> = {
    AR: { urban: '40', rural: '110', motorway: '130' },
    AT: { urban: '50', rural: '100', trunk: '100', motorway: '130', bicycle_road: '30' },
    BE: { living_street: '20', cyclestreet: '30', zone30: '30', trunk: '120', motorway: '120' },
    BG: { urban: '50', rural: '90', living_street: '20', trunk: '120', motorway: '140' },
    BY: { urban: '60', rural: '90', living_street: '20', motorway: '110' },
    CH: { urban: '50', rural: '80', trunk: '100', motorway: '120' },
    CZ: { urban: '50', rural: '90', pedestrian_zone: '20', living_street: '20', urban_motorway: '80', urban_trunk: '80', trunk: '110', motorway: '130' },
    DE: { urban: '50', rural: '100', living_street: 'walk', bicycle_road: '30', motorway: 'none' },
    DK: { urban: '50', rural: '80', motorway: '130' },
    EE: { urban: '50', rural: '90' },
    ES: { urban: '50', rural: '90', living_street: '20', zone30: '30', trunk: '90', motorway: '120' },
    FI: { urban: '50', rural: '80' },
    FR: { urban: '50', rural: '80', zone30: '30', motorway: '130' },
    GR: { urban: '50', rural: '90', living_street: '20', trunk: '110', motorway: '130' },
    HU: { urban: '50', rural: '90', living_street: '20', trunk: '110', motorway: '130' },
    ID: { urban: '50', rural: '80', residential: '30', motorway: '100' },
    IL: { urban: '50', rural: '90', living_street: '30', trunk: '100', motorway: '110' },
    IN: { urban: '70', rural: '70', motorway: '120' },
    IT: { urban: '50', rural: '90', trunk: '110', motorway: '130' },
    JP: { nsl: '60', motorway: '100' },
    KR: { urban: '50', rural: '60', trunk: '80', motorway: '80' },
    LT: { urban: '50', rural: '90' },
    NO: { urban: '50', rural: '80' },
    PH: { urban: '40', rural: '80', motorway: '100' },
    PL: { urban: '50', rural: '90', living_street: '20', motorway: '140' },
    PT: { urban: '50', rural: '90', trunk: '100', motorway: '120' },
    RO: { urban: '50', rural: '90', trunk: '100', motorway: '130' },
    RS: { urban: '50', rural: '80', living_street: '10', trunk: '100', motorway: '130' },
    RU: { urban: '60', rural: '90', living_street: '20', motorway: '110' },
    SE: { urban: '50', rural: '70' },
    SI: { urban: '50', rural: '90', trunk: '110', motorway: '130' },
    SK: { urban: '50', rural: '90', living_street: '20', trunk: '90', motorway: '130', motorway_urban: '90' },
    TR: { urban: '50', rural: '90', living_street: '20', zone30: '30', trunk: '110', motorway: '120' },
    UA: { urban: '50', rural: '90', living_street: '20', trunk: '110', motorway: '130' },
    UZ: { urban: '70', rural: '100', living_street: '30', motorway: '110' },
    ZA: { urban: '60', rural: '100', motorway: '120' }
};

/** Whether a value is a limit type, `CC:type` (`PL:urban`, `GB:nsl_single`, `BE-VLG:rural`) */
export const isSpeedType = (value: string | undefined): value is string =>
    !!value && /^[A-Z]{2}(-[A-Z0-9]{1,3})?:[a-z][a-z0-9_]*$/.test(value);

/**
 * The limit a type sets, as `maxspeed` is tagged (`60 mph`, `50`, `walk`, `none`), where the wiki gives it, or a zone
 * names it (`PL:zone30`, `DE:zone20`: the zones of zone:maxspeed, in km/h)
 */
export function speedTypeValue(type: string): string | undefined {
    if (isUkSpeedType(type)) return `${ukSpeedTypes[type].mph} mph`;
    const [country, name] = type.split(':');
    return countryTypeTable[country]?.[name] ?? name.match(/^zone(\d+)$/)?.[1];
}

/** The limit types offered for a country (its ISO code): the UK's, or those the wiki lists for it */
export function speedTypesFor(country: string | undefined): string[] {
    if (!country) return [];
    if (['GB', 'IM', 'JE', 'GG'].includes(country)) return ukSpeedTypeList;
    return Object.keys(countryTypeTable[country] ?? {}).map(name => `${country}:${name}`);
}

/** The values with no number Key:maxspeed documents: no limit, and walking pace */
export const speedValues = ['none', 'walk'] as const;
export type SpeedValue = typeof speedValues[number];

/** What a roundel picks: a limit in its unit, a limit type, a value with no number, or no limit tagged */
export type SpeedPick = { kind: 'speed'; n: number; unit: SpeedUnit } | { kind: 'type'; type: string } |
    { kind: 'value'; value: SpeedValue } | { kind: 'none' };

/** Whether two picks are the same limit */
export function samePick(a: SpeedPick | undefined, b: SpeedPick): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === 'speed') return a.n === (b as typeof a).n && a.unit === (b as typeof a).unit;
    if (a.kind === 'type') return a.type === (b as typeof a).type;
    if (a.kind === 'value') return a.value === (b as typeof a).value;
    return true;
}

/** A value as tagged for a pick (`30 mph`, `50`, `none`), or '' for no limit; a type gives the limit it sets */
export function pickValue(pick: SpeedPick): string {
    if (pick.kind === 'speed') return formatSpeed(pick.n, pick.unit);
    if (pick.kind === 'value') return pick.value;
    if (pick.kind === 'type') return speedTypeValue(pick.type) ?? '';
    return '';
}

/** A value as tagged, as a pick: a number in its unit, `none` or `walk`, a type; null for anything else */
export function valuePick(value: string | undefined): SpeedPick | null {
    if (!value) return { kind: 'none' };
    if ((speedValues as readonly string[]).includes(value)) return { kind: 'value', value: value as SpeedValue };
    if (isSpeedType(value)) return { kind: 'type', type: value };
    const speed = parseSpeed(value);
    return speed ? { kind: 'speed', ...speed } : null;
}

/** A road's limit type, from `maxspeed:type`, `source:maxspeed` (the older key, common outside the UK), or `maxspeed` */
export function speedTypeOf(tags: Tags): string | undefined {
    for (const key of ['maxspeed:type', 'source:maxspeed', 'maxspeed']) {
        if (isSpeedType(tags[key])) return tags[key];
    }
    return undefined;
}

/** A road's speed limit: its `maxspeed`, or the limit its type sets when no number is tagged */
export function roadMaxspeed(tags: Tags): string | undefined {
    const type = speedTypeOf(tags);
    if (type && (!tags.maxspeed || tags.maxspeed === 'national' || tags.maxspeed === type)) return speedTypeValue(type) ?? tags.maxspeed;
    return tags.maxspeed;
}

/** The national limit a road has by its kind: a motorway's, a dual carriageway's (70 mph) or a single carriageway's */
function nationalTypeFor(tags: Tags): UkSpeedType {
    const dual = tags.dual_carriageway === 'yes' || (tags.oneway === 'yes' && /^(trunk|primary)$/.test(tags.highway ?? ''));
    return /^motorway(_link)?$/.test(tags.highway ?? '') ? 'GB:motorway' : dual ? 'GB:nsl_dual' : 'GB:nsl_single';
}

/** What a road's own tags say its limit is, as a pick (`maxspeed=national` alone is read by the road's kind) */
export function roadSpeedPick(tags: Tags): SpeedPick {
    const type = speedTypeOf(tags);
    if (type) return { kind: 'type', type };
    if (tags.maxspeed === 'national') return { kind: 'type', type: nationalTypeFor(tags) };
    return valuePick(tags.maxspeed) ?? { kind: 'none' };
}

/** The tags without a limit type, in `maxspeed:type`, `source:maxspeed` or `maxspeed` */
function withoutSpeedType(tags: Tags): Tags {
    const next = { ...tags };
    for (const key of ['maxspeed:type', 'source:maxspeed', 'maxspeed']) {
        if (isSpeedType(next[key])) delete next[key];
    }
    return next;
}

/**
 * A road's tags with a limit type set, and the limit it sets as `maxspeed`; none removes the type alone. A UK type goes
 * in `maxspeed:type`, as the wiki prefers there; another where the road has one already, else in `source:maxspeed` (as
 * most communities use it), or `maxspeed:type` where `source:maxspeed` says something else
 */
export function withSpeedType(tags: Tags, type: string | undefined): Tags {
    const next = withoutSpeedType(tags);
    if (!type) return next;
    const value = speedTypeValue(type);
    const key = isUkSpeedType(type) ? 'maxspeed:type' : ['maxspeed:type', 'source:maxspeed', 'maxspeed'].find(k => isSpeedType(tags[k])) ??
        (next['source:maxspeed'] ? 'maxspeed:type' : 'source:maxspeed');
    if (key === 'maxspeed') {
        next.maxspeed = type;
    } else {
        next[key] = type;
        if (value) next.maxspeed = value;
    }
    return next;
}

/**
 * A road's tags with a speed limit picked: a number in its unit (dropping any limit type: a plain 20 is not a 20
 * zone), `none` or `walk`, a limit type with its limit, or no limit
 */
export function withRoadSpeed(tags: Tags, pick: SpeedPick): Tags {
    if (pick.kind === 'type') return withSpeedType(tags, pick.type);
    const next = withoutSpeedType(tags);
    if (pick.kind === 'none') delete next.maxspeed;
    else next.maxspeed = pickValue(pick);
    return next;
}

/** A road's tags with a minimum speed picked (`minspeed`), or none */
export function withRoadMinspeed(tags: Tags, pick: SpeedPick): Tags {
    const next = { ...tags };
    if (pick.kind === 'speed') next.minspeed = formatSpeed(pick.n, pick.unit);
    else delete next.minspeed;
    return next;
}
