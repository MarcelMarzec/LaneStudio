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

Zoom levels: lanes, pavements, footways, railways and mapped areas from zoom 17; lane lines, turn
arrows, crossings, stop and give way lines, railway sleepers and parking bay lines from zoom 18 (also
where editing starts); labels, painted STOP text and give-way triangles from zoom 19.

Lane Studio's name and logo are at the top left, above the sidebar. After an update, a **what's new**
menu lists every version since the one you last used, with what changed in each (from
[CHANGELOG.md](CHANGELOG.md)); tick "Don't show what's new after updates" to stop it, or turn it back on
in the settings. When the welcome screen or iD's prompt to restore unsaved changes is open, it waits until
that is closed.

**Lanes when none are tagged**: two lanes, one each way (one way: one lane), including service roads; a
single lane shared by both directions on a track, a driveway, an alley, a drive-through or an emergency
access road (`service=*`), or a service road tagged `narrow=yes` or narrower than 4.5 m.

**Top bar**: Selection (the default: select and edit roads, lanes and other features), Routing and
Speed Limit, then iD's Point, Line and Area for adding features.

**Routing** (top bar, or leave with Esc): editing is off and the sidebar shows the routes. Hover a lane
to see every route a vehicle in it can take, up to 450 m and four junctions on, in numbered colours,
with the lanes traffic comes from and the turns it may not take (red, with the reason); click to pin
them (the pin survives panning; click the map again to let go). Pick Car, Bus, Bicycle or Lorry: each
keeps to the lanes, access tags, height and weight limits and roads open to it. Routes follow turn
arrows, lane connections and turn restrictions (via nodes and via ways, including U-turns through the
gap of a dual carriageway), keep to their lane at the first junction and along links too short to
change lanes on, and leave a roundabout only by the exits the entry lane's arrows point to. Hover a
footway or pavement to see the streets reachable on foot and the crossings used.

**Speed Limit** (top bar, or leave with Esc): every lane is coloured by its limit (its own
`maxspeed:lanes`, else its road's `maxspeed`, or the limit its `maxspeed:type` sets), in mph: 10 to
70 mph in their own colours, other limits grey, and roads with no limit red with a dashed edge
(footways and pedestrian ways are not coloured). A limit set by its UK type rather than a number
alone has a pattern over its colour: diagonal black bands for the national limit, blue stripes for a
motorway, white dots for a 20 zone and cross-hatching for a restricted road, explained under the
colours in the panel. Junctions (merged ones too), mini-roundabouts, turning heads and roads mapped as
areas are coloured by their roads' limit where they agree, else by the main road's (the most major road
meeting there); inside a road area its general lanes are coloured too. The sidebar shows the colours with how many roads in
view have each, and lists the roads in view with no limit by name (click one to go to it). Pick a
limit (or press 1 to 7 for 10 to 70 mph), then click a road to set it on that road, or shift-click a
lane to set it on that lane only (`maxspeed:lanes`). The panel offers the same signs as the Lanes
section, the UK limit types included (set on whole roads only). Esc lets go of the limit, then leaves
the tool.

Switch the panel from **Speed limit** to **Minimum speed** to do the same with minimum speeds: blue
roundels, lanes coloured by their `minspeed:lanes` or their road's `minspeed` (roads with none are
drawn as usual), a click setting `minspeed` and a shift-click `minspeed:lanes`.

**Lanes** (sidebar section for a selected road)

- Click a lane on the map or in the lane strip to select it; shift-click to add lanes.
  `[` and `]` step to the lane left or right; Delete removes the selected lanes, never the road.
- Lane counts per direction with `+` and `−`.
- Inspector: direction of travel, position (move left or right), turn arrows, lane change,
  lane type, speed limits, destination, access, width, width and height limits, surface,
  and every other `*:lanes` tag on the road.
- Speed limits are picked from a row of UK roundels (10 to 70 mph, and none), the current one ringed,
  and minimum speeds from a row of blue ones: with no lane selected, the road's own (`maxspeed`,
  `minspeed`); with lanes selected, theirs (`maxspeed:lanes`, `minspeed:lanes`), in a box after the
  lanes' turn arrows, laid out like the road's, with the same signs (a limit type for lanes is written as `maxspeed:type:lanes`,
  with its limit in `maxspeed:lanes`) and lower limit, which says the road's limit (lanes with none of
  their own follow it) and has a **Whole road** button to let go of the lanes and edit the road.
