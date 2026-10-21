# Lane Studio

Lane Studio is a road and lane editor for OpenStreetMap built on iD. It shares iD's map, history,
OSM API, imagery, validator and save flow; lanes, pavements and road markings are drawn on the map at
their real width over aerial imagery and are edited where they are drawn. The website is Lane Studio
only; iD's own page stays in the repository for development and comparison.

## Running it locally

```sh
npm clean-install
npm run all                         # builds CSS, data, icons, both apps and the site (needs network)
ID_API_CONNECTION=dev npm start     # dev OSM server only, so test edits never reach the live map
```

Then open:

- http://127.0.0.1:8080/lanes.html for Lane Studio
- http://127.0.0.1:8080/ for plain iD (development only; it is not part of the website)

`npm start` rebuilds JavaScript, CSS and Lane Studio's strings (`data/lanes.yaml`) on save.

Before pushing: `npm run lint`, `npx tsc` and `npm run test:once`.

## Using it

Zoom levels: lanes, pavements, footways and mapped areas from zoom 17; lane lines, turn arrows,
crossings, stop and give way lines from zoom 18 (also where editing starts); labels, painted STOP
text and give-way triangles from zoom 19.

**Top bar**: Selection (the default: select and edit roads, lanes and other features) and Routing,
then iD's Point, Line and Area for adding features.

**Routing** (top bar, or leave with Esc): editing is off and the sidebar shows the routes. Hover a lane
to see every route a vehicle in it can take, up to 450 m and four junctions on, in numbered colours,
with the lanes traffic comes from and the turns it may not take (red, with the reason); click to pin
them (the pin survives panning; click the map again to let go). Pick Car, Bus, Bicycle or Lorry: each
keeps to the lanes, access tags, height and weight limits and roads open to it. Routes follow turn
arrows, lane connections and turn restrictions (via nodes and via ways, including U-turns through the
gap of a dual carriageway), keep to their lane at the first junction and along links too short to
change lanes on, and leave a roundabout only by the exits the entry lane's arrows point to. Hover a
footway or pavement to see the streets reachable on foot and the crossings used.

**Lanes** (sidebar section for a selected road)

- Click a lane on the map or in the lane strip to select it; shift-click to add lanes.
  `[` and `]` step to the lane left or right; Delete removes the selected lanes, never the road.
- Lane counts per direction with `+` and `−`.
- Inspector: direction of travel, position (move left or right), turn arrows, lane change,
  lane type, speed limits, destination, access, width, width and height limits, surface,
  and every other `*:lanes` tag on the road.
- Click the line between two lanes of the selected road to cycle its marking: dashed, solid,
  crossable one way, crossable the other way (`change:lanes`).

**Settings** (the Lane Studio pane, first in the pane bar on the right, shortcut `K`)

- Lane surface opacity: 35% is the usual see-through look, 100% fully opaque, 0% invisible; the
  reset button returns to 35%. It applies to lanes, roads, pavements, footways and paths alike.
- Hide iD's lines and points under lanes: hides iD's own way lines, vertices, points and direction
  cones for everything Lane Studio draws. They can still be clicked, and hovering or selecting a road
  highlights Lane Studio's drawing of it. The selected road keeps a thin line and its nodes, so its
  nodes and midpoints can still be dragged to reshape it.

**Tools** (buttons in the Lanes section)

| Tool | What it does |
| --- | --- |
| Select | Click lanes to edit them |
| Paint | Pick a lane type or a value (turn, lane change, speed, access, surface, width), then click lanes to apply it, one undo step per click |
| Width | Drag lane lines and kerbs of the selected road; writes `width:lanes` in metres |
| Markings | Click a road to place a crossing, stop or give way sign, traffic signals, traffic calming or a mini-roundabout |
| Connect | Click the lane traffic comes from, then the lane on the next road; creates a `type=connectivity` relation (click the same pair again to remove it) |
| Signs | Pick a sign (UK signs, a variable message sign or a camera), then click a lane to place it beside the road facing that lane's traffic |

Esc, clicking empty map or selecting nothing returns to Select.

Lane fields in the inspector work like iD's own fields: type or pick from the suggestions (speeds in
the country's units, access and surface values, widths, destinations used on nearby roads).

