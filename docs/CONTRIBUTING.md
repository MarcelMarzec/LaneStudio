# Contributing to Lane Studio

Everyone involved follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting issues

Open an issue at https://github.com/MarcelMarzec/LaneStudio/issues with:

- **Where**: the map URL (`#map=zoom/lat/lon`) or the OSM ids (`w123`, `n456`);
- **What you expected and what you saw**: a screenshot, ideally marked up;
- **The data**, for drawing or routing problems: openstreetmap.org → Export → the junction → `.osm` file;
- **Version** (bottom right) and browser.

Elsewhere: presets and fields → [id-tagging-schema](https://github.com/openstreetmap/id-tagging-schema/issues); imagery →
[editor-layer-index](https://github.com/osmlab/editor-layer-index/issues); iD's own editing (happens in plain iD too) →
[iD](https://github.com/openstreetmap/iD/issues).

## Contributing code

Open an issue first for anything bigger than a fix. Set up with [Running locally](develop/Running-Locally.md); find
your way with the [Code map](develop/Code-Map.md) and [Architecture](ARCHITECTURE.md).

| Change | Goes in |
| --- | --- |
| Lane Studio features | `modules/lanes/` (TypeScript), styles `css-lanes/`, strings `data/lanes.yaml`, tests `test/spec/lanes/` |
| Documents | `docs/` (the wiki is copied from it); README, CLAUDE and LICENSE stay at the root |
| Website | `LanesWebsite/` |
| iD | Only small hooks that keep iD's behaviour by default |

Never edit or commit `dist/` or `dist-lanes/`.

**Style**: modern TypeScript, 4-space indents; `npm run lint` with no warnings; match the file you're in; comments say
why and name the wiki pages for the tags read; geometry in metres (`metricFrame`).

**Tags**: every feature Lane Studio adds has a preset found by search in Add Point, Line or Area, tagged as the
OpenStreetMap wiki documents it, and every key and value the wiki gives it is drawn (or listed in the guide as not
drawn). When unsure what the tags should be, read the wiki's pages for them, or ask.

**Tests**: every fix comes with a test that fails without it. Look at drawing changes in the browser, before and
after.

## Submitting

1. Branch from `mm/lane-studio-main`.
2. Make the change with tests, and check it in the browser (light and dark themes for the sidebar).
3. Update every document, the walkthrough, the help pages and the website that no longer describe it accurately
   ([CLAUDE.md](../CLAUDE.md) lists what each covers). Keep them short.
4. Keep the sidebar one menu with iD's ([CLAUDE.md](../CLAUDE.md) § One sidebar).
5. Give the commit its version and changelog section ([Releasing](RELEASING.md)).
6. Open a pull request against `mm/lane-studio-main`.

## Translations and licence

Lane Studio's own strings are English only for now; iD's come from
[Transifex](https://app.transifex.com/openstreetmap/id-editor/). Contributions are under the
[ISC License](https://opensource.org/licenses/ISC), like iD.
