<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/statistics/view.php';

$title       = 'Statistics — Lane Studio';
$description = 'Every changeset saved with Lane Studio on a map: how many, by how many mappers, where, '
             . 'the latest changesets and the mappers who made the most.';
$theme       = 'orange';
$path        = '/statistics';

$navLinks = [
    ['label' => 'Overview', 'href' => '/'],
    ['label' => 'Statistics', 'href' => '/statistics'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
    ['label' => 'marcelmarzec.com', 'href' => $site['home']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

$stats = stats_data();

require __DIR__ . '/includes/head.php';
?>

<section class="hero hero-narrow">
  <div class="section-inner">
    <div class="hero-body hero-body-wide">
      <p class="eyebrow">Statistics</p>
      <h1>Lane Studio on the map</h1>
      <p class="hero-sub">
        Every changeset saved with Lane Studio, found in OpenStreetMap's public changeset feed by
        its <code>created_by=LaneStudio</code> tag and updated every few minutes.
      </p>
      <?php if ($stats): ?>
        <p class="hero-meta">
          <span>Updated <?= e(stats_ago($stats['generated'])) ?></span>
          <span class="sep">·</span>
          <span>Since <?= e(gmdate('j F Y', strtotime($stats['start'] . ' UTC'))) ?></span>
        </p>
      <?php endif; ?>
    </div>
  </div>
</section>

<?php if (!$stats): ?>
  <section class="section-bordered">
    <div class="section-inner">
      <div class="alert" data-theme="orange" role="note">
        The statistics appear here once the collector has run on the server.
      </div>
    </div>
  </section>
<?php else: $t = $stats['totals']; ?>

  <section class="section-bordered stats-section">
    <div class="section-inner">
      <?php if ($stats['catching_up']): ?>
        <div class="alert" data-theme="orange" role="note">
          Still reading the history: these figures cover changesets up to
          <?= e(gmdate('j F Y, H:i', strtotime($stats['up_to']))) ?> UTC.
        </div>
      <?php endif; ?>

      <?php stats_tiles([
          ['Changesets', stats_n($t['changesets']), stats_n($t['week']['changesets']) . ' in the last 7 days'],
          ['Mappers', stats_n($t['mappers']), stats_n($t['new_mappers']) . ' new in the last 30 days'],
          ['Changes', stats_n($t['changes']), 'Objects created, modified or deleted'],
          ['Countries', stats_n($t['countries']), null],
          ['Ways with lane tags changed', stats_n($t['lane_ways']), null],
          ['Km of road edited', stats_n($t['road_km'], 1), stats_n($t['road_ways']) . ' road ways'],
          ['Changesets in 30 days', stats_n($t['month']['changesets']),
           stats_n($t['month']['mappers']) . ($t['month']['mappers'] === 1 ? ' mapper' : ' mappers')],
          ['Objects created', stats_n($t['created']), stats_n($t['modified']) . ' modified, ' . stats_n($t['deleted']) . ' deleted'],
      ], 'stats-tiles-4'); ?>

      <?php if ($t['detailed'] < $t['changesets']): ?>
        <p class="stats-footnote">
          Lanes, roads and objects cover the <?= e(stats_n($t['detailed'])) ?> changesets whose edits have
          been read so far; the rest follow within minutes.
        </p>
      <?php endif; ?>
    </div>
  </section>

  <section class="stats-section">
    <div class="section-inner">
      <div class="section-head">
        <h2>Where</h2>
        <p>
          Each dot is a changeset, at the centre of the area it edited. Click a group to zoom in, a dot for
          its details, or a changeset in the list to find it on the map.
        </p>
      </div>
      <?php stats_map($stats, 'Map of changesets saved with Lane Studio'); ?>
    </div>
  </section>

  <section class="section-bordered stats-section">
    <div class="section-inner">
      <div class="section-head">
        <h2>When</h2>
        <p>Changesets saved with Lane Studio <?= count($stats['daily']) > 120 ? 'each week' : 'each day' ?>.</p>
      </div>
      <div class="stats-card">
        <?php stats_daily_chart($stats['daily']); ?>
      </div>
    </div>
  </section>

  <section class="stats-section">
    <div class="section-inner">
      <div class="stats-columns">
        <div class="stats-card">
          <h2 class="stats-card-title">Leaderboard</h2>
          <p class="stats-card-sub">The mappers who saved the most changesets with Lane Studio.</p>
          <?php stats_leaderboard($stats['leaderboard']); ?>
        </div>

        <div class="stats-card">
          <h2 class="stats-card-title">Countries</h2>
          <p class="stats-card-sub">Changesets by the country at their centre.</p>
          <?php stats_bars(array_map(fn ($c) => [
              '<span aria-hidden="true">' . e($c['flag']) . '</span> ' . e($c['name']),
              $c['changesets'], stats_n($c['changesets']),
          ], array_slice($stats['countries'], 0, 10))); ?>
        </div>
      </div>
    </div>
  </section>

  <section class="section-bordered stats-section">
    <div class="section-inner">
      <div class="stats-columns">
        <div class="stats-card">
          <h2 class="stats-card-title">Tags changed most</h2>
          <p class="stats-card-sub">How many objects had each key added, changed or removed.</p>
          <?php stats_bars(array_map(fn ($tag) => [
              '<code>' . e($tag['key']) . '</code>', $tag['objects'], stats_n($tag['objects']),
          ], $stats['tags'])); ?>
        </div>

        <div class="stats-card">
          <h2 class="stats-card-title">Versions</h2>
          <p class="stats-card-sub">Changesets by the version of Lane Studio that saved them.</p>
          <?php stats_bars(array_map(fn ($v) => [
              'v' . e($v['version']), $v['changesets'], stats_n($v['changesets']),
          ], array_slice($stats['versions'], 0, 10))); ?>
        </div>
      </div>
    </div>
  </section>

  <section class="stats-section">
    <div class="section-inner">
      <div class="prose stats-how">
        <h2>How these are counted</h2>
        <ul>
          <li>A changeset counts when its <code>created_by</code> tag starts with <code>LaneStudio</code>.</li>
          <li><strong>Changes</strong> is the changeset's own count of objects created, modified or deleted.</li>
          <li><strong>Ways with lane tags changed</strong> are ways where a key with a <code>lanes</code> part
            (<code>lanes</code>, <code>turn:lanes</code>, <code>width:lanes:forward</code>),
            <code>placement</code>, <code>cycleway*</code> or <code>busway*</code> was added, changed or
            removed.</li>
          <li><strong>Km of road edited</strong> is the length of the roads (<code>highway=*</code> from
            motorway to service road, not paths) a changeset created or changed.</li>
          <li>Changesets wider than 50 km count in the figures but are left off the map.</li>
          <li>Usernames and changesets are public on OpenStreetMap. To be left off the leaderboard, use the
            <a href="<?= e($site['contact']) ?>">contact form</a>.</li>
        </ul>
      </div>
    </div>
  </section>

  <?php stats_scripts(); ?>
<?php endif; ?>

<?php require __DIR__ . '/includes/footer.php'; ?>
