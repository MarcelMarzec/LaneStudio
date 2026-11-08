# iD core

Lane Studio runs on iD's core. This is the short version; iD's own
[ARCHITECTURE.md](https://github.com/openstreetmap/iD/blob/develop/ARCHITECTURE.md) has the long one.

## Data

| Part | What it is |
| --- | --- |
| `iD.osmNode`, `osmWay`, `osmRelation` | OSM entities, immutable: an edit makes a new copy. Ids are prefixed by type (`n123`, `w123`); new ones are negative |
| `iD.coreGraph` | All entities by id, immutable and shared between versions, like git |
| `iD.coreHistory` | A stack of graphs: undo pops one. Actions need no undo code of their own |
| `iD.coreDifference` | What changed between two graphs, to redraw |
| `iD.coreTree` | An R-tree of what is in view |

![](../img/graph-history.png)

## Editing

| Part | What it is |
| --- | --- |
| Actions | Functions from a graph to a new graph (`actionDeleteNode('n1')(graph)`), keeping the data consistent |
| Modes | Browse, Select and the drawing modes; each has `enter` and `exit`, and one is active at a time |
| Behaviors | Shared interaction (hover, drag, select), installed by a mode and removed with `off` |
| Operations | An action with its interface: tooltip, key, whether it is available and enabled |

## Drawing and UI

- `iD.rendererMap` sets up the projection and zoom; `iD.svgPoints`, `svgVertices`, `svgLines` and `svgAreas` draw with
  d3 joins. A point is a node in no way, a vertex a node in a way, an area a closed way with area tags or a
  multipolygon.
- Elements get classes from their tags (`tag-highway tag-highway-residential`), see [Customising](Customising.md).
- UI components are d3 functions: `selection.call(uiThing(context))`.
- d3 also provides fetching, dispatch (events), geo paths and zoom.

## Validation

`coreValidator` runs rules (`modules/validations/`) on each entity and lists issues in the Issues pane: **errors**
block upload, **warnings** don't. Rules include `almost_junction`, `close_nodes`, `crossing_ways`,
`disconnected_way`, `help_request`, `impossible_oneway`, `incompatible_source`, `invalid_format`,
`mismatched_geometry`, `missing_role`, `missing_tag`, `osm_api_limits`, `outdated_tags`, `private_data`,
`suspicious_name` and `unsquare_way`; Lane Studio adds `lane_tags` ([Checks](../guide/Checks.md)).

Changesets record issues as `warnings:<type>:<subtype>=<count>` (left by the user) and `resolved:<type>:<subtype>=<count>`
(fixed).
