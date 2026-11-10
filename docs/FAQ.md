# Lane Studio FAQ

**What is Lane Studio?**
A lane and road editor for OpenStreetMap built on [iD](https://github.com/openstreetmap/iD). Roads are drawn lane by
lane at their real width, and edited where they are drawn; everything else works as in iD.

**Do my edits go to the real OpenStreetMap?**
Yes, once you log in and save, as changesets tagged `created_by=LaneStudio <version>`. Until then they stay in your
browser. To practise, take the walkthrough (Help → Start the walkthrough), or use a development build on the dev
server ([Running locally](develop/Running-Locally.md)).

**Why are lanes not drawn?**
Lanes appear from zoom 17, lines and arrows from 18. A road without `lanes` is drawn with the usual number for its
type, so tag it to get it right.

**The lanes at a junction don't line up, or a route goes the wrong way. Is the data wrong?**
Often: lanes line up from `turn:lanes`, connectivity relations and turn restrictions, and the Routing tool shows what
Lane Studio reads. If the tags are right, [report it](CONTRIBUTING.md#reporting-issues) with an export of the
junction. Don't change correct tags to fix the drawing: other maps and routers read them too.

**Does Lane Studio change tags I didn't edit?**
No. Lining up and tapers are drawing only; tags change only when you edit, one undo step each.

**Which countries does it work for?**
Anywhere, with left- and right-hand traffic. Lane widths, sign pictures, shields, roundels, crossing zig-zags, level
crossings and railway signals follow UK practice; elsewhere signs are a plate with their code. Speeds are in mph
(km/h tags are read).

**How many people use Lane Studio, and where?**
The website's [statistics](https://lanestudio.marcelmarzec.com/statistics) map every changeset saved with it, with
the latest ones, figures and a leaderboard, updated every few minutes from OpenStreetMap's changeset feed.

**What do the colours and symbols mean?**
Open the Map key pane (`G`).

**How do I set speed limits?**
Use the Speed Limit tool ([Tools](guide/Tools.md#speed-limit)), or the road's Speed limit field
([Road fields](guide/Road-Fields.md#speed-limits)).

**How do I measure a road's width?**
Use the Measure tool: click both kerbs on the imagery, then **Road width**. `width` is kerb to kerb, parking and cycle
lanes on the road included.

**Where are iD's Lanes, Speed Limit, Sidewalks and Street Parking fields?**
Replaced by Lane Studio's for one selected road ([Road fields](guide/Road-Fields.md)). Select several roads and iD's
come back.

**How do I tag yellow lines, parking bays and pay and display?**
Use the + at the kerb: **No-waiting lines** or **Parking** ([Street parking](guide/Street-Parking.md)).

**How do I hide land use without hiding car parks?**
Lane Studio pane (`K`) → **Hide land use** (Map Data's filter hides car parks too).

**Why are there no roads when I zoom out?**
Data loads from zoom 16, and Mapbox serves iD's Locator Overlay only to iD's own sites. A site sets its own roads
overlay with `locatorOverlay` or the `ID_LOCATOR_OVERLAY_URL` build setting ([API](API.md#build-settings)); the
deploy workflow reads it from the `LOCATOR_OVERLAY_URL` variable.

**Why does a motorway have a hard shoulder I didn't tag?**
Motorways are presumed to have one. Tag `shoulder=no`, or use Active traffic management.

**Are railways drawn?**
Yes, with track, level crossings, platforms and signals ([Railways](guide/Railways.md)).

**What is the window after an update?**
What's new since your last visit. Turn it off under About in the Lane Studio pane.

**How do I report bad imagery?**
Bing: Bing Maps → Feedback → Report a map problem. Esri: the
[Imagery Map Feedback tool](https://www.arcgis.com/home/item.html?id=ebdfa4146680410bb952c7d532ea5407).

**Can I change the colours?**
The Lane Studio pane sets lane opacity and hides iD's lines; the theme follows your system. It is all CSS, so
restyling extensions work.

**Can I use it offline, or with my own OSM server?**
Not offline. Your own server: build with `ID_API_CONNECTION_URL`, `ID_API_CONNECTION_API_URL` and
`ID_API_CONNECTION_CLIENT_ID` ([API](API.md#build-settings)).
