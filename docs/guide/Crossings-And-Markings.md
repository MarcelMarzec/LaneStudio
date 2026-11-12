# Crossings and markings

Road features on a road node are set with iD's own presets and fields, plus what Lane Studio's drawing reads: a
**Traffic signals** check on crossings (`crossing:signals`, also setting `crossing=traffic_signals|uncontrolled`),
and **Type** and **Direction Affected** on traffic calming and passing places. The **Markings** tool places them.

Everything on a node follows its direction (`direction=forward|backward|both` or `traffic_signals:direction`). A stop
or give way with no direction on a two-way road faces the nearest junction along the road.

## Crossings

Painted by `crossing:markings` (on a node or a crossing way):

| Value | Painted |
| --- | --- |
| `zebra`, `zebra:double`, `zebra:paired`, `zebra:bicolour` | Bars; two zebras; paired bars; alternate bars in `crossing:markings:colour` (red untagged) |
| `lines`, `lines:paired`, `dashes`, `dots` | Lines along both edges |
| `ladder`, `ladder:skewed`, `ladder:paired` | Lines with bars |
| `surface`, `pictograms` | A coloured surface; symbols |
| `no`, untagged unmarked | Nothing (a faint outline) |
| Several (`zebra;dots`) | All of them |

With no markings tagged: `crossing=uncontrolled` or `marked` is a zebra; a crossing with signals has lines, or in
the UK two rows of studs (pelican, puffin, toucan, pegasus, by `crossing_ref` too); `crossing_ref=tiger` is a zebra
with a cycle crossing beside it. `crossing:island=yes` adds a refuge; signals add a head for each direction.

### UK crossings (Highway Code rule 191)

Implied by the crossing, not tagged: a zebra or signal crossing's controlled area has zig-zags along both kerbs and
the centre line on each approach (up to eight 2 m marks, stopping 3 m short of a junction, none if fewer than two
fit), a give way line before a zebra or a stop line before a signal crossing (unless one is mapped near it), and
Belisha beacons at a zebra's ends. Drawn along the road the crossing is on.

### Tactile paving

`tactile_paving=yes` on a crossing (or its way): blister paving at each end, red at signals, buff elsewhere; one end
for `partial` or `incorrect`.

## Stop, give way and signals

| Node | Drawn |
| --- | --- |
| `highway=stop` | Stop line, STOP painted on each approach lane |
| `highway=give_way` | Give way line and triangles |
| `highway=traffic_signals` | Stop line and signal head; on a junction node, a line on every approach |
| `traffic_signals=blinker`, `lane_control` | Their own heads, no stop line |
| `traffic_signals=emergency` | Two red lamps |
| `cycleway=asl` (with `direction`) | Advanced stop line: the cycles' line, the traffic's 5 m before it, the green box and a cycle symbol |

A line on a pedestrian crossing, or up to 10 m past one, stands just before the crossing.

## Traffic calming

On a node (each value of a `;` list, across the lanes `direction` gives or all): hump and dynamic bump (with white
triangles), table and painted table, bump, mini bumps, rumble strip, cushions, dip and double dip, choker, chicane,
island, `choked_table`, `choked_island`. Tagged on a road way, it covers that way: table, painted table, hump, or
hatched for rumble strips and the rest.

## Other features on roads

- **Passing places** (`highway=passing_place`): a bay on the side `direction` (or `passing_place=left|right|both`)
  gives, both when untagged.
- **Emergency bays** (`highway=emergency_bay` node): an orange layby 100 m long past any hard shoulder; as its own way,
  a one-lane orange road. `emergency=phone`: an orange box with a handset.
- **Barriers** on roads and paths: gates and the like across, bollards and blocks as posts, cattle grids; fences,
  walls, guard rails, jersey barriers and hedges at their width. Mapped kerbs (`barrier=kerb`) styled by `kerb=*`.
- **Fords**: a ford way is water; a ford node a band of water across the road.

## Road markings (`road_marking=*`)

