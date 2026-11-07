/*
 * Street parking along a road, as the wiki's Street parking scheme tags it (wiki: Street parking): `parking:<side>`
 * for where cars stand, and `parking:<side>:<key>` for everything else (orientation, markings, restriction, fee,
 * maxstay, zone, access…), with `both` for what is the same on both sides. Pure functions over tags.
 */

export type ParkingSide = 'left' | 'right';

/** Where cars stand (wiki: Street parking § Parking position) */
export const parkingPositions = ['lane', 'street_side', 'half_on_kerb', 'on_kerb', 'shoulder', 'yes', 'separate', 'no'] as const;
export type ParkingPosition = typeof parkingPositions[number];
/** The positions where cars stand along the road (not `no` or `separate`) */
export const parkedPositions: readonly string[] = ['lane', 'street_side', 'half_on_kerb', 'on_kerb', 'shoulder', 'yes'];

export const parkingOrientations = ['parallel', 'diagonal', 'perpendicular'] as const;
export type ParkingOrientation = typeof parkingOrientations[number];
export const parkingDirections = ['back_in', 'head_in'] as const;

/** Legal restrictions, at any time (`restriction`) or at times (`restriction:conditional`) */
export const parkingRestrictions = ['no_parking', 'no_stopping', 'no_standing', 'loading_only', 'charging_only', 'none'] as const;

export const parkingAccessValues = ['yes', 'private', 'customers', 'delivery', 'designated', 'no'] as const;
export const parkingPrivateValues = ['residents', 'employees', 'students', 'permit_holders'] as const;
export const parkingMaxstays = ['10 minutes', '20 minutes', '30 minutes', '1 hour', '2 hours', '3 hours', '4 hours', '1 day'] as const;
export const parkingSurfaces = ['asphalt', 'paving_stones', 'concrete', 'sett', 'grass_paver', 'gravel', 'unpaved'] as const;
/** Why there is no parking, or why it is restricted (wiki: Street parking § Reasons for parking restrictions) */
export const parkingReasons = [
    'narrow', 'cycleway', 'turn_lane', 'bus_lane', 'bus_stop', 'turnaround', 'priority_road', 'living_street', 'dual_carriage',
    'markings', 'rails', 'structure', 'junction', 'driveway', 'crossing', 'fire_lane', 'loading_zone', 'passenger_loading_zone',
    'street_cleaning'
] as const;

/** The other keys of a side, as `parking:<side>:<key>` */
export const parkingDetailKeys = [
    'orientation', 'direction', 'markings', 'restriction', 'restriction:conditional', 'restriction:reason', 'fee', 'fee:conditional',
    'charge', 'maxstay', 'maxstay:conditional', 'access', 'access:conditional', 'private', 'zone', 'disabled', 'authentication:disc',
    'capacity', 'width', 'surface', 'staggered', 'reason'
] as const;

const parkingKey = (side: ParkingSide | 'both', key = '') => `parking:${side}${key ? `:${key}` : ''}`;

/** One side's value of a parking key (`''` for the position): its own, else the `both` one */
export function parkingValue(tags: Tags, side: ParkingSide, key = ''): string | undefined {
    return tags[parkingKey(side, key)] ?? tags[parkingKey('both', key)];
}

/**
 * Sets one side's value of a parking key, keeping the other side's: written as `parking:both:<key>` when both sides
 * then match, else per side. `undefined` removes the side's value.
 */
export function withParkingValue(tags: Tags, side: ParkingSide, key: string, value: string | undefined): Tags {
    const other: ParkingSide = side === 'left' ? 'right' : 'left';
    const values: Record<ParkingSide, string | undefined> = { [side]: value, [other]: parkingValue(tags, other, key) } as Record<ParkingSide, string | undefined>;
    const next = { ...tags };
    for (const s of ['both', 'left', 'right'] as const) delete next[parkingKey(s, key)];
    if (values.left !== undefined && values.left === values.right) {
        next[parkingKey('both', key)] = values.left;
    } else {
        if (values.left !== undefined) next[parkingKey('left', key)] = values.left;
        if (values.right !== undefined) next[parkingKey('right', key)] = values.right;
    }
    return next;
}

/** Whether a key is one of a side's parking keys (its own or a `both` one), for that side's bin and undo */
export function isParkingKey(key: string, side?: ParkingSide): boolean {
    const m = key.match(/^parking:(left|right|both)(?::|$)/);
    if (!m) return false;
    return !side || m[1] === 'both' || m[1] === side;
}

/** Removes a side's parking tags, keeping the other side's (a `both` value is moved to the other side) */
export function withoutParkingSide(tags: Tags, side: ParkingSide): Tags {
    let next = { ...tags };
    const keys = new Set<string>();
    for (const key of Object.keys(tags)) {
        const m = key.match(/^parking:(left|right|both)(?::(.*))?$/);
        if (m && (m[1] === 'both' || m[1] === side)) keys.add(m[2] ?? '');
    }
    for (const key of keys) next = withParkingValue(next, side, key, undefined);
    return next;
}


