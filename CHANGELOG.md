# Lane Studio changelog

What changed in Lane Studio, newest first. Every change is a new version, named by its date,
`YY.MM.DD` (`v26.10.21` is 21 October 2026), with `r2`, `r3` … for later changes the same day
(`v26.10.21r2`). Versions up to 26.10.21 were releases gathering several days of work, listed by day.

Before versions were dates, builds were numbered 0.1.0 (12 to 21 October) and 0.2.0 (briefly on
21 October); each day's work is listed here under its date. Lane Studio is built on iD 2.43.0-dev;
for the changes in iD itself, see [iD's changelog](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md).

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
