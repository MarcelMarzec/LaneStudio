<?php
defined('STATISTICS') or exit;
// What each changeset changed, from its edits (the OpenStreetMap API's osmChange download): objects created,
// modified and deleted, the tag keys changed, ways with lane tags changed and the length of road edited.

/** Roads, as `highway=*` values, for the length of road edited (paths and footways don't count). */
const STATS_ROADS = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'service',
    'living_street', 'road', 'busway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
    'tertiary_link',
];

/** Lane tags: keys with a `lanes` part (`lanes`, `turn:lanes:forward`, `width:lanes`), `placement`, `cycleway*`, `busway*` */
function details_is_lane_key(string $key): bool
{
    return (bool) preg_match('/(^|:)lanes(:|$)|^(placement|cycleway|busway)(:|$)/', $key);
}

/** Fills in the details of closed changesets that don't have them yet, newest first, until the time runs out. */
function details_collect(PDO $pdo, int $deadline): void
{
    $todo = $pdo->query('SELECT id FROM ls_changesets WHERE is_open = 0 AND details_at IS NULL AND details_tries < 5
                         ORDER BY id DESC LIMIT 200')->fetchAll(PDO::FETCH_COLUMN);
    $done = 0;
    foreach ($todo as $id) {
        if (time() >= $deadline) {
            break;
        }
        $details = details_changeset((int) $id, $deadline);
        if ($details === null && time() >= $deadline) {
            break; // out of time: carry on next time
        }
        if ($details === null) {
            $pdo->prepare('UPDATE ls_changesets SET details_tries = details_tries + 1 WHERE id = ?')->execute([$id]);
            stats_log("Changeset $id: its edits could not be read; trying again next time");
            continue;
        }
        $details['details_at'] = gmdate('Y-m-d H:i:s');
        $set = implode(', ', array_map(fn ($c) => "$c = :$c", array_keys($details)));
        $pdo->prepare("UPDATE ls_changesets SET $set WHERE id = :id")->execute($details + ['id' => $id]);
        $done++;
    }
    if ($todo) {
        stats_log("Read the edits of $done of " . count($todo) . ' changesets waiting');
    }
}

/** One changeset's details, as columns of ls_changesets, or null if its edits could not be read. */
function details_changeset(int $id, int $deadline): ?array
{
    [$status, $body] = stats_api("/changeset/$id/download");
    $change = $status === 200 ? simplexml_load_string($body) : false;
    if ($change === false) {
        return null;
    }

    // Each object once: what happened to it, its first and last version in the changeset, and its last state
    $objects = [];
    $counts = ['create' => 0, 'modify' => 0, 'delete' => 0];
    $coordinates = [];
    foreach ($change->children() as $action => $block) {
        if (!isset($counts[$action])) {
            continue;
        }
        foreach ($block->children() as $type => $element) {
            $key = $type . (string) $element['id'];
            $version = (int) $element['version'];
            $tags = [];
            foreach ($element->tag as $tag) {
                $tags[(string) $tag['k']] = (string) $tag['v'];
            }
            $nodes = [];
            foreach ($element->nd as $nd) {
                $nodes[] = (int) $nd['ref'];
            }
            if ($type === 'node' && isset($element['lat'])) {
                $coordinates[(int) $element['id']] = [(float) $element['lat'], (float) $element['lon']];
            }
            $first = $objects[$key] ?? null;
            $objects[$key] = [
                'type'    => $type,
                'id'      => (int) $element['id'],
                'action'  => $action,
                'created' => ($first['created'] ?? false) || $action === 'create',
                'first'   => $first['first'] ?? $version,
                'tags'    => $tags,
                'nodes'   => $nodes,
            ];
        }
    }
    foreach ($objects as $object) {
        $counts[$object['created'] ? 'create' : $object['action']]++;
    }

    // Tags before the changeset, for objects it didn't create: every way and relation, and nodes with tags now
    $before = details_previous_tags($objects, $deadline);
    if ($before === null) {
        return null;
    }

    $keys = [];
    $laneWays = 0;
    $roads = [];
    foreach ($objects as $key => $object) {
        $old = $object['created'] ? [] : ($before[$key] ?? null);
        $new = $object['action'] === 'delete' ? [] : $object['tags'];
        if ($old === null) {
            continue; // an untagged node moved or deleted, or a version that can't be read
        }
        $changed = [];
        foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $k) {
            if (($old[$k] ?? null) !== ($new[$k] ?? null)) {
                $changed[] = (string) $k;
            }
        }
        foreach ($changed as $k) {
            $keys[$k] = ($keys[$k] ?? 0) + 1;
        }
        if ($object['type'] === 'way' && array_filter($changed, 'details_is_lane_key')) {
            $laneWays++;
        }
        if ($object['type'] === 'way' && $object['action'] !== 'delete'
            && in_array($new['highway'] ?? '', STATS_ROADS, true)) {
            $roads[] = $object['nodes'];
        }
    }
    arsort($keys);
    $length = details_length($roads, $coordinates, $deadline);
    if ($length === null) {
        return null; // out of time
    }

    return [
        'created'   => $counts['create'],
        'modified'  => $counts['modify'],
        'deleted'   => $counts['delete'],
        'road_ways' => count($roads),
        'lane_ways' => $laneWays,
        'road_m'    => $length,
        'tag_keys'  => json_encode(array_slice($keys, 0, 100, true), JSON_UNESCAPED_UNICODE),
    ];
}

