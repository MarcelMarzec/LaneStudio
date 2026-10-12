# Lane Studio

Lane Studio is a road and lane editor for OpenStreetMap built on iD. It lives in this fork next to iD
and shares iD's map, history, OSM API, imagery, validator and save flow; lanes, pavements and road
markings are drawn on the map at their real width over aerial imagery and are edited where they
are drawn.

## Running it locally

```sh
npm clean-install
npm run all                         # builds CSS, data, icons and both apps (needs network)
ID_API_CONNECTION=dev npm start     # dev OSM server only, so test edits never reach the live map
```

Then open:

- http://127.0.0.1:8080/lanes.html for Lane Studio
- http://127.0.0.1:8080/ for plain iD

`npm start` rebuilds JavaScript and CSS on save. After editing `data/lanes.yaml`, run
`npm run build:data` (or restart) to rebuild the strings.

Before pushing: `npm run lint`, `npx tsc` and `npm run test:once`.

## Using it

Zoom levels: lanes, pavements, footways and mapped areas from zoom 17; lane lines, turn arrows,
crossings, stop and give way lines from zoom 18 (also where editing starts); labels, painted STOP
text and give-way triangles from zoom 19.

**Lanes** (sidebar section for a selected road)

- Click a lane on the map or in the lane strip to select it; shift-click to add lanes.
  `[` and `]` step to the lane left or right; Delete removes the selected lanes, never the road.
- Lane counts per direction with `+` and `−`.
- Inspector: direction of travel, position (move left or right), turn arrows, lane change,
  lane type, speed limits, destination, access, width, width and height limits, surface,
  and every other `*:lanes` tag on the road.
- Click the line between two lanes of the selected road to cycle its marking: dashed, solid,
  crossable one way, crossable the other way (`change:lanes`).

**Tools** (buttons in the Lanes section)

| Tool | What it does |
| --- | --- |
| Select | Click lanes to edit them |
| Paint | Pick a lane type or a value (turn, lane change, speed, access, surface, width), then click lanes to apply it, one undo step per click |
| Width | Drag lane lines and kerbs of the selected road; writes `width:lanes` in metres |
| Markings | Click a road to place a crossing, stop or give way sign, traffic signals, traffic calming or a mini-roundabout |
| Connect | Click the lane traffic comes from, then the lane on the next road; creates a `type=connectivity` relation (click the same pair again to remove it) |

Esc, clicking empty map or selecting nothing returns to Select.

Lane fields in the inspector work like iD's own fields: type or pick from the suggestions (speeds in
the country's units, access and surface values, widths, destinations used on nearby roads).

**Look ahead**: the roads the selected road leads on to (highlighted on the map), the exits at its
end with a suggested turn and the exit's sign text (written to the selected lanes only when you
click Turn or Destination), and "Copy lanes to the next road" (lane counts and lane tags, not turn
or destination lanes; one road per click).

**Roundabouts**: selecting a ring segment shows the whole ring, a turbo toggle for that segment
(`roundabout=turbo`, `change:lanes=no|no`), the segments still untagged, and the number of turn
restrictions against the six a standard turbo roundabout needs.

**Roadside**: pavement, cycleway and parking per side (`sidewalk:<side>`, `cycleway:<side>`,
`parking:<side>`). Lane Studio also looks at what is mapped next to the road:

- a separately mapped pavement on a side → "Set to mapped separately" (or a double-mapping warning);
- mapped `barrier=kerb` lines on both sides → the kerb-to-kerb width, with "Set width";
- traffic islands on the road are counted.

**Road markings** (sidebar section for a selected node on a road): what is there (crossing, stop,
give way, traffic signals, traffic calming, mini-roundabout), crossing markings, signals and refuge
island, the direction a sign applies to, all-way stop, and the kind of traffic calming.

**Islands, road markings and street parking** (sidebar section when one is selected):

- traffic islands (`area:highway=traffic_island`, `highway=traffic_island`, or
  `traffic_calming=island` + `area=yes`): surface and kerb. Islands are coloured by `surface`
  (`landuse=grass` counts as grass); untagged ones are drawn as concrete.
- `road_marking=*`: the marking, `stroke` (or `stroke:left` and `stroke:right`), `pattern`, `width`,
  `dasharray`, `colour`, and `inscription` for painted text on a node.
- street parking (`amenity=parking` with `parking=street_side|lane|layby|on_kerb|half_on_kerb`):
  where, direction, spaces, surface, and which road it is joined to.

**What is drawn**: lanes by type (bus, PSV, taxi, HOV, bicycle, pedestrian, no access), kerbs,
lane lines, turn arrows, labels; junctions; pavements and cycle and parking strips from road tags,
with unknown sides hatched; footways, paths, cycleways, steps and pedestrian streets at their real
width; crossing ways with zebra bars or lines; `area:highway=*` areas, pedestrian areas and traffic
islands; mapped kerbs styled by kerb height; crossings, stop and give way lines, signals, traffic
calming and mini-roundabouts on road nodes; `road_marking=*` lines, areas and text; street parking
with its bays and a layby joining it to the road; and lane connections. Everything else is drawn by
iD as usual.

**Junctions** (drawing only; no tags are written):

- The main road through a junction (the roundabout ring, or the road that carries on with the same
  ref, name or class) runs through; side roads stop at its kerb, and its kerbs and lane lines stop
  where they join.
