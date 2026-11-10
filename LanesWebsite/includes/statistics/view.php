<?php
defined('SITE') or exit;
// The statistics' parts of a page: figures, the map with the latest changesets, the chart, lists and the
// leaderboard. They read /data/statistics.json, written by the collector (collect.php) every few minutes.

const STATS_MAPLIBRE = 'https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.0/dist/';

/** The collector's latest figures, or null before it has run. */
function stats_data(): ?array
{
    static $data = false;
    if ($data === false) {
        $file = __DIR__ . '/../../data/statistics.json';
        $data = is_readable($file) ? json_decode(file_get_contents($file), true) : null;
    }
    return $data;
}

function stats_n(int|float $n, int $decimals = 0): string
{
    return number_format($n, $decimals);
}

/** "4 min ago", "3 h ago", "2 days ago", then the date */
function stats_ago(?string $iso): string
{
    if (!$iso) {
        return '';
    }
    $seconds = time() - strtotime($iso);
    if ($seconds < 90) {
        return 'just now';
    }
    if ($seconds < 3600) {
        return round($seconds / 60) . ' min ago';
    }
    if ($seconds < 86400) {
        return round($seconds / 3600) . ' h ago';
    }
    if ($seconds < 7 * 86400) {
        $days = (int) round($seconds / 86400);
        return $days === 1 ? 'yesterday' : "$days days ago";
    }
    return gmdate('j M Y', strtotime($iso));
}

/** A mapper's name, linked to their OpenStreetMap profile ("A mapper" for anyone hidden) */
function stats_user(?string $user): string
{
    if ($user === null) {
        return '<span class="stats-muted">A mapper</span>';
    }
    $href = 'https://www.openstreetmap.org/user/' . rawurlencode($user);
    return '<a href="' . e($href) . '" target="_blank" rel="noopener" title="' . e($user) . '">' . e($user) . '</a>';
}

/** A row of figures: [label, value, note] each */
function stats_tiles(array $tiles, string $class = ''): void
{
    ?>
    <div class="stats-tiles <?= e($class) ?>">
      <?php foreach ($tiles as [$label, $value, $note]): ?>
        <div class="stats-tile">
          <p class="stats-tile-value"><?= e($value) ?></p>
          <p class="stats-tile-label"><?= e($label) ?></p>
          <?php if ($note): ?><p class="stats-tile-note"><?= e($note) ?></p><?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
    <?php
}

/** The map of every changeset, with the latest five beside it */
function stats_map(array $stats, string $label): void
{
    ?>
    <div class="stats-map-layout">
      <div class="stats-map-card">
        <div class="stats-map" data-stats-map data-points="/data/changesets.geojson?v=<?= e(strtotime($stats['generated'])) ?>"
             role="region" aria-label="<?= e($label) ?>"></div>
        <noscript><p class="stats-map-fallback">The map needs JavaScript.</p></noscript>
      </div>

      <aside class="stats-latest" aria-labelledby="stats-latest-title">
        <h3 id="stats-latest-title">Latest changesets</h3>
        <?php if (!$stats['latest']): ?>
          <p class="stats-muted">None yet.</p>
        <?php endif; ?>
        <ol>
          <?php foreach ($stats['latest'] as $changeset): ?>
            <li>
              <button type="button" class="stats-latest-show"
                      <?= $changeset['bbox'] ? 'data-bbox="' . e(json_encode($changeset['bbox'])) . '"' : 'disabled' ?>
                      title="Show on the map">
                <?= e($changeset['comment'] ?: 'No comment') ?>
              </button>
              <p class="stats-latest-meta">
                <?= stats_user($changeset['user']) ?>
                <span class="sep">·</span>
                <time datetime="<?= e($changeset['time']) ?>"><?= e(stats_ago($changeset['time'])) ?></time>
                <?php if ($changeset['country']): ?>
                  <span class="sep">·</span>
                  <span title="<?= e($changeset['country']['name']) ?>"><?= e($changeset['country']['flag'] ?: $changeset['country']['code']) ?></span>
                <?php endif; ?>
              </p>
              <p class="stats-latest-meta">
                <?= e(stats_n($changeset['changes'])) ?> <?= $changeset['changes'] === 1 ? 'change' : 'changes' ?>
                <span class="sep">·</span>
                <a href="https://www.openstreetmap.org/changeset/<?= e($changeset['id']) ?>"
                   target="_blank" rel="noopener">#<?= e($changeset['id']) ?></a>
              </p>
            </li>
          <?php endforeach; ?>
        </ol>
      </aside>
    </div>
    <?php
}