- For a whole road, the UK limit types (wiki: Key:maxspeed:type) are signs beside the roundels, each
  setting its type and limit: the national limit on a single carriageway (`GB:nsl_single`, 60 mph) or a
  dual carriageway (`GB:nsl_dual`, 70 mph), a motorway (`GB:motorway`, 70 mph), a restricted road with
  street lights (`GB:nsl_restricted`, 30 mph) and a 20 mph zone (`GB:zone20`, signed with ZONE under
  the roundel: not the same as a plain 20). A plain number drops the type. A type in `source:maxspeed`
  is read too, and written as `maxspeed:type`; `maxspeed=national` alone is read by the kind of road.
  Under the signs, the lower limit the national limit sets for vehicles towing caravans or trailers,
  buses and minibuses up to 12 m and HGVs (50 mph, 60 mph on a dual carriageway; 60 mph on a motorway,
  where it doesn't apply to buses).
- Click the line between two lanes of the selected road to cycle its marking: dashed, solid,
  crossable one way, crossable the other way (`change:lanes`).

**Settings** (the Lane Studio pane, first in the pane bar on the right, its button Lane Studio's logo's
lane lines and arrows, shortcut `K`)

- Lane surface opacity: 35% is the usual see-through look, 100% fully opaque, 0% invisible; the
  reset button returns to 35%. It applies to lanes, roads, pavements, footways and paths alike.
- Hide iD's lines and points under lanes: hides iD's own way lines, vertices, points and direction
  cones for everything Lane Studio draws. They can still be clicked, and hovering or selecting a road
  highlights Lane Studio's drawing of it. The selected road keeps a thin line and its nodes, so its
  nodes and midpoints can still be dragged to reshape it.
- Hide land use: hides land use areas (`landuse=*`) alone, iD's and Lane Studio's. Map Data's Land Use
  filter also hides car parks and other surfaces; this keeps them.
- Show brand logos (on unless turned off): a shop, restaurant or other feature tagged
  `brand:wikidata=*` shows its brand's logo on a white tile in place of iD's marker (at a point, or in
  the middle of an area), from zoom 17, drawn over every other area and feature. The logo is the brand's small logo (P8972) or logo image (P154)
  on Wikidata, loaded from Wikimedia Commons; a brand without one keeps iD's marker. Clicking the tile
  selects the feature.
- About Lane Studio: "Show what's new after an update" (on unless turned off), "See what's new" (the
  latest versions' changes at any time), and links to the website, privacy policy and contact page
  (set in `modules/lanes/core/links.ts`).

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
the country's units, access and surface values, widths, destinations used on nearby roads). A field
with a fixed set of choices (lane type, the tools' marking, sign and paint pickers, roadside features)
is a dropdown that can't be typed in. As in iD, an empty field's placeholder shows its first few
choices ("Yes, No, Mapped separately…"), and a field whose selected lanes differ shows "Multiple
Values".

Look ahead and Roadside fold away like iD's own sections (click their heading), and stay as you
left them.

**Look ahead**: how many roads to follow (1 to 10, with `−` and `+`), then the roads the selected
road leads on to (highlighted on the map), one line each with its lanes and how far along it is, the exits at its
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
`parking:<side>`): one field each, with a Forward and a Backward dropdown as in iD's cycle lane field.
Forward is the side beside traffic going along the way's drawing direction (the way's left where traffic
drives on the left, its right elsewhere), backward the other; the tags stay `:left` and `:right`.
Lane Studio also looks at what is mapped next to the road:

- a separately mapped pavement on a side → "Set to mapped separately" (or a double-mapping warning);
- mapped `barrier=kerb` lines on both sides → the kerb-to-kerb width, with "Set width";
- traffic islands on the road are counted.

**Road features in iD's fields**: a crossing, stop, give way, traffic signals, traffic calming, mini-roundabout
or passing place on a road is set with iD's own preset and fields, to which Lane Studio adds what its drawing
reads: a **Traffic signals** check on every crossing (`crossing:signals`; ticking it makes the crossing a
crossing with traffic signals, `crossing=traffic_signals`, and unticking it an uncontrolled one, in the same
undo step), the **Type** dropdown
(`traffic_calming=*`) and **Direction Affected** on every kind of traffic calming, and **Direction Affected**
on a passing place. Whatever Lane Studio draws on a node follows its direction (`direction=forward|backward|both`,
or `traffic_signals:direction`): stop, give way and signal lines, a crossing's signals, traffic calming and a
passing place's bay.

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
width; crossings, on a node or as a way, painted by `crossing:markings` (wiki: Key:crossing:markings): a
zebra, a double zebra (two side by side), paired bars, a bicolour zebra (red and white), lines, paired lines,
a ladder (lines and bars), a skewed or paired ladder, dashes, dots, a coloured surface or pictograms (an
unmarked or untagged crossing leaves the road showing, with a faint dashed outline); `area:highway=*` areas, pedestrian areas and traffic islands; mapped kerbs
styled by kerb height; crossings, stop and give way lines, signals, traffic calming and mini-roundabouts on
road nodes (a stop, give way or signals' line on a pedestrian
crossing, or up to 10 m past one, stands just before the crossing, and signals tagged as their
crossing draw the crossing with a line each way); `road_marking=*` lines, areas and text; street parking
with its bays and a layby joining it to the road; passing places (`highway=passing_place`) as a bay
of road on the side `direction=forward|backward|both` gives (forward: beside traffic going along the road),
else `passing_place=left|right|both`, both when not tagged; and lane connections.
Footways, paths, cycleways and pedestrian ways are drawn under the roads; crossings (`footway=crossing`
and the like) over them, and paths on a bridge or above ground (`layer` > 0) over them too. Everything
else is drawn by iD as usual. A node Lane Studio draws as what it is (a crossing, a barrier, a sign, a
road marking, a passing place, a buffer stop or other railway equipment) is not drawn by iD as well: no
marker, icon or direction cone, only iD's highlight when it is hovered or selected (it can still be
clicked and dragged). Nor is iD's fill drawn along the edge of an area Lane Studio draws as a surface
(a car park, a parking space, a highway area), so it doesn't lie over the roads beside it.

