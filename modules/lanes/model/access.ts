/*
 * Access tags (wiki: Key:access): who may use a road, path, gate or other feature. The general `access=*` key is
 * overridden by keys for transport modes, arranged in a hierarchy (wiki: Key:access#Transport mode restrictions): a
 * mode's own key wins over its parent's (`hgv=no` over `motor_vehicle=yes` over `vehicle=*` over `access=*`). Each key
 * can be set for one direction (`hgv:forward=no`, wiki: Forward & backward, left & right) and at times or for some
 * vehicles (`hgv:conditional=no @ (Mo-Fr 07:00-19:00)`, wiki: Conditional restrictions). Pure functions over tags.
 */

/** A transport mode's access key, with the key it inherits from (land-based transport, as the wiki lists it) */
export interface AccessMode {
    key: string;
    parent: string | null;
}

/** The land-based transport modes, in the wiki's order, each after its parent */
export const accessModes: AccessMode[] = [
    { key: 'access', parent: null },
    // without a vehicle
    { key: 'foot', parent: 'access' },
    { key: 'dog', parent: 'access' },
    { key: 'ski', parent: 'access' },
    { key: 'ski:nordic', parent: 'ski' },
    { key: 'ski:alpine', parent: 'ski' },
    { key: 'ski:telemark', parent: 'ski' },
    { key: 'ice_skates', parent: 'access' },
    { key: 'inline_skates', parent: 'access' },
    { key: 'horse', parent: 'access' },
    { key: 'portage', parent: 'access' },
    // with any vehicle: non-motorised
    { key: 'vehicle', parent: 'access' },
    { key: 'bicycle', parent: 'vehicle' },
    { key: 'electric_bicycle', parent: 'bicycle' },
    { key: 'mtb', parent: 'bicycle' },
    { key: 'cargo_bike', parent: 'bicycle' },
    { key: 'kick_scooter', parent: 'vehicle' },
    { key: 'carriage', parent: 'vehicle' },
    { key: 'cycle_rickshaw', parent: 'vehicle' },
    { key: 'hand_cart', parent: 'vehicle' },
    { key: 'trailer', parent: 'vehicle' },
    { key: 'caravan', parent: 'trailer' },
    // motorised: single-tracked
    { key: 'motor_vehicle', parent: 'vehicle' },
    { key: 'motorcycle', parent: 'motor_vehicle' },
    { key: 'moped', parent: 'motor_vehicle' },
    { key: 'speed_pedelec', parent: 'moped' },
    { key: 'mofa', parent: 'motor_vehicle' },
    { key: 'small_electric_vehicle', parent: 'motor_vehicle' },
    // double-tracked
    { key: 'motorcar', parent: 'motor_vehicle' },
    { key: 'motorhome', parent: 'motor_vehicle' },
    { key: 'tourist_bus', parent: 'motor_vehicle' },
    { key: 'coach', parent: 'tourist_bus' },
    { key: 'goods', parent: 'motor_vehicle' },
    { key: 'hgv', parent: 'motor_vehicle' },
    { key: 'hgv_articulated', parent: 'hgv' },
    { key: 'bdouble', parent: 'hgv' },
    { key: 'agricultural', parent: 'motor_vehicle' },
    { key: 'auto_rickshaw', parent: 'motor_vehicle' },
    { key: 'nev', parent: 'motor_vehicle' },
    { key: 'golf_cart', parent: 'motor_vehicle' },
    { key: 'microcar', parent: 'motor_vehicle' },
    { key: 'atv', parent: 'motor_vehicle' },
    { key: 'ohv', parent: 'motor_vehicle' },
    { key: 'snowmobile', parent: 'motor_vehicle' },
    // by use
    { key: 'psv', parent: 'motor_vehicle' },
    { key: 'bus', parent: 'psv' },
    { key: 'taxi', parent: 'psv' },
    { key: 'minibus', parent: 'psv' },
    { key: 'share_taxi', parent: 'psv' },
    { key: 'rideshare', parent: 'motor_vehicle' },
    { key: 'hov', parent: 'motor_vehicle' },
    { key: 'carpool', parent: 'hov' },
    { key: 'car_sharing', parent: 'motor_vehicle' },
    { key: 'emergency', parent: 'motor_vehicle' },
    { key: 'hazmat', parent: 'motor_vehicle' },
    { key: 'hazmat:water', parent: 'hazmat' },
    { key: 'school_bus', parent: 'motor_vehicle' },
    { key: 'disabled', parent: 'motor_vehicle' }
];

const modeByKey = new Map(accessModes.map(mode => [mode.key, mode]));

/** Whether a key is one of the access keys (a transport mode, or `access` itself) */
export const isAccessMode = (key: string) => modeByKey.has(key);

/** A mode's key and the keys it inherits from, most specific first (`hgv`, `motor_vehicle`, `vehicle`, `access`) */
export function accessChain(key: string): string[] {
    const chain: string[] = [];
    for (let mode = modeByKey.get(key); mode; mode = mode.parent ? modeByKey.get(mode.parent) : undefined) chain.push(mode.key);
    return chain;
}

