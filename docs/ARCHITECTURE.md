# Lane Studio architecture

Lane Studio is a layer on iD. iD provides the editor (data graph, history, modes, OSM API, imagery, validator,
sidebar, saving); Lane Studio adds a map layer drawing roads lane by lane, sidebar sections and fields that edit lane
tags, tools, panes, a walkthrough and help pages. iD changes only through small hooks that keep its behaviour by
default ([Code map](develop/Code-Map.md#id-hooks)).

Two rules:

- **The tags are the truth.** Everything drawn is worked out from the data on every redraw. Lining lanes up, tapers,
  junction boxes and guide lines are drawing only; tags change only through edits, each one iD action and undo step.
- **Geometry is in metres**, in a local frame (`metricFrame`), converted to map coordinates only to draw.

## Modules (`modules/lanes/`)

| Folder | Holds |
| --- | --- |
| `model/` | Pure functions: `parseLanes` reads lane tags into lanes per direction, `serialiseLanes` writes back only the keys that changed; lane types, markings, signs, connectivity, street features, street parking, speed limits, active traffic management |
| `actions/` | iD actions for lane edits, markings, signs, copying and connecting lanes |
| `geometry/` | Everything drawn, in metres: `laneLayout`, `roadGeometry`, `streetGeometry`, `laneSymbols`, `parkingGeometry`, `parkingSpaceGeometry`, `railGeometry`, `railFeatures`, `signGeometry`, `routing.ts` |
| `svg/` | The `lanes` layer (`svgLanes`) that runs the geometry and draws it, with click targets; `vertices.ts` |
| `core/` | State with d3 dispatch: selected lanes, tools, settings, the tools' modes (Routing, Speed Limit, Measure), brand logos, what's new, boot (`laneStudioInit`) |
| `osm/` | Looking along roads: the corridor ahead, roundabouts |
| `ui/` | Sidebar sections and fields, panes, panels, welcome screen, what's new, walkthrough, help pages |
| `validations/` | The Lane tags rule |

Files by feature: [Code map](develop/Code-Map.md).

## Drawing a frame

`svgLanes` redraws when the map moves or the graph changes:

1. Collect the lane roads, carriageway areas, islands and street features in view.
2. `roadGeometry` works out the roads: fitted into their carriageway areas; parted round painted areas between lanes
   (`partsFromAreas`, `road_marking=restriction` ways and multipolygons; rings, areas beyond another road and
   junction ends stay put); shifted and tapered at each join so lanes
   that carry on line up (`alignAt`, `alignBranches`, `alignMerges`, from connectivity relations or `turn:lanes`);
   junctions (`junctionAt`: through road, side roads, the box, flares, splits); road pieces (`buildPieces`: lanes,
   lines, arrows, labels, roadside strips); guide lines (`junctionConnections`); lanes channelled between islands.
3. `streetGeometry`, `signGeometry`, `laneSymbols`, the railway and parking geometry use the same shifts.
4. Draw it all with click targets, then mark iD's own features for what was drawn (`markIdFeatures`).

Work is skipped when nothing changed: at most one redraw a frame (`drawWhenChanged`), geometry kept while the graph
and view are the same, layouts cached per way version (`cachedLayout`), and attributes written only when they change
(`attrChanged`).

## Editing and the sidebar

- Clicking a lane selects it in `laneState`; the Lanes section edits the road's model and `actionChangeLanes` writes it
  as one action. Tools (`laneTools`) change what a click does; Esc returns to Select.
- **One menu with iD's**: road fields are iD field types (`uiFields.lanes_*`) and fields (`lanes/*`) placed in road
  presets by `arrangeFields` (common ones in `fields`, the rest in `moreFields`). `field_filter.ts` leaves out iD's
  field for a tag Lane Studio edits. Lane Studio's own sections build fields with `fieldShell` and `laneField`, which
  make iD's markup. Every field's i button (`fieldReference`) shows `_lanes.info.<topic>` and a wiki link
  (`fieldInfoPages`); a test checks each has both.

## Tools

- **Speed Limit** (`lanes-speed` mode): `laneSpeed` holds the measure and pick; the layer colours lanes by
  `speedClassOf`; clicks write `maxspeed` or `maxspeed:lanes`.
- **Routing** (`lanes-routing` mode): `vehicleRoutes` explores junction by junction with the drawing's junction rules,
  per vehicle profile, blocked by restrictions and limits.
- **Measure** (`lanes-measure` mode): two clicks, `geoSphericalDistance`, and the road nearest the middle
  (`roadAt`) to set a width on.

## Walkthrough and help

`uiIntroSetChapters` gives iD's walkthrough Lane Studio's chapters (`ui/intro.ts`), and `uiPaneHelpAddDocs` puts
Lane Studio's pages first in the Help pane (`ui/help.ts`); their text is `_lanes.intro` and `_lanes.help`.

## Tests

`test/spec/lanes/`: model, actions, geometry, routing, UI and the version rules. Geometry and routing tests build small
graphs in code or load fixtures from real data (`test/spec/lanes/fixtures/`).

## Developer pages

[Running locally](develop/Running-Locally.md) · [Code map](develop/Code-Map.md) · [iD core](develop/iD-Core.md) ·
[Customising](develop/Customising.md) · [iD accessibility](develop/iD-Accessibility.md) ·
[Website statistics](develop/Statistics.md)
