import { laneDirections, type LaneDirection } from './types';

// Keys that mention `lanes` but carry free text about them, not one value per lane
const ignoredPrefixes = new Set(['source', 'note', 'fixme', 'FIXME', 'description', 'check_date', 'survey']);

export interface ParsedLaneTagKey {
    /** key id without direction, e.g. `maxspeed:lanes:conditional` */
    id: string;
    /** the part before `:lanes`, e.g. `destination:ref` */
    base: string;
    direction?: LaneDirection;
    /** `:conditional` keys hold `value @ (condition)` lists that Lane Studio does not rewrite */
    conditional: boolean;
}

function isDirection(token: string): token is LaneDirection {
    return (laneDirections as readonly string[]).includes(token);
}

/**
 * Splits a tag key like `turn:lanes:forward` into its lane key id and direction.
 * Returns `null` for keys that are not per-lane lists, including the count keys
 * `lanes`, `lanes:forward` and `lanes:bus`.
 */
export function parseLaneTagKey(tagKey: string): ParsedLaneTagKey | null {
    const tokens = tagKey.split(':');
    const i = tokens.indexOf('lanes');
    if (i <= 0) return null;
    if (ignoredPrefixes.has(tokens[0])) return null;

    const rest = tokens.slice(i + 1);
    const directions = rest.filter(isDirection);
    if (directions.length > 1) return null;
    const suffix = rest.filter(token => !isDirection(token));

    const base = tokens.slice(0, i).join(':');
    return {
        id: [base, 'lanes', ...suffix].join(':'),
        base,
        direction: directions[0],
        conditional: suffix.includes('conditional')
    };
}

/** Builds the tag key for a lane key id and direction, e.g. (`turn:lanes`, `forward`) -> `turn:lanes:forward` */
export function laneTagKey(id: string, direction?: LaneDirection): string {
    if (!direction) return id;
    const tokens = id.split(':');
    const i = tokens.indexOf('lanes');
    tokens.splice(i + 1, 0, direction);
    return tokens.join(':');
}

/** The part of a lane key id before `:lanes`, e.g. `turn:lanes` -> `turn` */
export function laneKeyBase(id: string): string {
    const tokens = id.split(':');
    return tokens.slice(0, tokens.indexOf('lanes')).join(':');
}

/** Splits a `:lanes` value into its slots; `a||b` -> `['a', '', 'b']` */
export function splitLaneValue(value: string): string[] {
    return value.split('|').map(slot => slot.trim());
}
