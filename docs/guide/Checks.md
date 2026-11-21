# Checks

The **Lane tags** rule in iD's Issues pane checks roads and lane connections everywhere on the map. A fix is offered only where the answer
is certain.

| Check | Fix |
| --- | --- |
| A `*:lanes` tag with more or fewer values than lanes | — |
| `lanes:forward` + `lanes:backward` + [`lanes:both_ways`](https://wiki.openstreetmap.org/wiki/Key:lanes:both_ways) not adding up to [`lanes`](https://wiki.openstreetmap.org/wiki/Key:lanes) | — |
| An odd `lanes` on a two-way road with no direction counts | — |
| A key tagged with and without a direction | — |
| `lanes` not a whole number; `lanes=0` | [`lane_markings=no`](https://wiki.openstreetmap.org/wiki/Tag:lane_markings=no) |
| An unknown turn value | The right value, for clear misspellings |
| Deprecated `change:lanes` values (`only_left`, `only_right`) | `not_right`, `not_left` |
| `hov=lane` | — (use `hov:lanes`) |
| [`destination`](https://wiki.openstreetmap.org/wiki/Key:destination) on a two-way road | — (use `destination:forward\|backward`) |
| [`width`](https://wiki.openstreetmap.org/wiki/Key:width) narrower than the lanes' `width:lanes` | — |
| [`lanes:bus`](https://wiki.openstreetmap.org/wiki/Key:lanes:bus) or [`lanes:psv`](https://wiki.openstreetmap.org/wiki/Key:lanes:psv) with fewer bus lanes marked | Mark the kerb-side lanes |
| The old `opposite_*` cycleway values | Upgrade to `cycleway:<side>` and [`oneway:bicycle`](https://wiki.openstreetmap.org/wiki/Key:oneway:bicycle) |
| The old `busway=lane` | Make them lanes of their own |
| Lanes turning off at a dead end | — |
| A merging lane whose road carries on with as many lanes | — |
| A [`type=connectivity`](https://wiki.openstreetmap.org/wiki/Relation:connectivity) relation without one `from` way, one `to` way and a `via` node or via ways, or with roads not joined at the via | — |
| A `connectivity` value against the wiki's syntax | One statement per from lane, for `1,2:1` (to `1:1\|2:1`) or a from lane listed twice |
| A `connectivity` lane the from or to road does not have | — |

The dead end and merge checks need the roads around, so they run only where the map data at the road's ends is loaded.

More on lane connections: [Connectivity](Connectivity.md).

On the OpenStreetMap wiki: [Lanes](https://wiki.openstreetmap.org/wiki/Lanes), [Relation:connectivity](https://wiki.openstreetmap.org/wiki/Relation:connectivity).
