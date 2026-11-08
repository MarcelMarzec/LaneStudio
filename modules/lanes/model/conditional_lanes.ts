import { laneRefsInWayOrder } from './order';
import type { LaneModel, LaneRef } from './types';

/*
 * `:conditional` lane tags (wiki: Conditional restrictions): a list of rules, each a value per lane and the condition
 * they hold under, `100|60 @ (wet); 80|40 @ (22:00-06:00)`. Each rule's list has a slot per lane, so a lane's own
 * conditions are read from and written into every rule.
 */

export interface LaneRule {
    values: string[];
    condition: string;
}

/** Splits on `;` outside parentheses */
function splitRules(value: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of value) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (ch === ';' && depth === 0) {
            out.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    out.push(current);
    return out.map(rule => rule.trim()).filter(Boolean);
}

/** `100|60 @ (wet); 80|40 @ (22:00-06:00)` as its rules; null when a rule has no condition */
export function parseLaneConditional(value: string): LaneRule[] | null {
    const rules: LaneRule[] = [];
    for (const rule of splitRules(value)) {
        const at = rule.indexOf('@');
        if (at < 0) return null;
        const condition = rule.slice(at + 1).trim().replace(/^\((.*)\)$/s, '$1').trim();
        rules.push({ values: rule.slice(0, at).split('|').map(v => v.trim()), condition });
    }
    return rules;
}

/** Rules back as a tag value; rules with no value for any lane are left out */
export function formatLaneConditional(rules: LaneRule[]): string {
    return rules.filter(rule => rule.values.some(Boolean))
        .map(rule => `${rule.values.join('|')} @ (${rule.condition})`).join('; ');
}

/** One lane's conditions in conditional syntax, `60 @ (wet); 40 @ (22:00-06:00)` */
export function laneConditions(rules: LaneRule[], slot: number): string {
    return rules.filter(rule => rule.values[slot]).map(rule => `${rule.values[slot]} @ (${rule.condition})`).join('; ');
}

/**
 * Where a lane's conditional values are: the tag key (`maxspeed:lanes:forward:conditional`, or the plain key on a
 * one-way road or listing a two-way road's lanes along the way) and the lane's slot in its lists
 */
export function conditionalSlot(model: LaneModel, tags: Tags, base: string, ref: LaneRef): { key: string; slot: number; count: number } {
    const plain = `${base}:lanes:conditional`;
    if (model.oneway) return { key: plain, slot: ref.index, count: model.lanes[ref.direction].length };
    const directional = `${base}:lanes:${ref.direction}:conditional`;
    if (tags[plain] !== undefined && tags[directional] === undefined) {
        const refs = laneRefsInWayOrder(model);
        return { key: plain, slot: refs.findIndex(r => r.direction === ref.direction && r.index === ref.index), count: refs.length };
    }
    return { key: directional, slot: ref.index, count: model.lanes[ref.direction].length };
}

/**
 * Sets the lanes' conditions from text in conditional syntax (`60 @ (wet)`): each condition's rule gets the value in
 * these lanes' slots, a rule for a new condition is added, and the lanes are taken out of conditions not given.
 * Returns the changed tags, or null when the text or a tagged value can't be read.
 */
export function withLaneConditions(model: LaneModel, tags: Tags, base: string, refs: LaneRef[], text: string): Tags | null {
    const wanted = text.trim() ? parseLaneConditional(text) : [];
    if (!wanted) return null;
    const next: Tags = { ...tags };
    for (const ref of refs) {
        const { key, slot, count } = conditionalSlot(model, next, base, ref);
        const rules = next[key] ? parseLaneConditional(next[key]) : [];
        if (!rules || rules.some(rule => rule.values.length !== count)) return null;
        for (const rule of rules) rule.values[slot] = '';
        for (const { values, condition } of wanted) {
            let rule = rules.find(r => r.condition === condition);
            if (!rule) {
                rule = { values: Array(count).fill(''), condition };
                rules.push(rule);
            }
            rule.values[slot] = values[0] ?? '';
        }
        const value = formatLaneConditional(rules);
        if (value) next[key] = value;
        else delete next[key];
    }
    return next;
}
