# Lane Studio: rules for working in this repository

Lane Studio is a fork of iD. Its code is in `modules/lanes/`; see the guide ([LANES.md](docs/LANES.md) and its pages in
`docs/guide/`), [ARCHITECTURE.md](docs/ARCHITECTURE.md) and the [code map](docs/develop/Code-Map.md). Work on the
`mm/lane-studio-main` branch.

## Versions

These rules are checked by `test/spec/lanes/version.ts`, which fails if they are broken.

**Every commit is a new version.** There is no "Unreleased": each commit bumps the version, names it
at the start of its title, and adds its own section to the changelog.

### What a version looks like: `YY.MM.DD`, then `YY.MM.DDr#`

- **Always use this format, and only this format.** A version is **the date of the commit**,
  `YY.MM.DD`: `26.10.21` is 21 October 2026. The first commit of a day has no suffix.
- A second commit on the same day is `YY.MM.DDr2` (`26.10.21r2`), a third `r3`, and so on: `r#` is one
  more than the highest version already made that day. There is never an `r1`.
- It is written with a `v` (`v26.10.21`, `v26.10.21r2`) in the footer, the welcome screen, the what's
  new menu and commit titles, and without the `v` in code, in the changelog's headings and in the
  changeset tag `created_by=LaneStudio 26.10.21`.
- Never use any other form (no `0.3.0`, no `26.10.21.2`, no `26.10.21-r2`, no `-dev`, no `-beta`).

### Where the version lives

- Lane Studio's version is **only** in `modules/lanes/version.ts` (`laneStudioVersion`, without the
  `v`). The footer, the changeset tag, the welcome screen, the what's new menu and `LaneStudio.version`
  all read it from there. Never write the version anywhere else.
- `version` in `package.json` is **iD's** version (`2.43.0-dev`). Never change it for Lane Studio.

### Every commit: bump the version, title the commit, add to the changelog

Do all of this in the commit itself, every time, however small the change (code, tests, docs, the
website, its build or its deploy alike):

1. **Work out the version:** today's date as `YY.MM.DD` (check the date; don't guess it). If
   `docs/CHANGELOG.md` already has a version with that date, it is `YY.MM.DDr#`: `r2`, or one more than the
   highest `r#` that day (`26.10.21r3` after `26.10.21r2`).
2. **Set it** in `modules/lanes/version.ts`.
3. **Add its section at the top of [CHANGELOG.md](docs/CHANGELOG.md)**, above the previous version:

   ```
   # 26.10.21r2
   ##### 2026-Oct-21

   #### Lanes and junctions
   * What changed, for the person using Lane Studio
   ```

   - The heading is the version, the line under it the commit's date (`##### 2026-Oct-21`).
   - Group lines under `#### Website`, `#### Routing tool`, `#### Lanes and junctions`,
     `#### Roads and signs`, `#### Railways`, `#### Editing`, `#### Performance` or a new heading in
     the same style. The what's new menu in the app shows these headings and lines.
   - Each line says what changed for the person using Lane Studio, not which code changed. Name the
     place or tag that showed the problem when there is one (`Liquorpond Street Roundabout`,
     `merge_to_left`).
   - A commit users can't see (tests alone, refactoring, developer docs) still gets a version and a
     section, with one line under `#### Behind the scenes` saying what it was.
   - Never edit an older version's section to describe new work: new work goes in the new section.
4. **Title the commit with the version first:** `v26.10.21r2: Lanes run between traffic islands`.
5. Run the checks below, then commit and push.

Deploying (the **Deploy LaneStudio to server** workflow, which uploads the editor, the website in
`LanesWebsite/` or both) ships whatever version the branch is at; it never changes the version. Tell
the user to run it when they want the site updated.

## Keep the documents accurate

**Every commit checks the documents against what it changes, and updates any that are no longer
accurate, in the same commit.** A feature isn't finished while a document still describes the old
behaviour, leaves the new one out, or names files, settings or steps that no longer exist.

The documents are in `docs/`: main pages at its top, the user guide's pages in `docs/guide/` and developer pages in
`docs/develop/` (sub pages under the Guide and Developers pages on the wiki). Only [README.md](README.md), this file
and [LICENSE.md](LICENSE.md) stay at the root, where GitHub and Claude Code look for them; links between documents are
relative to where each one is, and page file names are unique across the folders. The GitHub wiki is a copy of
`docs/`, rebuilt on every push by the **Sync docs to the wiki** workflow (`scripts/build_wiki.js`): edit the documents
here, never on the wiki.

Before committing, look at what the change touches and check the documents that cover it:

