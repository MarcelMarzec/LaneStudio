## Lane Studio Privacy Policy

Lane Studio is an open source OpenStreetMap editor built on [iD](https://github.com/openstreetmap/iD).
You do not need Lane Studio to use or edit OpenStreetMap, and the OpenStreetMap Foundation does not
operate it. You can learn more about OpenStreetMap and the OpenStreetMap Foundation at
[https://www.openstreetmap.org/about](https://www.openstreetmap.org/about) and
[https://wiki.osmfoundation.org/wiki/Main_Page](https://wiki.osmfoundation.org/wiki/Main_Page).
The project's code and issues are at [https://github.com/MarcelMarzec/iD](https://github.com/MarcelMarzec/iD).

### The website and source code

Lane Studio is a static website: it has no server-side code, accounts or database of its own, and
runs entirely in your browser. The web server that hosts it keeps ordinary access logs (such as your
IP address, the pages and files requested, and your browser's user agent), which are used only to keep
the site running. The pages describing Lane Studio at lanestudio.marcelmarzec.com load their
typefaces from Google Fonts, so Google receives your IP address when one of them opens, under
[Google's privacy policy](https://policies.google.com/privacy); they set no cookies. If you interact with the project on GitHub, you do so under
[GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

### Storage in your browser

Lane Studio does not set tracking cookies and does not collect analytics. It stores some information
in your browser's local storage so you don't have to re-enter it: your settings (such as lane opacity,
the map layers shown, whether the what's new menu is shown, whether the Lanes section's Look ahead
and Roadside are folded away, and whether land use and brand logos are shown), the Lane Studio version you last used
(so the what's new menu shows only what changed since) and edits you have not saved yet, under keys
starting with `lanes_`, and
your OpenStreetMap login token, under a key named after the OpenStreetMap server. This stays on your
device; you can delete it by clearing the site's data in your
browser, which also logs you out and discards unsaved edits.

### Logging into OpenStreetMap

To save edits you must log into your OpenStreetMap account. Logging in happens on openstreetmap.org
(or a login service you choose there) and is governed by its privacy policy; Lane Studio never sees
your password, only a token that lets it save edits on your behalf.

### Changeset information

When you save, Lane Studio uploads your edits to OpenStreetMap with the OpenStreetMap API. Along with
the information recorded for every OpenStreetMap edit, each changeset carries tags that identify the
editor and help quality control: `created_by=LaneStudio <version>`, the page address it was made from
(`host`), the language of the editor (`locale`), the imagery used (`imagery_used`), how many
changesets you had made before (`changesets_count`), any warnings you saved with, and your progress
through iD's walkthrough. See [modules/ui/commit.js](modules/ui/commit.js) for details. The
[OSMF privacy policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy) governs this data in the
OpenStreetMap database.

### Background imagery and other third-party services

Your browser fetches map data from the OpenStreetMap API, and, if you use them, background and
street-level imagery from third-party hosts. Each host's privacy policy governs that use. The
[Editor Layer Index](https://github.com/osmlab/editor-layer-index) lists the imagery sources.
Searching uses OpenStreetMap's [Nominatim](https://nominatim.openstreetmap.org/), and tag suggestions
use [taginfo](https://taginfo.openstreetmap.org/). If you do not wish to interact with these third
parties, do not use these features.

Lane Studio's changelog, for the what's new menu, is fetched from the site Lane Studio is served from.

Brand logos (Lane Studio pane, "Show brand logos", on unless turned off) are looked up on
[Wikidata](https://www.wikidata.org/) for the brands (`brand:wikidata=*`) of features in view, and the
logo images loaded from [Wikimedia Commons](https://commons.wikimedia.org/). The Wikimedia Foundation's
[privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy) governs that use. Turn the
setting off not to contact them for logos.

Lane Studio fetches some resources (tagging presets and indexes) from the [jsDelivr](https://www.jsdelivr.com/)
content delivery network, governed by its
[privacy policy](https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net).

### Name Suggestion Index

iD's Name Suggestion Index helps map brand names consistently. It can fetch information and brand
logos from third-party sites, including Wikidata and Wikimedia Commons, governed by their privacy
policies such as [https://foundation.wikimedia.org/wiki/Privacy_policy](https://foundation.wikimedia.org/wiki/Privacy_policy).
You can turn this off in Preferences → Privacy.

### Contact

If you believe information about you has been processed in violation of this policy or applicable
law, or want to ask about it, open an issue at
[https://github.com/MarcelMarzec/iD/issues](https://github.com/MarcelMarzec/iD/issues).

### Changelog

* _2026-Oct-28_ - Brand logos are looked up on Wikidata and loaded from Wikimedia Commons (can be turned off); the land use and brand logo settings are stored with your settings.
* _2026-Oct-28_ - Whether Look ahead and Roadside are folded away is stored with your settings.
* _2026-Oct-27_ - The website's pages, now part of this project, load fonts from Google Fonts.
* _2026-Oct-27_ - The version last used and the what's new setting are stored; the changelog is fetched from the site itself.
* _2026-Oct-21_ - Lane Studio's own policy, adapted from [iD's](https://github.com/openstreetmap/iD/blob/develop/PRIVACY.md).
