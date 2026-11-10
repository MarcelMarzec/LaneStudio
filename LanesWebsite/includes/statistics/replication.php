<?php
defined('STATISTICS') or exit;
// Reads OpenStreetMap's changeset replication feed: a small file each minute listing every changeset opened,
// closed or commented on in that minute, at https://planet.openstreetmap.org/replication/changesets/.

/**
 * Where the feed's files really are (planet.openstreetmap.org redirects to a mirror), and its latest sequence
 * number and time: ['base' => url, 'sequence' => int, 'time' => unix time].
 */
function repl_state(): array
{
    [$status, $body, $url] = stats_get(STATS_REPLICATION . 'state.yaml', 30);
    if ($status !== 200 || !preg_match('/sequence:\s*(\d+)/', $body, $sequence)) {
        throw new RuntimeException("The changeset feed's state could not be read (HTTP $status).");
    }
    preg_match('/last_run:\s*([0-9-]+ [0-9:]+)/', $body, $time);
    return [
        'base'     => substr($url, 0, -strlen('state.yaml')),
        'sequence' => (int) $sequence[1],
        'time'     => isset($time[1]) ? strtotime($time[1] . ' UTC') : time(),
    ];
}

/** A sequence number's place in the feed: 7261745 → 007/261/745 */
function repl_path(int $sequence): string
{
    $digits = sprintf('%09d', $sequence);
    return substr($digits, 0, 3) . '/' . substr($digits, 3, 3) . '/' . substr($digits, 6, 3);
}

/** When a file in the feed was written (from its .state.txt), or null if it can't be read. */
function repl_sequence_time(string $base, int $sequence): ?int
{
    [$status, $body] = stats_get($base . repl_path($sequence) . '.state.txt', 30);
    if ($status !== 200 || !preg_match('/last_run:\s*([0-9-]+ [0-9:]+)/', $body, $time)) {
        return null;
    }
    return strtotime($time[1] . ' UTC');
}

/** The last file in the feed written before a time: about one a minute, so estimate and then correct it. */
function repl_sequence_at(array $state, int $time): int
{
    $sequence = $state['sequence'] - intdiv(max(0, $state['time'] - $time), 60);
    for ($i = 0; $i < 6; $i++) {
        $at = repl_sequence_time($state['base'], $sequence);
        if ($at === null) {
            break;
        }
        $off = intdiv($at - $time, 60);
        if ($off <= 0 && $off > -5) {
            break;
        }
        $sequence = min($state['sequence'], max(1, $sequence - $off - 2));
    }
    return $sequence;
}

/** The Lane Studio changesets in one of the feed's files, as rows for ls_changesets. */
function repl_changesets(string $gzipped, string $createdBy): array
{
    $xml = @gzdecode($gzipped);
    if ($xml === false) {
        throw new RuntimeException('A file in the changeset feed could not be unpacked.');
    }
    if (!str_contains($xml, $createdBy)) {
        return [];
    }
    $osm = simplexml_load_string($xml);
    if ($osm === false) {
        throw new RuntimeException('A file in the changeset feed could not be read.');
    }
    $rows = [];
    foreach ($osm->changeset as $changeset) {
        if ($row = repl_row($changeset, $createdBy)) {
            $rows[] = $row;
        }
    }
    return $rows;
}

/** A <changeset> element (from the feed or the API) as a row for ls_changesets, or null if not Lane Studio's. */
function repl_row(SimpleXMLElement $changeset, string $createdBy): ?array
{
    $tags = [];
    foreach ($changeset->tag as $tag) {
        $tags[(string) $tag['k']] = (string) $tag['v'];
    }
    $editor = $tags['created_by'] ?? '';
    if (!preg_match('/^' . preg_quote($createdBy, '/') . '\b\s*v?(.*)$/', $editor, $match)) {
        return null;
    }
    $a = $changeset->attributes();
    $coordinate = fn ($name) => isset($a[$name]) ? (float) $a[$name] : null;
    return [
        'id'             => (int) $a['id'],
        'uid'            => (int) $a['uid'],
        'username'       => (string) $a['user'],
        'created_at'     => stats_time((string) $a['created_at']),
        'closed_at'      => stats_time((string) ($a['closed_at'] ?? '')),
        'is_open'        => (string) $a['open'] === 'true' ? 1 : 0,
        'num_changes'    => (int) ($a['num_changes'] ?? 0),
        'comments_count' => (int) ($a['comments_count'] ?? 0),
        'min_lat'        => $coordinate('min_lat'),
        'min_lon'        => $coordinate('min_lon'),
        'max_lat'        => $coordinate('max_lat'),
        'max_lon'        => $coordinate('max_lon'),
        'comment'        => isset($tags['comment']) ? mb_substr($tags['comment'], 0, 255) : null,
        'version'        => mb_substr(trim($match[1]) ?: 'unknown', 0, 32),
    ];
}

/**
 * Reads the feed's files after the last one read, saving the Lane Studio changesets in them, until it is up to
 * date or the time runs out. Several files are fetched at once while catching up.
 */
function repl_collect(PDO $pdo, array $config, int $deadline): void
{
    $state = repl_state();
    $last = stats_meta($pdo, 'sequence');
    if ($last === null) {
        $start = strtotime($config['start'] . ' UTC');
        $last = repl_sequence_at($state, $start) - 1;
        stats_log('Starting from ' . gmdate('Y-m-d H:i', $start) . " (feed file $last)");
    }
    $last = (int) $last;
    stats_set_meta($pdo, 'feed_sequence', (string) $state['sequence']);
    stats_set_meta($pdo, 'feed_time', (string) $state['time']);

    $found = 0;
    $read = 0;
    $failures = 0;
    while ($last < $state['sequence'] && time() < $deadline) {
        $batch = range($last + 1, min($last + 8, $state['sequence']));
        $urls = array_map(fn ($s) => $state['base'] . repl_path($s) . '.osm.gz', $batch);
        $results = stats_get_many($urls);

        $pdo->beginTransaction();
        foreach ($batch as $i => $sequence) {
            [$status, $body] = $results[$urls[$i]];
            if ($status === 404 && $sequence < $state['sequence'] - 60) {
                // a file the feed never wrote (it happens rarely): nothing to read
                stats_log("Feed file $sequence is missing; skipped");
            } elseif ($status !== 200) {
                stats_log("Feed file $sequence: HTTP $status");
                break;
            } else {
                foreach (repl_changesets($body, $config['created_by']) as $row) {
                    stats_upsert($pdo, 'ls_changesets', 'id', $row);
                    $found++;
                }
            }
            $last = $sequence;
            $read++;
        }
        stats_set_meta($pdo, 'sequence', (string) $last);
        $pdo->commit();
        if ($last !== end($batch)) {
            // a file that couldn't be fetched: try again in a moment, and next run after three goes
            if (++$failures === 3) {
                stats_log('Trying again next time');
                break;
            }
            sleep(5);
        } else {
            $failures = 0;
        }
    }
    $behind = $state['sequence'] - $last;
    stats_log("Read $read feed files, found $found Lane Studio changesets" . ($behind ? ", $behind files behind" : ''));
}

/** Adds one changeset by its number, from the API: for one the feed missed. */
function repl_add_changeset(PDO $pdo, array $config, int $id): bool
{
    [$status, $body] = stats_api("/changeset/$id");
    $osm = $status === 200 ? simplexml_load_string($body) : false;
    $row = $osm ? repl_row($osm->changeset, $config['created_by']) : null;
    if ($row) {
        stats_upsert($pdo, 'ls_changesets', 'id', $row);
    }
    return (bool) $row;
}
