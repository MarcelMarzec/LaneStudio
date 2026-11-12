/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the Tag coverage pages (`docs/TAGS.md` and `docs/tags/`): every key and tag the OpenStreetMap wiki documents,
 * and whether Lane Studio draws it, could, or cannot (and why).
 *
 * 1. Reads the wiki through its API (wiki.openstreetmap.org/w/api.php): every English `Key:` and `Tag:` page in the
 *    trees of Category:Tags and Category:Features, as deep as their sub categories go (translations left out), and every
 *    one Map features links to; each page's status and group from the wiki's status and group categories. Pages with
 *    the status proposed, voting, deprecated, obsolete, discardable or imaginary are left out.
 * 2. Reads Lane Studio's code (`modules/lanes/`) for the keys it reads and the values it names.
 * 3. Sorts every key and tag: rendered (Lane Studio draws it, or the Routing tool uses it), could be rendered (on or
 *    beside the street, where Lane Studio's layer could draw it), or cannot be rendered (with the reason).
 *
 * Usage: node scripts/build_tag_coverage.js [--cache <file>]
 * (needs network access; `--cache` keeps what was read from the wiki in a file, and reads it from there next time)
 */

const API = 'https://wiki.openstreetmap.org/w/api.php';
const AGENT = 'tag-coverage-builder/1.0';
const WIKI = 'https://wiki.openstreetmap.org/wiki/';

/** The statuses kept: documented and in use (left out: proposed, voting, deprecated, obsolete, discardable, imaginary) */
const kept = new Set(['approved', 'de facto', 'in use', 'imported', 'none', 'undefined']);
const statuses = ['approved', 'de facto', 'in use', 'imported', 'undefined', 'proposed', 'voting', 'deprecated', 'obsolete', 'discardable', 'imaginary'];

const sleep = ms => new Promise(resolve => {
    setTimeout(resolve, ms);
});

async function call(params) {
    const url = `${API}?${new URLSearchParams({ ...params, format: 'json', formatversion: '2' })}`;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const response = await fetch(url, { headers: { 'User-Agent': AGENT } });
            if (response.ok) return await response.json();
        } catch { /* tried again below */ }
        await sleep(2000 + attempt * 3000);
    }
    throw new Error(`could not read ${url}`);
}

async function members(category, type) {
    const out = [];
    let more = {};
    for (;;) {
        const data = await call({ action: 'query', list: 'categorymembers', cmtitle: category, cmtype: type, cmlimit: '500', ...more });
        out.push(...data.query.categorymembers.map(m => m.title));
        if (!data.continue) return out;
        more = data.continue;
    }
}

const english = /^(Key|Tag):/;
// translations, and categories of pages not yet agreed
const skipped = category => category.includes('/translations') || /^Category:([A-Z][a-z]{0,2}(-[a-z]+)?|[a-z]{2,3}(-[a-z]+)?):/.test(category) ||
    /proposed|voting/i.test(category);