/** MapLibre and the statistics' script: once, at the end of the page */
function stats_scripts(): void
{
    ?>
    <link rel="stylesheet" href="<?= STATS_MAPLIBRE ?>maplibre-gl.css"
          integrity="sha384-Nq6PQ+9vJPvw7U/VfDELyrWoGQMsy0gi6QShhaSrGzkpF5KkM40csg2leky+YMTd" crossorigin="anonymous">
    <script src="<?= STATS_MAPLIBRE ?>maplibre-gl.js" defer
            integrity="sha384-GfxBM9x46BaAFxtCq39Fxir8fNZ4VDnwgfi6Kzi5/F1tAFsm0amuuV8kd+Pxzuf/" crossorigin="anonymous"></script>
    <script src="/assets/js/statistics.js?v=3" defer></script>
    <?php
}

/**
 * Changesets per day as bars (per week when there are more than 120 days), with each bar's figures on hover and in
 * a table below.
 */
function stats_daily_chart(array $daily): void
{
    $weekly = count($daily) > 120;
    $periods = [];
    foreach ($daily as $day) {
        $key = $weekly ? gmdate('o-\WW', strtotime($day['date'])) : $day['date'];
        $periods[$key] ??= ['date' => $day['date'], 'changesets' => 0];
        $periods[$key]['changesets'] += $day['changesets'];
    }
    $periods = array_values($periods);
    $max = max(1, ...array_column($periods, 'changesets'));
    $step = $max <= 4 ? 1 : (int) ceil($max / 4 / 5) * 5;
    $top = (int) ceil($max / $step) * $step;

    $date = fn ($d) => gmdate('j M', strtotime($d));
    $label = 'Changesets per ' . ($weekly ? 'week' : 'day') . ' from ' . $date($periods[0]['date']) . ' to '
           . $date(end($periods)['date']) . '; the table below lists them';
    ?>
    <figure class="stats-chart" data-stats-chart>
      <?php
      // drawn twice, for wide and narrow screens, so the axis text stays readable at either width
      stats_bar_svg($periods, $weekly, $top, $step, 1000, 'stats-chart-wide', $label);
      stats_bar_svg($periods, $weekly, $top, $step, 400, 'stats-chart-narrow', $label);
      ?>
      <div class="stats-tip" role="status" hidden></div>
      <details class="stats-table-toggle">
        <summary>Show as a table</summary>
        <table class="stats-table">
          <thead><tr><th scope="col"><?= $weekly ? 'Week of' : 'Day' ?></th><th scope="col" class="num">Changesets</th></tr></thead>
          <tbody>
            <?php foreach (array_reverse($periods) as $p): if (!$p['changesets']) continue; ?>
              <tr><td><?= e(gmdate('j M Y', strtotime($p['date']))) ?></td><td class="num"><?= e(stats_n($p['changesets'])) ?></td></tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      </details>
    </figure>
    <?php
}

