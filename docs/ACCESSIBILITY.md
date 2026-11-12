# Accessibility

How well Lane Studio's own features work by keyboard, screen reader, colour and touch. Everything else is iD's, whose
support is in [iD accessibility](develop/iD-Accessibility.md).

✅ full support · 🟩 assumed, not well tested · 🟠 partial · ❌ none · 🤷 unknown

## Lane Studio's features

|   | Feature | Notes |
|---|---|---|
| ✅ | Light and dark themes | Lane Studio's panes, sidebar sections and Routing panel follow iD's themes and your system's setting |
| ✅ | Lane Studio's fields | Built as iD's own fields, many of them inside iD's Fields section: usable with a keyboard and screen readers like iD's, including the dropdowns (lane type, roadside, parking and the tools' pickers), with iD's placeholders. Each has iD's bin and undo buttons and an i button (named for screen readers) that opens a written overview and a link to the wiki page; the overview stays open until it is closed again |
| ✅ | Centre line and parking choices | Parking's orientations are buttons with their meaning in words for screen readers and in their tooltip, the tagged one pressed (`aria-pressed`) |
| 🟩 | Compact choices (centre line, speeds, structure, active traffic management) | iD's combobox: a text input named by its field, opened with the arrow keys, each value in words beside its sign; typing a name, number or short name (`nsl`) picks one, Return or Tab sets it |
| ✅ | Roadside + menu | The + at each kerb of the selected road is a button that can be reached with Tab and opened with Enter or Space; the menu is a dialog of buttons and fields, closed with Esc (focus goes back to where it was) or by clicking outside it. "Add to the roadside" in the Lanes section opens it from the sidebar too |
| ✅ | Turn arrow and lane change buttons | Inactive ones are drawn in the theme's text colour, so they are as clear on the dark theme as on the light one; each is named for screen readers, the lane change buttons with what is beside the lane (another lane, the centre line or the kerb) |
| ✅ | Active traffic management | Standard buttons and tick boxes, usable from the keyboard, with the state of each button given to screen readers; the map's scheme is in words on a badge, not only a colour |
| ✅ | Sections and parking details | Look ahead, the roundabout and each side's parking details fold away with their headings, as iD's sections do, from the keyboard too; roadside fields label their sides Forward and Backward beside each dropdown |
| 🟠 | Picking lanes | Lanes are picked on the map or in the sidebar's lane strip with a pointer; once one is selected, `[` and `]` step to the next lane and Delete removes the selected lanes |
| 🟠 | Lane colours | Lane types are told apart by colour, with labels on each lane from zoom 19; the lane opacity setting (pane shortcut `K`) makes them stronger or fainter |
| 🟠 | Street parking and no-waiting lines | Yellow and red lines tell no waiting from no stopping by colour (single or double by their width, as painted); the sidebar's parking fields say the same in words, and a badge on the map gives the fee, time limit and zone in text |
| 🟠 | Cycle lane details and UK markings | Each side's cycle lane details are iD dropdowns under the Cycleway field, usable from the keyboard. On the map, an advisory cycle lane's line is dashed and a mandatory one solid (not only a colour); a coloured cycle lane or bus lane is a colour alone, with its tag in the fields; tactile paving is red or buff by colour alone, as it is on the ground |
| ✅ | Map key | A pane like iD's own, opened with `G` or its button, its sections folding as iD's do; each swatch has its meaning in words beside it, so nothing is told by colour alone |
| 🟠 | Measure tool | Its button and panel buttons work from the keyboard and Esc leaves, but the two points are placed with the mouse or a tap; the distance is given in words in the panel as well as on the map |
| 🟠 | Speed Limit tool | Lanes are coloured by their speed limit or minimum speed, with a pattern as well as a colour for limits set by their type (national, motorway, 20 zone, restricted road); the sidebar lists what each colour means, and the limit itself is shown in the inspector's speed roundels (each named for screen readers). The Speed limit / Minimum speed switch is a pair of buttons. Keys `1` to `7` pick 10 to 70 mph and Esc lets go; setting the limit still needs a click on the road |
| 🟠 | Brand logos | Shown in place of a feature's marker; selecting it shows its name and tags in the inspector as usual. Turned off in the Lane Studio pane |
| 🟠 | Painted road markings | Drawn as painted: lines, shark's teeth, zig-zags, patterns, arrows and symbols are told apart by shape, not colour; the Painted marking section gives the marking, stroke, pattern, arrow, symbol and colour in words |
| 🟠 | Railways, signals and level crossings | Drawn as symbols on the map; what each one is shows in the inspector when it is selected, as for any feature in iD |
| 🟩 | What's new menu | A dialog listing the changes since the version you last used; closed with Esc or its button, and turned off under About in the Lane Studio pane |
| 🟩 | Walkthrough and help | iD's walkthrough and Help pane, with Lane Studio's chapters and pages: keyboard and screen readers as in iD; the first Lanes step asks for a click on the map |
| 🟠 | Website statistics | The figures, latest changesets, lists and leaderboard are text, and the chart has a table view; the map pans and zooms from the keyboard, but its dots are opened with a pointer (the latest five are also buttons in the list beside it) |
| ❌ | Routing tool | Routes are shown for the lane under the pointer; there is no keyboard way to pick a lane in it yet |
| 🤷 | Touch | Not yet tested on touch screens; the Routing tool relies on hovering |
| ❌ | Translation | Lane Studio's own strings are English only; the rest of the editor uses iD's translations |
