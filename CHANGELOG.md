# Lane Studio changelog

What changed in Lane Studio, newest first. Every change is a new version, named by its date,
`YY.MM.DD` (`v26.10.21` is 21 October 2026), with `r2`, `r3` … for later changes the same day
(`v26.10.21r2`). Versions up to 26.10.21 were releases gathering several days of work, listed by day.

Before versions were dates, builds were numbered 0.1.0 (12 to 21 October) and 0.2.0 (briefly on
21 October); each day's work is listed here under its date. Lane Studio is built on iD 2.43.0-dev;
for the changes in iD itself, see [iD's changelog](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md).

# 26.10.28r12
##### 2026-Oct-28

#### Lanes and junctions
* A two-way road joining a stretch with centre right turn lanes (a staggered junction, as on Holbeach
  Road, Spalding) is no longer shifted a lane sideways with a step in its kerb: its two directions part
  smoothly about the centre, with a hatched ghost island between them
* A diagonal white line crosses a centre lane where its traffic changes direction (back-to-back right
  turn lanes)
* Zebra bars and hatching in micro-mapped areas run along the area's length, not its diagonal

#### Roads and signs
* Traffic calming is drawn in full: humps, tables and cushions with their white triangles, painted
  tables, bumps, mini bumps, rumble strips, dips, chokers, chicanes, islands, choked tables and islands,
  `;` lists and `direction=*`; every kind can be picked under Road markings
* A passing place's side can be picked as Forward, Backward or Both under Road markings, and its bay is
  easier to see
* An unmarked or untagged crossing no longer shows as a black band across the road

#### Editing
* With lanes selected, their speed limits come after their turn arrows
* Inactive turn arrow and lane change buttons are clearly visible on the dark theme

# 26.10.28r11
##### 2026-Oct-28

#### Editing
* Fixed since the last version: nodes Lane Studio draws (signals, crossings, gates, buffer stops…) showed
  iD's empty white markers and direction cones; iD no longer draws them at all, only its highlight when
  one is hovered or selected
* iD's fill along the edge of a car park, parking space or highway area is no longer drawn over the
  roads beside it (the car park by Boston station)
* Roadside's sides are Forward and Backward, by the traffic beside them, in place of Left and Right
* The what's new menu waits for iD's prompt to restore unsaved changes (or the welcome screen) to close,
  rather than not showing at all
* Footways, paths and cycleways are drawn under the roads; crossings, and paths on bridges, over them

#### Roads and signs
* A limit after the national limit or a motorway is painted on the road (50 after the national limit
  on Skegness Road was missing); every change between limits, the national limit, motorways and 20 zones
  is checked
* Selected lanes have the same speed signs as the whole road, limit types included
  (`maxspeed:type:lanes`), with the lower national limit for some vehicles
* Passing places (`highway=passing_place`) are drawn as a bay of road on the side `passing_place=*`
  gives, or both

#### Lanes and junctions
* Micro-mapping follows the Street area proposal: only `area:highway` areas stand in for turning heads;
  bus, taxi and hard shoulder areas are painted inside the road's area; hatching follows `direction=*`

# 26.10.28r10
##### 2026-Oct-28

#### Editing
* iD's icons are no longer drawn over features Lane Studio draws itself, such as buffer stops, crossings,
  gates, signs and road markings; their markers stay, to click and drag

# 26.10.28r9
##### 2026-Oct-28

#### Lanes and junctions
* A one-way road that gives way, stops or has traffic signals at its end is no longer moved sideways to
  merge into a lane of the road it meets: Lister Way at Sleaford Road, Boston, was drawn a lane over,
  across the pavement and cycle path

#### Editing
* Brand logos are drawn over every other area and feature, not under them

# 26.10.28r8
##### 2026-Oct-28

#### Roads and signs
* The Speed Limit tool colours merged junctions (round the roundabout by Asda on Lister Way),
  mini-roundabouts, turning heads and roads mapped as areas, which stayed grey
* Where the limit becomes the national limit, its sign (a white disc with a black band) is painted on
  the road, and where a road becomes a motorway, the blue motorway sign
* With lanes selected, their speed limit and minimum speed are in a box laid out like the whole road's,
  saying what the road's limit is, with a **Whole road** button to go back to the road

#### Editing
* Car parks and parking spaces can be hovered and selected anywhere on their surface, not only on
  their edge
* **Hide land use** in the Lane Studio pane hides `landuse=*` alone; Map Data's Land Use also hides car
  parks and other surfaces
* Brand logos: a shop, restaurant or other feature with `brand:wikidata` shows its brand's logo from
  Wikidata in place of its marker (turned off with **Show brand logos** in the Lane Studio pane)

#### Lanes and junctions
* Micro-mapping (`area:highway=*`): junction and turning circle areas stand in for Lane Studio's own
  junction boxes and turning heads; `emergency` and `prohibited` areas are hatched; crossings mapped as
  areas get zebra bars (or a dashed edge for a cycle crossing); steps, bridleway and corridor areas are
  drawn as pavement; and every highway area can be selected anywhere on its surface

# 26.10.28r7
##### 2026-Oct-28

#### Roads and signs
* In the Speed Limit tool, a limit set by its type has a pattern over its colour, so it stands apart
  from a plain `maxspeed`: diagonal bands for the national limit, blue stripes for a motorway, dots
  for a 20 zone and cross-hatching for a restricted road, with what each means under the colours in
  the panel

# 26.10.28r6
##### 2026-Oct-28

#### Roads and signs
* The UK speed limit types are signs beside the speed roundels, in place of a separate Speed limit
  type field: national limit on a single or dual carriageway, motorway, restricted road, and a new
  **20 mph zone** (`maxspeed:type=GB:zone20`), which is kept apart from a plain 20 mph
* The Speed Limit tool offers the same signs as a selected road, so it can set every limit type
* Junctions are coloured in the Speed Limit tool, by their roads' limit, or the main road's where they
  differ, and lanes running between traffic islands (round the roundabout by Asda on Lister Way) are
  coloured instead of staying grey
* Speed limit roundels are painted again where a road splits into a dual carriageway and its limit
  changes (Lister Way), and a road tagged with only a `maxspeed:type` (a 20 zone, a restricted road)
  gets its limit painted
* The Speed Limit button in the top bar always shows its 30, not only while the tool is on
* Speed roundel tooltips no longer overlap themselves or run off the side of the sidebar

#### Railways
* Level crossings follow the Office of Rail and Road's typical layouts: full barriers are two booms
  meeting in the middle on each side, booms narrow to the tip, and the light units have the red and
  white chequered border
* User worked crossings (`crossing:activation=user`) get a braced gate on each side with its swing,
  and miniature warning lights in place of road traffic light signals
* Open crossings get a St Andrew's cross on its own post and give way lines (`crossing=uncontrolled`,
  `crossing:saltire`); `crossing:barrier=yes`, `crossing:light=no`, `crossing:surface`,
  `crossing:whistle` (whistle boards beside the line) and `crossing=informal` are drawn too