/** How deep a mode is in the hierarchy (`access` 0, `vehicle` 1, `motor_vehicle` 2, `hgv` 3) */
export const accessDepth = (key: string) => Math.max(0, accessChain(key).length - 1);

/** The access values the wiki lists (Key:access#List of possible values), most used first */
export const accessValues = [
    'yes', 'no', 'private', 'permissive', 'destination', 'delivery', 'customers', 'designated', 'permit', 'discouraged',
    'agricultural', 'forestry', 'military', 'use_sidepath', 'dismount', 'no_turnaround', 'unknown'
] as const;

export type AccessValue = typeof accessValues[number];

/** The modes that may be told to dismount and walk (wiki: access=dismount, mostly for bicycles) */
const dismountModes = new Set(['bicycle', 'electric_bicycle', 'mtb', 'cargo_bike', 'kick_scooter', 'horse', 'carriage', 'cycle_rickshaw']);

/** The values offered for a key: `designated` and `use_sidepath` are for transport modes, not plain `access` */
export function accessValuesFor(key: string): AccessValue[] {
    const base = accessParts(key)?.mode ?? key;
    return accessValues.filter(value => {
        if (value === 'designated' || value === 'use_sidepath') return base !== 'access';
        if (value === 'dismount') return dismountModes.has(base);
        if (value === 'no_turnaround') return base === 'hgv' || base === 'hgv_articulated' || base === 'bdouble';
        return true;
    });
}

/** The direction or condition an access key is for, after its mode: `:forward`, `:backward`, `:conditional` and both */
export type AccessSuffix = '' | ':forward' | ':backward' | ':conditional' | ':forward:conditional' | ':backward:conditional';

const suffixes: AccessSuffix[] = [':forward:conditional', ':backward:conditional', ':forward', ':backward', ':conditional', ''];

/** An access key split into its mode and suffix (`hgv:forward` → `hgv`, `:forward`), or null when it is none */
export function accessParts(key: string): { mode: string; suffix: AccessSuffix } | null {
    for (const suffix of suffixes) {
        if (suffix && !key.endsWith(suffix)) continue;
        const mode = suffix ? key.slice(0, -suffix.length) : key;
        if (isAccessMode(mode)) return { mode, suffix };
    }
    return null;
}

/** The access keys tagged on a feature, in the hierarchy's order, each mode's suffixes after it */
export function taggedAccessKeys(tags: Tags): string[] {
    const order = (key: string) => {
        const parts = accessParts(key)!;
        return accessModes.findIndex(mode => mode.key === parts.mode) * 10 + suffixes.slice().reverse().indexOf(parts.suffix);
    };
    return Object.keys(tags).filter(key => accessParts(key)).sort((a, b) => order(a) - order(b));
}

/** The first value of a `;`-separated list (`agricultural;forestry` reads as `agricultural`) */
const firstValue = (value: string | undefined) => value?.split(';')[0].trim() || undefined;

/**
 * The access a mode has on a feature from its tags, travelling one way along it or either way: the most specific key
 * tagged, its direction's key before its own (`hgv:forward`, then `hgv`, then `motor_vehicle:forward`…), and where that
 * key came from; undefined when no key in its chain is tagged
 */
export function accessFor(tags: Tags, mode: string, direction?: 'forward' | 'backward'):
    { value: string; key: string } | undefined {
    for (const key of accessChain(mode)) {
        for (const tagged of direction ? [`${key}:${direction}`, key] : [key]) {
            const value = firstValue(tags[tagged]);
            if (value) return { value, key: tagged };
        }
    }
    return undefined;
}

/** Whether a mode's access on a feature changes at times or for some vehicles (a `:conditional` key in its chain) */
export function accessConditional(tags: Tags, mode: string, direction?: 'forward' | 'backward'): string | undefined {
    for (const key of accessChain(mode)) {
        for (const tagged of direction ? [`${key}:${direction}:conditional`, `${key}:conditional`] : [`${key}:conditional`]) {
            if (tags[tagged]) return tags[tagged];
        }
        // a plain value tagged lower down overrides any condition further up
        if (tags[key] || (direction && tags[`${key}:${direction}`])) return undefined;
    }
    return undefined;
}

/**
 * What an access value means for someone wanting to get through, as the Routing tool colours it: open, open but
 * discouraged, only to get to somewhere on it (destination, delivery, customers, local traffic), only with permission
 * (private, permit, agricultural, forestry, military), on the path beside it (use_sidepath), or closed
 */
export type AccessClass = 'yes' | 'designated' | 'discouraged' | 'destination' | 'permission' | 'sidepath' | 'dismount' | 'no' | 'unknown';

