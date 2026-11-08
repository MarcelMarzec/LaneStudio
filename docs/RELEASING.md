# Releasing Lane Studio

Every commit is a version; a deploy ships the version the branch is at.

## Every commit

1. Checks pass: `npm run lint`, `npx tsc`, `npm run test:once`.
2. The version is the commit's date, `YY.MM.DD` (`26.10.21`), then `r2`, `r3` … for later commits that day. Set it in
   `modules/lanes/version.ts` only. It shows as `v26.10.21` and is written as `created_by=LaneStudio 26.10.21`.
3. Add its section at the top of [CHANGELOG.md](CHANGELOG.md): `# YY.MM.DD`, the date (`##### 2026-Oct-21`), then
   what changed under `####` headings. The what's new menu shows it.
4. Commit with the version first in the title (`v26.10.21: what changed`) and push.

The full rules are in [CLAUDE.md](../CLAUDE.md); `test/spec/lanes/version.ts` checks them.

## One-time setup

1. **OAuth 2 application** on openstreetmap.org (My Account → OAuth 2 applications): redirect URI
   `https://<domain>/editor/land.html`; confidential **no** (PKCE, no secret); permissions: read and modify user
   preferences, modify the map, read GPS traces, modify notes. Register one on the dev server too to test there.
2. **GitHub** (Settings → Secrets and variables → Actions): variable `OSM_CLIENT_ID` (public by design), and
   optionally `LOCATOR_OVERLAY_URL` and `LOCATOR_OVERLAY_CREDIT` (a roads tile layer for zoomed-out views, whose
   terms allow it); secrets
   `FTP_SERVER`, `FTP_LANES_USERNAME` and `FTP_LANES_PASSWORD` (an account opening in `/editor/`),
   `FTP_ROOT_USERNAME` and `FTP_ROOT_PASSWORD` (one opening at the web root).

## Deploying

1. Actions → **Deploy LaneStudio to server** → Run workflow: **editor and website**, **editor** or **website**.
   - The editor: `npm run all` packages `dist-lanes/` (`index.html`, `land.html`, `dist/`, `.htaccess`), uploaded to
     `/editor/`. Files are loaded with a stamp of their contents, so visitors get the new version at once.
   - The website (`LanesWebsite/`: overview, changelog, privacy) goes to the web root with the current changelog,
     under its own upload record so it never deletes the editor.
2. Check: the footer shows the version, you can log in, and a test changeset says `created_by=LaneStudio YY.MM.DD`.

By hand: set `ID_API_CONNECTION_URL`, `ID_API_CONNECTION_API_URL` and `ID_API_CONNECTION_CLIENT_ID`, run
`npm run all`, and upload `dist-lanes/` (with its `.htaccess`) to `/editor/`.

## The website

`LanesWebsite/` is a PHP site: `index.php`, `changelog.php` (renders the changelog), `privacy_policy.php`, `error.php`,
`includes/` (settings, header, footer, icons, Markdown) and `assets/`. Run it with `php -S localhost:8000 router.php`
in that folder.

## The wiki

The GitHub wiki is a copy of `docs/`, rebuilt on every push that changes `docs/` by the **Sync docs to the wiki**
workflow (`scripts/build_wiki.js`). Pages in `docs/guide/` and `docs/develop/` are sub pages under the Guide and
Developers pages in the wiki's sidebar; page names must be unique. Turn the wiki on and make one page by hand before
the first run; try it with `node scripts/build_wiki.js <folder>`.

## Taking in a new iD version

Merge the iD release tag (or `develop`) into a branch off `mm/lane-studio-main`, resolve conflicts in the hooked files
([Code map](develop/Code-Map.md#id-hooks)), run `npm ci` and `npm run all`, run the checks, and look at a few junctions
and roundabouts before merging.
