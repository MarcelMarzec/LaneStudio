# Lane Studio: rules for working in this repository

Lane Studio is a fork of iD. Its code is in `modules/lanes/`; see [LANES.md](LANES.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Work on the `mm/lane-studio-main` branch.

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
   `CHANGELOG.md` already has a version with that date, it is `YY.MM.DDr#`: `r2`, or one more than the
   highest `r#` that day (`26.10.21r3` after `26.10.21r2`).
2. **Set it** in `modules/lanes/version.ts`.
3. **Add its section at the top of [CHANGELOG.md](CHANGELOG.md)**, above the previous version:

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

Deploying (the **Deploy LaneStudio to server** workflow for the editor, **Deploy Lane Studio website to
server** for the pages in `LanesWebsite/`) ships whatever version the branch is at; it never changes the
version. Tell the user to run them when they want the site updated.

## Keep the documents accurate

**Every commit checks the documents against what it changes, and updates any that are no longer
accurate, in the same commit.** A feature isn't finished while a document still describes the old
behaviour, leaves the new one out, or names files, settings or steps that no longer exist.

Before committing, look at what the change touches and check the documents that cover it:

| Document | Covers | Update it when |
| --- | --- | --- |
| [README.md](README.md) | What Lane Studio is and does, getting started, putting it online | A feature users would notice is added or removed, or setup changes |
| [LANES.md](LANES.md) | The user and developer guide: tools, settings, what is drawn and how, where each part lives, iD's hooks | Anything users see or do changes; a file, folder or iD hook is added, moved or removed |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the code fits together: modules, how a frame is drawn, editing, tools, caching | The structure, the drawing steps or a module's job changes |
| [API.md](API.md) | Starting Lane Studio on a page, files it serves, URL parameters, build settings | `LaneStudio.init`, served files, URL parameters or environment variables change |
| [FAQ.md](FAQ.md) | Common questions | A change answers, changes or raises a common question |
| [PRIVACY.md](PRIVACY.md) | What is stored, sent and to whom | Anything new is stored in the browser or sent anywhere (add a line to its changelog) |
| [ACCESSIBILITY.md](ACCESSIBILITY.md) | Keyboard, colour, touch and translation support of Lane Studio's features | A feature is added or changes how it is used |
| [CONTRIBUTING.md](CONTRIBUTING.md), [RELEASING.md](RELEASING.md) | How to contribute, commit, version and deploy | The workflow, checks, versioning or deploy changes |
| This file | The rules for working here | A rule changes |
| `.github/` (issue templates, `FUNDING.yml`, workflows) | Reporting, sponsoring, building and deploying | What they ask for or do goes out of date |

- Write documents for the person reading them, in the same plain style as the rest; name the tags,
  files and settings exactly as they are.
- When unsure whether a document is affected, read its section on the area you changed.
- A commit that only updates documents still gets a version and changelog section
  (`#### Behind the scenes`, or `#### Website` when it changes what users read).

## Checks before pushing

`npm run lint`, `npx tsc` and `npm run test:once` must pass. Never run `npm run build:data` or
`npm run all` without network access: the data step deletes files when it can't download.
