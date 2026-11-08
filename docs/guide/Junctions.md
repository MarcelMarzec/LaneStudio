# Junctions

Junctions are drawing only: nothing here writes tags.

## How a junction is drawn

- **The main road runs through** (the roundabout ring, or the road that carries on by ref, name or class); side
  roads stop at its kerb.
- **Lanes that carry on line up.** The road with fewer lanes is shifted (unless it has `placement`), for 30 m then
  fading over 50 m, by at most one lane. Which lanes carry on: a `type=connectivity` relation, else `turn:lanes`.
- **Added and dropped lanes taper** over 25 m. A `merge_to_left|right` lane is the one that ends; a one-way slip
  road starts where the lane leading into it ends.
- **Short links** (40 m or less, no arrows of their own, as between the halves of a dual carriageway) take the
  arrows of the road leading in, less the turns already taken.
- **Slip roads** joining at a shallow angle end on the lane they become, unless they give way, stop or have signals
  within 30 m of the end.
- **Centre turn lanes**: a two-way road joining one with centre turn lanes parts its directions over 40 m round a
  hatched ghost island; a centre lane changing direction gets a diagonal white line.
- **Junctions closer than 25 m** are one junction: one box, the short link drawn as guide lines, or as whole lanes
  between traffic islands (`area:highway=traffic_island`) where there are any.
- **A two-way road dividing round an island** into one-way branches is no junction: the space between is road.
- **Junction boxes** are a shade lighter than the road, with curved kerbs from road to road. Where no traffic crosses
  the main road (roundabouts, slip roads) the box is only the widening mouth. At a bend, both halves meet on the
  bisector.
- **Guide lines** (dashed) carry each lane through the box to the lanes it leads to; connectivity relations are
  solid blue curves. Side roads without arrows get fainter guides to every road they may turn into, leaving out
  turns a restriction bans. None at mini-roundabouts.
- **Mapped carriageway areas** belong to the road lying mostly inside them: the road is shifted into the middle
  (by at most half its width) and the area drawn as its surface.
- Roads shorter than 8 m get an outline and a clickable marker. A road ending with nothing joining it has a
  rounded end.

## Roundabouts

Selecting a ring segment shows the whole ring, a **turbo** toggle for that segment (`roundabout=turbo`,
`change:lanes=no|no`), the segments still untagged, and the turn restrictions against the six a standard turbo
roundabout needs. Routes leave a roundabout only by the exits the entry lane's arrows point to.

## Mini-roundabouts and turning heads

- `highway=mini_roundabout`: a circular carriageway (`diameter=*` or from the roads), the white disc, and a give way
  line on each approach unless one is mapped.
- `highway=turning_circle|turning_loop`: the road flares into the head (`turning_circle=circle|oval|square|hammer|knuckle`,
  sized by `diameter=*` or twice the road's width), kerb and pavement carried round.
- Mapped areas (`area:highway=turning_circle`, a junction area) replace the drawn head or box.

## Look ahead

The roads the selected road leads on to (1 to 10, highlighted on the map), each with its lanes and distance; the
exits at its end (a roundabout's numbered) with a suggested turn and the exit's sign text, written to the selected
lanes only when you click **Turn** or **Destination**; and **Copy lanes to the next road** (lane counts and lane
tags, not turns or destinations).