/* ---------- conditional values: `value @ (condition); value @ (condition)` (wiki: Conditional restrictions) ---------- */

export interface Conditional {
    value: string;
    condition: string;
}

/** The parts of a conditional value, or null when it can't be read */
export function parseConditional(text: string | undefined): Conditional[] | null {
    if (!text?.trim()) return [];
    const parts: Conditional[] = [];
    // split on the semicolons between parts, not those inside a condition's brackets
    let depth = 0;
    let start = 0;
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ';' && depth === 0) {
            pieces.push(text.slice(start, i));
            start = i + 1;
        }
    }
    pieces.push(text.slice(start));
    for (const piece of pieces) {
        const m = piece.trim().match(/^([^@]+?)\s*@\s*(.+)$/);
        if (!m) return null;
        const condition = m[2].trim().replace(/^\((.*)\)$/, '$1').trim();
        parts.push({ value: m[1].trim(), condition });
    }
    return parts;
}

/** Writes conditional parts back, each condition in brackets */
export function formatConditional(parts: Conditional[]): string {
    return parts.filter(p => p.value && p.condition).map(p => `${p.value} @ (${p.condition})`).join('; ');
}


/* ---------- what is drawn ---------- */

/**
 * The lines painted along the kerb where parking is restricted, as in the UK: double yellow lines where waiting is
 * banned at any time (`no_parking`, `no_standing`), a single yellow line where it is banned at times only, and double
 * or single red lines for no stopping (a red route). Drawn only where nobody parks on the road on that side.
 */
export type KerbMarking = 'double_yellow' | 'single_yellow' | 'double_red' | 'single_red';

export function kerbMarking(tags: Tags, side: ParkingSide): KerbMarking | undefined {
    const position = parkingValue(tags, side);
    if (position && parkedPositions.includes(position)) return undefined;
    const always = parkingValue(tags, side, 'restriction');
    const times = (parseConditional(parkingValue(tags, side, 'restriction:conditional')) ?? []).map(p => p.value);
    // lifted at times (`none @ …`): banned the rest of the time, a single line
    const lifted = times.includes('none');
    if (always === 'no_stopping') return lifted ? 'single_red' : 'double_red';
    if (always === 'no_parking' || always === 'no_standing') return lifted ? 'single_yellow' : 'double_yellow';
    if (times.includes('no_stopping')) return 'single_red';
    if (times.includes('no_parking') || times.includes('no_standing')) return 'single_yellow';
    return undefined;
}

/** What parking is kept for, for its colour: loading, charging, disabled drivers or permit holders */
export type ParkingUse = 'loading' | 'charging' | 'disabled' | 'permit';

export function parkingUse(tags: Tags, side?: ParkingSide): ParkingUse | undefined {
    const get = (key: string) => side ? parkingValue(tags, side, key) : tags[key];
    const restriction = get('restriction');
    if (restriction === 'loading_only') return 'loading';
    if (restriction === 'charging_only') return 'charging';
    if (get('disabled') === 'designated' || get('disabled') === 'only') return 'disabled';
    if (get('access') === 'private' || get('access') === 'permit' || get('access') === 'designated') return 'permit';
    return undefined;
}

/**
 * The parts of a parking strip's badge on the map and its summary in the sidebar: pay, the time limit and the zone
 * (`fee`, `maxstay`, `zone`), as short words; `get` reads a key for the side or the separately mapped parking
 */
export function parkingBadgeParts(get: (key: string) => string | undefined): { fee?: 'yes' | 'no'; maxstay?: string; zone?: string; disc?: boolean; times?: boolean } {
    const fee = get('fee');
    const maxstay = get('maxstay');
    return {
        fee: fee === 'yes' || fee === 'no' ? fee : undefined,
        maxstay: maxstay ? shortDuration(maxstay) : undefined,
        zone: get('zone') || undefined,
        disc: get('authentication:disc') === 'yes' || undefined,
        times: !!(get('restriction:conditional') || get('maxstay:conditional') || get('fee:conditional')) || undefined
    };
}

/** A duration as a sign gives it: `2 hours` → `2h`, `30 minutes` → `30m`, `1 day` → `1d` */
export function shortDuration(value: string): string {
    const m = value.trim().match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?|h|m|d)$/i);
    if (!m) return value;
    const unit = m[2][0].toLowerCase();
    return `${m[1]}${unit === 'h' ? 'h' : unit === 'd' ? 'd' : 'm'}`;
}


/* ---------- the old scheme (parking:lane=*, parking:condition=*), deprecated in 2022 ---------- */