* Level crossings no longer draw their own double white centre lines on the approach, which didn't line
  up with the road's centre (Sleaford Road)

#### Editing
* The Lane Studio settings button on the right shows the logo's lines and arrows in the button's
  colour, without the black tile and its uneven corners

# 26.10.28r5
##### 2026-Oct-28

#### Roads and signs
* Minimum speeds: blue roundels set `minspeed` on a selected road and `minspeed:lanes` on selected
  lanes, and the Speed Limit tool has a Minimum speed switch that colours lanes by their minimum speed
  and sets it with a click (shift-click: one lane)
* A selected road's **Speed limit type** sets the UK limits from the wiki with their speed:
  `GB:nsl_single` (60 mph), `GB:nsl_dual` (70 mph), `GB:motorway` (70 mph) and `GB:nsl_restricted`
  (30 mph), with the lower limit for vehicles towing caravans or trailers, buses and HGVs shown under it
* A road tagged only with `maxspeed:type` (or `source:maxspeed`) is coloured by the limit its type sets,
  and the national speed limit on a motorway is tagged `GB:motorway`

#### Editing
* Roadside is laid out as iD's own fields: one field each for hard shoulder, pavement, cycleway and
  parking, with a Left and a Right dropdown, in place of rows of radio buttons
* Look ahead is tidier: one line per road with its lanes and distance, one line per exit, and a
  number field with `−` and `+` for how many roads to follow
