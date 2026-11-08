# Areas and surfaces

## Surfaces

`surface=*` (and `surface:lanes`) changes how carriageways, lanes, paths and areas look: asphalt, concrete, paving,
setts and gravel (as textures), unpaved, grass, wood, metal. `surface:colour` (or `surface:colour:lanes`) colours a
lane or road, such as a red bus lane.

## Paths

Footways, paths, cycleways, steps and pedestrian streets are drawn at their width (`width`, `est_width`), under the
roads; crossings and paths on bridges (`layer` > 0) over them. Shared foot and cycle paths are striped, segregated
ones split in two. A free path end is rounded.

## Mapped road areas (micro-mapping)

`area:highway=*` (wiki: Key:area:highway), from closed ways or multipolygons with their holes:

| Area | Drawn |
| --- | --- |
| Road areas (`primary`, `residential`, `service`, `passing_place`, `escape`…) | The road's surface, the road fitted inside |
| Junction areas (`junction=yes`, `roundabout`, `y_junction`) | The junction's surface, in place of the box |
| `turning_circle`, `turning_loop` | In place of the drawn turning head |
| Footway, pedestrian, path, steps, bridleway, corridor | Pavement |
| Cycleway | Cycleway; with `cycleway=crossing`, a dashed edge |
| Verge | Grass |
| `traffic_island` | An island (by `surface`; concrete untagged) |
| `emergency`, `prohibited` | White hatching along `direction=*` (else 45°), edged white |
| `bus`, `bus_stop`, `taxi_stop` | Bus lane red |
| `shoulder` | Hard shoulder |
| Footway with `footway=crossing` | Zebra bars across the way people walk |

A road mapped as a routable area (`area=yes` + `highway=*`) is a plaza or service area: ways inside it draw only
their lines, arrows and special lanes. Roads are fitted into way areas, not multipolygons.

## Structures

| Tag | Drawn |
| --- | --- |
| `bridge=*` | Parapets along the outer edges |
| `tunnel=*`, `covered=yes` | Faded, with dashed walls |
| `cutting=*`, `embankment=*` (`yes`, `both`, `left`, `right`) | Slopes on that side (iD's triangles are hidden) |
| `ford=*` | Water |

## Roads being built

`highway=construction` + `construction=<type>` (or `construction:highway=<type>`): drawn as the road it will be,
faded, with yellow and black stripes and orange kerbs, without arrows or lane lines. Without a type, left to iD.

## Other road types

- `highway=busway`, `bus_guideway`: bus lanes (a guideway as a concrete track).
- `highway=escape`: one lane of gravel (a runaway lorry ramp).
- `highway=emergency_bay` as a way: a one-lane orange road.

## Brand logos

A feature tagged `brand:wikidata=*` shows its brand's logo (Wikidata P8972 or P154, from Wikimedia Commons) on a white
tile in place of iD's marker, from zoom 17. Turn off in the Lane Studio pane.