const oldPositions: Record<string, string> = {
    on_street: 'lane', half_on_kerb: 'half_on_kerb', on_kerb: 'on_kerb', street_side: 'street_side', lay_by: 'street_side',
    painted_area_only: 'lane', shoulder: 'shoulder'
};
const oldConditions: Record<string, Tags> = {
    free: { fee: 'no' }, ticket: { fee: 'yes' }, disc: { 'authentication:disc': 'yes' }, residents: { access: 'private', private: 'residents' },
    customers: { access: 'customers' }, private: { access: 'private' }, no_parking: { restriction: 'no_parking' },
    no_stopping: { restriction: 'no_stopping' }, no_standing: { restriction: 'no_standing' }, loading: { restriction: 'loading_only' },
    disabled: { disabled: 'designated' }, charging: { restriction: 'charging_only' }
};

/** Whether a road still uses the old street parking scheme */
export function hasOldParkingTags(tags: Tags): boolean {
    return Object.keys(tags).some(key => /^parking:(lane|condition)(:|$)/.test(key));
}

/**
 * The old scheme's tags in the current one, as far as they can be read for sure (wiki: Street parking § To migrate
 * deprecated parking:lane=* and parking:condition=* tags): positions, orientations, no parking and no stopping,
 * fees, discs, residents and customers, time limits and the times of a condition. Keys it can't read are kept.
 */
export function upgradeOldParking(tags: Tags): Tags {
    const out = { tags: { ...tags } };
    const sideKeys = (base: 'lane' | 'condition', side: ParkingSide | 'both') => `parking:${base}:${side}`;
    for (const side of ['both', 'left', 'right'] as const) {
        const targets: ParkingSide[] = side === 'both' ? ['left', 'right'] : [side];
        const set = (key: string, value: string | undefined) => {
            if (value === undefined) return;
            for (const target of targets) out.tags = withParkingValue(out.tags, target, key, value);
        };
        const lane = tags[sideKeys('lane', side)];
        if (lane) {
            if ((parkingOrientations as readonly string[]).includes(lane)) {
                set('orientation', lane);
                const position = tags[`${sideKeys('lane', side)}:${lane}`];
                set('', position ? oldPositions[position] ?? 'yes' : 'yes');
                if (position === 'painted_area_only') set('markings', 'yes');
                delete out.tags[`${sideKeys('lane', side)}:${lane}`];
            } else if (lane === 'marked') {
                set('', 'yes');
                set('markings', 'yes');
            } else if (lane === 'no_parking' || lane === 'no_stopping' || lane === 'no_standing') {
                set('', 'no');
                set('restriction', lane);
            } else if (lane === 'fire_lane') {
                set('', 'no');
                set('restriction', 'no_stopping');
                set('restriction:reason', 'fire_lane');
            } else if (lane === 'no' || lane === 'separate' || lane === 'yes') {
                set('', lane);
            } else continue;
            delete out.tags[sideKeys('lane', side)];
        }
        const condition = tags[sideKeys('condition', side)];
        if (condition && oldConditions[condition]) {
            const time = tags[`${sideKeys('condition', side)}:time_interval`];
            const fallback = tags[`${sideKeys('condition', side)}:default`];
            const write = oldConditions[condition];
            if (time && Object.keys(write).length === 1) {
                // a condition only at times: `restriction:conditional=no_parking @ (Mo-Fr 08:00-18:00)`
                const [[key, value]] = Object.entries(write);
                set(`${key}:conditional`, `${value} @ (${time})`);
                if (fallback && oldConditions[fallback]) for (const [k, v] of Object.entries(oldConditions[fallback])) set(k, v);
                delete out.tags[`${sideKeys('condition', side)}:time_interval`];
                delete out.tags[`${sideKeys('condition', side)}:default`];
            } else if (!time) {
                for (const [key, value] of Object.entries(write)) set(key, value);
            } else continue;
            delete out.tags[sideKeys('condition', side)];
        }
        const maxstay = tags[`${sideKeys('condition', side)}:maxstay`];
        if (maxstay) {
            set('maxstay', maxstay);
            delete out.tags[`${sideKeys('condition', side)}:maxstay`];
        }
        const residents = tags[`${sideKeys('condition', side)}:residents`];
        if (residents) {
            set('zone', residents);
            delete out.tags[`${sideKeys('condition', side)}:residents`];
        }
        const capacity = tags[`${sideKeys('lane', side)}:capacity`] ?? tags[`${sideKeys('condition', side)}:capacity`];
        if (capacity) {
            set('capacity', capacity);
            delete out.tags[`${sideKeys('lane', side)}:capacity`];
            delete out.tags[`${sideKeys('condition', side)}:capacity`];
        }
    }
    return out.tags;
}
