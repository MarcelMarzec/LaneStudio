# Lane Studio changelog

What changed in each version of Lane Studio. A version is the date it was released, `YY.MM.DD`
(`v26.10.21` is 21 October 2026), with `r2`, `r3` … for later releases on the same day (`v26.10.21r2`). Lane Studio is
built on iD 2.43.0-dev; for the changes in iD itself, see
[iD's changelog](https://github.com/openstreetmap/iD/blob/develop/CHANGELOG.md).

# Unreleased

#### Routing tool
* Every lane of a roundabout carries on round it: the outer lanes of tight rings mapped as short ways
  (Liquorpond Street Roundabout) no longer route nowhere
* A turn arrow for a turn banned at the first junction is for one further on: the lane carries on
  ahead to the junction where that turn is allowed; the banned turn is still listed as not allowed,
  and each vehicle's own exceptions apply

#### Lanes and junctions
* The U-turn arrow turns round to the right where traffic drives on the left
* A lane gained or lost at a junction, on a side no other road joins (a turn lane starting just past
  a junction), widens or narrows from the kerb instead of starting square


# 26.10.21
##### 2026-Oct-21 (first numbered 0.2.0)

#### Website
* The whole site is Lane Studio: `npm run all` ends by packaging `dist-lanes/` with every icon, data
  file and translation, after the rest of the build (it used to race the icon build and miss icons)
* The page loads its code and styles with a stamp of their contents, so a deploy reaches visitors
  straight away instead of after the browser cache expires
* The footer shows Lane Studio's version, linking to this repository
* One OpenStreetMap server: the live / dev switch is gone from the footer
* The deploy workflow builds with the site's own OAuth 2 client (`OSM_CLIENT_ID`)

#### Routing tool
* New Routing tool in the top bar, next to Selection: hover a lane to see every route from it for a
  car, bus, bicycle or lorry, the lanes traffic comes from, and the turns it may not take; hover a
  footway to see where people can walk; click to pin
* The routes are listed in the sidebar, in iD's light and night themes
* Turn restrictions via ways (U-turns through the gap of a dual carriageway), including for a route
  that starts part way along them
* Lanes keep to themselves along links too short to change lanes on; roundabout exits follow the
  arrows of the lane the route entered on
* Easier lane picking under the pointer, and pinned routes survive panning

#### Lanes and junctions
* Lanes marked `merge_to_left` / `merge_to_right` narrow into the lane beside them from the side away
  from the centre line
* A short link with no arrows (the stretch between the two halves of a dual carriageway crossroads)
  takes the arrows of the road leading into it, so the lanes going ahead line up straight through and
  a turning lane gets its own path; an arrow that points to no road at a junction carries on ahead
* Stop, give way and signal lines stand before a pedestrian crossing on the same spot or just before
  it; signals tagged as their crossing draw the crossing with a line each way
* Tight roundabouts mapped as many short ways: roads joining them stop outside the ring, lanes join the
  right ring lane, and unmarked rings get no guide lines
* Roads join roundabouts cleanly at any angle and width; smooth kerbs into shallow exits; guide lines on
  lane edges onto and off roundabouts, following lane connections
* Turn arrows line up along the stop line

#### Roads and signs
* Hard shoulders and variable-access lanes, drawn and edited
* Traffic signs (UK drawings, other codes as plates), variable message signs on gantries, speed and red
  light cameras, and average-speed sections; new Signs tool and sign section
* Road number shields and motorway junction numbers; minimum speed and lane speed roundels
* UK default lane widths; units for width and height limits, and weight limit fields
* Motorway slip roads, parking and sidebar icons for turns and lane changes
* iD's Point, Line and Area tools are back in the top bar


# 26.10.13
##### 2026-Oct-13 (first numbered 0.1.0)

First version.

* Lane model: parse, edit and write `*:lanes` tags; lanes on the map at their real width, with lane
  lines, turn arrows and labels
* Select and edit lanes on the map and in the sidebar: counts, direction, position, turn arrows, lane
  change, type, speeds, destinations, access, widths and limits; Paint, Width, Markings and Connect
  tools
* Junctions: the main road runs through, lanes that carry on line up, added and dropped lanes taper,
  slip roads start where their lane ends, junction clusters and forks, kerb-curve corners, guide lines
* Look ahead along the road: the roads it leads on to, exits, destinations, copying lanes on
* Roundabouts, lane connections (`type=connectivity`) and turbo roundabout tagging
* Pavements, cycleways and parking per side; footways, crossings, stop and give way lines, signals,
  kerbs, traffic islands, `road_marking=*`, street parking laybys
* Surfaces, roads mapped as areas, fitting roads into mapped carriageways
* Mini-roundabouts, turning heads, speed limit roundels, barriers, bridges, tunnels, cuttings,
  embankments, fords and roads under construction
* Lane Studio settings pane: lane opacity, hiding iD's own lines under lanes
* Lane tags rule in iD's Issues pane, welcome screen, and packaging as a static site
