# Areas and surfaces

## Surfaces

[`surface=*`](https://wiki.openstreetmap.org/wiki/Key:surface) (and [`surface:lanes`](https://wiki.openstreetmap.org/wiki/Key:surface:lanes)) changes how carriageways, lanes, paths and areas look: asphalt, concrete, paving,
setts and gravel (as textures), unpaved, grass, wood, metal. [`surface:colour`](https://wiki.openstreetmap.org/wiki/Key:surface:colour) (or `surface:colour:lanes`) colours a
lane or road, such as a red bus lane.

## Paths

Footways, paths, cycleways, steps and pedestrian streets are drawn at their width ([`width`](https://wiki.openstreetmap.org/wiki/Key:width), [`est_width`](https://wiki.openstreetmap.org/wiki/Key:est_width)), under the
roads; crossings and paths on bridges ([`layer`](https://wiki.openstreetmap.org/wiki/Key:layer) > 0) over them. Shared foot and cycle paths are striped, segregated
ones split in two. A free path end is rounded. Steps with a ramp ([`ramp`](https://wiki.openstreetmap.org/wiki/Key:ramp), `ramp:bicycle`, `ramp:stroller`,
`ramp:wheelchair=yes`) have a smooth strip up one side.

## Mapped road areas (micro-mapping)

[`area:highway=*`](https://wiki.openstreetmap.org/wiki/Key:area:highway) (wiki: [Key:area:highway](https://wiki.openstreetmap.org/wiki/Key:area:highway)), from closed ways or multipolygons with their holes:

| Area | Drawn |
| --- | --- |
| Road areas (`primary`, `residential`, `service`, `passing_place`, `escape`…) | The road's surface, the road fitted inside |
| Junction areas ([`junction=yes`](https://wiki.openstreetmap.org/wiki/Tag:junction=yes), `roundabout`, `y_junction`) | The junction's surface, in place of the box |
| `turning_circle`, `turning_loop` | In place of the drawn turning head; the road leading in drawn up to its edge |
| Footway, pedestrian, path, steps, bridleway, corridor | Pavement |
| Cycleway | Cycleway; with [`cycleway=crossing`](https://wiki.openstreetmap.org/wiki/Tag:cycleway=crossing), a dashed edge |
| Verge | Grass |
| [`traffic_island`](https://wiki.openstreetmap.org/wiki/Tag:area:highway=traffic_island) | An island (by [`surface`](https://wiki.openstreetmap.org/wiki/Key:surface); concrete untagged) |
| `emergency`, `prohibited` | White hatching along [`direction=*`](https://wiki.openstreetmap.org/wiki/Key:direction) (else 45°), edged white |
| `bus`, `bus_stop`, `taxi_stop` | Bus lane red |
| [`shoulder`](https://wiki.openstreetmap.org/wiki/Key:shoulder) | Hard shoulder |
| Footway with [`footway=crossing`](https://wiki.openstreetmap.org/wiki/Tag:footway=crossing) | Zebra bars across the way people walk |

Add Area finds each: iD's Road Area, Footway Area and Traffic Island, and Lane Studio's Cycleway, Path, Pedestrian
street, Steps and Prohibited road areas. `emergency` is read but not offered: the wiki maps such hatching as
`road_marking=restriction`.

Places mapped as areas ([`place=island`](https://wiki.openstreetmap.org/wiki/Tag:place=island), `islet`, `suburb`…) name a place and are no surface: iD's fill is left out (an
island only partly loaded, such as Great Britain, would otherwise wash over the map), and their outline kept.

A road mapped as a routable area ([`area=yes`](https://wiki.openstreetmap.org/wiki/Tag:area=yes) + [`highway=*`](https://wiki.openstreetmap.org/wiki/Key:highway)) is a plaza or service area: ways inside it draw only
their lines, arrows and special lanes. Roads are fitted into way and multipolygon areas alike (a multipolygon by its
largest outer ring).

## Structures

| Tag | Drawn |
| --- | --- |
| [`bridge=*`](https://wiki.openstreetmap.org/wiki/Key:bridge) | Parapets along the outer edges |
| [`tunnel=*`](https://wiki.openstreetmap.org/wiki/Key:tunnel), [`covered=yes`](https://wiki.openstreetmap.org/wiki/Tag:covered=yes) | Faded, with dashed walls |
| [`cutting=*`](https://wiki.openstreetmap.org/wiki/Key:cutting), [`embankment=*`](https://wiki.openstreetmap.org/wiki/Key:embankment) (`yes`, `both`, `left`, `right`) | Slopes on that side (iD's triangles are hidden) |
| [`ford=*`](https://wiki.openstreetmap.org/wiki/Key:ford) | Water |

## Roads being built

[`highway=construction`](https://wiki.openstreetmap.org/wiki/Tag:highway=construction) + [`construction=<type>`](https://wiki.openstreetmap.org/wiki/Key:construction) (or `construction:highway=<type>`): drawn as the road it will be,
faded, with yellow and black stripes and orange kerbs, without arrows or lane lines. Without a type, left to iD.

## Other road types

- [`highway=busway`](https://wiki.openstreetmap.org/wiki/Tag:highway=busway), `bus_guideway`: bus lanes (a guideway as a concrete track).
- [`highway=escape`](https://wiki.openstreetmap.org/wiki/Tag:highway=escape): one lane of gravel (a runaway lorry ramp).
- [`highway=emergency_bay`](https://wiki.openstreetmap.org/wiki/Tag:highway=emergency_bay) as a way: a one-lane orange road.

## Solar panels

Panels (wiki: [Tag:generator:source=solar](https://wiki.openstreetmap.org/wiki/Tag:generator:source=solar)) are drawn dark blue with a grid of modules, on fields and roofs alike:

| Mapped | Tags | Drawn |
| --- | --- | --- |
| A row of panels, or a roof's panels, as an area | [`power=generator`](https://wiki.openstreetmap.org/wiki/Tag:power=generator), [`generator:source=solar`](https://wiki.openstreetmap.org/wiki/Tag:generator:source=solar), [`generator:method=photovoltaic`](https://wiki.openstreetmap.org/wiki/Tag:generator:method=photovoltaic) | Modules about 1.1 by 2 m, in rows across the way they face (`generator:orientation` or [`direction`](https://wiki.openstreetmap.org/wiki/Key:direction)), else along the area |
| Panels as a node | the same | A rectangle of [`generator:solar:modules`](https://wiki.openstreetmap.org/wiki/Key:generator:solar:modules) modules (2 m² each), else 4 by 2 m |
| Solar water heating (preset: Solar water heater) | [`generator:method=thermal`](https://wiki.openstreetmap.org/wiki/Tag:generator:method=thermal), [`generator:type=solar_thermal_collector`](https://wiki.openstreetmap.org/wiki/Tag:generator:type=solar_thermal_collector) | Dark grey |
| The whole solar farm | [`power=plant`](https://wiki.openstreetmap.org/wiki/Tag:power=plant), [`plant:source=solar`](https://wiki.openstreetmap.org/wiki/Tag:plant:source=solar) | iD's outline |

On the OpenStreetMap wiki: [Key:area:highway](https://wiki.openstreetmap.org/wiki/Key:area:highway), [Proposal:Street area](https://wiki.openstreetmap.org/wiki/Proposal:Street_area), [Key:surface](https://wiki.openstreetmap.org/wiki/Key:surface).