export function accessClass(value: string | undefined): AccessClass | undefined {
    switch (value) {
        case undefined: return undefined;
        case 'yes': case 'permissive': return 'yes';
        case 'designated': case 'official': return 'designated';
        case 'discouraged': return 'discouraged';
        case 'destination': case 'delivery': case 'customers': case 'local': return 'destination';
        // (no room to turn round: a lorry should not go in)
        case 'no_turnaround': return 'discouraged';
        // (`restricted` is an old spelling of private, wiki: Key:access#Possible tagging mistakes)
        case 'private': case 'permit': case 'agricultural': case 'forestry': case 'military': case 'restricted': return 'permission';
        case 'use_sidepath': return 'sidepath';
        case 'dismount': return 'dismount';
        case 'no': return 'no';
        default: return 'unknown';
    }
}

/**
 * The access a kind of road or barrier implies when nothing is tagged, as iD's access field shows it (wiki: OSM tags
 * for routing/Access restrictions, Worldwide); a mode not listed takes its parent's
 */
const impliedByTag: Record<string, Record<string, Record<string, string>>> = {
    highway: {
        footway: { foot: 'designated', motor_vehicle: 'no' },
        steps: { foot: 'yes', motor_vehicle: 'no', bicycle: 'no', horse: 'no' },
        ladder: { foot: 'yes', motor_vehicle: 'no', bicycle: 'no', horse: 'no' },
        pedestrian: { foot: 'yes', motor_vehicle: 'no' },
        living_street: { foot: 'yes' },
        cycleway: { motor_vehicle: 'no', bicycle: 'designated' },
        bridleway: { motor_vehicle: 'no', horse: 'designated' },
        path: { foot: 'yes', motor_vehicle: 'no', bicycle: 'yes', horse: 'yes' },
        motorway: { foot: 'no', motor_vehicle: 'yes', bicycle: 'no', horse: 'no' },
        motorway_link: { foot: 'no', motor_vehicle: 'yes', bicycle: 'no', horse: 'no' },
        trunk: { motor_vehicle: 'yes' },
        trunk_link: { motor_vehicle: 'yes' },
        construction: { access: 'no' },
        busway: { access: 'no', bus: 'designated', emergency: 'yes' },
        ...Object.fromEntries(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential',
            'unclassified', 'service'].map(highway => [highway, { foot: 'yes', motor_vehicle: 'yes', bicycle: 'yes', horse: 'yes' }]))
    },
    barrier: {
        bollard: { access: 'no', bicycle: 'yes', foot: 'yes' },
        bus_trap: { motor_vehicle: 'no', psv: 'yes', foot: 'yes', bicycle: 'yes' },
        city_wall: { access: 'no' },
        coupure: { access: 'yes' },
        cycle_barrier: { motor_vehicle: 'no' },
        ditch: { access: 'no' },
        entrance: { access: 'yes' },
        fence: { access: 'no' },
        hedge: { access: 'no' },
        jersey_barrier: { access: 'no' },
        motorcycle_barrier: { motor_vehicle: 'no' },
        rail_guard: { access: 'no' },
        stile: { bicycle: 'no', foot: 'yes', horse: 'no', motor_vehicle: 'no' }
    }
};

export function impliedAccess(tags: Tags, mode: string): string | undefined {
    for (const key of accessChain(mode)) {
        // a motorroad is for motor vehicles only (wiki: Key:motorroad)
        if (tags.motorroad === 'yes' && ['foot', 'bicycle', 'horse'].includes(key)) return 'no';
        for (const [tagKey, table] of Object.entries(impliedByTag)) {
            const value = tags[tagKey] ? table[tags[tagKey]]?.[key] : undefined;
            if (value) return value;
        }
    }
    return mode === 'access' && !tags.barrier ? 'yes' : undefined;
}

/**
 * The modes biggest first, as the Allowed Access field lists them: everyone, then the groups (all vehicles, motor
 * vehicles), then each vehicle by its size, down to people on foot
 */
export const accessSizeOrder: string[] = [
    'access', 'vehicle', 'motor_vehicle',
    'bdouble', 'hgv_articulated', 'hgv', 'hazmat', 'hazmat:water', 'coach', 'tourist_bus', 'bus', 'school_bus', 'psv', 'agricultural',
    'motorhome', 'emergency', 'goods', 'minibus', 'caravan', 'trailer', 'motorcar', 'taxi', 'share_taxi', 'rideshare', 'car_sharing',
    'hov', 'carpool', 'disabled', 'carriage', 'microcar', 'nev', 'atv', 'ohv', 'snowmobile', 'golf_cart', 'auto_rickshaw',
    'motorcycle', 'moped', 'speed_pedelec', 'mofa', 'small_electric_vehicle', 'horse', 'cycle_rickshaw', 'cargo_bike', 'bicycle',
    'electric_bicycle', 'mtb', 'kick_scooter', 'hand_cart', 'portage', 'foot', 'dog', 'ski', 'ski:nordic', 'ski:alpine', 'ski:telemark',
    'inline_skates', 'ice_skates'
];

/** The rows the Allowed Access field starts with, whatever is tagged: everyone, HGVs, cars, bicycles and pedestrians */
export const accessDefaultRows = ['access', 'hgv', 'motorcar', 'bicycle', 'foot'];
