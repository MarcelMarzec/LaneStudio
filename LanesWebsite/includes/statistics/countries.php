<?php
defined('STATISTICS') or exit;
// Which country a changeset is in, from the centre of its bounding box and the borders in countries.json
// (written by scripts/build_statistics_countries.js from the borders iD uses).

function countries_all(): array
{
    static $countries = null;
    return $countries ??= json_decode(file_get_contents(__DIR__ . '/countries.json'), true);
}

/** The country's ISO code at a point, or '' at sea or where no border says. */
function countries_at(float $lat, float $lon): string
{
    foreach (countries_all() as $country) {
        [$minLon, $minLat, $maxLon, $maxLat] = $country['bbox'];
        if ($lon < $minLon || $lon > $maxLon || $lat < $minLat || $lat > $maxLat) {
            continue;
        }
        foreach ($country['polygons'] as $polygon) {
            if (countries_in_polygon($lat, $lon, $polygon)) {
                return $country['code'];
            }
        }
    }
    return '';
}

/** Inside the polygon's outer ring and none of its holes */
function countries_in_polygon(float $lat, float $lon, array $polygon): bool
{
    foreach ($polygon as $i => $ring) {
        if (countries_in_ring($lat, $lon, $ring) !== ($i === 0)) {
            return false;
        }
    }
    return true;
}

function countries_in_ring(float $lat, float $lon, array $ring): bool
{
    $inside = false;
    for ($i = 0, $j = count($ring) - 1; $i < count($ring); $j = $i++) {
        [$xi, $yi] = $ring[$i];
        [$xj, $yj] = $ring[$j];
        if (($yi > $lat) !== ($yj > $lat) && $lon < ($xj - $xi) * ($lat - $yi) / ($yj - $yi) + $xi) {
            $inside = !$inside;
        }
    }
    return $inside;
}

/** Names and flags by ISO code */
function countries_names(): array
{
    $names = [];
    foreach (countries_all() as $country) {
        $names[$country['code']] ??= ['name' => $country['name'], 'flag' => $country['flag']];
    }
    return $names;
}

/** Fills in the country of changesets that don't have one yet. */
function countries_collect(PDO $pdo): void
{
    $rows = $pdo->query('SELECT id, min_lat, min_lon, max_lat, max_lon FROM ls_changesets
                         WHERE country IS NULL AND min_lat IS NOT NULL')->fetchAll();
    $update = $pdo->prepare('UPDATE ls_changesets SET country = ? WHERE id = ?');
    foreach ($rows as $row) {
        $lat = ($row['min_lat'] + $row['max_lat']) / 2;
        $lon = ($row['min_lon'] + $row['max_lon']) / 2;
        $update->execute([countries_at($lat, $lon), $row['id']]);
    }
}
