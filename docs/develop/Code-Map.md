# Code map

Where each part of Lane Studio lives, and the hooks it uses in iD.

## Lane Studio (`modules/lanes/`)

| Part | Where |
| --- | --- |
| Entry point and boot | `index.ts`, `core/boot.ts`, `lanes.html` |
| Lane model: parse, edit and write `*:lanes` tags; lane types; markings; connectivity; street features and the centre line; street parking (`parking.ts`); active traffic management | `model/` |
| Actions (lanes, markings, signs, copy, connect), each one undo step | `actions/` |
| State: selected lanes, tools, keyboard, settings, roadside detection, what's new, links; fields, a preset for every road marking (`markingPresets`) and for the other features iD has none for (`featurePresets`) added to iD's presets (`preset_fields.ts`) | `core/` |
| Geometry in metres: lane layout, roads and junctions, street features (crossings, UK crossings, tactile paving, advanced stop lines, multipolygon areas), road markings, symbols along lanes, parking, parking spaces, railways, signs, routing | `geometry/` |
| Look-ahead corridor, roundabouts | `osm/` |
| Map drawing and click targets | `svg/` |
| Sidebar sections; road fields in iD's Fields (`road_fields.ts`); shared field parts (`lane_fields.ts`); i button topics (`field_info.ts`); parking (`parking_fields.ts`) and cycle lane (`cycleway_fields.ts`) details; the + menu (`roadside_menu.ts`); the field filter (`field_filter.ts`); panes (settings, Map key `pane_key.ts`); welcome screen, what's new, walkthrough (`intro.ts`), help pages (`help.ts`), logo, speed roundels | `ui/` |
| Lane tags rule | `validations/` |
| Version | `version.ts` |

| Feature | Files |
| --- | --- |
| Routing | `geometry/routing.ts`, `core/lane_routing.ts`, `core/mode_routing.ts`, `ui/routing_panel.ts`, `svg/routing.ts` |
| Speed Limit tool | `core/lane_speed.ts`, `core/mode_speed.ts`, `ui/speed_panel.ts`, `ui/speed_roundels.ts`, `model/speed_limits.ts` |
| Measure tool | `core/mode_measure.ts`, `ui/measure_panel.ts` |
| Railways | `geometry/railway.ts`, `geometry/rail_features.ts`, `svg/railway.ts` |
| Parking spaces and car parks | `geometry/parking_spaces.ts`, `svg/parking_spaces.ts` |
| Brand logos | `core/brand_logos.ts` (Wikidata), `svg/brand_logos.ts` |
| What's new | `core/whats_new.ts`, `ui/whats_new.ts` (the build copies `docs/CHANGELOG.md` to `dist/lanes-changelog.md`) |

Elsewhere: styles `css-lanes/` (built into `dist/lanes.css`), strings `data/lanes.yaml` (read as `t('_lanes.…')`),
the logo `docs/img/lane-studio-logo.svg`, site packaging `scripts/build_lanes_site.js`, the wiki
`scripts/build_wiki.js`, tests `test/spec/lanes/`.

The website is `LanesWebsite/`; its statistics' collector and page parts are in `LanesWebsite/includes/statistics/`,
their country borders built by `scripts/build_statistics_countries.js` ([Statistics](Statistics.md)).

## iD hooks

iD needed only small hooks that keep its behaviour by default, so plain iD (`index.html`) works as before:

| Hook | File | Default |
| --- | --- | --- |
| `context.createdBy()`, the changeset's `created_by` | `modules/core/context.ts`, `modules/ui/commit.js` | `iD <version>` |
| `context.operationFilter()`, hiding edit menu operations | `modules/core/context.ts`, `modules/modes/select.js` | none |
| `prefs.prefix()`, for stored keys, saved edits and the edit lock | `modules/core/preferences.js`, `modules/core/history.ts` | no prefix |
| `localizer.addLocaleDir()`, `localizer.mergeStrings()` | `modules/core/localizer.ts` | none |
| `uiEntityEditorAddSection()`, extra sidebar sections (`{ afterFields: true }` after the fields) | `modules/ui/entity_editor.js` | none |
| `uiSectionPresetFieldsSetFilter()`, leaving out preset fields | `modules/ui/sections/preset_fields.js` | none |
| A field's `referenceComponent`, its own i button | `modules/ui/field.js` | iD's wiki reference |
| `uiInitAddPane()`, extra panes | `modules/ui/init.js` | none |
| `uiInitHidePane()`, leaving out one of iD's panes (Preferences) | `modules/ui/init.js` | all shown |
| `uiInitSetSidebarHeader()`, a header above the sidebar | `modules/ui/init.js` | none |
| `uiTopToolbarAddTool()`, extra top bar tools | `modules/ui/top_toolbar.js` | none |
| `uiVersionSetProduct()`, the footer's version | `modules/ui/version.js` | iD's version |
| `uiIntroSetChapters()`, the walkthrough's chapters | `modules/ui/intro/intro.js` | iD's chapters |
| `uiPaneHelpAddDocs()`, help pages before iD's | `modules/ui/panes/help.js` | none |
| `coreValidatorAddRule()`, extra validation rules | `modules/core/validator.js` | none |
| `svgVerticesSetImportance()`, which vertices are drawn unselected | `modules/svg/vertices.js` | iD's choice |
| A second esbuild entry, CSS bundle and strings file | `config/`, `scripts/` | iD unchanged |

Lane Studio saves changesets as `created_by=LaneStudio <version>`, keeps its saved edits and preferences under a
`lanes_` prefix, and writes `none` for unmarked lanes in new `turn:lanes` keys.
