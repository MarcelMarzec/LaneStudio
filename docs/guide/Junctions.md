# Junctions

Junctions are drawing only: nothing here writes tags.

## How a junction is drawn

- **The main road runs through** (the roundabout ring, or the road that carries on by ref, name or class); side
  roads stop at its kerb.
- **Lanes that carry on line up.** The road with fewer lanes is shifted (unless it has [`placement`](https://wiki.openstreetmap.org/wiki/Key:placement)), for 30 m then
  fading over 50 m, by at most one lane. Which lanes carry on: a [`type=connectivity`](https://wiki.openstreetmap.org/wiki/Tag:type=connectivity) relation, else `turn:lanes`.
- **Lanes of different widths** where two roads meet end to end (a road widening or narrowing, perhaps with lanes
  added, dropped or changing direction): the narrower road takes the wider one's kerbs and lane lines at the join and
  runs in straight lines to its own lanes (over 15 m or more, at most half its length). A lane of the wider road that
  ends closes in a V; a new lane opens from nothing; where two lanes come from one (`through|right` into
  `through|through|right|right`, by the arrows), the line between them opens out of the middle of that lane.
- **Added and dropped lanes taper** over 25 m a lane (lanes of the same width), every lane that ends however many
  (one lane each way into three and two, as on the Spalding Bypass), from the side away from oncoming traffic. Where a
  one-way road gains or loses two or more lanes, the lanes that carry on stay in the middle. A `merge_to_left|right`
  lane is the one that ends; a one-way slip road starts where the lane leading into it ends.
- **Short links** (40 m or less, no arrows of their own, as between the halves of a dual carriageway) take the
  arrows of the road leading in, less the turns already taken.
- **Slip roads** joining or leaving at a shallow angle line up with the lane they become, unless they give way, stop
  or have signals within 30 m of the end. The slip lane runs on along the main road's edge until its own way has drawn
  that far away, then follows its way, so it never bows out. Beside a hard shoulder, a one-lane slip road runs over
  the shoulder, outside the outer lane, and the main road runs straight through with no hard shoulder beside the slip
  lane (it comes back over 16 m past it). A slip road (`*_link`) never makes a fork, even with the main road's ref.
- **Centre turn lanes**: a two-way road joining one with centre turn lanes parts its directions over 40 m round a
  hatched ghost island; a centre lane changing direction gets a diagonal white line.
- **Junctions closer than 25 m** are one junction: one box, the short link drawn as guide lines, or as whole lanes
  between traffic islands ([`area:highway=traffic_island`](https://wiki.openstreetmap.org/wiki/Tag:area:highway=traffic_island)) where there are any.
- **A two-way road dividing round an island** into one-way branches is no junction: the space between is road. Two
  branches that meet again (round a pair of bollards) are drawn side by side all the way, however sharply they part.
- **A two-way road splitting into a pair of one-way roads** (one leaving, one coming back, even where a side road
  joins at the same node) has no through road: each one-way road is drawn where it is mapped, not shifted onto a lane
  of the two-way road.
- **A two-way road dividing into several one-way roads** (or several joining it), all within 50° of straight on, is
  a fork: each lane leads into the branch whose own arrows ([`turn`](https://wiki.openstreetmap.org/wiki/Key:turn) or `turn:lanes`) hold its arrows (`through|through|right|right`
  into a `turn=through` road and a `turn=right` one), else the lanes are shared out in order, left lanes to the left
  branch. There is no junction box: each branch starts on the end of the lanes it carries on from, edge to edge, and
  its lane lines and kerbs run in straight lines to its own lanes (over 15 m, or more the further they move, at most
  the branch's length). Roads joining there end on the lanes they merge into the same way. A [`placement`](https://wiki.openstreetmap.org/wiki/Key:placement) other than `transition` keeps a branch where it is mapped.
- **Junction boxes** are a shade lighter than the road, with curved kerbs from road to road. Two roads parting at a
  sharp angle, whose kerbs would only meet past the node, get a straight kerb between them. Where no traffic crosses
  the main road (roundabouts, slip roads) the box is only the widening mouth. At a bend, both halves meet on the
  bisector.
- **Guide lines** (dashed) carry each lane through the box to the lanes it leads to; with a road selected, its
  connectivity relations are solid blue curves. The [Connectivity](Connectivity.md) tool shows and edits them all. Side roads without arrows get fainter guides to every road they may turn into, leaving out
  turns a restriction bans. None at mini-roundabouts.
- **Mapped carriageway areas** belong to the road lying mostly inside them: the road is shifted into the middle
  (by at most half its width) and the area drawn as its surface.
- Roads shorter than 8 m get an outline and a clickable marker. A road ending with nothing joining it has a
  rounded end.

## Roundabouts

Selecting a ring segment shows the whole ring, a **turbo** toggle for that segment ([`roundabout=turbo`](https://wiki.openstreetmap.org/wiki/Tag:roundabout=turbo),
`change:lanes=no|no`), the segments still untagged, and the turn restrictions against the six a standard turbo
roundabout needs. Routes leave a roundabout only by the exits the entry lane's arrows point to.

## Mini-roundabouts and turning heads

- [`highway=mini_roundabout`](https://wiki.openstreetmap.org/wiki/Tag:highway=mini_roundabout): a circular carriageway ([`diameter=*`](https://wiki.openstreetmap.org/wiki/Key:diameter) or from the roads), the white disc, and a give way
  line on each approach unless one is mapped.
- [`highway=turning_circle|turning_loop`](https://wiki.openstreetmap.org/wiki/Key:highway): the road flares into the head ([`turning_circle=circle|oval|square|hammer|knuckle`](https://wiki.openstreetmap.org/wiki/Key:turning_circle),
  sized by `diameter=*` or twice the road's width), kerb and pavement carried round.
- Mapped areas (`area:highway=turning_circle`, a junction area) replace the drawn head or box, with no kerb or
  pavement of the drawn head inside; the road leading in is drawn up to the area's edge.

## Look ahead

The roads the selected road leads on to (1 to 10, highlighted on the map), each with its lanes and distance; the
exits at its end (a roundabout's numbered) with a suggested turn and the exit's sign text, written to the selected
lanes only when you click **Turn** or **Destination**; and **Copy lanes to the next road** (lane counts and lane
tags, not turns or destinations).

On the OpenStreetMap wiki: [Junctions](https://wiki.openstreetmap.org/wiki/Junctions), [Tag:junction=roundabout](https://wiki.openstreetmap.org/wiki/Tag:junction=roundabout), [Relation:connectivity](https://wiki.openstreetmap.org/wiki/Relation:connectivity), [Key:destination](https://wiki.openstreetmap.org/wiki/Key:destination).
