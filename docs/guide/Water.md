# Water

Water is drawn under the roads, faded with the Lane surface opacity setting (and hidden in wireframe, `W`).

## Watercourses

A [`waterway=*`](https://wiki.openstreetmap.org/wiki/Key:waterway) line is drawn as water at its width
([`width`](https://wiki.openstreetmap.org/wiki/Key:width), `est_width`), with its banks; untagged, a UK width:

| Tag | Width |
| --- | --- |
| [`ditch`](https://wiki.openstreetmap.org/wiki/Tag:waterway=ditch) | 1 m |
| [`stream`](https://wiki.openstreetmap.org/wiki/Tag:waterway=stream), [`fish_pass`](https://wiki.openstreetmap.org/wiki/Tag:waterway=fish_pass) | 1.5 m |
| [`drain`](https://wiki.openstreetmap.org/wiki/Tag:waterway=drain), [`canoe_pass`](https://wiki.openstreetmap.org/wiki/Tag:waterway=canoe_pass) | 2 m |
| [`tidal_channel`](https://wiki.openstreetmap.org/wiki/Tag:waterway=tidal_channel) | 5 m |
| [`river`](https://wiki.openstreetmap.org/wiki/Tag:waterway=river) | 10 m |
| [`canal`](https://wiki.openstreetmap.org/wiki/Tag:waterway=canal) | 12 m |
| [`pressurised`](https://wiki.openstreetmap.org/wiki/Tag:waterway=pressurised) | 1 m, faded (a pipe) |

- In a culvert or tunnel ([`tunnel=culvert`](https://wiki.openstreetmap.org/wiki/Tag:tunnel=culvert)): faded, dashed banks.
- Dry part of the year ([`intermittent=yes`](https://wiki.openstreetmap.org/wiki/Key:intermittent), `seasonal`): paler, dashed banks.
- Where its water is mapped as an area, the area is drawn and the line left out.
- `link`, `fairway` and `flowline` are routes over water: left to iD.

## Water areas

[`natural=water`](https://wiki.openstreetmap.org/wiki/Tag:natural=water) with any [`water=*`](https://wiki.openstreetmap.org/wiki/Key:water)
(river, pond, lake, reservoir, basin, canal, lock, ditch, drain…), and [`waterway=dock`](https://wiki.openstreetmap.org/wiki/Tag:waterway=dock):
water, its edge drawn faintly; wastewater tanks grey-green. The replaced `waterway=riverbank`, `landuse=reservoir` and
`landuse=basin` are read as water. Hide natural features (`natural=water`) or Hide land use hides them.

## In the water

On a watercourse's node, laid across it (to the banks of the water area it is in, else at the watercourse's width);
mapped as a line or area, along it:

| Tag | Drawn |
| --- | --- |
| [`weir`](https://wiki.openstreetmap.org/wiki/Tag:waterway=weir) | A concrete sill, white water below |
| [`waterfall`](https://wiki.openstreetmap.org/wiki/Tag:waterway=waterfall) | Its lip, white water below |
| [`rapids`](https://wiki.openstreetmap.org/wiki/Tag:waterway=rapids) | White water |
| [`dam`](https://wiki.openstreetmap.org/wiki/Tag:waterway=dam) | Concrete (a line: its 4 m crest) |
| [`lock_gate`](https://wiki.openstreetmap.org/wiki/Tag:waterway=lock_gate) | Mitre gates, pointing upstream |
| [`sluice_gate`](https://wiki.openstreetmap.org/wiki/Tag:waterway=sluice_gate), [`floodgate`](https://wiki.openstreetmap.org/wiki/Tag:waterway=floodgate), [`security_lock`](https://wiki.openstreetmap.org/wiki/Tag:waterway=security_lock), [`check_dam`](https://wiki.openstreetmap.org/wiki/Tag:waterway=check_dam) | A gate across |
| [`debris_screen`](https://wiki.openstreetmap.org/wiki/Tag:waterway=debris_screen) | A screen across |

Waterways are drawn with the flow, so "below" is downstream. Add Point, Line and Area find each (Lane Studio's
presets where iD has none: Rapids, Sluice gate, Floodgate, Flood barrier, Check dam, Debris screen, Pressurised
waterway, Canoe pass, Lock chamber, Lagoon…).

On the OpenStreetMap wiki: [Key:waterway](https://wiki.openstreetmap.org/wiki/Key:waterway), [Key:water](https://wiki.openstreetmap.org/wiki/Key:water), [Waterways](https://wiki.openstreetmap.org/wiki/Waterways).