- Where one road continues another, the lanes that carry on line up: the road with fewer lanes is
  shifted (unless it has `placement` tags), an added or dropped outer lane tapers over 25 m, and a
  one-way slip road starts where the lane leading into it ends. Which lanes carry on comes from a
  `type=connectivity` relation, else from `turn:lanes`.
- Dashed guide lines carry each lane through the junction box to the lanes it leads to, from its turn
  arrows and the exit angles; connectivity relations are drawn as solid blue curves instead.
- Roads shorter than 8 m get an outline and a marker you can click.

**Issues**: the "Lane tags" rule in iD's Issues pane checks lane tags everywhere on the map (value
counts, lane counts, unknown turn values, deprecated values, `hov=lane`, `destination` on two-way
roads) and offers a fix where the answer is certain.

## Putting it online (cPanel)

Lane Studio is a static site: no server code, just files.

1. **Register an OAuth 2 application** on openstreetmap.org (My Account → OAuth 2 applications →
   Register new application):
   - Name: Lane Studio
   - Redirect URI: `https://lanestudio.marcelmarzec.com/land.html` (or
     `https://marcelmarzec.com/lanestudio/land.html` if it lives in a folder)
   - Confidential application: **no** (it runs in the browser)
   - Permissions: read user preferences, modify user preferences, modify the map, read GPS traces,
     modify notes (the scopes iD asks for)

   Do the same on https://api06.dev.openstreetmap.org first, to test against the dev server.
2. **Build** with your client ID, in a `.env` file (git-ignored) or on the command line:

   ```sh
   ID_API_CONNECTION_URL=https://www.openstreetmap.org \
   ID_API_CONNECTION_API_URL=https://api.openstreetmap.org \
   ID_API_CONNECTION_CLIENT_ID=<your client id> \
   npm run all && npm run dist:lanes
   ```

   For the dev server use `ID_API_CONNECTION_URL=https://api06.dev.openstreetmap.org` and the dev
   client ID.
3. **Upload** the contents of `dist-lanes/` (including the hidden `.htaccess`) to the subdomain's
   document root with cPanel's File Manager or FTP. `index.html` must stay the page and `land.html`
   must sit next to it.
4. Open the site, log in, make one small test edit and check the changeset on openstreetmap.org:
   it should say `created_by=LaneStudio 0.1.0`.

Before going live: add a short privacy note to the site (adapted from iD's `PRIVACY.md`) and a wiki
page for Lane Studio that names its `created_by` value, and list it on the wiki's Editors page.

## How it fits into iD

| Part | Where |
| --- | --- |
| Entry point and boot | `modules/lanes/index.ts`, `modules/lanes/core/boot.ts`, `lanes.html` |
| Lane model (parse, edit, write `*:lanes` tags), lane types, markings, connectivity, street feature tags | `modules/lanes/model/` |
| Actions (lanes, markings, copy, connect), each one undo step | `modules/lanes/actions/` |
| Selected lanes, tools, keyboard, roadside detection | `modules/lanes/core/` |
| Geometry in metres: lanes, junctions and lane connections, street features, road markings, parking | `modules/lanes/geometry/` |
| Look-ahead corridor, roundabouts | `modules/lanes/osm/` |
| Map drawing and click targets | `modules/lanes/svg/` |
| Sidebar sections and welcome screen | `modules/lanes/ui/` |
| Lane tags validation rule | `modules/lanes/validations/` |
| Styles (built into `dist/lanes.css`) | `css-lanes/` |
| Strings (read as `t('_lanes.…')`) | `data/lanes.yaml` |
| Site packaging | `scripts/build_lanes_site.js` |
| Tests | `test/spec/lanes/` |

iD itself needed only small, default-preserving hooks, so iD at `index.html` behaves exactly as before:

| Hook | File | Default |
| --- | --- | --- |
| `context.createdBy()` for the changeset `created_by` tag | `modules/core/context.ts`, `modules/ui/commit.js` | `iD <version>` |
| `context.operationFilter()` to hide edit menu operations | `modules/core/context.ts`, `modules/modes/select.js` | none |
| `prefs.prefix()` for stored keys, saved edits and the edit lock | `modules/core/preferences.js`, `modules/core/history.ts` | no prefix |
| `localizer.addLocaleDir()` and `localizer.mergeStrings()` | `modules/core/localizer.ts` | none |
| `uiEntityEditorAddSection()` for extra sidebar sections | `modules/ui/entity_editor.js` | none |
| `coreValidatorAddRule()` for extra validation rules | `modules/core/validator.js` | none |
| Second esbuild entry, CSS bundle and strings file | `config/`, `scripts/` | iD unchanged |

Lane Studio saves changesets with `created_by=LaneStudio <version>`, keeps its saved edits and
preferences under a `lanes_` prefix, and writes `none` for unmarked lanes in new `turn:lanes` keys.

## Status

| Phase | State |
| --- | --- |
| 0. Shell and seams | Done |
| 1. Lane model | Done |
| 2. Lane rendering | Done |
| 3. Core map editing | Done |
| 4. Look ahead and destinations | Done |
| 5. Junctions, roundabouts, roadside editing | Done |
| 6. Validation and polish | Done |
| 7. Release | Packaging done; register OAuth apps, upload, privacy note and wiki page still to do |

Not built yet: `+` handles on the map itself, a full replacement of iD's sidebar, detailed turbo
roundabouts with one way per lane (drawn, not specially handled), `:conditional` lane tags (kept and
shown, not edited), and tests in a real browser against the dev server.