**Parking spaces and car parks**: a parking space mapped as an area of its own
(`amenity=parking_space`) is drawn with white bay lines on every side but the one facing the aisle or
road it is driven into from, coloured by `parking_space=*`: blue with yellow lines and a wheelchair for
disabled bays, green with a bolt for charging, purple for parent and child, orange for motorcycles; iD's
parking icon in the middle of the bay is hidden. A car park (`amenity=parking` with no `parking=*` or `parking=surface`) is drawn as asphalt.
Car parks, parking spaces and mapped highway areas can be hovered and clicked anywhere on their surface,
not only on their edge.

**Railways** (wiki: Key:railway): track is drawn at its gauge, from `gauge` (mm) or the usual one:
1435 mm for main lines, the Underground, light rail and trams, 600 mm for narrow gauge, 184 mm for
miniature lines. Grey ballast, concrete sleepers (timber on heritage and narrow gauge lines and
`railway:preserved=yes`) and steel rails; `tracks=n` lays tracks side by side; conductor rails show for
`electrified=rail` (third rail) and `electrified=4th_rail` (the Underground's centre and outer rails).
Trams run in the road with their rails over its lanes, unless `embedded=no`. Tunnels are faded, disused
track has rusty rails, track being built is striped, and abandoned, razed and proposed lines are a
dashed trackbed; a monorail is its beam. Railways pass under the roads, except:

- **Level crossings** (`railway=level_crossing`), laid out as in the Office of Rail and Road's
  typical layouts and the Highway Code (rules 291-299):
  - panels and rails across the road, the panels coloured by `crossing:surface` (rubber, wood,
    concrete…); a `crossing=informal` crossing has the rails alone;
  - barrier booms in red and white bands, narrowing to the tip, with red lamps and the barrier machine
    at the pivot, by `crossing:barrier`: `half` across the lanes coming in, on the traffic's left;
    `full`, `double_half` and `yes` as two booms from the kerbs meeting in the middle;
  - `gates`: at a user worked crossing (`crossing:activation=user`) one gate across the road on each
    side, braced, between its posts, with the arc it swings through away from the line; otherwise a
    pair of white gates with red targets;
  - the road traffic light signals (two red lamps and an amber one on a black backboard with a red
    and white chequered border, over a "STOP when lights show" plate) on the nearside verge facing
    the traffic, from `crossing:light` or barriers that lower on their own (`crossing:light=no` turns
    them off); at a user worked crossing, miniature warning lights (red over green) instead;
  - a St Andrew's cross at an open crossing (`crossing:saltire`, or no barriers with lights or
    `crossing=uncontrolled`): above the lights, or on its own post;
  - the white stop line where there are barriers, gates or lights, or a give way line at an open
    crossing without lights;
  - whistle boards (a W) beside the line 40 m out each way where trains sound their horn
    (`crossing:whistle`).

  Where a road crosses several tracks, the barriers and lights stand outside them all.
