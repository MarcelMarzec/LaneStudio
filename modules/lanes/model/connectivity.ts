/*
 * The `connectivity` tag of a type=connectivity relation (Relation:connectivity):
 * `1:1|2:2,3|3:(3)` — from-lane : to-lanes, numbered from the driver's left, `(n)` marks an
 * optional (non-default) connection and `bw` a both-ways lane.
 */

export interface LaneConnection {
    to: string;
    optional: boolean;
}

export interface ConnectivityGroup {
    from: string;
    to: LaneConnection[];
}

export function parseConnectivity(value: string): ConnectivityGroup[] {
    return value.split('|').map(group => group.trim()).filter(Boolean).flatMap(group => {
        const [from, to] = group.split(':');
        if (!from || to === undefined) return [];
        return [{
            from: from.trim(),
            to: to.split(',').map(t => t.trim()).filter(Boolean).map(t => {
                const optional = /^\(.*\)$/.test(t);
                return { to: optional ? t.slice(1, -1) : t, optional };
            })
        }];
    });
}

export function formatConnectivity(groups: ConnectivityGroup[]): string {
    const rank = (lane: string) => (lane === 'bw' ? 0 : parseInt(lane, 10) || 0);
    return [...groups]
        .filter(g => g.to.length)
        .sort((a, b) => rank(a.from) - rank(b.from))
        .map(g => `${g.from}:${[...g.to].sort((a, b) => rank(a.to) - rank(b.to)).map(c => (c.optional ? `(${c.to})` : c.to)).join(',')}`)
        .join('|');
}

/** Adds a connection, or removes it if it is already there (a second click undoes the first) */
export function toggleConnection(value: string, from: string, to: string): string {
    const groups = parseConnectivity(value);
    let group = groups.find(g => g.from === from);
    if (!group) {
        group = { from, to: [] };
        groups.push(group);
    }
    const existing = group.to.findIndex(c => c.to === to);
    if (existing === -1) group.to.push({ to, optional: false });
    else group.to.splice(existing, 1);
    return formatConnectivity(groups);
}
