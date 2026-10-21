# Lane Studio: rules for working in this repository

Lane Studio is a fork of iD. Its code is in `modules/lanes/`; see [LANES.md](LANES.md) and
[ARCHITECTURE.md](ARCHITECTURE.md). Work on the `mm/lane-studio-main` branch.

## Versions

These rules are checked by `test/spec/lanes/version.ts`, which fails if they are broken.

### Where the version lives

- Lane Studio's version is **only** in `modules/lanes/version.ts` (`laneStudioVersion`). The footer,
  the changeset tag `created_by=LaneStudio <version>`, the welcome screen and `LaneStudio.version`
  all read it from there. Never write the version anywhere else.
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

1. Choose the new version from what is under `# Unreleased`:
   - while the version is `0.x`: raise the **middle** number (`0.2.0` → `0.3.0`) if anything new was
     added or behaviour changed; raise the **last** number (`0.2.0` → `0.2.1`) if it is fixes only;
   - from `1.0.0` on: **MAJOR** for changes that break existing use (tags written differently,
     removed features or URL parameters), **MINOR** for new features, **PATCH** for fixes only;
   - `1.0.0` itself only when the user decides Lane Studio is ready for it.
2. Set `laneStudioVersion` in `modules/lanes/version.ts`.
3. In `CHANGELOG.md`, rename `# Unreleased` to the version with today's date on the next line
   (`##### 2026-Oct-21`), and add a new empty `# Unreleased` above it.
4. Run `npm run lint`, `npx tsc` and `npm run test:once`.
5. Commit as `Lane Studio A.B.C` with only the version and changelog changes, tag it
   `lane-studio-vA.B.C`, and push the branch and the tag.
6. Tell the user to run the **Deploy LaneStudio to server** workflow. Deploying never changes the
   version: a deploy without a release ships the same version number.

If there is nothing under `# Unreleased`, there is nothing to release: say so instead of bumping.

## Checks before pushing

`npm run lint`, `npx tsc` and `npm run test:once` must pass. Never run `npm run build:data` or
`npm run all` without network access: the data step deletes files when it can't download.
