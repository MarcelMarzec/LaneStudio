# Roadside

Pavement, Cycleway, Hard shoulder and Parking are fields in iD's Fields section with a **Forward** and a
**Backward** dropdown. Forward is the side beside traffic going along the way (the way's left where traffic keeps
left); the tags stay `:left` and `:right`.

## The + menu

With a road selected, a **+** stands outside each kerb on the map (or use **Add to the roadside** in the Lanes
section). Pick a side and what to add, fill in its tags, and **Add** writes it as one undo step:

| Add | Asks for |
| --- | --- |
| Lane | Its type, beside the kerb |
| Hard shoulder | Width |
| Pavement | Yes or mapped separately, width |
| Cycleway | Lane, track, shared lane, shared bus lane |
| Parking | Where, how cars park, fee, time limit, zone ([Street parking](Street-Parking.md)) |
| No-waiting lines | Double or single yellow, double or single red, times for a single line |

What a side already has is ticked; picking it changes it.

## Pavements

| Tag | Drawn |
| --- | --- |
| `sidewalk:<side>=yes` | A pavement, 2 m until `sidewalk:<side>:width` |
| `separate` | Nothing (mapped as its own way) |
| `lane` | A pedestrian lane painted on the road, inside the kerb |
| Untagged on streets that expect one | A hatched strip |
| `sidewalk:<side>:surface` | Its surface |
| `sidewalk:<side>:kerb` | Its kerb: lowered, flush or rolled |

A pavement mapped separately beside the road offers **Set to mapped separately** (or warns of double mapping).

## Cycle lanes and tracks

| Tag | Drawn |
| --- | --- |
| `cycleway:<side>=lane` | A lane on the road, inside the kerb, with a white line beside the lanes and a cycle symbol every 40 m |
| `track` | A track beyond the kerb |
| `shared_lane` | Cycle symbols with chevrons in the outer lane |
| `share_busway` | Cycle symbols in the bus lane |
| `cycleway:<side>:width` | Its width (lane 1.5 m, track 2 m until tagged) |

Each side's details fold under the Cycleway field:

| Detail | Tag | Drawn |
| --- | --- | --- |
| Line beside it | `cycleway:<side>:lane=exclusive\|advisory` | Solid or dashed |
| Cycles go | `cycleway:<side>:oneway=yes\|-1\|no` | Cycle symbols pointing that way (both ways for `no`) |
| Buffer | `cycleway:<side>:buffer=yes\|<width>` | A hatched strip |
| Kept apart by | `cycleway:<side>:separation` | Bollards, posts, a kerb, planters, panels |
| Colour | `cycleway:<side>:surface:colour` | Green, red, blue |

The old `cycleway=opposite_lane` (and `opposite_track`, `opposite`) on a one-way road is one contraflow lane;
**Upgrade** rewrites it as `cycleway:<side>=lane` + `cycleway:<side>:oneway=-1` + `oneway:bicycle=no`.

## Hard shoulders

`shoulder=*` (or per side), drawn 2.5 m wide until `shoulder:<side>:width`. Clicking one selects its road and marks
the field. Motorways have one unless tagged otherwise ([Road fields](Road-Fields.md#active-traffic-management)).

## Bus lanes and bus bays

- `bus_bay=left|right|both` (on the stretch of road beside it): a layby the kerb goes round, with the yellow
  BUS STOP box in the UK.
- Bus lanes tagged the old way (`busway:<side>=lane`) are drawn beside the lanes; the Number of lanes field offers to
  **Upgrade** them to lanes of their own (`bus:lanes=designated`, on the kerb side).

## Mapped kerbs and islands

`barrier=kerb` lines on both sides give the kerb-to-kerb width, with **Set width** (Lanes section); traffic islands
on the road are counted there.
