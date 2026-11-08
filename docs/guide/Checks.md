# Checks

The **Lane tags** rule in iD's Issues pane checks roads everywhere on the map. A fix is offered only where the answer
is certain.

| Check | Fix |
| --- | --- |
| A `*:lanes` tag with more or fewer values than lanes | — |
| `lanes:forward` + `lanes:backward` + `lanes:both_ways` not adding up to `lanes` | — |
| An odd `lanes` on a two-way road with no direction counts | — |
| A key tagged with and without a direction | — |
| `lanes` not a whole number; `lanes=0` | `lane_markings=no` |
| An unknown turn value | The right value, for clear misspellings |
| Deprecated `change:lanes` values (`only_left`, `only_right`) | `not_right`, `not_left` |
| `hov=lane` | — (use `hov:lanes`) |
| `destination` on a two-way road | — (use `destination:forward\|backward`) |
| `width` narrower than the lanes' `width:lanes` | — |
| `lanes:bus` or `lanes:psv` with fewer bus lanes marked | Mark the kerb-side lanes |
| The old `opposite_*` cycleway values | Upgrade to `cycleway:<side>` and `oneway:bicycle` |
| The old `busway=lane` | Make them lanes of their own |
| Lanes turning off at a dead end | — |
| A merging lane whose road carries on with as many lanes | — |

The last two need the roads around, so they run only where the map data at the road's ends is loaded.