* Look ahead and Roadside fold away like iD's sections, and stay as you left them
* Every dropdown in the Lanes section is an iD dropdown with iD's placeholder (its first few choices,
  or "Multiple Values"), including the lane type and the Markings, Signs and Paint pickers

# 26.10.28r4
##### 2026-Oct-28

#### Editing
* The Lane Studio settings pane's button on the right of the map shows Lane Studio's logo in black and
  white, in place of three plain lanes

# 26.10.28r3
##### 2026-Oct-28

#### Roads and signs
* A parking space drawn with its bay lines (`amenity=parking_space`) no longer has iD's parking icon in the middle of it

# 26.10.28r2
##### 2026-Oct-28

#### Website
* Lane Studio's logo has orange turn arrows, the same orange as the website, in place of light blue:
  beside the name above the sidebar, on the browser tab, on the website, in the README and on
  marcelmarzec.com

# 26.10.28
##### 2026-Oct-28

#### Website
* The website at lanestudio.marcelmarzec.com uses the editor's logo (the three-lane road with a turn
  arrow in each lane) as its icon and beside its name, in place of the orange placeholder
* The logo is saved in the repository as `docs/img/lane-studio-logo.svg` and shown at the top of the
  README

# 26.10.27r4
##### 2026-Oct-27

#### Website
* One deploy, **Deploy LaneStudio to server**, now uploads both the editor (to `/editor/`) and the
  website (to the root of lanestudio.marcelmarzec.com), or either one on its own, each with its own
  FTP account

# 26.10.27r3
##### 2026-Oct-27

#### Website
* The Lane Studio website (overview, changelog and privacy policy) now lives in this repository, in
  `LanesWebsite/`, and is served at lanestudio.marcelmarzec.com instead of marcelmarzec.com/lanestudio,
  with the editor at lanestudio.marcelmarzec.com/editor
* Each website deploy carries the current changelog to the changelog page, and the privacy policy now
  covers the website's own pages

# 26.10.27r2
##### 2026-Oct-27

#### Website
* The guides, FAQ, privacy policy and accessibility notes now cover the Speed Limit tool, railways and level
  crossings, parking spaces, traffic islands and the what's new menu
* You can support Lane Studio through GitHub Sponsors: the repository has a Sponsor button, and the README
  says how

#### Behind the scenes
* Every change now checks the documents it affects and keeps them up to date

# 26.10.27
##### 2026-Oct-27

