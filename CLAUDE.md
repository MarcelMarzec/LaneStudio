# Lane Studio: rules for working in this repository

Lane Studio is a fork of iD. Its code is in `modules/lanes/`; see [LANES.md](LANES.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Work on the `mm/lane-studio-main` branch.

## Versions

These rules are checked by `test/spec/lanes/version.ts`, which fails if they are broken.

### What a version looks like

- A version is the **date of the release**, `YY.MM.DD`: `26.10.21` is 21 October 2026. It is written
  `v26.10.21` in the footer, the welcome screen, commit messages and git tags, and without the `v` in
  code, in the changelog's headings and in the changeset tag `created_by=LaneStudio 26.10.21`.
- A second release on the same day adds `r2` (`26.10.21r2`, shown `v26.10.21r2`), a third `r3`, and so on.
  The first release of a day has no suffix.
- Never use any other form (no `0.3.0`, no `26.10.21.2`, no `-dev`, no `-beta`).

### Where the version lives

- Lane Studio's version is **only** in `modules/lanes/version.ts` (`laneStudioVersion`, without the
  `v`). The footer, the changeset tag, the welcome screen and `LaneStudio.version` all read it from
  there. Never write the version anywhere else.
- `version` in `package.json` is **iD's** version (`2.43.0-dev`). Never change it for Lane Studio.

### Every change goes in the changelog, not in the version

- Every commit that changes what users see or how Lane Studio behaves adds a line under
  `# Unreleased` at the top of [CHANGELOG.md](CHANGELOG.md), in the same commit. Group lines under
  `#### Website`, `#### Routing tool`, `#### Lanes and junctions`, `#### Roads and signs` or a new
  heading in the same style. Describe the change for users, not the code.
- Changes that users can't see (tests only, refactoring, docs for developers) need no line.
- **Never change the version in an ordinary commit.** It changes only when releasing.

### Releasing

Release only when the user asks for a release (or to bump the version). Then:

1. The new version is **today's date** as `YY.MM.DD` (check the date; don't guess it). If the
   changelog already has a release with that date, add `r2`, or one more than the highest `r`
   suffix that day (`26.10.21r3` after `26.10.21r2`).
2. Set `laneStudioVersion` in `modules/lanes/version.ts`.
3. In `CHANGELOG.md`, rename `# Unreleased` to the version (`# YY.MM.DD` or `# YY.MM.DDrN`) with the full date on the next line
   (`##### 2026-Oct-21`), and add a new empty `# Unreleased` above it.
4. Run `npm run lint`, `npx tsc` and `npm run test:once`.
5. Commit as `Lane Studio vYY.MM.DD` with only the version and changelog changes, tag it
   `vYY.MM.DD`, and push the branch and the tag.
6. Tell the user to run the **Deploy LaneStudio to server** workflow. Deploying never changes the
   version: a deploy without a release ships the same version.

If there is nothing under `# Unreleased`, there is nothing to release: say so instead of bumping.

## Checks before pushing

`npm run lint`, `npx tsc` and `npm run test:once` must pass. Never run `npm run build:data` or
`npm run all` without network access: the data step deletes files when it can't download.