**Look ahead**: the roads the selected road leads on to (highlighted on the map), the exits at its
end (for a road entering a roundabout, the roundabout's exits, numbered) with a suggested turn and the exit's sign text (written to the selected lanes only when you
click Turn or Destination), and "Copy lanes to the next road" (lane counts and lane tags, not turn
or destination lanes; one road per click).

**Roundabouts**: selecting a ring segment shows the whole ring, a turbo toggle for that segment
(`roundabout=turbo`, `change:lanes=no|no`), the segments still untagged, and the number of turn
restrictions against the six a standard turbo roundabout needs.

**Signs** (sidebar section for a selected sign or camera): which sign (`traffic_sign=GB:670[40]` and
the rest; several on one post), the value on it, the way it faces (`direction=*`, with Turn round),
and for cameras the enforced speed. UK signs are drawn as their pictures beside the road, other codes
as a plate with the code; variable message signs stand on their gantry (`man_made=gantry`), and an
average-speed camera system (`type=enforcement`) shows the stretch of road it covers.

**Roadside**: hard shoulders (with width; drawn 2.5 m wide until one is tagged), and pavement,
cycleway and parking per side (`sidewalk:<side>`, `cycleway:<side>`,
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

**Structures** (drawn on roads and paths; iD's own cutting and embankment triangles are hidden):
bridges (`bridge=*`) get parapets along their outer edges; tunnels and covered ways (`tunnel=*`,
`covered=yes`) are faded with dashed walls; cuttings and embankments (`cutting=*`, `embankment=*`:
`yes`/`both`, `left`, `right`) get slope wedges on that side, falling towards the road for a cutting
and away from it for an embankment; a ford way (`ford=*`) is drawn as water, and a ford node on a
road as a band of water across it.

**Under construction** (`highway=construction` + `construction=<type>`, or the `construction:highway=<type>`
lifecycle prefix): roads and paths are drawn as the type they will be, with their lanes, widths and
pavements, faded, with yellow and black work stripes and dashed orange kerbs, and without turn arrows,
lane lines or direction arrows. `highway=construction` without a type is left to iD.

**What is drawn**: lanes by type (bus, PSV, taxi, HOV, bicycle, pedestrian, no access), kerbs,
lane lines, turn arrows, labels; junctions; pavements and cycle and parking strips from road tags,
with unknown sides hatched; footways, paths, cycleways, steps and pedestrian streets at their real
width; crossing ways with zebra bars or lines; `area:highway=*` areas, pedestrian areas and traffic
islands; mapped kerbs styled by kerb height; crossings, stop and give way lines, signals, traffic
calming and mini-roundabouts on road nodes (a stop, give way or signals' line on a pedestrian
crossing, or up to 10 m past one, stands just before the crossing, and signals tagged as their
crossing draw the crossing with a line each way); `road_marking=*` lines, areas and text; street parking
with its bays and a layby joining it to the road; and lane connections. Everything else is drawn by
iD as usual.

**Surfaces**: `surface=*` (and `surface:lanes`) changes how carriageways, lanes, paths and mapped areas
look: asphalt, concrete, paving slabs, setts and gravel (as textures), unpaved, grass, wood and metal.
A road mapped as an area (`area=yes` + `highway=service` etc., or `area:highway=<road>`) is the road's
surface: ways inside it draw only their lane lines, arrows and special lanes. Shared foot and cycle
paths are striped with both colours, segregated ones split in two.

**Also drawn**: mini-roundabouts (a circular carriageway from `diameter=*` or the roads, the white
disc, and a give way line on each approach unless one is mapped); turning heads at road ends
(`highway=turning_circle|turning_loop`, shaped by `turning_circle=circle|oval|square|hammer|knuckle`,
a circle when untagged, sized by `diameter=*` or twice the road width): the road flares out into the
head with its kerb carried round, a pavement on the road is carried round it too, and a knuckle bulges
out on the outside of a bend. Hovering or clicking a mini-roundabout or turning head selects its node,
like a road. Road numbers in shields (UK colours: motorways blue, primary routes green, other A and B
roads white) and motorway junction numbers; speed limit roundels where the limit changes between two
roads that both have one, and minimum speed roundels; barriers on roads (gates and similar across the road, bollards and blocks
as posts, cattle grids) and on paths; fences, walls, guard rails, jersey barriers and hedges at their
width; and small direction arrows on the lanes of one-way roads (iD's own arrows on the way line are
hidden).

**Junctions** (drawing only; no tags are written):

- The main road through a junction (the roundabout ring, or the road that carries on with the same
  ref, name or class) runs through; side roads stop at its kerb, and its kerbs and lane lines stop
  where they join.
- Where one road continues another, the lanes that carry on line up: the road with fewer lanes is
  shifted (unless it has `placement` tags), an added or dropped outer lane tapers over 25 m, and a
  one-way slip road starts where the lane leading into it ends. Which lanes carry on comes from a
  `type=connectivity` relation, else from `turn:lanes`; a lane marked `merge_to_left` or
  `merge_to_right` is the one that ends, narrowing into the lane beside it from the side away from
  the centre line (`slight_*` arrows are not merges), and its arrow sits just before its taper. A
  shift holds for 30 m from the join, then fades out over 50 m.
- A link of 40 m or less with no arrows of its own (the stretch between the two halves of a dual
  carriageway crossroads) takes the arrows of the road leading into it, less the turns taken where it
  begins; an arrow that points to no road at a junction carries on ahead to the junction it is for.
  So the lanes going ahead line up straight through and a turning lane turns off at the far half.
  Roundabouts keep their own lanes.
- A mapped carriageway area belongs to the road lying mostly inside it (an area of ordinary road
  surface, asphalt or untagged, is drawn in the road colour): that road is shifted to sit in
  the middle of it (stop, give way and signal lines, symbols and crossings move with it), the area is
  drawn as its surface, and hovering or clicking the area selects that road. A road the area only
  touches, like the main road a side road's area reaches, is left as it is (no box, unbroken kerbs).
- Shifts are capped: lining up with a joining road moves a road by at most one lane (3.5 m), and
  fitting it to an area by at most half its width; bigger gaps mean the lanes or the area do not
  match, and moving that far would push the road into its neighbours.
- Junctions joined by a road shorter than 25 m are one junction: one box, and the short link is drawn
  only as lane guide lines. At a fork (a dual carriageway splitting) nothing runs through, so the
  carriageways stop where they meet.
- Junction boxes are a little lighter and bluer than the road. Their corners use each road's edges
  where it actually ends (a shifted or tapering road included), and curve round from one road's kerb
  to the next, with a kerb line. On the side a road joins, the box runs back along the main road to
  that road's corner (and the main road's kerb stops there), so a road joining at a shallow angle
  meets a smooth wedge. Where no traffic crosses the main road (round a roundabout, or a slip road
  leaving or joining a road that is one-way on both sides of the junction, on one side) the box is
  only the widening mouth outside the main road's edge, drawn in the road colour; a ring's outside
  is taken from its centre, and the mouth follows the ring's kerb. A roundabout's kerbs and lane
  lines run all the way round. Where two roads just join there is no box; where a road bends at a node, both halves are cut on the bisector of the
  bend so their lanes, kerbs and pavements meet exactly.
- Dashed guide lines carry each lane through the junction box to the lanes it leads to, along the
  lane's edges, from its turn arrows and the exit angles; connectivity relations are drawn as solid
  blue curves instead. A road running straight through with no gap gets no guides, and fragments
  shorter than 2 m are left out.
- Roads shorter than 8 m get an outline and a marker you can click.

**Issues**: the "Lane tags" rule in iD's Issues pane checks lane tags everywhere on the map (value
counts, lane counts, unknown turn values, deprecated values, `hov=lane`, `destination` on two-way
roads) and offers a fix where the answer is certain.

## Putting it online

Lane Studio is a static site: no server code, just files. `npm run all` ends by packaging it into
`dist-lanes/`: `index.html` (the Lane Studio page), `land.html` (where logins return), `dist/` (code,
styles, icons, data and translations) and an `.htaccess` for Apache hosts. The page loads its code and
styles with a stamp of their contents (`lanes.min.js?v=…`), so visitors get a new version as soon as
it is uploaded.

1. **Register an OAuth 2 application** on openstreetmap.org (My Account → OAuth 2 applications →
   Register new application):
   - Name: Lane Studio
   - Redirect URI: `https://<your domain>/land.html` (with the folder, if the site is in one)
   - Confidential application: **no**. Lane Studio runs in the browser and logs in with PKCE, so it
     has no client secret; anything built into the site is public.
   - Permissions: read user preferences, modify user preferences, modify the map, read GPS traces,
     modify notes (the scopes iD asks for)

   Register one on https://api06.dev.openstreetmap.org too if you want to test against the dev server.
2. **Deploy** with the **Deploy LaneStudio to server** workflow (Actions tab → Run workflow). It builds
   `mm/lane-studio-main` and uploads `dist-lanes/` over FTP. It needs:
   - repository **variable** `OSM_CLIENT_ID`: the application's client ID (Settings → Secrets and
     variables → Actions → Variables)
   - repository **secrets** `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`

   To build by hand instead, set the client ID in a `.env` file (git-ignored) or on the command line,
   and upload the contents of `dist-lanes/` (including the hidden `.htaccess`) to the web root:

   ```sh
   ID_API_CONNECTION_URL=https://www.openstreetmap.org \
   ID_API_CONNECTION_API_URL=https://api.openstreetmap.org \
   ID_API_CONNECTION_CLIENT_ID=<your client id> \
   npm run all
   ```
