# Tools

Routing, Speed Limit and Measure are in the top bar. Each turns editing off while it is on; Esc leaves. Routing has
a page of its own: [Routing](Routing.md).

## Speed Limit

- Every lane is coloured by its limit (`maxspeed:lanes`, else its direction's `maxspeed:forward|backward`, else
  [`maxspeed`](https://wiki.openstreetmap.org/wiki/Key:maxspeed), or the limit [`maxspeed:type`](https://wiki.openstreetmap.org/wiki/Key:maxspeed:type) sets), in mph; other limits grey; roads with none red with a dashed edge.
- UK limit types have a pattern too: black bands national limit, blue stripes motorway, white dots 20 zone,
  cross-hatching restricted road.
- The sidebar shows the colours with counts, and lists roads in view with no limit (click one to go to it).
- Pick a limit (or press `1`–`7` for 10–70 mph), then click a road to set `maxspeed`, or shift-click a lane to set
  `maxspeed:lanes`. Limit types are set on whole roads only. Esc lets go of the limit, then leaves.
- **Minimum speed** does the same with [`minspeed`](https://wiki.openstreetmap.org/wiki/Key:minspeed) and blue roundels.

## Measure

1. Click two points on the imagery, such as the kerbs either side of a road. The distance shows on the map and in
   the sidebar.
2. Set it, rounded to 0.1 m, on the road nearest the middle of the line, as one of:

   | Button | Writes |
   | --- | --- |
   | Road width | [`width`](https://wiki.openstreetmap.org/wiki/Key:width) (kerb to kerb) |
   | This lane's width | `width:lanes` of the lane under the middle |
   | Pavement, cycle lane, hard shoulder, parking width | `sidewalk:<side>:width`, `cycleway:<side>:width`, `shoulder:<side>:width`, `parking:<side>:width` |

A third click starts again; Esc lets go of the measurement, then leaves. iD's Measurement panel (Ctrl+Shift+M) still
measures a selected feature.

## Map key

The Map key pane (`G`) shows every colour, line, symbol and surface on the map beside what it means.

On the OpenStreetMap wiki: [Key:maxspeed](https://wiki.openstreetmap.org/wiki/Key:maxspeed), [Key:width](https://wiki.openstreetmap.org/wiki/Key:width).
