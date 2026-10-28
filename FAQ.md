# Lane Studio FAQ

## What is Lane Studio?

A lane and road editor for OpenStreetMap. It draws roads lane by lane at their real width over aerial
imagery, and lets you edit lanes, turn arrows, lane connections, junction markings, pavements and
signs where they are drawn. It is built on [iD](https://github.com/openstreetmap/iD), so editing
anything else works as it does in iD.


## Do my edits go to the real OpenStreetMap?

Yes: once you log in, saving uploads a changeset to openstreetmap.org like any other editor, tagged
`created_by=LaneStudio <version>`. Until you save, edits stay in your browser (and are offered back if
you close the page). To practise, a development build can point at the OSM dev server instead (see
[CONTRIBUTING.md](CONTRIBUTING.md)).


## Why are lanes not drawn?

Lanes, pavements and footways are drawn from zoom 17; lane lines, arrows, crossings and stop lines
from zoom 18, where editing starts too. Roads are drawn from their tags: a road without `lanes=*` is
drawn with the usual number of lanes for its type, so add the tags to get it right.


## The lanes at a junction don't line up, or a route goes the wrong way. Is the data wrong?

Sometimes. Lane Studio lines lanes up from `turn:lanes`, `type=connectivity` relations and turn
restrictions, so missing or wrong arrows show up as lanes that don't meet, or as routes that turn from
the wrong lane. Check the tags first; the Routing tool shows what Lane Studio reads from them. If the
tags are right, please report it with an export of the junction (see [CONTRIBUTING.md](CONTRIBUTING.md)).


## Does Lane Studio change tags I didn't edit?

No. The junction drawing, lining up and tapers are drawing only. Tags are written only when you edit,
and each edit is one undo step.


## Which countries does it work for?

Anywhere: lane tags are the same everywhere, and left- and right-hand traffic are both handled. Lane
widths, sign drawings, road number shields, speed roundels, level crossings and railway signals follow
UK conventions; elsewhere signs are drawn as a plate with their code. The Speed Limit tool works in
mph, and reads limits tagged in km/h too.


## How do I check and set speed limits?

Turn on the Speed Limit tool in the top bar. Every lane is coloured by its limit, and roads with no
`maxspeed` stand out. Pick a limit in the sidebar (or press `1` to `7` for 10 to 70 mph), then click a
road to set it; shift-click sets it on one lane only (`maxspeed:lanes`). Esc lets go of the limit, then
leaves the tool. Switch the panel to **Minimum speed** to set `minspeed` the same way.

Beside the roundels are signs for the UK limit types, in the tool and for a selected road: the
national limit on a single or dual carriageway, a motorway, a restricted road and a 20 mph zone
(`maxspeed:type=GB:nsl_single`, `GB:nsl_dual`, `GB:motorway`, `GB:nsl_restricted`, `GB:zone20`). With a
road selected and no lane picked, the Lanes section also sets the road's minimum speed.


## Are railways drawn?

Yes. Railways, the Underground and tram lines are drawn with their ballast, sleepers and rails at their
gauge, along with level crossings (barriers, light units and road markings, UK style), footpath
crossings, platforms, signals and track equipment. They are edited like any other feature in iD.


## What is the window that opens after an update?

The what's new menu lists the changes since the version you last used, from the changelog. Turn it off
under About in the Lane Studio pane (shortcut `K`); the changelog is linked there too.


## How can I report an issue with background imagery?

Lane Studio uses iD's imagery list, from the [editor-layer-index](https://github.com/osmlab/editor-layer-index)
project. For missing or cloudy imagery:

* _Bing:_ open the location in [Bing Maps](https://www.bing.com/maps), click "Feedback" and choose
  "Report a map problem".
* _Esri World Imagery:_ use the [Imagery Map Feedback tool](https://www.arcgis.com/home/item.html?id=ebdfa4146680410bb952c7d532ea5407).


## Can I change the colours?

The Lane Studio pane (shortcut `K`) sets how see-through lanes are and hides iD's own lines under
them. Lane Studio follows your system's light or dark setting, like iD. Everything is drawn with CSS
and SVG, so browser extensions that restyle pages can change any colour.


## Can I use it offline?

No. Like iD, it loads map data, imagery and presets as you pan, and saves straight to OpenStreetMap.


## Can I use it with my own OSM server?

Yes. Build it with `ID_API_CONNECTION_URL`, `ID_API_CONNECTION_API_URL` and
`ID_API_CONNECTION_CLIENT_ID` pointing at your server and its OAuth 2 application (see [API.md](API.md)).
