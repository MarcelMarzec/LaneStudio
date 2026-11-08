# Road fields

Lane Studio's road fields sit in iD's **Fields** section, in place of iD's fields for the same tags (one field per
tag). With several roads selected, iD's own fields come back to set a value on all of them.

| Field | Tags | Shown from the start on |
| --- | --- | --- |
| Number of lanes | `lanes`, `lanes:forward`, `lanes:backward`, `lanes:both_ways` (− and + per direction) | Every road |
| Centre line | `overtaking`, `overtaking:forward`, `overtaking:backward` | Two-way roads, not slip roads |
| Speed limit | `maxspeed`, `maxspeed:type` | Every road |
| Minimum speed | `minspeed` | Motorways |
| Pavement, Cycleway, Hard shoulder, Parking | Per side, see [Roadside](Roadside.md) and [Street parking](Street-Parking.md) | Pavements where expected, parking on residential and living streets, shoulders on motorways and trunk roads |
| Active traffic management | `active_traffic_management`, `maxspeed:variable` | Motorways, or once tagged |

Everything else is in **Add field**.

## Centre line

Dashed (`overtaking=yes`), double white line solid on the forward or backward side (`overtaking:forward=no`,
`overtaking:backward=no`), or double solid (`overtaking=no`). Also set by clicking a side of the line on the map,
or from the lane beside it.

## Speed limits

- UK roundels, 10 to 70 mph and none; minimum speeds as blue roundels.
- UK limit types (wiki: Key:maxspeed:type), each setting its type and limit:

  | Sign | Writes |
  | --- | --- |
  | National limit, single carriageway | `maxspeed:type=GB:nsl_single`, 60 mph |
  | National limit, dual carriageway | `GB:nsl_dual`, 70 mph |
  | Motorway | `GB:motorway`, 70 mph |
  | Restricted road (street lights) | `GB:nsl_restricted`, 30 mph |
  | 20 mph zone | `GB:zone20`, 20 mph |

- A plain number drops the type. `source:maxspeed` types are read and written as `maxspeed:type`;
  `maxspeed=national` alone is read by the kind of road.
- Under the signs: the lower national limit for towing, buses and HGVs.
- A lane's own limit (`maxspeed:lanes`, `minspeed:lanes`) is set in the Lanes section; lanes without one follow the
  road. `maxspeed:forward` and `maxspeed:backward` are read per direction.

## Active traffic management

| Scheme | Writes |
| --- | --- |
| None | Removes the scheme (a variable limit stays) |
| Controlled | `active_traffic_management=yes`, `maxspeed:variable=yes` |
| All lanes running | Also `shoulder=no` |
| Dynamic hard shoulder | Also a variable lane (`access:lanes=…\|variable`) on the driving side; one-way roads only |

**Variable speed limit** sets `maxspeed:variable=yes` or the reasons ticked. A managed road has a dotted blue line
along its lanes and, from zoom 18, a badge naming its scheme.

Motorways are drawn with a 2.5 m hard shoulder on the driving side unless that side is tagged (`shoulder=*`) or a
lane is the running hard shoulder.