#### Railways
* Level crossings are drawn as on British roads today, following the Highway Code (rules 291-299) and
  the Traffic Signs Regulations: barrier booms in red and white bands with red lamps along them and the
  barrier machine at the pivot (half barriers across the lanes coming in, on the traffic's left), the
  road traffic light signals on the nearside verge facing the traffic (two red lamps and an amber one
  on a black backboard edged white, over a "STOP when lights show" plate), a St Andrew's cross over
  the lights at an open crossing with no barriers, the white stop line, and double white centre lines
  on the approach of a two-way road; gates are white with a red target
* Signals are drawn as Network Rail colour-light signals, upright beside the line like traffic signs:
  a black head edged white with 2, 3 or 4 aspects (`railway:signal:main:states`) showing red, a distant
  signal showing yellow, and a ground position-light shunt signal (`railway:signal:shunting`), each
  over its white identification plate (`ref`), with a wedge showing which way it faces the trains
* A crossing for people over the line (`railway=crossing`) shows its panels and rails over the footway
  again

# 26.10.26r5
##### 2026-Oct-26

#### Railways
* Level crossings (`railway=level_crossing`) are drawn over the road: panels across it with the rails
  through them, barriers by `crossing:barrier` (`full`, `half`, `double_half`, `gates`), red lights and
  stop lines. Where a road crosses several tracks (Sleaford Road at Boston station) the barriers stand
  outside them all
* Crossings for people over the line (`railway=crossing`) get their panels, and tram crossings
  (`railway=tram_level_crossing`) their rails across the road
* Platforms (`railway=platform`) are drawn with a white edge and a yellow safety line on the side that
  faces the track
* Buffer stops, switches (with their point motor), derailers, signals (beside the line on the side
  tagged, facing the trains) and stop markers are drawn at the track
* Turntables and traversers are drawn as pits, a turntable with its bridge and rails
* The old course of an abandoned or razed line and a proposed line are drawn as a dashed trackbed,
  a monorail as its beam, and `railway:preserved=yes` lines as heritage lines (timber sleepers)

#### Roads and signs
* Parking spaces mapped as areas of their own (`amenity=parking_space`) are drawn with white bay lines
  on every side but the one facing the aisle or road, and coloured by `parking_space=*` (blue disabled
  bays with yellow lines and a wheelchair, green charging bays with a bolt, purple parent and child
  bays); car parks (`amenity=parking`, `parking=surface`) are drawn as asphalt

# 26.10.26r4
##### 2026-Oct-26

#### Lanes and junctions
* A two-way road dividing round an island into one-way roads (as Oak Spinney Park at Ratby Lane,
  Leicester) is drawn as the road widening into its two halves, with its kerbs carried on, instead of
  a small junction box with notches between the roads
* Junctions are drawn a shade lighter than the road rather than blue, so a junction with many links
  and islands (Ratby Lane and Wembley Road) reads as one road surface, not a patchwork
* Dashed guide lines show where a side road's lanes lead through a junction even with no turn arrows
  tagged: one lane to every road it can turn into, or several lanes shared out from left to right.
  They are a little fainter than guide lines from turn arrows, and leave out turns a restriction bans
  (`no_right_turn`, `only_left_turn` … now also on a road passing through the junction)

#### Behind the scenes
* The changelog copied into the build for the what's new menu is no longer kept in the repository

# 26.10.26r3
##### 2026-Oct-26

#### Behind the scenes
* A style fix in the what's new tests, so the code checks pass again

# 26.10.26r2
##### 2026-Oct-26

#### Website
* After an update, a what's new menu lists every version since the one you last used, with what changed
  in each; tick "Don't show what's new after updates" to stop it
* The Lane Studio settings have a new About Lane Studio section: show what's new after an update (on or
  off), see what's new at any time, and links to the website, privacy policy and contact page

# 26.10.26
##### 2026-Oct-26

#### Versions
* Every change to Lane Studio is now a version of its own (`v26.10.26`, `v26.10.26r2` …), shown in the
  footer and listed here; this version gathers everything since v26.10.21

#### Railways (new)
* Railways, the Underground and tram lines are drawn as track: grey ballast, concrete sleepers (timber on
  heritage and narrow gauge lines) and the rails at their gauge, `gauge` if tagged, else standard gauge
  (1435 mm) for main lines, the Underground, light rail and trams, 600 mm for narrow gauge and 184 mm for
  miniature lines. `tracks=2` and more lay tracks side by side, and conductor rails show where a line is
  `electrified=rail` (third rail) or `electrified=4th_rail` (the Underground)
* Tram rails are set in the road, drawn over its lanes with no ballast (unless tagged `embedded=no`);
  railways in tunnels are faded, disused track faded with rusty rails, and track being built striped
* Sleepers appear from zoom 18; railways pass under roads at level crossings

