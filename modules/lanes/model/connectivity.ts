/*
 * The `connectivity` tag of a type=connectivity relation (wiki: Relation:connectivity):
 * `1:1|2:2,(3)` — one statement per from lane, `from-lane:to-lanes`, separated by `|`. Lanes are numbered from the
 * driver's left in the direction of travel (1 is the leftmost), as `placement` counts them; `bw` is the both_ways lane.
 * A to lane in brackets, `(3)`, needs a lane change to reach: it is not the lane's default.
 */
import type { LaneDirection, LaneRef } from './types';

export interface LaneConnection {
    to: string;
    optional: boolean;
}

export interface ConnectivityGroup {
    from: string;
    to: LaneConnection[];
}

/** How one lane reaches another: not at all, straight on (by default) or with a lane change (`(n)`) */
export type ConnectionState = 'none' | 'default' | 'optional';

/** Problems in a `connectivity` value, as the wiki defines its syntax */
export type ConnectivitySyntaxProblem =
    /** no value at all */
    | 'empty'
    /** a statement without `from:to` */
    | 'no_colon'
    /** two from lanes in one statement (`1,2:1`), which the wiki says is invalid: write `1:1|2:1` */
    | 'several_from'
    /** a lane that is not a number from 1 or `bw` */
    | 'bad_lane'
    /** the same from lane in two statements */
    | 'repeated_from'
    /** a statement leading to no lane */
    | 'no_to';

const laneToken = /^([1-9]\d*|bw)$/;

export function parseConnectivity(value: string): ConnectivityGroup[] {
    return value.split('|').map(group => group.trim()).filter(Boolean).flatMap(group => {
        const [from, to] = group.split(':');
        if (!from || to === undefined) return [];
        return [{
            from: from.trim(),
            to: to.split(',').map(t => t.trim()).filter(Boolean).map(t => {
                const optional = /^\(.*\)$/.test(t);
                return { to: optional ? t.slice(1, -1).trim() : t, optional };
            })
        }];
    });
}

/** What is wrong with a `connectivity` value, if anything (each problem once) */
export function connectivitySyntaxProblems(value: string | undefined): ConnectivitySyntaxProblem[] {
    const problems = new Set<ConnectivitySyntaxProblem>();
    const statements = (value ?? '').split('|').map(s => s.trim());
    if (!value?.trim()) return ['empty'];
    const froms = new Set<string>();
    for (const statement of statements) {
        const parts = statement.split(':');
        if (parts.length !== 2) {
            problems.add('no_colon');
            continue;
        }
        const from = parts[0].trim();
        if (from.includes(',')) problems.add('several_from');
        else if (!laneToken.test(from)) problems.add('bad_lane');
        if (froms.has(from)) problems.add('repeated_from');
        froms.add(from);
        const to = parts[1].split(',').map(t => t.trim());
        if (!to.some(Boolean)) problems.add('no_to');
        for (const lane of to.filter(Boolean)) {
            const bare = /^\(.*\)$/.test(lane) ? lane.slice(1, -1).trim() : lane;
            if (!laneToken.test(bare)) problems.add('bad_lane');
        }
    }
    return [...problems];
}

export function formatConnectivity(groups: ConnectivityGroup[]): string {
    const rank = (lane: string) => (lane === 'bw' ? 0 : parseInt(lane, 10) || 0);
    return [...groups]
        .filter(g => g.to.length)
        .sort((a, b) => rank(a.from) - rank(b.from))
        .map(g => `${g.from}:${[...g.to].sort((a, b) => rank(a.to) - rank(b.to)).map(c => (c.optional ? `(${c.to})` : c.to)).join(',')}`)
        .join('|');
}

/** How a lane is written in the tag: its number from the driver's left (from 1), or `bw` for the both_ways lane */
export function connectivityLane(ref: LaneRef): string {
    return ref.direction === 'both_ways' ? 'bw' : `${ref.index + 1}`;
}

/** The lane a number or `bw` in the tag stands for, among the lanes travelling `direction` */
export function connectivityRef(lane: string, direction: Exclude<LaneDirection, 'both_ways'>): LaneRef | null {
    if (lane === 'bw') return { direction: 'both_ways', index: 0 };
    if (!/^[1-9]\d*$/.test(lane)) return null;
    return { direction, index: parseInt(lane, 10) - 1 };
}

/** How `from` reaches `to` in a value */
export function connectionState(value: string, from: string, to: string): ConnectionState {
    const found = parseConnectivity(value).find(g => g.from === from)?.to.find(c => c.to === to);
    return !found ? 'none' : found.optional ? 'optional' : 'default';
}

/** Sets how `from` reaches `to`: not at all, straight on, or with a lane change */
export function setConnection(value: string, from: string, to: string, state: ConnectionState): string {
    const groups = parseConnectivity(value);
    let group = groups.find(g => g.from === from);
    if (!group) {
        group = { from, to: [] };
        groups.push(group);
    }
    group.to = group.to.filter(c => c.to !== to);
    if (state !== 'none') group.to.push({ to, optional: state === 'optional' });
    return formatConnectivity(groups);
}

/**
 * Adds a connection, or removes it if it is already there (a second click undoes the first); `optional` adds it as
 * needing a lane change, or turns an existing one into that (and back)
 */
export function toggleConnection(value: string, from: string, to: string, optional = false): string {
    const state = connectionState(value, from, to);
    const want: ConnectionState = optional ? 'optional' : 'default';
    return setConnection(value, from, to, state === want ? 'none' : want);
}

/**
 * A value with two from lanes in one statement (`1,2:1`, invalid on the wiki) or a from lane listed twice, written as
 * one statement per from lane (`1:1|2:1`)
 */
export function fixConnectivitySyntax(value: string): string {
    const groups = new Map<string, ConnectivityGroup>();
    for (const statement of value.split('|')) {
        const [from, to] = statement.split(':');
        if (from === undefined || to === undefined) continue;
        const lanes = parseConnectivity(`x:${to}`)[0]?.to ?? [];
        for (const lane of from.split(',').map(f => f.trim()).filter(Boolean)) {
            const group = groups.get(lane) ?? { from: lane, to: [] };
            for (const c of lanes) if (!group.to.some(x => x.to === c.to)) group.to.push({ ...c });
            groups.set(lane, group);
        }
    }
    return formatConnectivity([...groups.values()]);
}
