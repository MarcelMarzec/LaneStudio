# Lane Studio

Lane Studio is a road and lane editor for OpenStreetMap built on iD. It lives in this fork next to iD
and shares iD's map, history, OSM API, imagery, validator and save flow; lanes are drawn on the map
at their real width over aerial imagery and are edited where they are drawn.

## Running it locally

```sh
npm clean-install
npm run all                         # builds CSS, data, icons and both apps
ID_API_CONNECTION=dev npm start     # dev OSM server only, so test edits never reach the live map
```

Then open:

- http://127.0.0.1:8080/lanes.html for Lane Studio
- http://127.0.0.1:8080/ for plain iD

Lanes appear from zoom 17; lane markings and turn arrows from zoom 18; labels from zoom 19.

Editing (from zoom 18): click a lane to select it (shift-click for more lanes), then edit it in the
**Lanes** section of the sidebar. Click the line between two lanes of the selected road to cycle
its marking: dashed, solid, then crossable one way only. Every change is one undo step.

Before pushing: `npm run lint`, `npx tsc` and `npm run test:once`.

## How it fits into iD

| Part | Where |
| --- | --- |
| Entry point and boot | `modules/lanes/index.ts`, `modules/lanes/core/boot.ts`, `lanes.html` |
| Lane model (parse, edit, write `*:lanes` tags) | `modules/lanes/model/` |
| Tag edits as one undoable action | `modules/lanes/actions/change_lanes.ts` |
| Lane geometry in metres, junctions, cache | `modules/lanes/geometry/` |
| Lanes map layer, lane and divider click targets | `modules/lanes/svg/` |
| Selected lanes (a sub-selection of iD's selected road) | `modules/lanes/core/lane_state.ts` |
| Lanes section in the sidebar | `modules/lanes/ui/section_lanes.ts` |
| Styles (built into `dist/lanes.css`) | `css-lanes/` |
| Strings (read as `t('_lanes.…')`) | `data/lanes.yaml` |
| Tests | `test/spec/lanes/` |

iD itself needed only small, default-preserving hooks, so iD at `index.html` behaves exactly as before:

| Hook | File | Default |
| --- | --- | --- |
| `context.createdBy()` for the changeset `created_by` tag | `modules/core/context.ts`, `modules/ui/commit.js` | `iD <version>` |
| `prefs.prefix()` for stored keys, saved edits and the edit lock | `modules/core/preferences.js`, `modules/core/history.ts` | no prefix |
| `localizer.addLocaleDir()` for extra string scopes | `modules/core/localizer.ts` | none |
| `uiEntityEditorAddSection()` for extra sidebar sections | `modules/ui/entity_editor.js` | none |
| Second esbuild entry, CSS bundle and strings file | `config/`, `scripts/` | iD unchanged |

Lane Studio saves changesets with `created_by=LaneStudio <version>`, keeps its saved edits and
preferences under a `lanes_` prefix, and writes `none` for unmarked lanes in new `turn:lanes` keys.

## Status

| Phase | State |
| --- | --- |
| 0. Shell and seams | Done |
| 1. Lane model | Done |
| 2. Lane rendering (read-only) | Done |
| 3. Core map editing | In progress: lane selection on the map, lane counts, direction, turn arrows, lane change, lane type, per-lane values, dividers by click |
| 4. Look-ahead and destinations | Not started |
| 5. Junctions, roundabouts, roadside editing | Not started |
| 6. Validation and polish | Not started |
| 7. Release (own OAuth2 clients, hosting at lanestudio.marcelmarzec.com) | Not started |
