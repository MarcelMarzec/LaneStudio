# Contributing to Lane Studio

Thanks for helping. Lane Studio is a lane and road editor for OpenStreetMap built on iD; this
repository holds both, with Lane Studio's code in `modules/lanes/`.

Everyone involved is subject to the [Code of Conduct](CODE_OF_CONDUCT.md).


## Reporting issues

Open an issue at https://github.com/MarcelMarzec/iD/issues. The most useful reports have:

* **Where**: the map URL from the address bar (it holds the location, `#map=zoom/lat/lon`), or the
  OSM ids of the roads or nodes involved (`w123`, `n456`).
* **What you expected and what you saw**: a screenshot, ideally with your expected result drawn on it.
* **The data**: for drawing, routing or junction problems, an export of the area (openstreetmap.org →
  Export → Manual area covering the junction → `.osm` file). Lane Studio's drawing is worked out from
  the tags, so the exact data is what reproduces it.
* **Version** (bottom right of the map) and browser.

Not Lane Studio's to fix, so please report them where they belong:

* presets, fields and tagging suggestions: [id-tagging-schema](https://github.com/openstreetmap/id-tagging-schema/issues)
* background imagery: [editor-layer-index](https://github.com/osmlab/editor-layer-index/issues)
* iD's own editing (not lanes or road drawing): [iD](https://github.com/openstreetmap/iD/issues),
  after checking it happens in plain iD too


## Contributing code

Open an issue first for anything bigger than a fix, so we can agree the approach.

### Setting up

```sh
npm clean-install
npm run all                         # needs network: it downloads data the build bundles
ID_API_CONNECTION=dev npm start     # edits go to the OSM dev server, not the live map
```

Open http://127.0.0.1:8080/lanes.html. `npm start` rebuilds on save. [LANES.md](LANES.md) explains how
Lane Studio fits into iD and where each part lives; [ARCHITECTURE.md](ARCHITECTURE.md) goes deeper.

### Where changes go

* Lane Studio features: `modules/lanes/` (TypeScript), styles in `css-lanes/`, strings in
  `data/lanes.yaml` (read with `t('_lanes.…')`), tests in `test/spec/lanes/`.
* iD itself: only small hooks that keep iD's behaviour by default (see the hooks table in LANES.md).
  Keeping iD's code close to upstream makes it possible to take in new iD releases.
* `dist/` and `dist-lanes/` are built: don't edit or commit them.

### Code style

* Modern TypeScript for new Lane Studio code, 4-space indents, no tabs, in HTML and CSS too.
* `npm run lint` must pass with no warnings (`npm run lint:fix` fixes some).
* Match the file you are in: some older iD files use 2-space indents or ES5; don't reformat code you
  aren't changing.
* Comments say why, in plain words; name OSM wiki pages for the tags a piece of code reads.
* Geometry works in metres in a local frame (`metricFrame`), never in degrees.

### Tests

Every fix comes with a test that fails without it. Geometry and routing tests build small graphs in
code or load a fixture extracted from real OSM data (`test/spec/lanes/fixtures/`).

```sh
npm run lint
npx tsc
npm run test:once                   # or npx vitest run test/spec/lanes for Lane Studio's tests only
```

For drawing changes, also look at the result in the browser on real data before and after.

### Submitting changes

1. Branch from `mm/lane-studio-main` with a descriptive name.
2. Make the change, with tests, and check it in the browser.
3. Add a line to the Unreleased section of [CHANGELOG.md](CHANGELOG.md).
4. Commit with a message that says what changed and why.
5. Open a pull request against `mm/lane-studio-main`.


## Translations

Lane Studio's own strings are English only for now (`data/lanes.yaml`). iD's strings come from iD's
translations on [Transifex](https://app.transifex.com/openstreetmap/id-editor/), so the rest of the
editor follows your browser's language.


## Licensing

Lane Studio is available under the [ISC License](https://opensource.org/licenses/ISC), like iD. By
contributing, you contribute ISC-licensed code.
