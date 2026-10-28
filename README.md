<p align="center">
  <img src="docs/img/lane-studio-logo.svg" alt="Lane Studio logo: a three-lane road seen from above with a turn arrow in each lane" width="96" height="96">
</p>

# Lane Studio – a lane and road editor for [OpenStreetMap](https://www.openstreetmap.org/)

Lane Studio draws roads the way they look from above: every lane at its real width, with its lane
lines, turn arrows, junctions, crossings, stop lines, pavements, islands and signs, over aerial
imagery. You edit lanes where they are drawn, and Lane Studio writes the OpenStreetMap tags
(`lanes`, `turn:lanes`, `change:lanes`, `width:lanes`, `type=connectivity` relations and the rest).

> **Lane Studio is a fork of [iD](https://github.com/openstreetmap/iD)**, OpenStreetMap's in-browser
> editor. It keeps iD's map, history, imagery, validator and save flow, and adds lane editing on top.
> It is not made or supported by the iD project: report Lane Studio problems
> [here](https://github.com/MarcelMarzec/iD/issues), not to iD.
>
> **Lane Studio was written with AI.** Its code, tests and documentation were written with
> [Claude Code](https://claude.com/claude-code), Anthropic's AI coding tool, directed and reviewed by
> the project's maintainer.

The website is Lane Studio only; iD's own page is still in the repository for development.

## What it does

* **Lanes on the map**: lanes by type (general, bus, PSV, taxi, HOV, cycle, pedestrian, variable,
  no access) and hard shoulders, with kerbs, lane lines, turn arrows and labels, drawn at the tagged
  widths.
* **Lane editing**: click a lane to select it; add, remove and move lanes; set turn arrows, lane
  changes, lane types, speeds, destinations, access, widths and limits; drag lane widths; paint
  values onto lanes; connect lanes across junctions.
* **Junctions and roundabouts**: the main road runs through, lanes that carry on line up, added and
  dropped lanes taper, dashed guide lines carry each lane to where it leads (worked out from the
  exits where no turn arrows are tagged), lanes run between traffic islands, a road dividing round an
  island widens into its two halves, and roundabout entries and exits flare into the ring.
* **Street features**: pavements, footways and crossings at their width (paths drawn over the roads
  they cross), stop and give way lines, traffic signals, islands, road markings, street parking,
  parking spaces and car parks, traffic signs, message signs, cameras, bridges, tunnels and roads
  under construction; micro-mapped highway areas (`area:highway=*`: road and junction areas, hatching,
  crossings); and brand logos from Wikidata in place of shop and restaurant markers.
* **Railways**: track at its gauge (ballast, sleepers, rails and conductor rails) for main lines, the
  Underground, light rail, trams, narrow gauge and more; platforms; level crossings with UK-style
  barriers, light signals and road markings; Network Rail colour-light and shunt signals; buffer
  stops, switches, turntables and old trackbeds.
* **Routing**: hover a lane to see every route a car, bus, bicycle or lorry can take from it,
  following turn arrows, lane connections and turn restrictions; hover a footway to see where people
  can walk.
* **Speed limits**: the Speed Limit tool colours every lane by its limit, with roads missing one in
  red; pick a limit (UK roundels, in mph) and click roads or lanes to set it. Minimum speeds work the
  same way, and the UK's national, motorway and restricted road limit types are set with their limit.
* **Look ahead**: the roads a selected road leads on to, its exits and their destinations, and
  copying lanes to the next road.
* **Checks**: a lane tags rule in iD's Issues pane, with fixes where the answer is certain.
* **What's new**: after an update, a menu lists what changed since the version you last used.

The full guide (zoom levels, tools, what is drawn and how junctions work) is in [LANES.md](LANES.md).

## Getting started

```sh
npm clean-install
npm run all                         # builds styles, data, icons, code and the site (needs network)
ID_API_CONNECTION=dev npm start     # edits go to the OSM dev server, not the live map
```

Open http://127.0.0.1:8080/lanes.html. `npm start` rebuilds the code, styles and Lane Studio's
strings when you save.

Before pushing: `npm run lint`, `npx tsc` and `npm run test:once`.

## Putting it online

`npm run all` packages the editor into `dist-lanes/`: upload its contents (including `.htaccess`) to
the folder it is served from. The **Deploy LaneStudio to server** workflow in `.github/workflows/`
builds `mm/lane-studio-main` and uploads the editor and the website over FTP (or either one alone). Logging in from your own domain needs your own
OpenStreetMap OAuth 2 application. [RELEASING.md](RELEASING.md) has the steps.

The pages about Lane Studio (overview, changelog and privacy policy) are a small PHP site in
`LanesWebsite/`, served at the root of lanestudio.marcelmarzec.com with the editor in `/editor/`. To
try it locally, run
`php -S localhost:8000 router.php` in `LanesWebsite/`.

## More

* [LANES.md](LANES.md): the user and developer guide
* [CHANGELOG.md](CHANGELOG.md): what changed in each version
* [CONTRIBUTING.md](CONTRIBUTING.md): reporting issues and contributing code
* [ARCHITECTURE.md](ARCHITECTURE.md): how Lane Studio and iD fit together
* [API.md](API.md): URL parameters, build settings and embedding
* [FAQ.md](FAQ.md), [PRIVACY.md](PRIVACY.md), [ACCESSIBILITY.md](ACCESSIBILITY.md),
  [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Supporting Lane Studio

If Lane Studio helps you, you can support its development through
[GitHub Sponsors](https://github.com/sponsors/marcelmarzec) (the **Sponsor** button at the top of the
repository).

## License

Lane Studio is available under the [ISC License](https://opensource.org/licenses/ISC), like iD.
See [LICENSE.md](LICENSE.md).

Lane Studio includes iD, and iD bundles portions of the following open source software:

* [D3.js (BSD-3-Clause)](https://github.com/d3/d3)
* [CLDR (Unicode Consortium Terms of Use)](https://github.com/unicode-cldr/cldr-json)
* [editor-layer-index (CC-BY-SA 3.0)](https://github.com/osmlab/editor-layer-index)
* [Font Awesome (CC-BY 4.0)](https://fontawesome.com/license)
* [Maki (CC0 1.0)](https://github.com/mapbox/maki)
* [Temaki (CC0 1.0)](https://github.com/ideditor/temaki)
* [Röntgen icon set (CC-BY 4.0)](https://github.com/enzet/Roentgen)
* [Mapillary JS (MIT)](https://github.com/mapillary/mapillary-js)
* [iD Tagging Schema (ISC)](https://github.com/openstreetmap/id-tagging-schema)
* [name-suggestion-index (BSD-3-Clause)](https://github.com/osmlab/name-suggestion-index)
* [osm-community-index (ISC)](https://github.com/osmlab/osm-community-index)

## Thank you

Lane Studio would not exist without iD and its contributors. Initial development of iD was made
possible by a [grant of the Knight Foundation](https://blog.mapbox.com/large-investment-in-openstreetmap-from-knight-foundation-cf7aa00534db).
Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
