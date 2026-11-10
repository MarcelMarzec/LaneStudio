<?php
// Collects the changesets made with Lane Studio for the website's statistics. Run by cron every 5 minutes:
//
//   php /home/CPANELUSER/public_html/includes/statistics/collect.php --quiet
//
// Each run reads OpenStreetMap's changeset feed from where the last one stopped, reads the edits of new changesets,
// and writes /data/statistics.json and /data/changesets.geojson for the pages. A run stops after about 4 minutes, so
// runs never overlap; the first ones catch up from the `start` day in config.php. See docs/develop/Statistics.md.
//
// Options:
//   --quiet           print nothing unless something goes wrong
//   --time=SECONDS    how long a run may take (240)
//   --snapshot        only write the data files again
//   --changeset=ID    add one changeset the feed missed (if it was made with Lane Studio)

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('STATISTICS', true);
require __DIR__ . '/lib.php';
require __DIR__ . '/replication.php';
require __DIR__ . '/details.php';
require __DIR__ . '/countries.php';
require __DIR__ . '/snapshot.php';

$options = getopt('', ['quiet', 'time:', 'snapshot', 'changeset:']);
$GLOBALS['stats_quiet'] = isset($options['quiet']);
$deadline = time() + (int) ($options['time'] ?? 240);

// One run at a time: a run still going when cron starts the next one keeps going alone
$lock = fopen(__DIR__ . '/collect.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    stats_log('Another run is still going');
    exit(0);
}

try {
    $config = stats_config();
    $pdo = stats_db($config);

    if (isset($options['changeset'])) {
        $id = (int) $options['changeset'];
        fwrite(STDOUT, repl_add_changeset($pdo, $config, $id)
            ? "Added changeset $id\n" : "Changeset $id was not made with Lane Studio, or could not be read\n");
    } elseif (!isset($options['snapshot'])) {
        repl_collect($pdo, $config, $deadline - 60);
    }
    if (!isset($options['snapshot'])) {
        countries_collect($pdo);
        details_collect($pdo, $deadline - 10);
    }
    snapshot_write($pdo, $config);
} catch (Throwable $error) {
    fwrite(STDERR, 'Lane Studio statistics: ' . $error->getMessage() . "\n");
    exit(1);
}