/** One drawing of the bar chart, $width units wide */
function stats_bar_svg(array $periods, bool $weekly, int $top, int $step, int $width, string $class, string $label): void
{
    [$height, $left, $bottom, $topPad] = [240, 44, 28, 8];
    $plotWidth = $width - $left;
    $plotHeight = $height - $bottom - $topPad;
    $slot = $plotWidth / count($periods);
    $gap = max(2, $slot * 0.2);
    $barWidth = min(36, max(1, $slot - $gap));
    $date = fn ($d) => gmdate('j M', strtotime($d));
    ?>
    <svg class="<?= e($class) ?>" viewBox="0 0 <?= $width ?> <?= $height ?>" role="img" aria-label="<?= e($label) ?>">
      <?php for ($v = 0; $v <= $top; $v += $step): $y = $topPad + $plotHeight - $v / $top * $plotHeight; ?>
        <line class="stats-grid" x1="<?= $left ?>" x2="<?= $width ?>" y1="<?= round($y, 1) ?>" y2="<?= round($y, 1) ?>"/>
        <text class="stats-axis" x="<?= $left - 10 ?>" y="<?= round($y + 4, 1) ?>" text-anchor="end"><?= e(stats_n($v)) ?></text>
      <?php endfor; ?>
      <?php foreach ($periods as $i => $p):
          $x = $left + $i * $slot + ($slot - $barWidth) / 2;
          $h = $p['changesets'] / $top * $plotHeight;
          $y = $topPad + $plotHeight - $h;
          $r = min(4, $barWidth / 2, $h);
          $tip = ($weekly ? 'Week of ' : '') . gmdate('j M Y', strtotime($p['date'])) . ': '
               . stats_n($p['changesets']) . ($p['changesets'] === 1 ? ' changeset' : ' changesets');
      ?>
        <g class="stats-bar" data-tip="<?= e($tip) ?>">
          <rect class="stats-bar-hit" x="<?= round($left + $i * $slot, 2) ?>" y="<?= $topPad ?>"
                width="<?= round($slot, 2) ?>" height="<?= $plotHeight ?>"/>
          <?php if ($h > 0): ?>
            <path d="M<?= round($x, 2) ?>,<?= round($topPad + $plotHeight, 2) ?>
                     V<?= round($y + $r, 2) ?> q0,-<?= round($r, 2) ?> <?= round($r, 2) ?>,-<?= round($r, 2) ?>
                     H<?= round($x + $barWidth - $r, 2) ?> q<?= round($r, 2) ?>,0 <?= round($r, 2) ?>,<?= round($r, 2) ?>
                     V<?= round($topPad + $plotHeight, 2) ?> Z"/>
          <?php endif; ?>
        </g>
      <?php endforeach; ?>
      <?php foreach (array_unique([0, intdiv(count($periods) - 1, 2), count($periods) - 1]) as $i):
          $x = $left + $i * $slot + $slot / 2;
          $anchor = $x - $left < 40 ? 'start' : ($width - $x < 40 ? 'end' : 'middle');
          $x = $anchor === 'start' ? max($x - $barWidth / 2, $left)
             : ($anchor === 'end' ? min($x + $barWidth / 2, $width) : $x);
      ?>
        <text class="stats-axis" x="<?= round($x, 1) ?>" y="<?= $height - 6 ?>" text-anchor="<?= $anchor ?>"><?= e($date($periods[$i]['date'])) ?></text>
      <?php endforeach; ?>
    </svg>
    <?php
}

/** Ranked bars with their labels and figures: rows of [label HTML, value, value as text] */
function stats_bars(array $rows, string $empty = 'None yet.'): void
{
    if (!$rows) {
        echo '<p class="stats-muted">' . e($empty) . '</p>';
        return;
    }
    $max = max(1, ...array_column($rows, 1));
    ?>
    <ul class="stats-bars">
      <?php foreach ($rows as [$label, $value, $text]): ?>
        <li>
          <span class="stats-bars-label"><?= $label ?></span>
          <span class="stats-bars-track" aria-hidden="true">
            <span class="stats-bars-fill" style="width: <?= round(max(1, $value / $max * 100), 1) ?>%"></span>
          </span>
          <span class="stats-bars-value"><?= e($text) ?></span>
        </li>
      <?php endforeach; ?>
    </ul>
    <?php
}

/** The mappers with the most changesets */
function stats_leaderboard(array $leaders): void
{
    if (!$leaders) {
        echo '<p class="stats-muted">None yet.</p>';
        return;
    }
    ?>
    <table class="stats-table stats-leaderboard">
      <thead>
        <tr>
          <th scope="col" class="num">#</th>
          <th scope="col">Mapper</th>
          <th scope="col" class="num">Changesets</th>
          <th scope="col" class="num stats-hide-narrow">Changes</th>
          <th scope="col" class="stats-hide-narrow">Last edit</th>
        </tr>
      </thead>
      <tbody>
        <?php foreach ($leaders as $i => $leader): ?>
          <tr>
            <td class="num stats-rank"><?= $i + 1 ?></td>
            <td><?= stats_user($leader['user']) ?></td>
            <td class="num"><?= e(stats_n($leader['changesets'])) ?></td>
            <td class="num stats-hide-narrow"><?= e(stats_n($leader['changes'])) ?></td>
            <td class="stats-hide-narrow stats-muted"><?= e(stats_ago($leader['last'])) ?></td>
          </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
    <?php
}
