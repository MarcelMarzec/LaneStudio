# Tools

Routing, Speed Limit and Connectivity are in the top bar. Esc leaves each. Routing and Connectivity have pages of
their own: [Routing](Routing.md), [Connectivity](Connectivity.md).

## Speed Limit

- Every lane is coloured by its limit (`maxspeed:lanes`, else its direction's `maxspeed:forward|backward`, else
  [`maxspeed`](https://wiki.openstreetmap.org/wiki/Key:maxspeed), or the limit [`maxspeed:type`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:type) sets), in mph; other limits grey; roads with none red with a dashed edge.
- Junctions take the colour of the roads meeting there; where their limits differ, each road's part of the junction is
  its own colour (the more major road's where two cross).
- UK limit types have a pattern too: black bands national limit, blue stripes motorway, white dots 20 zone,
  cross-hatching restricted road.
- The sidebar shows the colours with counts, and lists roads in view with no limit (click one to go to it).
- Pick a limit (or press `1`–`7` for 10–70 mph), then click a road to set `maxspeed`, or shift-click a lane to set
  `maxspeed:lanes`. Limit types are set on whole roads only. Esc lets go of the limit, then leaves.
- **Minimum speed** does the same with [`minspeed`](https://wiki.openstreetmap.org/wiki/Key:minspeed) and blue roundels.

## Map key

The Map key pane (`G`) shows every colour, line, symbol and surface on the map beside what it means.

On the OpenStreetMap wiki: [Key:maxspeed](https://wiki.openstreetmap.org/wiki/Key:maxspeed), [Key:minspeed](https://wiki.openstreetmap.org/wiki/Key:minspeed).