#### Performance
* The map is much quicker to use with lanes shown, most of all in busy towns: moving the pointer over the
  map no longer redraws every lane (about three times quicker on a dense test map), selecting a lane or
  changing tool reuses the lanes already worked out, and only shapes that changed are redrawn

#### Speed Limit tool (new)
* A Speed Limit tool in the top bar, next to Routing: every lane is coloured by its speed limit (its
  own `maxspeed:lanes`, else its road's `maxspeed`), and roads with no limit are drawn in red with a
  dashed edge. Footways and pedestrian ways are not coloured
* Pick a limit in the sidebar (or press 1 to 7 for 10 to 70 mph), then click a road to set it on that
  road; shift-click a lane to set it on that lane only. The national speed limit sets 60 mph
  (`GB:nsl_single`), or 70 mph on a dual carriageway (`GB:nsl_dual`). Esc lets go of the limit, then
  leaves the tool
* The sidebar shows how many roads in view have each limit, and lists the roads in view with no limit
  by name; click one to go to it. Limits are in mph only for now

#### Editing
* Speed limits are picked from a row of UK speed limit roundels (10 to 70 mph, the national speed
  limit, and none) in place of a text box, for the whole road and for selected lanes; the limit
  tagged now is highlighted, and a limit no roundel shows is written beside them

#### Lanes and junctions
* Footways, paths, cycleways and pedestrian ways are drawn over the roads, so where a path meets or
  crosses a road it shows; those in a tunnel or below ground (`layer` < 0) stay under the road
* Lanes now run between traffic islands at a junction instead of being lost in one grey junction box:
  a link between two junctions with islands beside it (`area:highway=traffic_island`, as at Ratby
  Lane and Wembley Road, Leicester) is drawn as whole lanes with their arrows and lane lines, can be
  clicked, and the islands are cut out of the junction's surface

#### Website
* A Lane Studio logo (a three-lane road with turn arrows) and name at the top left, above the
  sidebar, and as the page's icon in the browser tab

# 26.10.21
##### 2026-Oct-21

#### Routing tool (new)
* A Routing tool in the top bar, next to Selection: editing is off, and hovering a lane shows every
  route a vehicle in it can take through the junctions ahead, in numbered colours, with the lanes
  traffic comes from and the turns it may not take (and why); hovering a footway or pavement shows
  where people can walk within 250 m and the crossings used. Click to pin the routes
* Car, bus, bicycle and lorry each keep to the lanes, roads, height and weight limits open to them
* Routes follow turn arrows, lane connections and turn restrictions, including those via ways (a
  U-turn through the gap of a dual carriageway) and their exceptions; roundabout exits follow the
  arrows of the lane the route entered on
* The routes are listed in the sidebar, in place of the feature search, in iD's light and night themes
* The lane under the pointer is found whatever is drawn over it; pinned routes stay while the map is
  panned
* Routes keep to their lane along a link too short to change lanes on, and a route starting on such a
  link is held to the turn bans of the road leading into it
* A turn arrow for a turn banned at the first junction is for one further on: the lane carries on to
  the junction where that turn is allowed (John Adams Way past South Square to South End); the banned
  turn is still listed, and each vehicle's own exceptions apply
* Every lane of a roundabout carries on round it: the outer lanes of tight rings mapped as short ways
  (Liquorpond Street Roundabout, Boston) no longer route nowhere

#### Lanes and junctions
* Tight roundabouts mapped as many short ways: roads joining them stop clear of the ring instead of
  running across it, and on a ring tagged `lane_markings=no` joining lanes stop at its edge
* A lane marked `merge_to_left` or `merge_to_right` narrows into the lane beside it from the side away
  from the centre line, which runs straight on (`slight_*` arrows are not merges); two tapers ending
  together no longer splay the kerbs
* A short link with no arrows (the stretch between the two halves of a dual carriageway crossroads)
  takes the arrows of the road leading into it, so the lanes going ahead line up straight through and
  a turning lane gets its own path (Spilsby Road and Freiston Road, Boston); an arrow that points to no
  road at a junction carries on ahead
* A lane gained or lost at a junction, on a side no other road joins (a turn lane starting just past a
  junction), widens or narrows from the kerb instead of starting square
* Stop, give way and signal lines on a pedestrian crossing, or up to 10 m past one, stand before it;
  signals tagged as their crossing draw the crossing, with a line each way
* The U-turn arrow turns round to the right where traffic drives on the left

#### Website
* Selection (the default) and Routing in the top bar, before iD's Point, Line and Area, which are back
* The site build packages every icon (they could go missing), offers one OpenStreetMap server (no live
  / dev switch), and logs in with the site's own OAuth application
* Code and styles load with a stamp of their contents, so a deploy reaches visitors straight away
* The footer shows Lane Studio's version (`v26.10.21`), linking to its repository
* The README, guides, privacy policy and issue forms describe Lane Studio, a fork of iD written with
  Claude Code


# 26.10.19
##### 2026-Oct-19

#### Lanes and junctions
* Lanes joined by a lane connection keep their white dashed guide lines along both lane edges; the blue
  editing line shows only while connecting lanes or with one of the roads selected (connecting lanes
  by hand made the markings disappear)
* Every lane entering a roundabout is guided into the ring, and the ring's outer lanes peel off into
  exits leaving at a shallow angle
* At a shallow roundabout exit, the ring's kerb sweeps smoothly into the exit's kerb, and the ring's
  edge line no longer runs across the exit's lanes (Exhall Interchange, M6 J3)
* Guide lines onto a ring at a shallow angle (a spiral) end where the lanes they join start
* No gap where two halves of a ring of different widths meet; road surface under connected lanes
* Turn arrows stand just behind a stop line, give way line or traffic signals, and behind a crossing
  just before them


# 26.10.18
##### 2026-Oct-18

#### Roads and signs
* Hard shoulders, drawn beside the carriageway with an edge line, and edited by clicking them or in
  the Roadside section
* Variable-access lanes (opened by signs), with their own hatched style and lane type
* Traffic signs: UK signs drawn as their pictures, other codes on a plate, growing with zoom and
  standing at the near-side kerb of their traffic; variable message signs on their gantries; speed
  and red light cameras; average-speed sections
* A Signs tool to place signs, message signs and cameras facing a lane's traffic, and a sidebar
  section to change the sign, its value, a camera's limit and the way it faces
* Road number shields (motorways blue, primary routes green, other A and B roads white) and motorway
  junction numbers with their names
* Minimum speed roundels, and a lane's own speed limit where it differs
* Width and height limits show their units; weight limits per lane and for the road
* On-street parking drawn as road surface with bay markings; on-kerb parking on the pavement
* UK lane widths when none is tagged (3.65 m on motorways and main roads down to 2.75 m on
  residential streets)

#### Lanes and junctions
* Lanes and hard shoulders can be clicked wherever they are drawn, from zoom 17
* Slip roads leave from and join the outer lane of wide roads
* Roads join roundabouts cleanly at any angle and width, with smooth flares, and no seam shows where a
  road is split into pieces
* Roundabout entries and exits keep to their own lines instead of being shifted towards the ring

#### Editing
* Turn arrows and lane changes are icon buttons in the sidebar; roadside choices are radio buttons
* Signs, cameras and junction labels take clicks over their whole picture


# 26.10.13
##### 2026-Oct-13

#### Lanes and junctions
* Junction corners curve from one road's kerb to the next, with a kerb line; roads bending at a node
  are cut on the bisector, so their lanes and pavements meet exactly
* Junction boxes have their own colour and meet each road where it actually ends; where no traffic
  crosses the main road (roundabouts, one-way slip roads) only the mouth is drawn, and where two roads
  just join there is no box
* No pinched box where a dual carriageway runs into a two-way road; a road joining at a shallow angle
  meets a smooth wedge; roundabout kerbs and lane lines run all the way round
* Shifts to line lanes up are capped at one lane; a mapped carriageway area belongs to the road mostly
  inside it
* No guide lines for roads running straight through, or shorter than 2 m; no spikes at piece ends
* A merging lane's arrow sits just before its taper

#### Roads
* Turning circles, loops and hammerheads shaped by `turning_circle=*`, flaring out of the road with
  the kerb and pavement carried round; they and mini-roundabouts select like roads
* Bridges with parapets, tunnels and covered ways faded with walls, cuttings and embankments with
  slopes, and fords
* Roads and paths under construction drawn as what they will be, faded, with work stripes
* Footways and pavements in stronger colours that follow the opacity setting

#### Editing
* With iD's lines hidden, the selected road keeps a thin line and its nodes, so it can be reshaped


# 26.10.12
##### 2026-Oct-12

First day: Lane Studio created on top of iD.

#### Lanes on the map
* Every lane drawn at its real width from zoom 17, with lane lines from `change:lanes` and turn arrows
  from zoom 18 and labels from zoom 19; pavements, cycle lanes and parking strips from the road's tags
* Lane types (bus, PSV, taxi, HOV, cycle, pedestrian, no access) by colour; surfaces (asphalt,
  concrete, paving, setts, gravel, unpaved, grass, wood, metal) as textures, per lane too
* Turn arrows share one stem, so combined arrows read as one; small direction arrows on the lanes of
  one-way roads

#### Editing lanes
* Click a lane to select it (shift-click for more); `[` and `]` step between lanes; Delete removes the
  selected lanes, never the road; lanes can be reordered
* A Lanes section: lane counts per direction, a lane strip, and an inspector for direction, turn
  arrows, lane change, type, speed, destination, access, width, limits, surface and any other lane
  tag, with iD-style fields and suggestions
* Click the line between two lanes to cycle its marking
* Paint, Width, Markings and Connect tools; Esc or clicking empty map returns to Select; every edit is
  one undo step

#### Junctions
* The main road or roundabout runs through; side roads stop at its kerb, where its kerb and lane lines
  stop too
* Lanes that carry on line up; added or dropped outer lanes taper; slip roads start where their lane
  ends; a lane marked to merge is the one that ends
* Junctions joined by roads under 25 m drawn as one box following the roads; forks; guide lines carry
  each lane through along its edges
* Signals and stop lines on a junction node go on its approaches
* Very short roads get an outline and a marker to click

#### Street features
* Footways, paths, cycleways, steps and pedestrian streets at their real width; shared and segregated
  paths; crossing ways with zebra stripes or lines
* Crossings, stop and give way lines (with painted STOP and triangles), signals and traffic calming on
  road nodes, edited in a Road markings section
* Mapped areas: `area:highway=*`, pedestrian areas, traffic islands by surface; kerbs by height;
  `road_marking=*` lines, areas and text
* Street parking strips, parking areas with bays and laybys
* Mini-roundabouts, turning circles, speed limit roundels where the limit changes, and barriers (gates,
  bollards, cattle grids, fences, walls, guard rails, hedges)
* Roads mapped as areas, and roads fitted into mapped carriageway areas (their markings follow)

#### Look ahead and roundabouts
* Look ahead: the roads a selected road leads on to, its exits with a suggested turn and destination
  (a roundabout's exits numbered), and copying lanes to the next road
* Selecting a roundabout shows the whole ring, a turbo toggle, untagged segments and the turn
  restrictions a turbo roundabout needs
* Lane connections (`type=connectivity`) drawn, and made with the Connect tool

#### Checks, settings and site
* A lane tags rule in iD's Issues pane, with fixes where the answer is certain
* A Lane Studio welcome screen
* A Lane Studio pane (`K`): lane opacity, and hiding iD's own lines under what Lane Studio draws;
  hovering and selecting highlight Lane Studio's drawing; the sidebar follows iD's light and dark themes
* Packaged as a static website, with logins returning to the site
