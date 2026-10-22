# Lane Studio: rules for working in this repository

Lane Studio is a fork of iD. Its code is in `modules/lanes/`; see [LANES.md](LANES.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Work on the `mm/lane-studio-main` branch.

## Versions

These rules are checked by `test/spec/lanes/version.ts`, which fails if they are broken.

### What a version looks like: `YY.MM.DD`, then `YY.MM.DDr#`

- **Always use this format, and only this format.** A version is the **date of the release**,
  `YY.MM.DD`: `26.10.21` is 21 October 2026. The first release of a day has no suffix.
- A second release on the same day is `YY.MM.DDr2` (`26.10.21r2`), a third `r3`, and so on: `r#` is
  one more than the highest release already made that day. There is never an `r1`.
- It is written with a `v` (`v26.10.21`, `v26.10.21r2`) in the footer, the welcome screen, commit
  messages and git tags, and without the `v` in code, in the changelog's headings and in the changeset
  tag `created_by=LaneStudio 26.10.21`.
- Never use any other form (no `0.3.0`, no `26.10.21.2`, no `26.10.21-r2`, no `-dev`, no `-beta`).

### Where the version lives

- Lane Studio's version is **only** in `modules/lanes/version.ts` (`laneStudioVersion`, without the
  `v`). The footer, the changeset tag, the welcome screen and `LaneStudio.version` all read it from
  there. Never write the version anywhere else.
- `version` in `package.json` is **iD's** version (`2.43.0-dev`). Never change it for Lane Studio.

### Always update the changelog

**Every time you change Lane Studio, you update [CHANGELOG.md](CHANGELOG.md) in the same commit.**
This is not optional and not left for later, and it applies to every change you make, however small:
fixes, new features, changes to how something is drawn or behaves, and changes to the website, its
build or its deploy. Only changes that users can't see (tests alone, refactoring with no change in
behaviour, developer-only docs) may skip it; if unsure, add a line.

How to write it:

- Changes go under `# Unreleased` at the top, under a heading for **the day the work was done**,
  newest day first: `### 2026-Oct-22` (check today's date; don't guess it). Add today's heading if
  it isn't there yet; add to it if it is.
- Under each day, group lines under `#### Website`, `#### Routing tool`, `#### Lanes and junctions`,
  `#### Roads and signs`, `#### Editing` or a new heading in the same style.
- Each line says what changed for the person using Lane Studio, not which code changed. Name the
  place or tag that showed the problem when there is one (`Liquorpond Street Roundabout`,
  `merge_to_left`).
- If you change something already listed under Unreleased, update that line rather than adding a
  contradicting one.
- **Never change the version in an ordinary commit.** It changes only when releasing.

### Releasing

Release only when the user asks for a release (or to bump the version). Then:

1. The new version is **today's date** as `YY.MM.DD` (check the date; don't guess it). If the
   changelog already has a release with that date, it is `YY.MM.DDr#`: `r2`, or one more than the
   highest `r#` that day (`26.10.21r3` after `26.10.21r2`).
2. Set `laneStudioVersion` in `modules/lanes/version.ts`.
3. In `CHANGELOG.md`, rename `# Unreleased` to the version (`# YY.MM.DD` or `# YY.MM.DDr#`), put the
   release date on the next line (`##### 2026-Oct-21`), keep the day headings under it, and add a new
   empty `# Unreleased` above it.
4. Run `npm run lint`, `npx tsc` and `npm run test:once`.
5. Commit as `Lane Studio vYY.MM.DD` (or `vYY.MM.DDr#`) with only the version and changelog
   changes, tag it with the same `v` version, and push the branch and the tag.
6. Tell the user to run the **Deploy LaneStudio to server** workflow. Deploying never changes the
   version: a deploy without a release ships the same version.

If there is nothing under `# Unreleased`, there is nothing to release: say so instead of bumping.

## Checks before pushing

`npm run lint`, `npx tsc` and `npm run test:once` must pass. Never run `npm run build:data` or
`npm run all` without network access: the data step deletes files when it can't download.
