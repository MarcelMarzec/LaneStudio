# Lane Studio API

Starting Lane Studio on a page, its URL parameters and build settings. iD's work too: Lane Studio runs on iD's core.

## Starting it on a page

The `lanes.js` (or `lanes.min.js`) bundle defines `LaneStudio` and `iD`. `lanes.html` is the reference page.

```html
<link rel='stylesheet' href='dist/iD.css'>
<link rel='stylesheet' href='dist/lanes.css'>
<div id='id-container'></div>
<script src='dist/lanes.min.js'></script>
<script>
  var context = LaneStudio.init(document.getElementById('id-container'), { assetPath: 'dist/' });
</script>
```

| | |
| --- | --- |
| `LaneStudio.init(container, options)` | Boots iD with Lane Studio and returns the iD context |
| `options.assetPath` | Where `dist/` is served, relative to the page (default `'dist/'`). The what's new menu reads `lanes-changelog.md` from it |
| `options.locatorOverlay` | A tile URL (`{zoom}`, `{x}`, `{y}`) for roads shown below zoom 16, in place of iD's Locator Overlay (Mapbox doesn't serve it to Lane Studio); `options.locatorOverlayCredit` credits it |
| `LaneStudio.version` | The version in the footer and in `created_by=LaneStudio <version>` |

Serve `land.html` next to the page (logins return to it). Preferences and unsaved edits are stored under a `lanes_`
prefix, apart from a plain iD on the same site.

## URL parameters

In the hash: `#map=19/52.9740/-0.0276&background=EsriWorldImagery`, percent-encoded.

| Parameter | Does | Example |
| --- | --- | --- |
| `map` | `zoom/latitude/longitude` | `map=20.00/38.90085/-77.02271` |
| `id` | Selects a feature (`n123`, `w123`, `r123`, `note/1`) and centres on it | `id=n1207480649` |
| `background` | An imagery id from iD's list, or `custom:<tile url>` | `background=custom:https://tile.openstreetmap.org/{zoom}/{x}/{y}.png` |
| `offset` | Imagery offset in metres, `east,north` | `offset=-10,5` |
| `disable_features` | Hides features: `points`, `traffic_roads`, `service_roads`, `paths`, `buildings`, `building_parts`, `indoor`, `landuse`, `boundaries`, `water`, `rail`, `pistes`, `aerialways`, `power`, `past_future`, `others` | `disable_features=water,boundaries` |
| `comment`, `hashtags`, `source` | Prefill the changeset | `hashtags=%23MissingMaps` |
| `gpx` | A GPX track to show | `gpx=https://…/track.gpx` |
| `notes` | Shows the notes layer | `notes=true` |
| `photo_overlay`, `photo`, `photo_dates`, `photo_username` | Street-level photos: layers (`streetside`, `mapillary`, `mapillary-signs`, `mapillary-map-features`, `kartaview`), one photo, a date range, users | `photo_dates=2019-01-01_2020-12-31` |
| `presets` | The only presets offered | `presets=building,highway/residential` |
| `locale` | Languages in order of preference | `locale=nl,fr` |
| `theme` | `light` or `dark` | `theme=dark` |
| `rtl` | Right-to-left layout, for testing | `rtl=true` |
| `validationDisable`, `validationSuggestion`, `validationWarning`, `validationError` | Rules (`type/subtype`, `*` wildcard) to turn off or treat as suggestions, warnings or errors | `validationWarning=crossing_ways/highway*` |
| `walkthrough` | Starts the walkthrough | `walkthrough=true` |

## Build settings

Environment variables, or a git-ignored `.env`:

| Variable | Sets |
| --- | --- |
| `ID_API_CONNECTION_URL`, `ID_API_CONNECTION_API_URL`, `ID_API_CONNECTION_CLIENT_ID` | A custom OSM server and its OAuth 2 application (the API URL defaults to the first). The deploy workflow sets them from `OSM_CLIENT_ID` |
| `ID_API_CONNECTION` | `live` (default) or `dev`, iD's built-in servers. Lane Studio offers one server, with no switch in the footer |
| `ID_PRESETS_CDN_URL` | Where to fetch presets (a schema-builder build) |
| `ENV__ID_OCI_CDN_URL`, `ENV__ID_NSI_CDN_URL`, `ENV__ID_WMF_SITEMATRIX_CDN_URL` | Hosted osm-community-index, name-suggestion-index, wmf-sitematrix |
| `ID_TAGINFO_API_URL`, `ID_NOMINATIM_API_URL` | Taginfo and Nominatim services |

CSS classes, services, imagery and presets can be customised: [Customising](develop/Customising.md).
