import { builtHighway } from '../core/roads';

/*
 * Active traffic management on motorways and trunk roads (wiki: Key:active_traffic_management, Key:maxspeed:variable,
 * Key:shoulder). A scheme is not a tag of its own: it is read from what the road is tagged with. Pure functions over tags.
 */

/**
 * - controlled: variable limits, with a hard shoulder
 * - all_lanes_running: the hard shoulder is a permanent lane (`shoulder=no`)
 * - dynamic_hard_shoulder: the hard shoulder is a lane opened by signs (`access:lanes=…|variable`)
 */
export const managedSchemes = ['none', 'controlled', 'all_lanes_running', 'dynamic_hard_shoulder'] as const;
export type ManagedScheme = typeof managedSchemes[number];

/** Why a limit changes (wiki: Key:maxspeed:variable) */
export const variableSpeedReasons = ['peak_traffic', 'weather', 'environment', 'obstruction', 'school_zone', 'border_control'] as const;

/** The roads active traffic management is tagged on */
export const canBeManaged = (tags: Tags) => ['motorway', 'trunk'].includes(builtHighway(tags) ?? '');

export function managedScheme(tags: Tags, runningShoulder: boolean): ManagedScheme {
    const value = tags.active_traffic_management;
    if (!value || value === 'no') return 'none';
    if (runningShoulder) return 'dynamic_hard_shoulder';
    return tags.shoulder === 'no' ? 'all_lanes_running' : 'controlled';
}

/**
 * The tags of a scheme: a managed road has variable limits, and has no hard shoulder of its own in all lanes running
 * or dynamic hard shoulder. No scheme leaves a variable limit as it is, as variable limits are also found without one.
 */
export function withManagedScheme(tags: Tags, scheme: ManagedScheme): Tags {
    const next = { ...tags };
    if (next.shoulder === 'no') delete next.shoulder;
    if (scheme === 'none') {
        delete next.active_traffic_management;
        return next;
    }
    next.active_traffic_management = 'yes';
    if (!isVariableSpeed(next)) next['maxspeed:variable'] = 'yes';
    if (scheme !== 'controlled') next.shoulder = 'no';
    return next;
}

/** Whether signs can lower the limit, in either direction (`maxspeed=signals` is the old way of tagging it) */
export function isVariableSpeed(tags: Tags): boolean {
    const set = (value: string | undefined) => !!value && value !== 'no';
    return set(tags['maxspeed:variable']) || set(tags['maxspeed:variable:forward']) || set(tags['maxspeed:variable:backward']) ||
        tags.maxspeed === 'signals';
}

/** The reasons tagged in `maxspeed:variable` */
export function variableSpeedReasonsOf(tags: Tags): string[] {
    return (tags['maxspeed:variable'] ?? '').split(';').map(value => value.trim())
        .filter(value => (variableSpeedReasons as readonly string[]).includes(value));
}

/** Sets `maxspeed:variable`: off, `yes`, or the reasons when there are any */
export function withVariableSpeed(tags: Tags, variable: boolean, reasons: string[] = []): Tags {
    const next = { ...tags };
    if (variable) next['maxspeed:variable'] = reasons.length ? reasons.join(';') : 'yes';
    else delete next['maxspeed:variable'];
    return next;
}

/** What a road's badge says on the map: its scheme, or that its limit is variable; null for neither */
export function managedBadge(tags: Tags, runningShoulder: boolean): Exclude<ManagedScheme, 'none'> | 'variable_speed' | null {
    const scheme = managedScheme(tags, runningShoulder);
    if (scheme !== 'none') return scheme;
    return isVariableSpeed(tags) ? 'variable_speed' : null;
}