- **Crossings for people** (`railway=crossing`) get their panels and rails over the path, and tram
  crossings (`railway=tram_level_crossing`) their panels and rails across the road.

Platforms (`railway=platform`, an area or a line 3 m wide or `width`) have a white edge and a yellow
safety line on the side that faces a track. Signals (`railway=signal`) stand upright beside the line
on the side tagged (`railway:signal:position`, the left by default), facing the trains
(`railway:signal:direction`): Network Rail colour-light heads with 2, 3 or 4 aspects
(`railway:signal:main:states`, else 3) showing red, distant signals showing yellow, and ground
position-light shunt signals (`railway:signal:shunting`), each over its identification plate (`ref`).
Buffer stops, switches (with their point motor), derailers and stop boards are drawn at the track, and
turntables and traversers as pits (a turntable with its bridge). Stations, stops, subway entrances and
railway buildings are left to iD's icons and buildings.

**Surfaces**: `surface=*` (and `surface:lanes`) changes how carriageways, lanes, paths and mapped areas
look: asphalt, concrete, paving slabs, setts and gravel (as textures), unpaved, grass, wood and metal.
A road mapped as an area (`area=yes` + `highway=service` etc., or `area:highway=<road>`) is the road's
surface: ways inside it draw only their lane lines, arrows and special lanes.

**Traffic calming** (wiki: Key:traffic_calming) on a road node is drawn as built and marked on British
roads, each value of a `;` list, across the lanes `direction=forward|backward` gives or all of them: a hump
or dynamic bump with a white triangle on each lane's approach ramp; a table (a paved flat top, triangles on
both ramps) and a painted table; a bump; mini bumps (a row of domes); a rumble strip (thin bars); cushions
(a pad in each lane, with its triangle); a dip or double dip (a dashed outline); a choker (the kerb built
out on both sides) and a chicane (on alternate sides); an island in the middle; and `choked_table` and
`choked_island` (a choker with a table or an island).

**Micro-mapping** (wiki: Key:area:highway, Proposal:Street area and the mapping guidelines): areas
tagged `area:highway=*`, the shape of a road mapped as a line, are drawn as what they are (a road mapped
as a routable area, `area=yes` + `highway=*`, is a plaza or service area, not micro-mapping):