| Document | Covers | Update it when |
| --- | --- | --- |
| [README.md](README.md) | What Lane Studio is and does, getting started, putting it online | A feature users would notice is added or removed, or setup changes |
| [LANES.md](docs/LANES.md) | The guide's front page: what Lane Studio is, and the guide's pages | A guide page is added, renamed or removed |
| `docs/guide/` | The user guide, a page per area: getting started, lanes, road fields, roadside, street parking, junctions, crossings and markings, areas and surfaces, signs, railways, tools, checks | Anything users see or do, or any tag Lane Studio reads, changes |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code fits together: modules, how a frame is drawn, editing, tools, caching | The structure, the drawing steps or a module's job changes |
| `docs/develop/` | Running locally, the code map (where each part lives, iD's hooks), iD's core, customising, iD's accessibility | A file, folder, setup step or iD hook is added, moved or removed |
| Walkthrough and help (`modules/lanes/ui/intro.ts`, `modules/lanes/ui/help.ts`, `_lanes.intro` and `_lanes.help` in `data/lanes.yaml`) | Lane Studio's walkthrough chapters and Help pane pages | A feature users would notice is added, changed or removed, or a part of the screen they point at moves |
| [API.md](docs/API.md) | Starting Lane Studio on a page, files it serves, URL parameters, build settings | `LaneStudio.init`, served files, URL parameters or environment variables change |
| [FAQ.md](docs/FAQ.md) | Common questions | A change answers, changes or raises a common question |
| [PRIVACY.md](docs/PRIVACY.md) | What is stored, sent and to whom | Anything new is stored in the browser or sent anywhere (add a line to its changelog) |
| [ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | Keyboard, colour, touch and translation support of Lane Studio's features | A feature is added or changes how it is used |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md), [RELEASING.md](docs/RELEASING.md) | How to contribute, commit, version and deploy | The workflow, checks, versioning or deploy changes |
| This file | The rules for working here | A rule changes |
| `.github/` (issue templates, `FUNDING.yml`, workflows) | Reporting, sponsoring, building and deploying | What they ask for or do goes out of date |
| `LanesWebsite/` (`index.php` and the other pages) | The website: what Lane Studio does, how it works | A feature users would notice is added, changed or removed (see Keep the website up to date) |

- Write documents for the person reading them, in the same plain style as the rest; name the tags,
  files and settings exactly as they are.
- When unsure whether a document is affected, read its section on the area you changed.
- A commit that only updates documents still gets a version and changelog section
  (`#### Behind the scenes`, or `#### Website` when it changes what users read).
- Each field's i button overview (`info` in `data/lanes.yaml`) is documentation too: keep it accurate with the field.

## Keep the wiki, walkthrough and help short

People skim; nobody reads a wall of text. **Every change to a document, the walkthrough or the help pages keeps them
short and to the point**:

- **One page per area.** Put new material on the guide or developer page that covers it, or a new page in
  `docs/guide/` or `docs/develop/` (linked from its main page's table) when no page does. Never let one page grow
  into a manual: split it when it covers more than one thing.
- **Lead with what to do or what is drawn**, then the tags. Prefer a table or a short list to a paragraph, one fact
  per line; cut history, repetition and asides. Link to another page rather than repeating it.
- **The walkthrough** (`ui/intro.ts`) shows what is different from iD, a few steps per chapter, each one or two
  sentences; a step points at something on screen (it scrolls it into view), and only the action asked for is in
  `**bold**`. Check it in the browser when a part of the screen it points at changes.
- **The help pages** (`ui/help.ts`) are a short list per topic, ending in a pointer to the wiki for the rest.

## One sidebar, in iD's design

Lane Studio's sidebar is one menu with iD's, not two designed separately. **Every change to it keeps it that
way**:

- **Build inputs as iD's fields.** An input for a tag on the road is an iD field among iD's own in the Fields
  section ([modules/lanes/ui/road_fields.ts](modules/lanes/ui/road_fields.ts): a `uiFields.lanes_*` type, a
  `lanes/*` field and its place in `arrangeFields`). Anything else is built with `fieldShell`, `laneField`,
  `sidedField` or `choiceButtons` from [modules/lanes/ui/lane_fields.ts](modules/lanes/ui/lane_fields.ts), which
  make iD's markup (`.form-field`, `.field-label`, `.form-field-input-wrap`) so iD's styles apply. Use iD's
  components (`uiSection`, `uiDisclosure`, `uiCombobox`, "Add field") and iD's CSS variables; never a look of
  Lane Studio's own.
- **Every field has iD's bin, undo where it applies, and the i button.** The i button opens a short overview
  (`info.<topic>` in `data/lanes.yaml`) and a link to the field's OpenStreetMap wiki page (`fieldInfoPages` in
  [modules/lanes/ui/field_info.ts](modules/lanes/ui/field_info.ts)). A new field gets a topic, an overview and a
  wiki page; check the page (and the section, for a link to one) exists. When a field changes, keep its overview
  and wiki link accurate.
- **One field per tag.** When Lane Studio edits a tag iD has a field for, iD's field is left out while Lane
  Studio's is shown ([modules/lanes/ui/field_filter.ts](modules/lanes/ui/field_filter.ts)); never show both.
- **Keep the clutter down.** Show a field when it is tagged or the feature usually needs it; put the rest in "Add
  field" (or the roadside + menu). Fold long groups of fields under a title (`uiDisclosure`), remembered as iD's
  sections are.
- Look at the result in the browser, in the light and dark themes, before committing.

## Keep the website up to date

The website in `LanesWebsite/` tells people what Lane Studio is and does before they open it. **Every commit that
adds, changes or removes something users see updates the website in the same commit** where the website no longer
describes it accurately or leaves out a feature people would look for: the features and How it works on
`index.php`, the pictures' captions, and any other page describing the editor. Nothing it says may be untrue of the
editor as it is. (The changelog page reads [CHANGELOG.md](docs/CHANGELOG.md) itself.)

## Checks before pushing

`npm run lint`, `npx tsc` and `npm run test:once` must pass. Never run `npm run build:data` or
`npm run all` without network access: the data step deletes files when it can't download.
