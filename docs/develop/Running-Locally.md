# Running locally

```sh
npm clean-install
npm run all                         # builds styles, data, icons, both apps and the site (needs network)
ID_API_CONNECTION=dev npm start     # dev OSM server only, so test edits never reach the live map
```

| URL | What |
| --- | --- |
| http://127.0.0.1:8080/lanes.html | Lane Studio |
| http://127.0.0.1:8080/ | Plain iD, for comparison (not part of the website) |

`npm start` rebuilds JavaScript, CSS and Lane Studio's strings (`data/lanes.yaml`) on save; reload the page to see a
change.

## Checks before pushing

```sh
npm run lint
npx tsc
npm run test:once                   # or npx vitest run test/spec/lanes for Lane Studio's tests only
```

Never run `npm run build:data` or `npm run all` without network access: the data step deletes files when it can't
download.

## Trying the wiki

```sh
node scripts/build_wiki.js <folder>
```

writes the wiki's pages from `docs/` into a folder (see [Releasing](../RELEASING.md#the-wiki)).
