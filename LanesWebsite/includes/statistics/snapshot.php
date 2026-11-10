<?php
defined('STATISTICS') or exit;
// Writes what the pages show into the website's /data/ folder, so a page view never touches the database:
// statistics.json (the figures, the latest changesets and the leaderboard) and changesets.geojson (the map's points).

/** Changesets whose bounding box is wider than this (metres corner to corner) are counted but not put on the map. */
const STATS_MAP_WIDEST = 50000;

function snapshot_write(PDO $pdo, array $config): void
{
    $hidden = array_map('intval', $config['hidden_users']);
    $now = time();
    $day = fn (int $time) => gmdate('Y-m-d H:i:s', $time);
    $one = function (string $sql, array $params = []) use ($pdo) {
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetch();
    };
    $all = function (string $sql, array $params = []) use ($pdo) {
        $statement = $pdo->prepare($sql);
        $statement->execute($params);
        return $statement->fetchAll();
    };
    $name = fn (array $row) => in_array((int) $row['uid'], $hidden, true) ? null : $row['username'];

    $totals = $one('SELECT COUNT(*) AS changesets, COUNT(DISTINCT uid) AS mappers,
                           COALESCE(SUM(num_changes), 0) AS changes,
                           COUNT(details_at) AS detailed,
                           COALESCE(SUM(created), 0) AS created, COALESCE(SUM(modified), 0) AS modified,
                           COALESCE(SUM(deleted), 0) AS deleted, COALESCE(SUM(lane_ways), 0) AS lane_ways,
                           COALESCE(SUM(road_ways), 0) AS road_ways, COALESCE(SUM(road_m), 0) AS road_m,
                           MIN(created_at) AS first
                    FROM ls_changesets');
    $recent = fn (int $days) => $one('SELECT COUNT(*) AS changesets, COUNT(DISTINCT uid) AS mappers
                                       FROM ls_changesets WHERE created_at >= ?', [$day($now - $days * 86400)]);
    $newMappers = $one('SELECT COUNT(*) AS n FROM (SELECT uid FROM ls_changesets GROUP BY uid
                                                   HAVING MIN(created_at) >= ?) AS firsts',
                       [$day($now - 30 * 86400)]);
    $countries = $all("SELECT country, COUNT(*) AS changesets FROM ls_changesets
                       WHERE country IS NOT NULL AND country <> '' GROUP BY country ORDER BY changesets DESC");

    $names = countries_names();
    $country = function (?string $code) use ($names) {
        return $code ? ['code' => $code] + ($names[$code] ?? ['name' => $code, 'flag' => '']) : null;
    };

    // Changesets and mappers each day, from the first day collected to today
    $perDay = [];
    foreach ($all('SELECT SUBSTR(created_at, 1, 10) AS day, COUNT(*) AS changesets, COUNT(DISTINCT uid) AS mappers
                   FROM ls_changesets GROUP BY SUBSTR(created_at, 1, 10)') as $row) {
        $perDay[$row['day']] = $row;
    }
    $daily = [];
    $first = min(strtotime($config['start'] . ' UTC'), $totals['first'] ? strtotime($totals['first'] . ' UTC') : $now);
    for ($t = $first; $t <= $now; $t += 86400) {
        $date = gmdate('Y-m-d', $t);
        $daily[] = [
            'date'       => $date,
            'changesets' => (int) ($perDay[$date]['changesets'] ?? 0),
            'mappers'    => (int) ($perDay[$date]['mappers'] ?? 0),
        ];
    }

    $versions = $all('SELECT version, COUNT(*) AS changesets FROM ls_changesets GROUP BY version');
    usort($versions, fn ($a, $b) => strnatcmp($b['version'], $a['version']));

    // The leaderboard: most changesets, then most changes; the name is the one on their latest changeset
    $leaders = [];
    $board = $all('SELECT uid, COUNT(*) AS changesets, SUM(num_changes) AS changes, MAX(id) AS latest
                   FROM ls_changesets GROUP BY uid ORDER BY changesets DESC, changes DESC');
    foreach ($board as $row) {
        if (in_array((int) $row['uid'], $hidden, true)) {
            continue;
        }
        $latest = $one('SELECT username, created_at FROM ls_changesets WHERE id = ?', [$row['latest']]);
        $leaders[] = [
            'user'       => $latest['username'],
            'changesets' => (int) $row['changesets'],
            'changes'    => (int) $row['changes'],
            'last'       => snapshot_iso($latest['created_at']),
        ];
        if (count($leaders) === 10) {
            break;
        }
    }

    // The tag keys changed most, over every changeset whose edits have been read
    $keys = [];
    foreach ($all('SELECT tag_keys FROM ls_changesets WHERE tag_keys IS NOT NULL') as $row) {
        foreach (json_decode($row['tag_keys'], true) ?: [] as $key => $count) {
            $keys[$key] = ($keys[$key] ?? 0) + $count;
        }
    }
    arsort($keys);
    $tags = [];
    foreach (array_slice($keys, 0, 12, true) as $key => $count) {
        $tags[] = ['key' => (string) $key, 'objects' => $count];
    }

    $changeset = fn (array $row) => [
        'id'      => (int) $row['id'],
        'user'    => $name($row),
        'comment' => $row['comment'],
        'time'    => snapshot_iso($row['created_at']),
        'changes' => (int) $row['num_changes'],
        'version' => $row['version'],
        'country' => $country($row['country']),
        'bbox'    => $row['min_lat'] === null ? null : array_map('floatval',
            [$row['min_lon'], $row['min_lat'], $row['max_lon'], $row['max_lat']]),
    ];
    $latest = array_map($changeset, $all('SELECT * FROM ls_changesets ORDER BY created_at DESC, id DESC LIMIT 5'));

    // How far the feed has been read: the feed writes a file about once a minute
    $feedSequence = (int) stats_meta($pdo, 'feed_sequence');
    $feedTime = (int) stats_meta($pdo, 'feed_time');
    $sequence = (int) stats_meta($pdo, 'sequence');
    $upTo = $feedTime ? $feedTime - max(0, $feedSequence - $sequence) * 60 : null;

    $statistics = [
        'generated' => gmdate('c', $now),
        'start'     => $config['start'],
        'up_to'     => $upTo ? gmdate('c', $upTo) : null,
        'catching_up' => $upTo !== null && $upTo < $now - 3600,
        'totals'    => [
            'changesets'  => (int) $totals['changesets'],
            'mappers'     => (int) $totals['mappers'],
            'changes'     => (int) $totals['changes'],
            'countries'   => count($countries),
            'detailed'    => (int) $totals['detailed'],
            'created'     => (int) $totals['created'],
            'modified'    => (int) $totals['modified'],
            'deleted'     => (int) $totals['deleted'],
            'lane_ways'   => (int) $totals['lane_ways'],
            'road_ways'   => (int) $totals['road_ways'],
            'road_km'     => round($totals['road_m'] / 1000, 1),
            'week'        => array_map('intval', $recent(7)),
            'month'       => array_map('intval', $recent(30)),
            'new_mappers' => (int) $newMappers['n'],
        ],
        'latest'      => $latest,
        'leaderboard' => $leaders,
        'daily'       => $daily,
        'versions'    => array_map(fn ($r) => ['version' => $r['version'], 'changesets' => (int) $r['changesets']],
            $versions),
        'countries'   => array_map(fn ($r) => $country($r['country']) + ['changesets' => (int) $r['changesets']],
            $countries),
        'tags'        => $tags,
    ];

    // The map's points: each changeset at the centre of its bounding box
    $features = [];
    $rows = $pdo->query('SELECT id, uid, username, created_at, num_changes, comment, version,
                                min_lat, min_lon, max_lat, max_lon
                         FROM ls_changesets WHERE min_lat IS NOT NULL ORDER BY created_at');
    while ($row = $rows->fetch()) {
        $size = details_distance([(float) $row['min_lat'], (float) $row['min_lon']],
                                 [(float) $row['max_lat'], (float) $row['max_lon']]);
        if ($size > STATS_MAP_WIDEST) {
            continue;
        }
        $features[] = [
            'type'       => 'Feature',
            'geometry'   => ['type' => 'Point', 'coordinates' => [
                round(($row['min_lon'] + $row['max_lon']) / 2, 5),
                round(($row['min_lat'] + $row['max_lat']) / 2, 5),
            ]],
            'properties' => [
                'id'      => (int) $row['id'],
                'user'    => $name($row),
                'time'    => snapshot_iso($row['created_at']),
                'changes' => (int) $row['num_changes'],
                'comment' => $row['comment'] === null ? null : mb_substr($row['comment'], 0, 140),
                'version' => $row['version'],
            ],
        ];
    }

    snapshot_save($config['output'] . '/statistics.json', $statistics);
    snapshot_save($config['output'] . '/changesets.geojson', ['type' => 'FeatureCollection', 'features' => $features]);
    stats_log("Wrote the statistics: {$statistics['totals']['changesets']} changesets, " . count($features) . ' on the map');
}

function snapshot_iso(?string $time): ?string
{
    return $time ? str_replace(' ', 'T', $time) . 'Z' : null;
}

/** Writes JSON to a file in one go (to a temporary file, then renamed), so a page never reads half of it. */
function snapshot_save(string $file, array $data): void
{
    if (!is_dir(dirname($file))) {
        mkdir(dirname($file), 0755, true);
    }
    $temporary = $file . '.tmp';
    file_put_contents($temporary, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    rename($temporary, $file);
}