Every marking the wiki lists has a preset: search Add Point, Add Line or Add Area for it. Each is drawn from `stroke`
(or `stroke:left|right`), `pattern`, `width`, `dasharray`, `colour`, `arrow`, `symbol` and `inscription`, edited in
the Painted marking section:

| Preset | Tags | Drawn |
| --- | --- | --- |
| Lane line, Edge line, Crossing edge, Stop line (line) | `road_marking=lane_divider\|edge_line\|crossing_edge\|stop_line` | `stroke=solid`, `dashed`, `double_solid`, `double_dashed`, `zigzag` |
| Shark's teeth | `road_marking=stop_line`, `stroke=sharks_teeth` | Triangles pointing right of the way |
| Stop line (on a road's node) | `road_marking=stop_line`, `direction=forward\|backward` | Across the lanes it faces |
| Hatched area, Chevron area, Box junction, Bus stop marking, Crossed-out area, Crossing marking area | `road_marking=restriction\|crossing` on a closed way (`area=yes`) or multipolygon | `pattern=stripes`, `crosshatch`, `x` (corner to corner), `chevron`, `zigzag` (end to end), `chessboard`, `solid`, `none` (outline only); holes (islands) left out |
| Painted arrow | `road_marking=arrow`, a way from base to tip | Each `arrow=*` value (`through;right`, `merge_to_left`…); banned turns (`no_right_turn`, `no_u_turn`) crossed out |
| Painted text | `road_marking=text`, `inscription=*` | The words, read along the road or `direction` |
| Painted symbol | `road_marking=symbol`, `symbol=bicycle\|pedestrian\|wheelchair\|hov\|airport\|motorway` | The pictogram (`hov` a diamond), `length` metres long; other symbols by name |
| Painted traffic sign | `road_marking=traffic_sign`, `traffic_sign=*` | A speed limit (`GB:670[30]`, or `maxspeed`) as its number in a red ring |

The presets add the wiki's example tags (Box junction: `pattern=crosshatch`, `reason=junction`, `colour=yellow`; Bus stop
marking: `pattern=zigzag`, `reason=bus_stop`). `reason=*` says why a restriction is painted. An area's outline takes
`stroke=solid` or `dashed`; double, shark's teeth and zigzag outlines are drawn as one line.

Legacy values are read but never written: `solid_stop_line`, `dash` (dashed `lane_divider`), `solid_lane_divider`,
`solid_road_edge`, `solid_crossing_edge`, `gore_chevron` (chevrons), `left|right|through` (arrows), `box_junction`.

### Hatched areas and chevrons

Map the painted area as its own area (Add Area → **Chevron area** or **Hatched area**, which add the tags below),
drawn round its outline at whatever width it has:

| Marking | Tags |
| --- | --- |
| Hatched area between lanes (ghost island) | `road_marking=restriction`, `pattern=stripes`, `stroke=solid` (or `dashed` for a broken edge line) |
| Chevrons (between a motorway and a slip road) | `road_marking=restriction`, `pattern=chevron`, `stroke=solid` |
| Lane lines beside it | `change:lanes` on the road ([Lanes](Lanes.md)), or `road_marking=lane_divider` + `stroke=*` as a way |

`area:highway=prohibited` and `road_marking=hatched|gore_chevron` are read too (the wiki prefers the tags above).

- Stripes run at 45° to the area; chevrons point back at the traffic coming towards them on the nearest road, as UK
  chevrons do (`direction=*`, the way the points face, overrides).
- **Lanes fit round it**: lanes either side of an area between them part as wide as it is mapped. A road beside an
  area that reaches towards another road (chevrons at a slip road) meets its edge: moved away where it would run over
  it, pulled in (up to 4 m) where it stands off, its hard shoulder giving way. Lanes never move sideways more than 1 m
  in 12, easing back to their own line past the area. Drawing only: tags are not changed.
- Left on their own line: lanes under an area painted across the whole road (box junction) or inside one lane
  (keep-clear marking); a roundabout's ring beside the hatching round its middle or chevrons outside it; a road with
  another road between it and the area. At a junction (three arms or more) the move eases to nothing, so lanes meet
  the roads there. Where two areas overlap, lanes move once, for the larger.
