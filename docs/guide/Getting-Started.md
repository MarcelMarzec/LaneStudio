# Getting started

New to Lane Studio? Open **Help** (`H`) → **Start the walkthrough**: it shows the lanes, the sidebar and the tools.

## Zoom levels

| Zoom | Drawn |
| --- | --- |
| 17 | Lanes, pavements, footways, railways, mapped areas, brand logos |
| 18 | Lane lines, turn arrows, crossings, stop and give way lines, sleepers, parking bays; editing starts |
| 19 | Lane labels, painted words (STOP, BUS LANE), give way triangles, parking badges |

## The screen

- **Top bar**: Selection (select and edit), [Routing, Speed Limit and Measure](Tools.md), then iD's Point, Line and Area.
- **Sidebar**, for a selected road, top to bottom: iD's feature type and issues; the **Lanes** section
  ([Lanes](Lanes.md)); iD's **Fields** with Lane Studio's road fields among them ([Road fields](Road-Fields.md),
  [Roadside](Roadside.md)); **Roundabout** or **Look ahead** ([Junctions](Junctions.md)); iD's tags.
- **Panes** on the right: **Lane Studio** (`K`, settings and About) and **Map key** (`G`, what every colour and
  symbol means), then iD's.
- **What's new**: after an update, a menu lists what changed since your last visit (turn it off under About).

Every Lane Studio field is built like iD's: a bin (removes its tags), undo (back to the last save) and an **i**
button (a short overview and a link to the wiki page). Rarely needed fields wait in **Add field**.

## Settings (Lane Studio pane, `K`)

| Setting | Does |
| --- | --- |
| Lane surface opacity | 35% by default; 100% opaque, 0% invisible |
| Hide natural features | Hides `natural=*` only |
| Hide iD's lines and points under lanes | Leaves Lane Studio's drawing alone (still clickable; the selected road keeps its nodes) |
| Hide land use | Hides `landuse=*` only, keeping car parks |
| Show brand logos | A shop's or restaurant's logo (Wikidata `brand:wikidata`) in place of iD's marker |
| About | What's new, and links to the website, privacy policy and contact page |

## Vertices

iD's grey points on ways show only where they matter: tagged nodes, way ends and where ways meet. Below zoom 18,
fences, hedges and other ways that aren't roads, railways or waterways show none. A selected way shows them all.
