# Routing

The Routing tool (top bar) shows where traffic in a lane can go. Editing is off while it is on; Esc leaves.

## Using it

- Hover a lane to see every route a vehicle in it can take, up to 450 m and four junctions on, in numbered colours,
  with the lanes traffic comes from and the turns it may not take (red, with the reason). Click to pin; click the map
  to let go.
- Hover a footway or pavement to see the streets reachable on foot and the crossings used.
- The roads take the colour of their access for the vehicle picked: see [Access](Access.md#on-the-map-routing).

## Vehicles

**Car, Motorcycle, Van, Lorry, Bus, Taxi, Bicycle**: each keeps to the lanes, access tags, height and weight limits
([`maxheight`](https://wiki.openstreetmap.org/wiki/Key:maxheight), [`maxweight`](https://wiki.openstreetmap.org/wiki/Key:maxweight)) and roads open to it, its access keys read down the wiki's hierarchy ([`hgv`](https://wiki.openstreetmap.org/wiki/Key:hgv), then
[`motor_vehicle`](https://wiki.openstreetmap.org/wiki/Key:motor_vehicle), [`vehicle`](https://wiki.openstreetmap.org/wiki/Key:vehicle), [`access`](https://wiki.openstreetmap.org/wiki/Key:access); [`goods`](https://wiki.openstreetmap.org/wiki/Key:goods) is vans only, see [Access](Access.md)).

- Cycles may ride a one-way road against it with `oneway:bicycle=no` or a contraflow cycle lane
  ([`cycleway=opposite*`](https://wiki.openstreetmap.org/wiki/Key:cycleway), `cycleway:<side>:oneway=-1`), buses with [`oneway:bus=no`](https://wiki.openstreetmap.org/wiki/Tag:oneway:bus=no) or [`oneway:psv=no`](https://wiki.openstreetmap.org/wiki/Tag:oneway:psv=no); drawn along
  the road's line. Cycles keep off [`motorroad=yes`](https://wiki.openstreetmap.org/wiki/Tag:motorroad=yes) and motorways.

## How routes are found

- Routes follow turn arrows (`turn:lanes`), lane connections ([`type=connectivity`](https://wiki.openstreetmap.org/wiki/Tag:type=connectivity)) and turn restrictions
  ([`type=restriction`](https://wiki.openstreetmap.org/wiki/Tag:type=restriction), via nodes and via ways, lifted by [`except=*`](https://wiki.openstreetmap.org/wiki/Key:except)), and keep to their lane through short links.
- On a stretch too short to change lanes, a route enters a lane that leads on, not one whose only way on is banned
  (a right turn lane whose turn is a banned U-turn).

## Roundabouts

An entry's arrows name exits in order round the ring, not by angle:

| Entry lane | Leaves by |
| --- | --- |
| `left` (nearside) | The first exit |
| `through` | The exits between, shared in order across the `through` lanes, nearside lane first |
| `right` (offside), or the offside lane when none is | The last exit before going back |
| `reverse` | Back round to the road it came from (no other lane may) |

Arrows on the ring's own ways (`through|right|right`, or `left|through`) say which lanes leave at its next exit and
which go on round, matched in order the same way.

On the OpenStreetMap wiki: [Relation:restriction](https://wiki.openstreetmap.org/wiki/Relation:restriction), [Relation:connectivity](https://wiki.openstreetmap.org/wiki/Relation:connectivity), [Key:turn](https://wiki.openstreetmap.org/wiki/Key:turn), [Key:access](https://wiki.openstreetmap.org/wiki/Key:access).