/** What the wiki documents: its pages (with where each was found), their statuses and groups */
async function readWiki() {
    const pages = {};
    const add = (title, source) => {
        if (english.test(title)) (pages[title] ??= new Set()).add(source);
    };
    const depth = {};
    for (const root of ['Category:Tags', 'Category:Features']) {
        const seen = new Set([root]);
        let frontier = [root];
        let level = 0;
        while (frontier.length) {
            const before = Object.keys(pages).length;
            level++;
            const next = [];
            // four categories at a time
            for (let i = 0; i < frontier.length; i += 4) {
                const batch = await Promise.all(frontier.slice(i, i + 4).map(async c => [await members(c, 'page'), await members(c, 'subcat')]));
                for (const [found, subs] of batch) {
                    found.forEach(t => add(t, root));
                    for (const sub of subs) {
                        if (seen.has(sub) || skipped(sub)) continue;
                        seen.add(sub);
                        next.push(sub);
                    }
                }
            }
            frontier = next;
            const added = Object.keys(pages).length - before;
            console.log(`${root}: level ${level}, ${seen.size} categories, ${Object.keys(pages).length} pages (${added} new)`);
            // deeper than this the trees spread into categories of places and projects with no more keys or tags
            if (level > 2 && added < 10) break;
        }
        depth[root] = { levels: level, categories: seen.size };
    }
    const features = await call({ action: 'parse', page: 'Map_features', prop: 'links' });
    features.parse.links.forEach(link => add(link.title, 'Map features'));

    const status = {};
    for (const kind of ['Key', 'Tag']) {
        for (const s of statuses) {
            for (const t of await members(`Category:${kind} descriptions with status "${s}"`, 'page')) if (english.test(t)) status[t] = s;
        }
        for (const t of await members(`Category:${kind} descriptions with no status specified`, 'page')) if (english.test(t)) status[t] ??= 'none';
    }
    const group = {};
    for (const kind of ['Tag', 'Key']) {
        for (const category of await members(`Category:${kind} descriptions by group`, 'subcat')) {
            const name = category.match(new RegExp(`^Category:${kind} descriptions for group "(.+)"$`))?.[1];
            if (!name) continue;
            for (const t of await members(category, 'page')) if (english.test(t)) group[t] ??= name;
        }
    }
    return { pages: Object.fromEntries(Object.entries(pages).map(([t, s]) => [t, [...s].sort()])), status, group, depth };
}


/* ---------- what Lane Studio reads ---------- */

