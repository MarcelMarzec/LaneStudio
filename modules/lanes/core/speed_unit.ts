import * as countryCoder from '@rapideditor/country-coder';

import type { coreGraph } from '../../core/graph';
import { prefs } from '../../core/preferences';
import type { osmNode } from '../../osm/node';
import type { osmWay } from '../../osm/way';
import type { SpeedUnit } from '../model/speed_limits';

/** The speed unit setting: as the country where the road is uses (automatic), or always mph or km/h */
export type SpeedUnitSetting = 'auto' | SpeedUnit;

/** The speed unit chosen in the Lane Studio pane (saved in the browser as `lanes-speed-unit`) */
export function speedUnitSetting(): SpeedUnitSetting {
    const value = prefs('lanes-speed-unit');
    return value === 'mph' || value === 'km/h' ? value : 'auto';
}

export function setSpeedUnitSetting(value: SpeedUnitSetting) {
    prefs('lanes-speed-unit', value === 'auto' ? null : value);
}

// a few hundred places at most are looked up while drawing; their answers are kept by rounded location
const placeCache = new Map<string, { unit: SpeedUnit; country: string | undefined }>();

function place(loc: [number, number]) {
    const key = `${loc[0].toFixed(2)},${loc[1].toFixed(2)}`;
    let answer = placeCache.get(key);
    if (!answer) {
        // the unit road signs use there (country-coder, as iD's own speed field), km/h where unknown
        answer = { unit: countryCoder.roadSpeedUnit(loc) === 'mph' ? 'mph' : 'km/h', country: countryCoder.iso1A2Code(loc) ?? undefined };
        if (placeCache.size > 2000) placeCache.clear();
        placeCache.set(key, answer);
    }
    return answer;
}

/** The unit speeds are shown and set in at a place: the setting's, or the one its road signs use */
export function speedUnitAt(loc: [number, number] | undefined): SpeedUnit {
    const setting = speedUnitSetting();
    if (setting !== 'auto') return setting;
    return loc ? place(loc).unit : 'km/h';
}

/** The country a place is in, as its ISO code (for the limit types it has) */
export const countryAt = (loc: [number, number] | undefined) => (loc ? place(loc).country : undefined);

/** Where a road is, for its unit and country: its middle node */
export function roadLoc(way: osmWay, graph: coreGraph): [number, number] | undefined {
    const node = graph.hasEntity(way.nodes[Math.floor(way.nodes.length / 2)]) as osmNode | undefined;
    return node?.loc as [number, number] | undefined;
}

/** The unit a road's speeds are shown and set in */
export const roadSpeedUnit = (way: osmWay, graph: coreGraph) => speedUnitAt(roadLoc(way, graph));

/** The country a road is in */
export const roadCountry = (way: osmWay, graph: coreGraph) => countryAt(roadLoc(way, graph));
