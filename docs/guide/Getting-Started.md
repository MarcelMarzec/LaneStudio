# Getting started

New to Lane Studio? Open **Help** (`H`) → **Start the walkthrough**: it shows the lanes, the sidebar and the tools.

## Zoom levels

| Zoom | Drawn |
| --- | --- |
| below 16 | Nothing can be edited: the standard OpenStreetMap map fades in over the imagery from 16 to 15 |
| 17 | Lanes, pavements, footways, railways, mapped areas, brand logos |
| 18 | Lane lines, turn arrows, crossings, stop and give way lines, sleepers, parking bays; editing starts |
| 19 | Lane labels, painted words (STOP, BUS LANE), give way triangles, parking badges |

## The screen

- **Top bar**: Selection (select and edit), [Routing](Routing.md), [Speed Limit](Tools.md), [Connectivity](Connectivity.md), then iD's Point, Line and Area.
- **Sidebar**, for a selected road, top to bottom: iD's feature type and issues; the **Lanes** section
  ([Lanes](Lanes.md)); iD's **Fields** with Lane Studio's road fields among them ([Road fields](Road-Fields.md),
  [Roadside](Roadside.md)); **Roundabout** or **Look ahead** ([Junctions](Junctions.md)); iD's tags.
- **Panes** on the right: **Lane Studio** (`P`, settings and About, in place of iD's Preferences) and **Map key** (`G`, what every colour and
  symbol means), then iD's.
- **What's new**: after an update, a menu lists what changed since your last visit (turn it off under About).

Every Lane Studio field is built like iD's: a bin (removes its tags), undo (back to the last save) and an **i**
button (a short overview and a link to the wiki page). Rarely needed fields wait in **Add field**.

## Settings (Lane Studio pane, `P`)

| Setting | Does |
| --- | --- |
| Lane surface opacity | 35% by default; 100% opaque, 0% invisible. iD's wireframe (`W`) hides lane surfaces, leaving their outlines and markings; `W` again brings them back at this setting |
| Hide natural features | Hides [`natural=*`](https://wiki.openstreetmap.org/wiki/Key:natural) only |
| Hide iD's lines and points under lanes | Leaves Lane Studio's drawing alone (still clickable; the selected road keeps its nodes). `⇧W` turns it on and off |
| Hide land use | Hides [`landuse=*`](https://wiki.openstreetmap.org/wiki/Key:landuse) only, keeping car parks |
| Show the OpenStreetMap map when zoomed out | Below zoom 16 the standard OpenStreetMap map fades in over the imagery, and the imagery back as you zoom in (on by default; not over a background that is already an OpenStreetMap map) |
| Show brand logos | A shop's or restaurant's logo in place of iD's marker, from zoom 17: [`brand:wikidata=*`](https://wiki.openstreetmap.org/wiki/Key:brand:wikidata), its Wikidata logo (P8972 or P154) from Wikimedia Commons, on a white tile |
| Privacy | iD's third-party icons setting (iD's Preferences pane is left out) |
| About | What's new, and links to the website, the [OpenStreetMap wiki page](https://wiki.openstreetmap.org/wiki/Lane_Studio), the [forum post](https://community.openstreetmap.org/t/introducing-lane-studio-a-visual-lane-editor-for-openstreetmap-built-on-id/150572), the GitHub repository, privacy policy and contact page |

## Vertices

iD's grey points on ways show only where they matter: tagged nodes, way ends and where ways meet. Below zoom 18,
fences, hedges and other ways that aren't roads, railways or waterways show none. A selected way shows them all.

On the OpenStreetMap wiki: [iD](https://wiki.openstreetmap.org/wiki/ID), [Tagging for the renderer](https://wiki.openstreetmap.org/wiki/Tagging_for_the_renderer).