function readCode(root = 'modules/lanes') {
    const keys = new Set();
    // the values each file names, and the keys it reads: a value counts for a key where one file has both
    const files = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.name.endsWith('.ts')) {
                const text = fs.readFileSync(file, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
                const own = { keys: new Set(), values: new Set(), text: text.toLowerCase() };
                for (const m of text.matchAll(/tags\??\.([a-z_][a-z0-9_]*)/g)) own.keys.add(m[1]);
                for (const m of text.matchAll(/(?:tags|values|next)\??\[\s*['"]([a-z_:0-9]+)['"]\s*\]/g)) own.keys.add(m[1]);
                for (const m of text.matchAll(/'([a-z_][a-z0-9_:;.\-]*)'/g)) {
                    own.values.add(m[1]);
                    // a key written out with its colons (`'cycleway:left'`)
                    if (/^[a-z_]+(:[a-z_0-9]+)+$/.test(m[1]) && !m[1].startsWith('_lanes')) own.keys.add(m[1]);
                }
                own.keys.forEach(k => keys.add(k));
                files.push(own);
            }
        }
    };
    walk(root);
    // a value counts for a key where the code names it near the key: in a check (`tags.highway === 'stop'`) or a list named
    // for it (`laneRoadHighways`, `barrierWidths`), within a few lines after the key's name
    const near = (f, key, value) => {
        // the key's last part, or its last word (`traffic_calming`: a `calming` function)
        const last = key.split(':').pop().toLowerCase();
        const words = [last, ...(last.includes('_') && last.split('_').pop().length >= 5 ? [last.split('_').pop()] : [])];
        const literal = `'${value}'`;
        for (let at = f.text.indexOf(literal); at >= 0; at = f.text.indexOf(literal, at + 1)) {
            // within 60 lines after it (a function that reads the key and checks each value)
            const from = f.text.slice(0, at).split('\n').length;
            for (const word of words) {
                const before = f.text.lastIndexOf(word, at);
                if (before >= 0 && from - f.text.slice(0, before).split('\n').length <= 60) return true;
            }
        }
        return false;
    };
    return { keys, named: (key, value) => files.some(f => f.values.has(value) && near(f, key, value)) };
}


/* ---------- sorting each key and tag ---------- */

const RENDERED = '✅ Rendered';
const COULD = '🟡 Could be rendered';
const CANNOT = '❌ Cannot be rendered';

const reasons = {
    info: 'Information, not a shape on the ground (iD shows it in the fields)',
    place: 'A place, business or service, not part of the road: iD draws it as a point or area',
    area: 'Land, water or buildings beside the street: iD draws them as areas',
    relation: 'A route or relation grouping other features, with no shape of its own',
    rule: 'A rule or condition with nothing painted or built to draw',
    hidden: 'Underground, underwater or indoors: not seen from the street',
    height: 'Height or 3D form: Lane Studio draws the street in plan',
    life: 'Not built yet, or gone: nothing on the ground to draw',
    meta: 'Data about the edit (changeset, import, source)',
    away: 'Away from roads, paths and railways (airfields, pistes, the sea): outside the street Lane Studio draws',
    network: 'A utility network iD draws as lines and points'
};
const street = 'On or beside the street: Lane Studio\'s street layer could draw it';

/** Each wiki group's usual answer, for keys and tags not settled otherwise */
const groupDefaults = Object.fromEntries([
    ...['highways', 'crossings', 'cycleways', 'barriers', 'parking', 'area:highway', 'bicycles', 'buses', 'public transport', 'railways',
        'bridges', 'advertising', 'transport', 'motorcycles'].map(g => [g, 'street']),
    ...['addresses', 'names', 'references', 'annotations', 'units', 'properties', 'NaPTAN', 'location', 'social networks', 'GPS',
        'humanitarian osm team', 'disabilities', 'accessibility', 'hazards'].map(g => [g, 'info']),
    ['changeset', 'meta'], ['import', 'meta'], ['lifecycle', 'life'], ['restrictions', 'rule'], ['routes', 'relation'], ['ferries', 'relation'],
    ['3D', 'height'], ['buildings', 'area'],
    ...['landuse', 'landcover', 'natural', 'places', 'boundaries', 'water', 'wetland', 'waterways', 'water management', 'agriculture']
        .map(g => [g, 'area']),
    ...['aeroways', 'aerialways', 'marine', 'maritime', 'marine navigation', 'outdoor activities', 'hiking', 'riding', 'climbing']
        .map(g => [g, 'away']),
    ...['power', 'pipelines', 'telecom', 'communications'].map(g => [g, 'network'])
]);

/** Keys (and, for the broad ones, values) of things standing in the street, at the kerb or over the road */
const streetThings = {
    amenity: ['bench', 'waste_basket', 'bicycle_parking', 'motorcycle_parking', 'post_box', 'telephone', 'vending_machine', 'charging_station',
        'parking_entrance', 'taxi', 'recycling', 'drinking_water', 'clock', 'parking_space', 'loading_dock', 'fuel', 'compressed_air',
        'ticket_validator', 'bicycle_rental', 'kick-scooter_rental', 'grit_bin', 'letter_box', 'bus_station', 'car_wash', 'atm',
        'water_point', 'fountain', 'shelter', 'bicycle_repair_station', 'parking'],
    man_made: ['street_cabinet', 'surveillance', 'flagpole', 'manhole', 'utility_pole', 'mast', 'bridge', 'gantry', 'monitoring_station',
        'pole', 'planter', 'tunnel', 'cutting', 'embankment', 'snow_fence', 'kerb'],
    emergency: ['fire_hydrant', 'phone', 'defibrillator', 'siren', 'access_point', 'fire_alarm_box', 'life_ring', 'assembly_point',
        'suction_point'],
    power: ['pole', 'catenary_mast', 'transformer', 'switch', 'insulator', 'portal', 'terminal'],
    natural: ['tree', 'tree_row', 'shrub', 'hedge'],
    leisure: ['picnic_table'],
    tourism: ['information', 'artwork'],
    historic: ['milestone', 'boundary_stone', 'memorial', 'wayside_cross', 'wayside_shrine'],
    public_transport: ['platform', 'stop_position', 'pole']
};
const streetKeys = new Set(['advertising', 'traffic_sign', 'kerb', 'tactile_paving', 'ramp', 'handrail', 'step_count', 'incline', 'smoothness',
    'lit', 'verge', 'embankment', 'cutting', 'lane_markings', 'surface', 'width', 'est_width', 'traffic_calming', 'barrier', 'crossing',
    'highway', 'railway', 'cycleway', 'sidewalk', 'footway', 'parking', 'shoulder', 'busway', 'bus_bay', 'junction', 'bridge', 'tunnel',
    'layer', 'covered', 'road_marking', 'area:highway', 'turn', 'lanes', 'placement', 'segregated', 'electrified', 'gauge', 'tracks',
    'platform', 'bus_stop', 'shelter', 'bench', 'bin', 'flashing_lights', 'button_operated', 'priority', 'priority_road', 'traffic_signals',
    'stop', 'give_way', 'speed_camera', 'enforcement', 'toll', 'ford', 'passing_places', 'overtaking', 'change', 'oneway', 'street_lamp',
    'trolley_wire', 'kerb:height', 'sidewalk:surface', 'cycleway:surface', 'footway:surface']);

// information about a feature rather than its shape
const infoKey = /^(name|alt_name|old_name|official_name|short_name|loc_name|nat_name|int_name|reg_name|addr|contact|website|url|phone|fax|email|opening_hours|service_times|collection_times|operator|owner|brand|network|wikidata|wikipedia|wikimedia_commons|image|mapillary|panoramax|description|note|fixme|FIXME|check_date|survey|start_date|end_date|opening_date|payment|currency|cuisine|diet|internet_access|stars|level|ele|population|is_in|gnis|tiger|ref|old_ref|official_ref|int_ref|nat_ref|reg_ref|loc_ref|source|attribution|license|ISO|iata|icao|wheelchair|capacity|fee|charge|maxstay|access_hours|sport|religion|denomination|healthcare|office|craft|shop|was|heritage|architect|artist|material|colour|wifi|toilets|changing_table|smoking|self_service|takeaway|delivery|drive_through|outdoor_seating|reservation|dog|indoor|min_age|max_age)(:|$)/;
const lifecycle = /^(proposed|construction|disused|abandoned|razed|demolished|removed|destroyed|was|not|planned):/;
const hidden = /(^location$|underground|^pipeline|^cable|^substance|^culvert|=culvert$)/;
const height = /^(height|min_height|building:|roof:|building_levels|min_level|max_level|levels)/;

// keys the Routing tool reads from its vehicle profiles (lists in geometry/routing.ts, not `tags.key`)
const routingKeys = new Set(['access', 'motor_vehicle', 'motorcar', 'vehicle', 'bus', 'psv', 'hgv', 'goods', 'bicycle', 'foot', 'except',
    'restriction', 'maxheight', 'maxweight']);
// keys Lane Studio builds from parts (`cycleway:${side}:width`, `parking:${side}:…`, `*:lanes`)
// (keys with fixed names, `crossing:*`, `railway:signal:*`, `maxspeed:*`, are found in the code as they are written)
const families = ['cycleway:', 'sidewalk:', 'parking:', 'shoulder:', 'busway:', 'turn:lanes', 'destination:', 'overtaking:', 'change:',
    'width:', 'placement:', 'road_marking', 'area:highway', 'restriction:', 'lanes:'];
// keys read for each direction (`maxspeed:forward`), built in the code from their parts
const directional = ['maxspeed:forward', 'maxspeed:backward', 'maxspeed:hgv:forward', 'maxspeed:hgv:backward', 'traffic_sign:forward',
    'traffic_sign:backward', 'oneway:bicycle', 'oneway:bus', 'oneway:psv'];
// values the code names near their key for something else (a path's kind, a prefix it reads past): not drawn
const notDrawn = {
    highway: ['corridor', 'no', 'ladder', 'proposed', 'platform', 'priority', 'turntable'], construction: ['steps'], cycleway: ['proposed'],
    footway: ['residential', 'service'], path: ['sidewalk'], 'restriction:bicycle': ['stop'], 'lane_markings': []
};
// broad keys of which Lane Studio draws only these values (the rest of each key is iD's)
const onlyValues = {
    amenity: ['parking', 'parking_space'], natural: ['grassland'], landuse: ['grass'], landcover: ['grass'], power: ['catenary_mast', 'generator'],
    emergency: ['phone'], man_made: ['gantry'], type: ['multipolygon', 'restriction', 'connectivity', 'enforcement'], shelter: ['yes'],
    'generator:source': ['solar'], 'generator:method': ['photovoltaic', 'thermal'], public_transport: ['platform'], service: [], usage: ['tourism']
};

/** A page's key and value, with the underscores the wiki's titles show as spaces (free text values keep theirs) */
const split = title => {
    const underscores = text => (/["+]/.test(text) ? text : text.replace(/ /g, '_'));
    if (title.startsWith('Key:')) return [underscores(title.slice(4)), null];
    const i = title.indexOf('=');
    return [underscores(title.slice(4, i)), underscores(title.slice(i + 1))];
};
const perLane = key => /(^|:)lanes(:|$)/.test(key) && !/^(source|note|fixme)/.test(key);

function sorter(code, groupOf) {
    const reads = key => code.keys.has(key) || routingKeys.has(key) || directional.includes(key) || families.some(f => key.startsWith(f));
    return title => {
        const [key, value] = split(title);
        const top = key.split(':')[0];
        const only = onlyValues[key];
        const drawn = value === null || value === '*' ? true : only ? only.includes(value) :
            !notDrawn[key]?.includes(value) && (code.named(key, value) || perLane(key));
        if (reads(key) && drawn) {
            if (routingKeys.has(key)) return [RENDERED, 'Routing tool: which vehicles may use the road or lane'];
            if ((top === 'name' || top === 'ref') && (value === null || value === '*')) return [RENDERED, 'Road shields and the panels; iD draws the names'];
            if (only && (value === null || value === '*')) {
                return [RENDERED, only.length ? `Only ${only.map(v => `\`${key}=${v}\``).join(', ')}; iD draws the rest` : 'Read, not drawn'];
            }
            return [RENDERED, ''];
        }
        if (perLane(key)) {
            return [COULD, reads(key.split(':lanes')[0]) ? 'Read per lane in the Lanes section, not drawn' : 'A per-lane value: could be drawn on the lanes'];
        }
        if (lifecycle.test(key)) return [CANNOT, reasons.life];
        if (hidden.test(key) || (value && hidden.test(`${key}=${value}`))) return [CANNOT, reasons.hidden];
        if (height.test(key)) return [CANNOT, reasons.height];
        const things = streetThings[top];
        if ((things && (value === null ? false : things.includes(value))) || (!things && streetKeys.has(top))) return [COULD, street];
        if (infoKey.test(key)) return [CANNOT, reasons.info];
        const answer = groupDefaults[groupOf(title, key)];
        if (answer === 'street') return [COULD, street];
        if (answer) return [CANNOT, reasons[answer]];
        if (/:(conditional|forward|backward|both|left|right)$/.test(key)) return [CANNOT, reasons.rule];
        return [CANNOT, things ? reasons.place : reasons.info];
    };
}


/** The guide page covering a key or tag Lane Studio draws (the Routing tool's keys: Tools) */
function guidePage(key, value) {
    const top = key.split(':')[0];
    const is = (k, values) => key === k && (!values || values.includes(value));
    if (routingKeys.has(key) || top === 'restriction' || key === 'except') return 'Tools';
    if (top === 'railway' || /:railway$/.test(key) || ['electrified', 'gauge', 'tracks', 'usage'].includes(key) || is('power', ['catenary_mast'])) {
        return 'Railways';
    }
    if (top === 'parking' || top === 'parking_space' || is('amenity') || key === 'capacity' || key === 'capacity:disabled') return 'Street-Parking';
    if (['junction', 'roundabout', 'turning_circle'].includes(top) || is('highway', ['mini_roundabout', 'turning_circle', 'turning_loop'])) return 'Junctions';
    if (['traffic_sign', 'enforcement', 'ref', 'name', 'destination', 'camera', 'brand'].includes(top) ||
        is('highway', ['speed_camera', 'toll_gantry', 'variable_message_sign', 'milestone', 'traffic_mirror', 'street_lamp', 'bus_stop']) ||
        is('man_made', ['gantry']) || is('emergency') || key === 'shelter') return 'Signs';
    if (['crossing', 'crossing_ref', 'traffic_signals', 'traffic_calming', 'road_marking', 'arrow', 'stroke', 'pattern', 'dasharray', 'barrier',
        'ford', 'colour', 'inscription', 'symbol', 'kerb'].includes(top) ||
        is('highway', ['crossing', 'stop', 'give_way', 'traffic_signals', 'passing_place', 'emergency_bay']) || is('footway', ['crossing']) ||
        is('cycleway', ['crossing', 'asl']) || is('path', ['crossing'])) return 'Crossings-And-Markings';
    if (['sidewalk', 'cycleway', 'shoulder', 'busway', 'bus_bay', 'segregated', 'verge'].includes(top)) return 'Roadside';
    if (['maxspeed', 'minspeed', 'overtaking', 'oneway', 'lane_markings', 'active_traffic_management', 'priority', 'dual_carriageway',
        'source', 'motorroad', 'toll'].includes(top)) return 'Road-Fields';
    if (['lanes', 'turn', 'width', 'change', 'placement', 'hov', 'bus', 'psv'].includes(top) || /(^|:)lanes(:|$)/.test(key)) return 'Lanes';
    return 'Areas-And-Surfaces';
}


/* ---------- the pages ---------- */

const pageName = group => `Tags-${group.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join('-')}`;
const title = group => group[0].toUpperCase() + group.slice(1);
const cell = text => String(text).replace(/\|/g, '\\|');

function writePages(rows, date, depth) {
    const byGroup = new Map();
    for (const row of rows) byGroup.set(row.group, [...(byGroup.get(row.group) ?? []), row]);
    const groups = [...byGroup.keys()].sort((a, b) => (a === 'other') - (b === 'other') || a.localeCompare(b));
    const count = (list, status) => list.filter(r => r.ls === status).length;

    fs.rmSync('docs/tags', { recursive: true, force: true });
    fs.mkdirSync('docs/tags');
    for (const group of groups) {
        const list = byGroup.get(group).sort((a, b) => a.key.localeCompare(b.key) || (a.value === null ? -1 : b.value === null ? 1 : a.value.localeCompare(b.value)));
        const lines = [
            `# Tags: ${title(group)}`,
            '',
            `The wiki's keys and tags in its group "${group}", and whether Lane Studio draws them ([Tag coverage](../TAGS.md)).`,
            `${list.length} keys and tags: ${count(list, RENDERED)} rendered, ${count(list, COULD)} could be, ${count(list, CANNOT)} cannot be.`,
            '',
            '| Key or tag | Wiki status | Lane Studio | Why, or how |',
            '| --- | --- | --- | --- |',
            ...list.map(r => {
                // a rendered row says where the guide covers it
                const where = r.ls === RENDERED ? `[${guidePage(r.key, r.value).replace(/-/g, ' ')}](../guide/${guidePage(r.key, r.value)}.md)` : '';
                const note = [cell(r.note), where].filter(Boolean).join('; ');
                return `| [\`${cell(r.value === null ? `${r.key}=*` : `${r.key}=${r.value}`)}\`](${WIKI}${encodeURI(r.title.replace(/ /g, '_')).replace(/\(/g, '%28').replace(/\)/g, '%29')}) | ${r.status === 'none' ? '—' : r.status} | ${r.ls} | ${note} |`;
            })
        ];
        fs.writeFileSync(`docs/tags/${pageName(group)}.md`, lines.join('\n') + '\n');
    }

    const total = rows.length;
    const lines = [
        '# Tag coverage',
        '',
        `Every key and tag the OpenStreetMap wiki documents, and whether Lane Studio draws it: ${total} in all, ` +
        `${count(rows, RENDERED)} rendered, ${count(rows, COULD)} could be, ${count(rows, CANNOT)} cannot be. One page per wiki group.`,
        '',
        '| Lane Studio | Means |',
        '| --- | --- |',
        `| ${RENDERED} | Drawn on the map, or used by the Routing tool (said so beside it), with the guide page covering it |`,
        `| ${COULD} | On or beside the street, where Lane Studio's layer could draw it, but does not yet |`,
        `| ${CANNOT} | Not a shape Lane Studio's street layer could draw; the reason is given |`,
        '',
        '| Group | Keys and tags | ✅ | 🟡 | ❌ |',
        '| --- | --- | --- | --- | --- |',
        ...groups.map(g => {
            const list = byGroup.get(g);
            return `| [${title(g)}](tags/${pageName(g)}.md) | ${list.length} | ${count(list, RENDERED)} | ${count(list, COULD)} | ${count(list, CANNOT)} |`;
        }),
        '',
        '## How it is made',
        '',
        `- Read from the wiki on ${date}: every English \`Key:\` and \`Tag:\` page in the trees of`,
        `  [Category:Tags](https://wiki.openstreetmap.org/wiki/Category:Tags) (${depth['Category:Tags'].categories} categories,`,
        `  ${depth['Category:Tags'].levels} levels deep) and [Category:Features](https://wiki.openstreetmap.org/wiki/Category:Features)`,
        `  (${depth['Category:Features'].categories} categories, ${depth['Category:Features'].levels} levels), translations left out, going`,
        '  deeper until a level adds no more keys or tags; and every one [Map features](https://wiki.openstreetmap.org/wiki/Map_features)',
        '  links to.',
        '- Kept: the statuses approved, de facto, in use, imported, undefined and none given. Left out: proposed and voting',
        '  pages, and deprecated, obsolete, discardable and imaginary ones (not for mapping).',
        '- Grouped by the wiki\'s groups (a tag without one takes its key\'s); "Other" has none.',
        '- Lane Studio\'s answer comes from its code (`modules/lanes/`): a key it reads, with the value named in the code, is',
        '  rendered; the rest is sorted by what it is (on the street, information, a place, land, a rule…). The sort is',
        '  automatic: report a wrong answer as an issue.',
        '- Made by `node scripts/build_tag_coverage.js` (needs network access): run it again when Lane Studio draws a new',
        '  key or value.'
    ];
    fs.writeFileSync('docs/TAGS.md', lines.join('\n') + '\n');
    console.log(`${total} keys and tags in ${groups.length} groups`);
}


async function main() {
    const at = process.argv.indexOf('--cache');
    const cache = at > 0 ? process.argv[at + 1] : null;
    let wiki;
    if (cache && fs.existsSync(cache)) wiki = JSON.parse(fs.readFileSync(cache, 'utf8'));
    else {
        wiki = await readWiki();
        wiki.date = new Date().toISOString().slice(0, 10);
        if (cache) fs.writeFileSync(cache, JSON.stringify(wiki));
    }
    const groupOf = (t, key) => wiki.group[t] ?? wiki.group[`Key:${key}`] ?? wiki.group[`Key:${key.split(':')[0]}`];
    const sort = sorter(readCode(), groupOf);
    const rows = [];
    for (const t of Object.keys(wiki.pages)) {
        const status = wiki.status[t] ?? 'none';
        if (!kept.has(status) || (t.startsWith('Tag:') && !t.includes('='))) continue;
        const [key, value] = split(t);
        const [ls, note] = sort(t);
        rows.push({ title: t, key, value, status, group: groupOf(t, key) ?? 'other', ls, note });
    }
    writePages(rows, wiki.date, wiki.depth);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
