# Road fields

Lane Studio's road fields sit in iD's **Fields** section, in place of iD's fields for the same tags (one field per
tag). With several roads selected, iD's own fields come back to set a value on all of them.

| Field | Tags | Shown from the start on |
| --- | --- | --- |
| Number of lanes | [`lanes`](https://wiki.openstreetmap.org/wiki/Key:lanes), `lanes:forward`, `lanes:backward`, [`lanes:both_ways`](https://wiki.openstreetmap.org/wiki/Key:lanes:both_ways) (− and + per direction) | Every road |
| Centre line | [`overtaking`](https://wiki.openstreetmap.org/wiki/Key:overtaking), `overtaking:forward`, `overtaking:backward` | Two-way roads, not slip roads |
| Speed limit | [`maxspeed`](https://wiki.openstreetmap.org/wiki/Key:maxspeed), [`maxspeed:type`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:type), [`source:maxspeed`](https://wiki.openstreetmap.org/wiki/Key:source:maxspeed) | Every road |
| Minimum speed | [`minspeed`](https://wiki.openstreetmap.org/wiki/Key:minspeed) | Motorways |
| Advisory speed | [`maxspeed:advisory`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:advisory) | Once tagged |
| Practical speed | [`maxspeed:practical`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:practical) (the speed the road can really be driven at; its verifiability is disputed on the wiki) | Once tagged |
| Speed limit for lorries | [`maxspeed:hgv`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:hgv) | Once tagged (in place of iD's) |
| Speed limit at times | [`maxspeed:conditional`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:conditional), as `30 @ (Mo-Fr 07:00-17:00)` or `20 mph @ (wet)` | Once tagged |
| Priority on a narrow stretch | [`priority=forward\|backward`](https://wiki.openstreetmap.org/wiki/Key:priority) (the way that has priority; the other gives way) | Once tagged |
| Motorroad | [`motorroad=yes`](https://wiki.openstreetmap.org/wiki/Tag:motorroad=yes) (motor vehicles only) | Trunk, primary and secondary roads, once tagged |
| Structure | [`bridge`](https://wiki.openstreetmap.org/wiki/Key:bridge), [`tunnel`](https://wiki.openstreetmap.org/wiki/Key:tunnel), [`embankment`](https://wiki.openstreetmap.org/wiki/Key:embankment), [`cutting`](https://wiki.openstreetmap.org/wiki/Key:cutting), [`ford`](https://wiki.openstreetmap.org/wiki/Key:ford), [`covered`](https://wiki.openstreetmap.org/wiki/Key:covered), [`layer`](https://wiki.openstreetmap.org/wiki/Key:layer) | Once tagged (in place of iD's Structure) |
| Pavement, Cycleway, Hard shoulder, Parking | Per side, see [Roadside](Roadside.md) and [Street parking](Street-Parking.md) | Pavements where expected, parking on residential and living streets, shoulders on motorways and trunk roads |
| Active traffic management | [`active_traffic_management`](https://wiki.openstreetmap.org/wiki/Key:active_traffic_management), [`maxspeed:variable`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:variable) | Motorways, or once tagged |

Everything else is in **Add field**.

Centre line, the speeds, Structure and Active traffic management show only the value chosen, with its sign; the
dropdown lists them all. Type to pick one: its name, a number (`35`, in the unit used there; `35 mph` or `50 km/h`
for another) or a short name (`nsl`, `urban`, `zone`,
[`motorway`](https://wiki.openstreetmap.org/wiki/Key:motorway), `double`, `tunnel`). Text naming nothing goes back to the value chosen.

## Centre line

Dashed (`overtaking=yes`), double white line solid on the forward or backward side (`overtaking:forward=no`,
`overtaking:backward=no`), or double solid (`overtaking=no`). Also set by clicking a side of the line on the map,
or from the lane beside it. **Lorries overtaking** sets `overtaking:hgv=no|yes` where lorries differ.

## Speed limits

**Units**: speeds are shown and set in the unit the country's road signs use (country-coder, as in iD): mph in the UK,
the US and a few others, written `30 mph`; km/h elsewhere, written as a bare number (`50`), as
[Key:maxspeed](https://wiki.openstreetmap.org/wiki/Key:maxspeed) says. The Lane Studio pane's **Speed unit** sets mph or km/h
everywhere instead. A value tagged in the other unit is shown as tagged.

| Offered | Values |
| --- | --- |
| Roundels | mph: 10 to 70; km/h: 20 to 140; any number typed |
| No number | `none` (no limit, as on German motorways), `walk` (walking pace) |
| Limit types of the road's country | Below; other countries' as the wiki's Key:maxspeed lists them (`PL:urban` 50, `DE:motorway` none, `FR:zone30` 30…); any `CC:zoneNN` is NN |
| Minimum speed | Blue roundels, in the same unit |
| Advisory, practical speed | A plate: mph 10 to 60, km/h 10 to 100 |

- A country's limit type writes its limit as `maxspeed` and the type in `source:maxspeed` (as most communities do), in
  `maxspeed:type` in the UK, or wherever the road has its type already (`maxspeed=RU:urban` itself in Russia and
  Romania).
- UK limit types (wiki: [Key:maxspeed:type](https://wiki.openstreetmap.org/wiki/Key:maxspeed:type)), each setting its type and limit:

  | Sign | Writes |
  | --- | --- |
  | National limit, single carriageway | [`maxspeed:type=GB:nsl_single`](https://wiki.openstreetmap.org/wiki/Tag:maxspeed:type=GB:nsl_single), 60 mph |
  | National limit, dual carriageway | `GB:nsl_dual`, 70 mph |
  | Motorway | `GB:motorway`, 70 mph |
  | Restricted road (street lights) | `GB:nsl_restricted`, 30 mph |
  | 20 mph zone | `GB:zone20`, 20 mph |

- A plain number drops the type. UK [`source:maxspeed`](https://wiki.openstreetmap.org/wiki/Key:source:maxspeed) types are written as `maxspeed:type`;
  `maxspeed=national` alone is read by the kind of road.
- Under the signs: the lower national limit for towing, buses and HGVs.
- A lane's own limit (`maxspeed:lanes`, `minspeed:lanes`) is set in the Lanes section; lanes without one follow the
  road. [`maxspeed:forward`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:forward) and [`maxspeed:backward`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:backward) are read per direction.

## Structure

| Choice | Writes |
| --- | --- |
| Bridge, Viaduct | [`bridge=yes`](https://wiki.openstreetmap.org/wiki/Tag:bridge=yes), [`bridge=viaduct`](https://wiki.openstreetmap.org/wiki/Tag:bridge=viaduct); `layer=1` when no layer is tagged |
| Tunnel, Building passage | [`tunnel=yes`](https://wiki.openstreetmap.org/wiki/Tag:tunnel=yes), [`tunnel=building_passage`](https://wiki.openstreetmap.org/wiki/Tag:tunnel=building_passage); `layer=-1` when none is tagged |
| Embankment, Cutting, Ford, Covered | `embankment=yes`, `cutting=yes`, [`ford=yes`](https://wiki.openstreetmap.org/wiki/Tag:ford=yes), [`covered=yes`](https://wiki.openstreetmap.org/wiki/Tag:covered=yes) |
| None | Removes them, and the layer the bridge or tunnel set |

The Layer row under it sets `layer` on a bridge or in a tunnel.

## Active traffic management

| Scheme | Writes |
| --- | --- |
| None | Removes the scheme (a variable limit stays) |
| Controlled | `active_traffic_management=yes`, `maxspeed:variable=yes` |
| All lanes running | Also `shoulder=no` |
| Dynamic hard shoulder | Also a variable lane (`access:lanes=…\|variable`) on the driving side; one-way roads only |

**Variable speed limit** sets `maxspeed:variable=yes` or the reasons ticked. A managed road has a dotted blue line
along its lanes and, from zoom 18, a badge naming its scheme.

Motorways are drawn with a 2.5 m hard shoulder on the driving side unless that side is tagged ([`shoulder=*`](https://wiki.openstreetmap.org/wiki/Key:shoulder)) or a
lane is the running hard shoulder.

On the OpenStreetMap wiki: [Key:maxspeed](https://wiki.openstreetmap.org/wiki/Key:maxspeed), [Key:maxspeed:type](https://wiki.openstreetmap.org/wiki/Key:maxspeed:type), [Key:overtaking](https://wiki.openstreetmap.org/wiki/Key:overtaking).
