# Lane Studio guide

Lane Studio is a road and lane editor for OpenStreetMap, built on iD. It draws every road lane by lane at its real
width over the imagery, and you edit lanes where they are drawn. Everything else (saving, history, imagery, other
features) works as in iD.

> **Tag what is on the ground, not what makes the drawing look right** (wiki: [Tagging for the renderer](https://wiki.openstreetmap.org/wiki/Tagging_for_the_renderer)). Where the
> tags leave something out, Lane Studio's drawing is a guess. If the tags are right and the drawing is wrong,
> [report it](CONTRIBUTING.md#reporting-issues).

## Using Lane Studio

| Page | What it covers |
| --- | --- |
| [Getting started](guide/Getting-Started.md) | Zoom levels, the top bar, the sidebar, the panes, settings, brand logos |
| [Lanes](guide/Lanes.md) | Selecting and editing lanes, the lane tools, lane types, turn arrows, widths, labels |
| [Road fields](guide/Road-Fields.md) | Number of lanes, centre line, speed limits, structure, active traffic management |
| [Access](guide/Access.md) | Who may use a road: the Allowed Access field, and the roads coloured by it |
| [Roadside](guide/Roadside.md) | Pavements, cycle lanes and tracks, hard shoulders, bus bays, the + menu |
| [Street parking](guide/Street-Parking.md) | Parking per side, no-waiting lines, parking spaces and car parks |
| [Junctions](guide/Junctions.md) | How junctions are drawn, roundabouts, look ahead |
| [Crossings and markings](guide/Crossings-And-Markings.md) | Crossings, stop and give way, signals, traffic calming, road markings |
| [Areas and surfaces](guide/Areas-And-Surfaces.md) | Surfaces, paths, mapped road areas, bridges and tunnels, roads being built, solar panels |
| [Signs](guide/Signs.md) | Traffic signs, cameras, road numbers, speed roundels |
| [Railways](guide/Railways.md) | Track, level crossings, platforms, signals |
| [Routing](guide/Routing.md) | Where traffic in a lane can go, for each vehicle |
| [Connectivity](guide/Connectivity.md) | How lanes connect through junctions, and `type=connectivity` relations |
| [Tools](guide/Tools.md) | Speed Limit and the Map key |
| [Checks](guide/Checks.md) | The Lane tags rule in the Issues pane |

Questions: [FAQ](FAQ.md). Which of the wiki's keys and tags Lane Studio draws: [Tag coverage](TAGS.md). Developers: [Architecture](ARCHITECTURE.md), [Running locally](develop/Running-Locally.md),
[Code map](develop/Code-Map.md), [API](API.md), [Releasing](RELEASING.md). What changed: [Changelog](CHANGELOG.md).

Not built yet: turbo roundabouts with one way per lane (drawn, not specially handled), `:conditional` lane tags
other than access and speed limits (kept and shown), translations of Lane Studio's own strings, and browser tests against the dev server.
