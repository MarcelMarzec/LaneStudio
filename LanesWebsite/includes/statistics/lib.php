<?php
defined('STATISTICS') or exit;
// Shared by the statistics collector: settings, the database and HTTP. See docs/develop/Statistics.md.

const STATS_API         = 'https://api.openstreetmap.org/api/0.6';
const STATS_REPLICATION = 'https://planet.openstreetmap.org/replication/changesets/';
const STATS_USER_AGENT  = 'LaneStudioStatistics/1.0 (+https://github.com/MarcelMarzec/LaneStudio)';

/** The settings in config.php (or the file named by LANES_STATISTICS_CONFIG), with defaults filled in. */
function stats_config(): array
{
    $file = getenv('LANES_STATISTICS_CONFIG') ?: __DIR__ . '/config.php';
    if (!is_readable($file)) {
        throw new RuntimeException("No settings: copy config.example.php to $file and fill it in.");
    }
    return (require $file) + [
        'username'     => null,
        'password'     => null,
        'start'        => '2026-10-12',
        'hidden_users' => [],
        // the start of `created_by` that marks a Lane Studio changeset
        'created_by'   => 'LaneStudio',
        // where the pages' data files are written: the website's /data/ folder
        'output'       => dirname(__DIR__, 2) . '/data',
    ];
}

/** Opens the database and creates its tables the first time. */
function stats_db(array $config): PDO
{
    $pdo = new PDO($config['dsn'], $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $mysql = stats_is_mysql($pdo);
    $table = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';

    $pdo->exec('CREATE TABLE IF NOT EXISTS ls_meta (
        name  VARCHAR(64) NOT NULL PRIMARY KEY,
        value TEXT NULL
    )' . $table);

    // Times are UTC, as 'YYYY-MM-DD HH:MM:SS'. The columns from `created` on are filled in later from the
    // changeset's edits (details_at says when), and `country` from its centre.
    $pdo->exec('CREATE TABLE IF NOT EXISTS ls_changesets (
        id             BIGINT       NOT NULL PRIMARY KEY,
        uid            BIGINT       NOT NULL,
        username       VARCHAR(255) NOT NULL,
        created_at     CHAR(19)     NOT NULL,
        closed_at      CHAR(19)     NULL,
        is_open        SMALLINT     NOT NULL DEFAULT 0,
        num_changes    INT          NOT NULL DEFAULT 0,
        comments_count INT          NOT NULL DEFAULT 0,
        min_lat        DOUBLE PRECISION NULL,
        min_lon        DOUBLE PRECISION NULL,
        max_lat        DOUBLE PRECISION NULL,
        max_lon        DOUBLE PRECISION NULL,
        comment        TEXT         NULL,
        version        VARCHAR(32)  NOT NULL,
        country        VARCHAR(8)   NULL,
        created        INT          NULL,
        modified       INT          NULL,
        deleted        INT          NULL,
        road_ways      INT          NULL,
        lane_ways      INT          NULL,
        road_m         DOUBLE PRECISION NULL,
        tag_keys       TEXT         NULL,
        details_at     CHAR(19)     NULL,
        details_tries  INT          NOT NULL DEFAULT 0
    )' . $table);

    $indexes = ['ls_changesets_created' => 'created_at', 'ls_changesets_uid' => 'uid'];
    foreach ($indexes as $name => $column) {
        if ($mysql) {
            $exists = $pdo->query("SHOW INDEX FROM ls_changesets WHERE Key_name = '$name'")->fetch();
            if (!$exists) {
                $pdo->exec("CREATE INDEX $name ON ls_changesets ($column)");
            }
        } else {
            $pdo->exec("CREATE INDEX IF NOT EXISTS $name ON ls_changesets ($column)");
        }
    }
    return $pdo;
}

function stats_is_mysql(PDO $pdo): bool
{
    return $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
}

/**
 * INSERT … or, when a row with the same key exists, UPDATE the other given columns: written for MySQL/MariaDB and
 * SQLite alike.
 */
function stats_upsert(PDO $pdo, string $table, string $key, array $row): void
{
    $columns = array_keys($row);
    $names = implode(', ', $columns);
    $params = implode(', ', array_map(fn ($c) => ":$c", $columns));
    $others = array_filter($columns, fn ($c) => $c !== $key);
    if (stats_is_mysql($pdo)) {
        $set = implode(', ', array_map(fn ($c) => "$c = VALUES($c)", $others));
        $sql = "INSERT INTO $table ($names) VALUES ($params) ON DUPLICATE KEY UPDATE $set";
    } else {
        $set = implode(', ', array_map(fn ($c) => "$c = excluded.$c", $others));
        $sql = "INSERT INTO $table ($names) VALUES ($params) ON CONFLICT($key) DO UPDATE SET $set";
    }
    $pdo->prepare($sql)->execute($row);
}

function stats_meta(PDO $pdo, string $name): ?string
{
    $statement = $pdo->prepare('SELECT value FROM ls_meta WHERE name = ?');
    $statement->execute([$name]);
    $value = $statement->fetchColumn();
    return $value === false ? null : $value;
}

function stats_set_meta(PDO $pdo, string $name, ?string $value): void
{
    stats_upsert($pdo, 'ls_meta', 'name', ['name' => $name, 'value' => $value]);
}

/** OSM's times (`2026-11-10T08:58:59Z`) as the database keeps them (`2026-11-10 08:58:59`). */
function stats_time(?string $iso): ?string
{
    return $iso ? gmdate('Y-m-d H:i:s', strtotime($iso)) : null;
}

function stats_log(string $message): void
{
    if (empty($GLOBALS['stats_quiet'])) {
        fwrite(STDOUT, gmdate('H:i:s') . " $message\n");
    }
}

function stats_curl(string $url, int $timeout)
{
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_CONNECTTIMEOUT => 15,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_USERAGENT      => STATS_USER_AGENT,
        CURLOPT_ENCODING       => '',
    ]);
    return $curl;
}

/** GETs a URL: [status, body, the URL it ended at after redirects]. Status 0 when it could not connect. */
function stats_get(string $url, int $timeout = 60): array
{
    $curl = stats_curl($url, $timeout);
    $body = curl_exec($curl);
    $result = [
        (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE),
        $body === false ? '' : $body,
        (string) curl_getinfo($curl, CURLINFO_EFFECTIVE_URL),
    ];
    return $result;
}

/** GETs several URLs at once: [url => [status, body]], in the order given. */
function stats_get_many(array $urls, int $timeout = 60): array
{
    $multi = curl_multi_init();
    $handles = [];
    foreach ($urls as $url) {
        $handles[$url] = stats_curl($url, $timeout);
        curl_multi_add_handle($multi, $handles[$url]);
    }
    do {
        $status = curl_multi_exec($multi, $running);
        if ($running) {
            curl_multi_select($multi, 1.0);
        }
    } while ($running && $status === CURLM_OK);

    $results = [];
    foreach ($handles as $url => $curl) {
        $results[$url] = [(int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), (string) curl_multi_getcontent($curl)];
        curl_multi_remove_handle($multi, $curl);
    }
    curl_multi_close($multi);
    return $results;
}

/** GETs from the OpenStreetMap API, pausing first so the collector never asks more than about twice a second. */
function stats_api(string $path, int $timeout = 120): array
{
    static $last = 0.0;
    $wait = 0.5 - (microtime(true) - $last);
    if ($wait > 0) {
        usleep((int) ($wait * 1e6));
    }
    $last = microtime(true);
    [$status, $body] = stats_get(STATS_API . $path, $timeout);
    return [$status, $body];
}