- road areas (`area:highway=primary`, `residential`, `service`, `road`, `passing_place`, `escape`…)
  as the road's surface, with the road fitted inside (below); a junction area (`junction=yes`,
  `roundabout`, `y_junction`) is the junction's surface in place of Lane Studio's junction box, and a
  turning circle or loop area (`area:highway=turning_circle`, `turning_loop`, or a road area round a
  road's end) in place of its turning head;
- footway, pedestrian, path, steps, bridleway and corridor areas as pavement, cycleway areas as
  cycleway, verges as grass, traffic islands as islands;
- painted over the lanes, inside the road's area: hatching (`area:highway=emergency`, `prohibited`) in
  white bars along `direction=*` (degrees or a compass point; else at 45° to the area) edged white; bus
  and taxi areas (`bus`, `bus_stop`, `taxi_stop`) in the bus lane red; a hard shoulder (`shoulder`);
  a crossing area (`area:highway=footway` + `footway=crossing`) with zebra bars across the way people
  walk unless `crossing:markings` says otherwise, and a cycle crossing area (`area:highway=cycleway` +
  `cycleway=crossing`) with a dashed edge.

Highway areas are areas drawn from closed ways; multipolygons are not drawn yet. Shared foot and cycle
paths are striped with both colours, segregated ones split in two.

**Also drawn**: mini-roundabouts (a circular carriageway from `diameter=*` or the roads, the white
disc, and a give way line on each approach unless one is mapped); turning heads at road ends
(`highway=turning_circle|turning_loop`, shaped by `turning_circle=circle|oval|square|hammer|knuckle`,
a circle when untagged, sized by `diameter=*` or twice the road width): the road flares out into the
head with its kerb carried round, a pavement on the road is carried round it too, and a knuckle bulges
out on the outside of a bend. Hovering or clicking a mini-roundabout or turning head selects its node,
like a road. Road numbers in shields (UK colours: motorways blue, primary routes green, other A and B
roads white) and motorway junction numbers; speed limit roundels where the limit changes between two
roads that both have one (the road traffic arrives from is the one carrying lanes towards the change, so
a road splitting into a dual carriageway counts; a road with only a `maxspeed:type` is painted with its
limit), where the limit becomes the national limit its sign (a white disc with a black band) and where
it becomes a motorway's the blue motorway sign, and minimum speed roundels; barriers on roads (gates and similar across the road, bollards and blocks
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
- A one-way road joining a road that carries on at a shallow angle (a slip road) has its end moved onto
  the lane it becomes, unless it gives way, stops or has traffic signals within 30 m of its end: then it
  meets the road at a junction, on its own line (as Lister Way does at Sleaford Road, Boston).
- A two-way road joining one with centre turn lanes it has none of (back-to-back right turn lanes at a
  staggered junction, or a right turn lane starting) is not shifted: over its last 40 m its two
  directions part about the centre, so both kerbs taper out smoothly, and the opening between them is
  a hatched ghost island. Where a centre lane's traffic changes direction between two roads meeting end to
  end, a diagonal white line crosses it, from the centre line on one side 3 m before the node to the centre
  line on the other 3 m after it, and the lane lines along both its edges run up to the diagonal's ends.
- Shifts are capped: lining up with a joining road moves a road by at most one lane (3.5 m), and
  fitting it to an area by at most half its width; bigger gaps mean the lanes or the area do not
  match, and moving that far would push the road into its neighbours.
- Junctions joined by a road shorter than 25 m are one junction: one box, and the short link is drawn
  only as lane guide lines, except where the junction holds traffic islands
  (`area:highway=traffic_island`): there the links are drawn as whole lanes running between the
  islands, and the islands are cut out of the box. At a fork (a dual carriageway splitting) nothing
  runs through, so the carriageways stop where they meet.
- A two-way road dividing round an island into roads carrying on from it, at least one of them one-way
  (as Oak Spinney Park at Ratby Lane, Leicester), is no junction: the two-way road runs up to the node,
  each branch starts where it clears the other, and the space between is filled as road with the kerbs
  carried on.
- Junction boxes are a shade lighter than the road, so a junction reads as one road surface. Their corners use each road's edges
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
  blue curves instead. A side road (or a road at a junction with no main road) with no turn arrows
  still gets guide lines, a little fainter: one lane to every road it can turn into, or several lanes
  shared out from left to right, leaving out turns a restriction bans (`no_*`, `only_*`, for the side
  of a road passing through that the restriction's turn names). Mini-roundabouts get none. A road running straight through with no gap gets no guides, and fragments
  shorter than 2 m are left out.
- Roads shorter than 8 m get an outline and a marker you can click.

**Issues**: the "Lane tags" rule in iD's Issues pane checks lane tags everywhere on the map (value
counts, lane counts, unknown turn values, deprecated values, `hov=lane`, `destination` on two-way
roads) and offers a fix where the answer is certain.

## Putting it online

Lane Studio is a static site: no server code, just files. `npm run all` ends by packaging it into
`dist-lanes/`: `index.html` (the Lane Studio page), `land.html` (where logins return), `dist/` (code,
styles, icons, data, translations and the changelog for the what's new menu) and an `.htaccess` for
Apache hosts. The page loads its code and
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
2. **Deploy** with the **Deploy LaneStudio to server** workflow (Actions tab → Run workflow, then pick
   **editor and website**, **editor** or **website**). It builds `mm/lane-studio-main` and uploads
   `dist-lanes/` to `/editor/` and the website below to the web root, over FTP. It needs:
   - repository **variable** `OSM_CLIENT_ID`: the application's client ID (Settings → Secrets and
     variables → Actions → Variables)
   - repository **secrets** `FTP_SERVER`; `FTP_LANES_USERNAME` and `FTP_LANES_PASSWORD` for an FTP
     account that opens in the editor's folder (`/editor/`); `FTP_ROOT_USERNAME` and
     `FTP_ROOT_PASSWORD` for one that opens at the web root, for the website

   To build by hand instead, set the client ID in a `.env` file (git-ignored) or on the command line,
   and upload the contents of `dist-lanes/` (including the hidden `.htaccess`) to `/editor/`:

   ```sh
   ID_API_CONNECTION_URL=https://www.openstreetmap.org \
   ID_API_CONNECTION_API_URL=https://api.openstreetmap.org \
   ID_API_CONNECTION_CLIENT_ID=<your client id> \
   npm run all
   ```
3. Open the site, log in, make one small test edit and check the changeset on openstreetmap.org:
   it should say `created_by=LaneStudio <version>` (the version in the footer).

### The Lane Studio website

The pages that describe Lane Studio are a separate PHP site in `LanesWebsite/`, at the root of
lanestudio.marcelmarzec.com; the editor is in `/editor/` (register the OAuth redirect URI as
`https://lanestudio.marcelmarzec.com/editor/land.html`).

- `index.php` (overview), `changelog.php` (renders [CHANGELOG.md](CHANGELOG.md)), `privacy_policy.php`
  and `error.php`; `.htaccess` gives them clean URLs (`/changelog`, `/privacy_policy`) on Apache.
- `includes/`: the settings and links (`config.php`), header, navigation, footer, icons and the
  Markdown renderer. They are refused when requested directly.
- `assets/`: the stylesheet and images. `assets/img/lanestudio-mark.svg` is the editor's logo (the
  page icon and the mark beside the name in the header).

