# Statistics

The website's statistics (the map and figures on its front page, and `/statistics`) count every changeset whose
`created_by` starts with `LaneStudio`. A cron job on the web server collects them into a database and writes the
files the pages read, so a page view never touches the database.

## How it works

| Step | What | Where |
| --- | --- | --- |
| Find | Reads OpenStreetMap's [changeset feed](https://planet.openstreetmap.org/replication/changesets/) (a file a minute) from where it stopped, keeping Lane Studio's changesets | `replication.php` |
| Read the edits | Downloads each closed changeset's edits from the API and the versions before them: objects created, modified and deleted, tag keys changed, ways with lane tags changed, length of road edited | `details.php` |
| Country | The country at each changeset's centre, from the borders iD uses | `countries.php`, `countries.json` |
| Write | `data/statistics.json` (figures, latest 5, leaderboard, per day, countries, versions, tags) and `data/changesets.geojson` (the map's points) | `snapshot.php` |
| Show | The figures, map (MapLibre GL on OpenFreeMap's dark style), chart, lists and leaderboard | `view.php`, `statistics.php`, `index.php`, `assets/js/statistics.js` |

All in `LanesWebsite/includes/statistics/` unless named otherwise. `collect.php` runs the steps; each run stops after
about 4 minutes, and a lock keeps two runs from overlapping. The first runs catch up from the `start` day, a few hours
of runs for a month of history; the page says when it is still catching up.

The database has two tables, `ls_changesets` (one row per changeset) and `ls_meta` (how far the feed has been read).
They are created on the first run. The collector works with MySQL/MariaDB or, for trying it locally, SQLite.

## Setting it up on the server (cPanel)

1. **Deploy the website** (the **Deploy LaneStudio to server** workflow, **website**) so the files are there.
2. **Make a database:** cPanel → **MySQL Databases** → create a database (`lanestudio`) and a user with a strong
   password, then **Add User To Database** with **ALL PRIVILEGES**. cPanel puts your account name in front of both
   (`CPANELUSER_lanestudio`).
3. **Give the collector its settings:** cPanel → **File Manager** → `public_html/includes/statistics/` → copy
   `config.example.php` to `config.php` and fill in the database name, user and password. `config.php` stays on the
   server: it is never committed, and deploys leave it alone.
4. **Run it once by hand** to check it (cPanel → **Terminal**, or SSH):

   ```sh
   php ~/public_html/includes/statistics/collect.php
   ```

   It prints how far it read and how many changesets it found. An error about the database means a wrong name, user
   or password in `config.php`.
5. **Add the cron job:** cPanel → **Cron Jobs** → **Common settings: Once per five minutes** (`*/5 * * * *`), command:

   ```sh
   /usr/local/bin/php /home/CPANELUSER/public_html/includes/statistics/collect.php --quiet
   ```

   Use your account name and the PHP path your host gives (cPanel's Cron Jobs page shows it; `which php` in the
   Terminal). With `--quiet`, cron emails you only when something goes wrong.

The pages show the statistics once the first run has written `data/statistics.json`; until then `/statistics` says
they are coming and the front page leaves the section out.

## Options and settings

| `collect.php` option | Does |
| --- | --- |
| `--quiet` | Prints nothing unless something goes wrong |
| `--time=SECONDS` | How long a run may take (240) |
| `--snapshot` | Only writes the data files again |
| `--changeset=ID` | Adds one changeset by its number (if made with Lane Studio) |

| `config.php` setting | Is |
| --- | --- |
| `dsn`, `username`, `password` | The database (PDO) |
| `start` | The first day to collect, used once when the database is empty |
| `hidden_users` | OpenStreetMap user ids (`uid`) shown as "A mapper" and left off the leaderboard, for anyone who asks |

## Trying it locally

```sh
cp LanesWebsite/includes/statistics/config.example.php LanesWebsite/includes/statistics/config.php
# set 'dsn' => 'sqlite:' . __DIR__ . '/statistics.sqlite' and a recent 'start' day
php LanesWebsite/includes/statistics/collect.php
cd LanesWebsite && php -S localhost:8000 router.php
```

`config.php`, the SQLite file and `LanesWebsite/data/` are ignored by git and left out of deploys. After updating
`@rapideditor/country-coder`, run `node scripts/build_statistics_countries.js` to rebuild `countries.json`.
