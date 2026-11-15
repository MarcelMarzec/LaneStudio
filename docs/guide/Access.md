# Access

Who may use a road, path, gate or car park (wiki: [Key:access](https://wiki.openstreetmap.org/wiki/Key:access)): [`access=*`](https://wiki.openstreetmap.org/wiki/Key:access) for everyone, overridden by a key per
transport mode. Lane Studio edits it in the Allowed Access field and colours the roads by it in the Routing tool.

## How it is read

| Rule | Example |
| --- | --- |
| A mode's own key wins over the one above it | [`hgv`](https://wiki.openstreetmap.org/wiki/Key:hgv) over [`motor_vehicle`](https://wiki.openstreetmap.org/wiki/Key:motor_vehicle) over [`vehicle`](https://wiki.openstreetmap.org/wiki/Key:vehicle) over [`access`](https://wiki.openstreetmap.org/wiki/Key:access) |
| [`goods`](https://wiki.openstreetmap.org/wiki/Key:goods) and `hgv` are separate modes | `goods=no` (vans) says nothing of lorries |
| A direction's key wins for traffic going that way | `hgv:forward=no`: lorries may not go the way the line is drawn |
| A lane's own key wins over the road's | `bus:lanes=designated` on a bus lane |
| `:conditional` changes it at times or for some vehicles | `hgv:conditional=no @ (Mo-Fr 07:00-19:00)` (wiki: [Conditional restrictions](https://wiki.openstreetmap.org/wiki/Conditional_restrictions)) |
| Nothing tagged: the kind of road decides | a motorway implies [`foot=no`](https://wiki.openstreetmap.org/wiki/Tag:foot=no) (wiki: [OSM tags for routing/Access restrictions](https://wiki.openstreetmap.org/wiki/OSM_tags_for_routing/Access_restrictions)) |

## Allowed Access field

iD's Allowed Access field (on roads, paths, gates, car parks…), with every land transport mode and value the wiki
lists:

- **Rows**: All, HGVs, Cars, Bicycles and Pedestrians, and every other access key tagged ([`psv`](https://wiki.openstreetmap.org/wiki/Key:psv), `goods`, [`horse`](https://wiki.openstreetmap.org/wiki/Key:horse),
  `hgv:forward`, [`motor_vehicle:conditional`](https://wiki.openstreetmap.org/wiki/Key:motor_vehicle:conditional)…): All first, then the groups (all vehicles, motor vehicles), then the
  biggest vehicle down to people on foot, each mode's directions and times under it.
- **An empty row shows what it inherits** (see above), in grey.
- **Values** with what they mean: [`yes`](https://wiki.openstreetmap.org/wiki/Tag:access=yes), [`no`](https://wiki.openstreetmap.org/wiki/Tag:access=no), [`private`](https://wiki.openstreetmap.org/wiki/Tag:access=private), [`permissive`](https://wiki.openstreetmap.org/wiki/Tag:access=permissive), [`destination`](https://wiki.openstreetmap.org/wiki/Tag:access=destination), [`delivery`](https://wiki.openstreetmap.org/wiki/Tag:access=delivery), [`customers`](https://wiki.openstreetmap.org/wiki/Tag:access=customers),
  [`designated`](https://wiki.openstreetmap.org/wiki/Tag:access=designated), [`permit`](https://wiki.openstreetmap.org/wiki/Tag:access=permit), [`discouraged`](https://wiki.openstreetmap.org/wiki/Key:access#access-discouraged), [`agricultural`](https://wiki.openstreetmap.org/wiki/Tag:access=agricultural), [`forestry`](https://wiki.openstreetmap.org/wiki/Tag:access=forestry), [`military`](https://wiki.openstreetmap.org/wiki/Tag:access=military), [`use_sidepath`](https://wiki.openstreetmap.org/wiki/Tag:access=use_sidepath), `dismount` (cycles,
  horses), `no_turnaround` (HGVs), [`unknown`](https://wiki.openstreetmap.org/wiki/Tag:access=unknown).
- **+ Add access type**: any mode in the wiki's hierarchy, biggest first (HGVs, buses, vans, horses, emergency,
  hazardous loads, disabled badge holders…), or for a mode shown, one direction or times and conditions:

  | Picked | Writes | Means |
  | --- | --- | --- |
  | HGVs: Forward | `hgv:forward` | Only traffic going the way the line is drawn, along its direction arrows |
  | HGVs: Backward | `hgv:backward` | Only traffic going against the way the line is drawn |
  | HGVs: Conditional | [`hgv:conditional`](https://wiki.openstreetmap.org/wiki/Key:hgv:conditional) | At times or for some vehicles: `no @ (Mo-Fr 07:00-19:00)`, `destination @ (weight>7.5)` |

## On the map (Routing)

With the [Routing tool](Routing.md) on, each lane takes the colour of the access the vehicle picked has there, from
its most specific key tagged:

| Colour | Values |
| --- | --- |
| Green | `yes`, `permissive` |
| Teal | `designated` |
| Yellow | `discouraged`, `no_turnaround` |
| Blue | `destination`, `delivery`, `customers` |
| Orange | `private`, `permit`, `agricultural`, `forestry`, `military` |
| Pink | `use_sidepath` |
| Purple | `dismount` |
| Red | `no`, or a lane kept for other traffic (a bus lane, for a car) |
| Grey | `unknown` or another value |

Faded: the value comes from a key above the vehicle's own ([`access=private`](https://wiki.openstreetmap.org/wiki/Tag:access=private) for a lorry). White dashes: a
`:conditional` restriction changes it. Nothing tagged: the usual surface. Road areas take their own tags, else
their road's; for a bicycle, paths are coloured too. The panel's key counts the roads in view of each.

On the OpenStreetMap wiki: [Key:access](https://wiki.openstreetmap.org/wiki/Key:access), [Conditional restrictions](https://wiki.openstreetmap.org/wiki/Conditional_restrictions), [OSM tags for routing/Access restrictions](https://wiki.openstreetmap.org/wiki/OSM_tags_for_routing/Access_restrictions), [Forward & backward, left & right](https://wiki.openstreetmap.org/wiki/Forward_%26_backward,_left_%26_right).