The **Deploy LaneStudio to server** workflow deploys it (choose **website** to deploy it alone). It
checks the PHP, copies `CHANGELOG.md` into `includes/changelog.md` for the changelog page and uploads
the folder to the web root with the `FTP_ROOT_*` account. It keeps its own upload record (`.ftp-deploy-website-state.json`), so it
never deletes the editor's files. Run locally with `php -S localhost:8000 router.php` in
`LanesWebsite/`; the changelog page then reads `CHANGELOG.md` from the repository.

The site's privacy note is [PRIVACY.md](PRIVACY.md). Still worth doing: a wiki page for Lane Studio
that names its `created_by` value, listed on the wiki's Editors page.

## How it fits into iD

| Part | Where |
| --- | --- |
| Entry point and boot | `modules/lanes/index.ts`, `modules/lanes/core/boot.ts`, `lanes.html` |
| Lane model (parse, edit, write `*:lanes` tags), lane types, markings, connectivity, street feature tags | `modules/lanes/model/` |
| Actions (lanes, markings, copy, connect), each one undo step | `modules/lanes/actions/` |
| Selected lanes, tools, keyboard, settings, roadside detection, the what's new state, links | `modules/lanes/core/` |
| Geometry in metres: lanes, junctions and lane connections, street features, road markings, parking, parking spaces, railways and their features | `modules/lanes/geometry/` |
| Look-ahead corridor, roundabouts | `modules/lanes/osm/` |
| Map drawing and click targets | `modules/lanes/svg/` |
| Sidebar sections, settings pane, welcome screen, what's new menu, logo, speed roundels | `modules/lanes/ui/` |
| The logo as an SVG file (for the README and anywhere else it is needed) | `docs/img/lane-studio-logo.svg` |
| Lane tags validation rule | `modules/lanes/validations/` |
| Styles (built into `dist/lanes.css`) | `css-lanes/` |
| Strings (read as `t('_lanes.…')`) | `data/lanes.yaml` |
| Version shown in the footer and written to changesets | `modules/lanes/version.ts` |
| Routing | `modules/lanes/geometry/routing.ts`, `modules/lanes/core/lane_routing.ts`, `modules/lanes/core/mode_routing.ts`, `modules/lanes/ui/routing_panel.ts`, `modules/lanes/svg/routing.ts` |
| Brand logos | `modules/lanes/core/brand_logos.ts` (looking them up on Wikidata), `modules/lanes/svg/brand_logos.ts` (drawing them) |
| Speed Limit tool | `modules/lanes/core/lane_speed.ts`, `modules/lanes/core/mode_speed.ts`, `modules/lanes/ui/speed_panel.ts`, `modules/lanes/ui/speed_roundels.ts`, `modules/lanes/model/speed_limits.ts` (the speed tags) |
| Railways | `modules/lanes/geometry/railway.ts` (track), `modules/lanes/geometry/rail_features.ts` (platforms, crossings, signals, equipment), `modules/lanes/svg/railway.ts` |
| Parking spaces and car parks | `modules/lanes/geometry/parking_spaces.ts`, `modules/lanes/svg/parking_spaces.ts` |
| What's new menu | `modules/lanes/core/whats_new.ts`, `modules/lanes/ui/whats_new.ts`; the build copies `CHANGELOG.md` to `dist/lanes-changelog.md` |
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
| `uiInitSetSidebarHeader()` for a header above the sidebar (Lane Studio's logo) | `modules/ui/init.js` | none |
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