3. Open the site, log in, make one small test edit and check the changeset on openstreetmap.org:
   it should say `created_by=LaneStudio <version>` (the version in the footer).

The site's privacy note is [PRIVACY.md](PRIVACY.md). Still worth doing: a wiki page for Lane Studio
that names its `created_by` value, listed on the wiki's Editors page.

## How it fits into iD

| Part | Where |
| --- | --- |
| Entry point and boot | `modules/lanes/index.ts`, `modules/lanes/core/boot.ts`, `lanes.html` |
| Lane model (parse, edit, write `*:lanes` tags), lane types, markings, connectivity, street feature tags | `modules/lanes/model/` |
| Actions (lanes, markings, copy, connect), each one undo step | `modules/lanes/actions/` |
| Selected lanes, tools, keyboard, settings, roadside detection | `modules/lanes/core/` |
| Geometry in metres: lanes, junctions and lane connections, street features, road markings, parking | `modules/lanes/geometry/` |
| Look-ahead corridor, roundabouts | `modules/lanes/osm/` |
| Map drawing and click targets | `modules/lanes/svg/` |
| Sidebar sections, settings pane and welcome screen | `modules/lanes/ui/` |
| Lane tags validation rule | `modules/lanes/validations/` |
| Styles (built into `dist/lanes.css`) | `css-lanes/` |
| Strings (read as `t('_lanes.…')`) | `data/lanes.yaml` |
| Version shown in the footer and written to changesets | `modules/lanes/version.ts` |
| Routing | `modules/lanes/geometry/routing.ts`, `modules/lanes/core/lane_routing.ts`, `modules/lanes/core/mode_routing.ts`, `modules/lanes/ui/routing_panel.ts`, `modules/lanes/svg/routing.ts` |
| Site packaging (`npm run site`, the last step of `npm run all`) | `scripts/build_lanes_site.js` |
| Tests | `test/spec/lanes/` |