/**
 * The tags each object had before the changeset ("way123" => tags), fetched as the version before its first one
 * here, many at a time. Objects the changeset created, untagged nodes and versions that can't be read (redacted)
 * are left out. Null if the API can't be reached.
 */
function details_previous_tags(array $objects, int $deadline): ?array
{
    $wanted = ['node' => [], 'way' => [], 'relation' => []];
    foreach ($objects as $key => $object) {
        if ($object['created'] || $object['first'] < 2) {
            continue;
        }
        if ($object['type'] === 'node' && (!$object['tags'] || $object['action'] === 'delete')) {
            continue;
        }
        $wanted[$object['type']][$key] = $object['id'] . 'v' . ($object['first'] - 1);
    }

    $before = [];
    $requests = 0;
    foreach ($wanted as $type => $versions) {
        foreach (array_chunk($versions, 100, true) as $chunk) {
            if (time() >= $deadline) {
                return null;
            }
            if (++$requests > 40) {
                return $before; // a very large changeset: its first few thousand objects are enough
            }
            [$status, $body] = stats_api("/{$type}s?{$type}s=" . implode(',', $chunk));
            if ($status === 404 || $status === 403) {
                // one of them can't be read (a redacted version): fetch them one by one, a few at most
                foreach (array_slice($chunk, 0, 10, true) as $versioned) {
                    [$id, $version] = explode('v', $versioned);
                    [$status, $body] = stats_api("/$type/$id/$version");
                    if ($status === 200) {
                        $before += details_tags_of($body);
                    }
                }
                continue;
            }
            if ($status !== 200) {
                return null;
            }
            $before += details_tags_of($body);
        }
    }
    return $before;
}

/** The tags of each element in an <osm> document: ["way123" => [k => v]] */
function details_tags_of(string $body): array
{
    $osm = simplexml_load_string($body);
    $tags = [];
    foreach ($osm ? $osm->children() : [] as $type => $element) {
        $key = $type . (string) $element['id'];
        $tags[$key] = [];
        foreach ($element->tag as $tag) {
            $tags[$key][(string) $tag['k']] = (string) $tag['v'];
        }
    }
    return $tags;
}

/**
 * The length in metres of the given roads (lists of node ids). Nodes the changeset didn't touch are fetched where
 * they are now, up to a few thousand; segments with a node that can't be placed are left out. Null if the time
 * runs out.
 */
function details_length(array $roads, array $coordinates, int $deadline): ?float
{
    if (!$roads) {
        return 0.0;
    }
    $missing = [];
    foreach ($roads as $nodes) {
        foreach ($nodes as $node) {
            if (!isset($coordinates[$node])) {
                $missing[$node] = true;
            }
        }
    }
    foreach (array_chunk(array_slice(array_keys($missing), 0, 5000), 200) as $chunk) {
        if (time() >= $deadline) {
            return null;
        }
        [$status, $body] = stats_api('/nodes?nodes=' . implode(',', $chunk));
        $osm = $status === 200 ? simplexml_load_string($body) : false;
        foreach ($osm ? $osm->node : [] as $node) {
            if (isset($node['lat'])) {
                $coordinates[(int) $node['id']] = [(float) $node['lat'], (float) $node['lon']];
            }
        }
    }

    $metres = 0.0;
    foreach ($roads as $nodes) {
        for ($i = 1; $i < count($nodes); $i++) {
            $a = $coordinates[$nodes[$i - 1]] ?? null;
            $b = $coordinates[$nodes[$i]] ?? null;
            if ($a && $b) {
                $metres += details_distance($a, $b);
            }
        }
    }
    return round($metres, 1);
}

/** Metres between two [lat, lon] points (haversine) */
function details_distance(array $a, array $b): float
{
    $toRadians = M_PI / 180;
    $dLat = ($b[0] - $a[0]) * $toRadians;
    $dLon = ($b[1] - $a[1]) * $toRadians;
    $h = sin($dLat / 2) ** 2 + cos($a[0] * $toRadians) * cos($b[0] * $toRadians) * sin($dLon / 2) ** 2;
    return 2 * 6371008.8 * asin(min(1, sqrt($h)));
}
