## Releasing Lane Studio

Lane Studio is deployed from the `mm/lane-studio-main` branch as a static website. A release is a
version (the release date), a changelog entry and a deploy.

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

### Release checklist

1. On `mm/lane-studio-main`, make sure everything is merged and passing:

   ```sh
   npm clean-install
   npm run lint
   npx tsc
   npm run test:once
   ```

2. The version is today's date as `YY.MM.DD` (`26.10.21` for 21 October 2026; a second release that day
   is `26.10.21r2`). Set it in `modules/lanes/version.ts`. The footer shows it as `v26.10.21`, and every
   changeset is tagged `created_by=LaneStudio 26.10.21`. The full rules are in [CLAUDE.md](CLAUDE.md).
3. In [CHANGELOG.md](CHANGELOG.md), rename the Unreleased section to `# YY.MM.DD` with the full date on
   the next line, and add a new empty Unreleased section above it.
4. Commit, tag and push:

   ```sh
   git commit -am "Lane Studio vYY.MM.DD"
   git tag "vYY.MM.DD" -m "Lane Studio vYY.MM.DD"
   git push origin mm/lane-studio-main "vYY.MM.DD"
   ```

5. Deploy: Actions → **Deploy LaneStudio to server** → Run workflow. It builds with `npm run all`
   (which ends by packaging `dist-lanes/`) and uploads `dist-lanes/` over FTP. The page loads its code
   and styles with a stamp of their contents, so visitors get the new version straight away.
6. Check the live site: the footer shows the new version, you can log in, and a small test edit's
   changeset on openstreetmap.org says `created_by=LaneStudio YY.MM.DD`.

### Taking in a new iD release

Lane Studio is built on iD and keeps iD's code close to upstream. To take in a new iD version, merge
the iD release tag from https://github.com/openstreetmap/iD into a branch off `mm/lane-studio-main`,
resolve conflicts in the hooked files (listed in [LANES.md](LANES.md)), then run the checks above and
check a few junctions and roundabouts in the browser before merging.
