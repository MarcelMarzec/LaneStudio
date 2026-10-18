/*
 * What the Signs tool places and the sign picker edits, as tags (wiki: Key:traffic_sign,
 * Tag:traffic_sign=variable_message, Tag:highway=speed_camera, Relation:enforcement).
 */

/** UK signs the picker offers, by TSRGD diagram number, in the order shown */
export const ukSignCodes = [
    'GB:670', 'GB:671', 'GB:674', 'GB:672', 'GB:601.1', 'GB:602', 'GB:616', 'GB:617', 'GB:619',
    'GB:612', 'GB:613', 'GB:614', 'GB:632', 'GB:606', 'GB:610', 'GB:652',
    'GB:626.2', 'GB:629', 'GB:629.2', 'GB:955', 'GB:956', 'GB:957'
] as const;

/** Signs that carry a number or measure: speed limits, zones, weight, width and height limits */
export const signsWithValue = new Set(['GB:670', 'GB:672', 'GB:674', 'GB:626.2', 'GB:629', 'GB:629.2']);

/** What the Signs tool places: a traffic sign code, a variable message sign, or a camera */
export type SignChoice = typeof ukSignCodes[number] | 'message' | 'camera:speed' | 'camera:red_light';
export const signChoices: SignChoice[] = [...ukSignCodes, 'message', 'camera:speed', 'camera:red_light'];

/** The key a sign's name is translated under: `GB:601.1` → `gb_601_1` */
export const signNameKey = (choice: string) => choice.toLowerCase().replace(/[:.]/g, '_');

/** The tags of a new sign node for a choice; `limit` is the road's speed limit for speed signs and cameras */
export function signTags(choice: SignChoice, limit: string | undefined): Tags {
    if (choice === 'message') return { traffic_sign: 'variable_message' };
    if (choice === 'camera:speed') return { highway: 'speed_camera', ...(limit ? { maxspeed: limit } : {}) };
    // a red light camera is a traffic camera in an enforcement relation (enforcement=traffic_signals)
    if (choice === 'camera:red_light') return { man_made: 'surveillance', 'surveillance:type': 'camera', 'surveillance:zone': 'traffic' };
    return { traffic_sign: choice, ...(choice === 'GB:670' && limit ? { maxspeed: limit } : {}) };
}

/** The first sign code in a `traffic_sign=*` value and its bracketed value: `GB:670[40]` → [`GB:670`, `40`] */
export function signCode(tags: Tags): { code: string; value: string } {
    const first = (tags.traffic_sign ?? '').split(/[;,]/)[0].trim();
    const m = first.match(/^(.*?)(?:\[(.*)\])?$/);
    return { code: m?.[1] ?? first, value: m?.[2] ?? '' };
}

/** Sets the sign's code (keeping any further signs on the post), and its value in brackets */
export function withSignCode(tags: Tags, code: string, value = ''): Tags {
    const rest = (tags.traffic_sign ?? '').split(/[;,]/).slice(1).map(s => s.trim()).filter(Boolean);
    const first = signsWithValue.has(code) && value ? `${code}[${value}]` : code;
    return { ...tags, traffic_sign: [first, ...rest].join(';') };
}

/** Turns a sign to face the other way: a bearing turns by 180°, forward and backward swap */
export function turnedRound(tags: Tags): Tags {
    const next = { ...tags };
    for (const key of ['direction', 'traffic_sign:direction', 'camera:direction']) {
        const v = tags[key];
        if (!v) continue;
        if (v === 'forward') next[key] = 'backward';
        else if (v === 'backward') next[key] = 'forward';
        else if (/^\d+(\.\d+)?$/.test(v)) next[key] = String((Math.round(parseFloat(v)) + 180) % 360);
    }
    return next;
}
