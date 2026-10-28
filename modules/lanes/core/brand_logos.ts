import { dispatch as d3_dispatch } from 'd3-dispatch';
import { json as d3_json } from 'd3-fetch';

import { utilQsString } from '../../util';

/**
 * Brand logos from Wikidata, for shops, restaurants, fuel stations and the like tagged `brand:wikidata=*`: the
 * brand's small logo (P8972), else its logo image (P154), as a small image from Wikimedia Commons. Looked up in
 * batches of up to 50 brands and kept for the session; a brand with no logo is remembered too, so it is asked once.
 * A lookup that fails (Wikidata busy or unreachable) is tried again a minute later.
 */

const apibase = 'https://www.wikidata.org/w/api.php?';
const commons = 'https://commons.wikimedia.org/w/index.php?';

/** a brand's logo URL, or null when it has none; missing while unknown */
const _logos = new Map<string, string | null>();
const _pending = new Set<string>();
/** brands whose lookup failed, and when they may be asked again */
const _retryAt = new Map<string, number>();
const retryAfter = 60_000;
const dispatch = d3_dispatch('change');

const isQid = (value: string | undefined): value is string => !!value && /^Q\d+$/.test(value);

/** The brand a feature is tagged with (`brand:wikidata`), if it is a Wikidata item */
export function brandOf(tags: Tags): string | undefined {
    const qid = tags['brand:wikidata']?.split(';')[0].trim();
    return isQid(qid) ? qid : undefined;
}

/** A brand's logo URL: a string once found, null when it has none, undefined while not yet known */
export function brandLogo(qid: string): string | null | undefined {
    return _logos.get(qid);
}

/** The logo's file on Commons, from a Wikidata item's claims: its small logo, else its logo image */
export function logoFileOf(claims: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]> | undefined): string | null {
    for (const property of ['P8972', 'P154']) {
        const value = claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
        if (typeof value === 'string' && value) return value;
    }
    return null;
}

/** Looks up the logos of the brands not yet known (each once), and dispatches `change` as they arrive */
export function requestBrandLogos(qids: Iterable<string>) {
    const now = Date.now();
    const wanted = [...new Set(qids)].filter(qid => isQid(qid) && !_logos.has(qid) && !_pending.has(qid) && (_retryAt.get(qid) ?? 0) <= now);
    for (let i = 0; i < wanted.length; i += 50) {
        const batch = wanted.slice(i, i + 50);
        batch.forEach(qid => _pending.add(qid));
        const url = apibase + utilQsString({
            action: 'wbgetentities', format: 'json', formatversion: '2', ids: batch.join('|'), props: 'claims', origin: '*'
        }, false);
        d3_json(url)
            .then((result: any) => {
                for (const qid of batch) {
                    const entity = result?.entities?.[qid];
                    if (!entity) {
                        _retryAt.set(qid, Date.now() + retryAfter);
                        continue;
                    }
                    const file = logoFileOf(entity.claims);
                    _logos.set(qid, file ? commons + utilQsString({ title: `Special:Redirect/file/${file}`, width: '64' }, false) : null);
                }
            })
            // until it is found, the feature keeps iD's own marker
            .catch(() => batch.forEach(qid => _retryAt.set(qid, Date.now() + retryAfter)))
            .finally(() => {
                batch.forEach(qid => _pending.delete(qid));
                dispatch.call('change');
            });
    }
}

/** Listen for logos arriving (`change`) */
export function onBrandLogos(type: `change${string}`, listener: (() => void) | null) {
    dispatch.on(type as 'change', listener as () => void);
}
