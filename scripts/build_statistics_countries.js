/* eslint-disable no-console */
import fs from 'node:fs';
import { borders, feature } from '@rapideditor/country-coder';

/**
 * Writes the country borders the website's statistics collector uses to say which country each changeset is in
 * (`LanesWebsite/includes/statistics/countries.json`), from the same borders iD uses (country-coder). Each entry is a
 * country or territory with its own ISO code (`GB`, `GL`), its short English name, flag, bounding box and outline;
 * parts without their own code (England, Ceuta, metropolitan France) are filed under the country they belong to.
 * Coordinates are rounded to 3 decimal places (about 100 m), plenty for a changeset's centre.
 *
 * Usage: node scripts/build_statistics_countries.js
 */

const out = 'LanesWebsite/includes/statistics/countries.json';
const round = n => Math.round(n * 1000) / 1000;
// short English names ("Denmark", not "Kingdom of Denmark"), from the same list as browsers use
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
// codes reserved for parts of a country rather than a country of their own
const partOf = { FX: 'FR' };
// names shorter than the list's
const shortNames = { HK: 'Hong Kong', MO: 'Macao' };
const flag = code => [...code].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');

const countries = [];
for (const f of borders.features) {
    if (!f.geometry) continue;
    let code = f.properties.iso1A2 ?? f.properties.country;
    if (!code) continue;
    code = partOf[code] ?? code;
    const regionName = regionNames.of(code);
    const name = shortNames[code] ?? (regionName && regionName !== code ? regionName : (feature(code)?.properties ?? f.properties).nameEn);
    const polygons = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
        .map(polygon => polygon.map(ring => ring.map(([lon, lat]) => [round(lon), round(lat)])));
    let [minLon, minLat, maxLon, maxLat] = [180, 90, -180, -90];
    for (const polygon of polygons) {
        for (const [lon, lat] of polygon[0]) {
            minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
        }
    }
    countries.push({ code, name, flag: flag(code), bbox: [minLon, minLat, maxLon, maxLat], polygons });
}

fs.writeFileSync(out, JSON.stringify(countries));
console.log(`Wrote ${countries.length} borders to ${out}`);