iD itself needed only small, default-preserving hooks, so iD at `index.html` (development only) behaves
as before, except that every build packages the Lane Studio site and offers one OSM server when one is
configured:

| Hook | File | Default |
| --- | --- | --- |
| `context.createdBy()` for the changeset `created_by` tag | `modules/core/context.ts`, `modules/ui/commit.js` | `iD <version>` |
| `context.operationFilter()` to hide edit menu operations | `modules/core/context.ts`, `modules/modes/select.js` | none |
| `prefs.prefix()` for stored keys, saved edits and the edit lock | `modules/core/preferences.js`, `modules/core/history.ts` | no prefix |
| `localizer.addLocaleDir()` and `localizer.mergeStrings()` | `modules/core/localizer.ts` | none |
| `uiEntityEditorAddSection()` for extra sidebar sections | `modules/ui/entity_editor.js` | none |
| `uiInitAddPane()` for extra map panes | `modules/ui/init.js` | none |
| `uiTopToolbarAddTool()` for extra top bar tools | `modules/ui/top_toolbar.js` | none |
| `uiVersionSetProduct()` for the version in the footer | `modules/ui/version.js` | iD's version |
| `coreValidatorAddRule()` for extra validation rules | `modules/core/validator.js` | none |
| Second esbuild entry, CSS bundle and strings file (`scripts/build_lanes_strings.js`) | `config/`, `scripts/` | iD unchanged |

Lane Studio saves changesets with `created_by=LaneStudio <version>`, keeps its saved edits and
preferences under a `lanes_` prefix, and writes `none` for unmarked lanes in new `turn:lanes` keys.

## Status

Lane Studio is in use and deployed from `mm/lane-studio-main`; see [CHANGELOG.md](CHANGELOG.md) for
what each version added.

Not built yet: `+` handles on the map itself, a full replacement of iD's sidebar, detailed turbo
roundabouts with one way per lane (drawn, not specially handled), `:conditional` lane tags (kept and
shown, not edited), translations of Lane Studio's own strings (English only), and tests in a real
browser against the dev server.
