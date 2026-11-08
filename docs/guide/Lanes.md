# Lanes

## Selecting and editing

- Click a lane on the map or in **Lanes along the road** (Lanes section) to select it; shift-click adds lanes.
- `[` and `]` step left and right; Delete removes the selected lanes (never the road).
- The selected lanes' fields: direction, turn arrows, lane change and overtaking, speed limit, lane type,
  destination (motorways, trunk and primary roads), access, width, position (move left or right), and every other
  `*:lanes` tag on the road. **Whole road** lets go of the lanes.
- In **Add field** until tagged: minimum speed; the sign's road number, street, European road number, arrow,
  country and symbol (`destination:ref|street|int_ref|arrow|country|symbol:lanes`); width limit, height, weight,
  surface; width at the way's start and end (`width:lanes:start|end`, drawn widening or narrowing evenly); toll and
  payment (`toll:lanes`, `payment:cash:lanes`, `payment:cards:lanes`); more turn arrows.
- **Access at times** and **Speed limit at times**: the lane's `:conditional` values as `value @ (condition)`
  (`no @ (Mo-Fr 07:00-10:00)`), several separated by semicolons; written into `access:lanes:conditional` or
  `maxspeed:lanes:conditional`, one list per condition.
- Click a line between two lanes to cycle it: dashed, solid, crossable one way, the other way (`change:lanes`).
- **Lane change and overtaking** knows what is beside a lane: another lane (`change:lanes`), the centre line
  (overtaking, `overtaking:forward|backward`) or the kerb (nothing to change into).
- Lane fields work like iD's: type or pick a suggestion; fixed lists are dropdowns; "Multiple Values" when the
  selected lanes differ.

## Lane tools (Lanes section)

| Tool | Does |
| --- | --- |
| Select | Click lanes to edit them |
| Paint | Pick a lane type or a value, then click lanes to apply it (one undo step a click) |
| Width | Drag lane lines and kerbs; writes `width:lanes` in metres |
| Markings | Click a road to place a crossing, stop, give way, signals, traffic calming, mini-roundabout, emergency bay |
| Connect | Click a lane, then the lane on the next road it leads to: a `type=connectivity` relation (again to remove). Lanes it can connect to are outlined, connected ones filled |
| Signs | Pick a sign or camera, then click a lane to place it beside the road facing that lane's traffic |

Esc, or clicking empty map, returns to Select.

## Lanes when none are tagged

Two lanes, one each way (a one-way road: one). One lane shared both ways on a track, an escape lane, a driveway,
alley, drive-through, fuel station lane or emergency access road (`service=*`), or a service road tagged
`narrow=yes` or narrower than 4.5 m.

## Lane types

| Drawn as | When |
| --- | --- |
| Bus, PSV, taxi, HOV, cycle, pedestrian lane | `designated` in `bus:lanes`, `psv:lanes`, `taxi:lanes`, `hov:lanes`, `bicycle:lanes`, `foot:lanes`; or closed to general traffic (`access`, `motor_vehicle` or `vehicle:lanes=no`) and `yes` for that traffic; `cycleway:lanes=lane` |
| Variable lane (running hard shoulder) | `access:lanes=variable` |
| No access (hatched) | Closed to general traffic and open to none of the above |
| Bus lane | Every lane of a busway or guided busway (`highway=busway`, `bus_guideway`) |

Making such a lane general traffic again opens its access too.

## Turn arrows and blank values

- Arrows from `turn:lanes`. A lane with a blank value takes the road's plain key, as the wiki says: `turn`,
  `turn:forward` or `turn:backward` (routing follows them too).
- `merge_to_left` and `merge_to_right` mark the lane that ends; `slight_*` are not merges.
- Rare values (under **More turn arrows**): `slide_left|right` (a lane shifting over: straight on, stepping
  sideways) and `next_left|right` (turn at the junction after next: straight on at this one).
- One-way roads have small direction arrows on their lanes (iD's arrows on the way are hidden).

## Widths

- `width` (or `width:carriageway`, or `est_width`) is the carriageway **kerb to kerb** (wiki: Key:width): cycle
  lanes and parking on the road are inside it. The lanes share what is left, after any `width:lanes` they have.
- Untagged lanes use UK widths: 3.65 m on motorways, trunk and primary roads, 3.5 m secondary, 3.25 m tertiary and
  unclassified, 2.75 m residential and service, 2.4 m living streets. A guessed width draws fainter edges.
- Measure a width on the imagery with the [Measure tool](Tools.md#measure).

## Labels (zoom 19)

A lane's label shows its destinations and road numbers (or the road's `destination` on a one-way road and
`destination:forward|backward`, once per direction), the sign's symbol (`destination:symbol`), its own speed limit,
and restrictions: no HGV (`hgv:lanes=no`), HGV lane (`designated`), height, width and weight limits
(`maxheight:lanes`, `maxwidth:lanes`, `maxweight:lanes`). Labels take their sign's colour (`destination:colour`).

## Lines between lanes (Highway Code)

- Same direction: dashed, or solid where `change:lanes` says no crossing; untagged lines are fainter. A UK bus lane
  has a wide solid line beside it; a variable lane a solid one.
- Between directions: a dashed centre line; `overtaking=no` a double solid line; `overtaking=forward|backward` or
  `overtaking:forward|backward=no` a double line solid on the side that may not overtake. Click a side of the centre
  line on the map to ban or allow that side overtaking.
- `lane_markings=no`: lanes without painted lines.
