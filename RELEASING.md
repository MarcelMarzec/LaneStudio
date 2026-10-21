## Releasing Lane Studio

Lane Studio is deployed from the `mm/lane-studio-main` branch as a static website. A release is a
version number, a changelog entry and a deploy.

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

2. Pick the version (`A.B.C`: B for new features, C for fixes only) and set it in
   `modules/lanes/version.ts`. It is shown in the footer and written to every changeset as
   `created_by=LaneStudio A.B.C`.
3. In [CHANGELOG.md](CHANGELOG.md), rename the Unreleased section to `A.B.C` with today's date, and add
   a new empty Unreleased section above it.
4. Commit (`Lane Studio A.B.C`), tag and push:

   ```sh
   git commit -am "Lane Studio A.B.C"
   git tag "lane-studio-vA.B.C" -m "Lane Studio A.B.C"
   git push origin mm/lane-studio-main "lane-studio-vA.B.C"
   ```

5. Deploy: Actions → **Deploy LaneStudio to server** → Run workflow. It builds with `npm run all`
   (which ends by packaging `dist-lanes/`) and uploads `dist-lanes/` over FTP. The page loads its code
   and styles with a stamp of their contents, so visitors get the new version straight away.
6. Check the live site: the footer shows the new version, you can log in, and a small test edit's
   changeset on openstreetmap.org says `created_by=LaneStudio A.B.C`.

### Taking in a new iD release

Lane Studio is built on iD and keeps iD's code close to upstream. To take in a new iD version, merge
the iD release tag from https://github.com/openstreetmap/iD into a branch off `mm/lane-studio-main`,
resolve conflicts in the hooked files (listed in [LANES.md](LANES.md)), then run the checks above and
check a few junctions and roundabouts in the browser before merging.
