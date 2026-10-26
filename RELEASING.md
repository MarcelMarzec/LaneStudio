## Releasing Lane Studio

Lane Studio is deployed from the `mm/lane-studio-main` branch as a static website. Every commit is a
version of its own (its date, `YY.MM.DD`, then `r2`, `r3` … later that day) with its own changelog
section, so a deploy simply ships the version the branch is at.

### One-time setup

1. **OpenStreetMap OAuth 2 application** (openstreetmap.org → My Account → OAuth 2 applications →
   Register new application):
   - Redirect URI: `https://<your domain>/land.html` (with the folder, if the site is in one)
   - Confidential application: **no**. Lane Studio logs in from the browser with PKCE, so it uses
     no client secret.
   - Permissions: read user preferences, modify user preferences, modify the map, read GPS traces,
     modify notes
2. **GitHub repository settings** (Settings → Secrets and variables → Actions):
   - Variables: `OSM_CLIENT_ID`, the application's client ID. It is built into the site, so it is
     public by design and belongs in a variable, not a secret.
   - Secrets: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` for the web host.

### Every commit

1. Make sure the checks pass:

   ```sh
   npm run lint
   npx tsc
   npm run test:once
   ```

2. The version is today's date as `YY.MM.DD` (`26.10.21` for 21 October 2026; a second commit that day
   is `26.10.21r2`, then `r3` …). Set it in `modules/lanes/version.ts`. The footer shows it as
   `v26.10.21`, and every changeset is tagged `created_by=LaneStudio 26.10.21`.
3. Add the version's section at the top of [CHANGELOG.md](CHANGELOG.md): `# YY.MM.DD`, the date on the
   next line (`##### 2026-Oct-21`), then what changed under `####` headings. The app's what's new menu
   shows these sections to people coming back after an update.
4. Commit with the version first in the title, and push:

   ```sh
   git commit -am "vYY.MM.DD: what changed"
   git push origin mm/lane-studio-main
   ```

The full rules are in [CLAUDE.md](CLAUDE.md), and `test/spec/lanes/version.ts` checks them.

### Deploying

1. Actions → **Deploy LaneStudio to server** → Run workflow. It builds with `npm run all` (which ends
   by packaging `dist-lanes/`) and uploads `dist-lanes/` over FTP. The page loads its code and styles
   with a stamp of their contents, so visitors get the new version straight away.
2. Check the live site: the footer shows the version, you can log in, and a small test edit's
   changeset on openstreetmap.org says `created_by=LaneStudio YY.MM.DD`.

### Taking in a new iD release

Lane Studio is built on iD and keeps iD's code close to upstream. To take in a new iD version, merge
the iD release tag from https://github.com/openstreetmap/iD into a branch off `mm/lane-studio-main`,
resolve conflicts in the hooked files (listed in [LANES.md](LANES.md)), then run the checks above and
check a few junctions and roundabouts in the browser before merging.
