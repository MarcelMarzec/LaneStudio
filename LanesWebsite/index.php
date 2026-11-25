<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/statistics/view.php';

$title       = 'Lane Studio — a visual road and lane editor for OpenStreetMap';
$description = 'Lane Studio is a visual road and lane editor for OpenStreetMap. Lay out turn '
             . 'lanes, bus lanes and cycle lanes on the carriageway and let it write the tags. '
             . 'A fork of iD, now in early access.';
$theme       = 'orange';
$path        = '/';

$navLinks = [
    ['label' => 'The problem', 'href' => '#problem'],
    ['label' => 'Features', 'href' => '#features'],
    ['label' => 'Screenshots', 'href' => '#screens'],
    ['label' => 'Statistics', 'href' => '/statistics'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
    ['label' => 'marcelmarzec.com', 'href' => $site['home']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

$stats = stats_data();

require __DIR__ . '/includes/head.php';
?>

<section class="hero hero-stacked" id="top">
  <div class="section-inner">
    <div class="hero-body hero-body-wide">

      <h1>Lane tagging for OpenStreetMap,<br>done visually.</h1>

      <p class="hero-sub">
        OSM can describe a carriageway in extraordinary detail — every turn lane, bus lane and
        cycle lane, in both directions. Writing those tags by hand is the problem. Lane Studio
        puts the road on screen, lets you lay out the lanes, and writes the tags for you.
      </p>

      <div class="hero-actions">
        <a class="btn-primary" href="<?= e($site['editor']) ?>" target="_blank" rel="noopener">
          Open the editor <?php icon_arrow_up_right(); ?>
        </a>
        <a class="btn-secondary" href="<?= e($site['github']) ?>" target="_blank" rel="noopener">
          <?php icon_github(); ?> View the source
        </a>
      </div>

      <p class="hero-meta">
        <span>A fork of iD</span>
        <span class="sep">·</span>
        <span>JavaScript</span>
        <span class="sep">·</span>
        <span>Open source</span>
        <span class="sep">·</span>
        <span>Early access</span>
      </p>
    </div>

    <figure class="hero-wide-visual">
      <img src="/assets/img/lanestudio-editor.webp"
           alt="The Lane Studio editor: a selected carriageway on a dark map with a turn arrow on
                each lane, beside a panel listing the lanes and the OpenStreetMap tags they produce"
           width="720" height="480" fetchpriority="high">
      <figcaption>
        A screenshot of Lane Studio's Editor, Based on iD, v26.11.22
      </figcaption>
    </figure>
  </div>
</section>

<section id="problem">
  <div class="section-inner">
    <div class="split">
      <div class="split-body">
        <p class="eyebrow">The problem</p>
        <h2>Lane tags are write-only</h2>
        <p>
          Lane information in OSM is encoded as pipe-separated lists, one entry per lane, ordered
          left to right in the direction of travel. Get the order wrong, or the count out of step
          with <code>lanes</code>, and routers quietly do the wrong thing.
        </p>
        <p>
          It is a format designed for machines to read, and it shows. Most mappers avoid it
          entirely — which is why so many junctions have no lane data at all.
        </p>
        <p class="alert" role="note">
          <strong>Made for UK roads.</strong> Lane Studio has been built around UK roads and their limits: lane widths,
          signs, markings and speed limits (in mph) follow British practice. Support for other countries will come
          later.
        </p>
      </div>

      <div class="tag-compare" aria-label="Example of raw OpenStreetMap lane tags">
        <div><span class="k">highway</span>=<span class="v">primary</span></div>
        <div><span class="k">lanes</span>=<span class="v">4</span></div>
        <div><span class="k">lanes:forward</span>=<span class="v">3</span></div>
        <div><span class="k">lanes:backward</span>=<span class="v">1</span></div>
        <div><span class="k">turn:lanes:forward</span>=<span class="v">left|through|through;right</span></div>
        <div><span class="k">busway:left</span>=<span class="v">lane</span></div>
        <div><span class="k">cycleway:right</span>=<span class="v">track</span></div>
        <div><span class="k">width:lanes:forward</span>=<span class="v">3.2|3.2|3.5</span></div>
      </div>
    </div>
  </div>
</section>

<section id="features">
  <div class="section-inner">
    <div class="section-head">
      <h2>What Lane Studio does</h2>
      <p>
        It is iD with a lane editor bolted on where the raw tag list used to be — same data, same
        changesets, a different way in.
      </p>
    </div>

    <div class="feature-grid">
      <article class="feature-card">
        <div class="feature-icon"><?php icon_lanes(); ?></div>
        <h3>Lay out the carriageway</h3>
        <ul>
          <li>Lanes drawn at real width over the imagery</li>
          <li>Add, remove and reorder lanes</li>
          <li>Set direction, turn arrows, widths and limits</li>
          <li>Bus and cycle lanes</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_tag(); ?></div>
        <h3>Correct tags, written for you</h3>
        <ul>
          <li>Writes <code>lanes</code>, <code>turn:lanes</code> and <code>:forward</code>/<code>:backward</code> keys</li>
          <li>Only changed keys are touched</li>
          <li>Every edit is one undo step</li>
          <li>Raw tags stay in view</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_sidebar(); ?></div>
        <h3>One sidebar with iD's</h3>
        <ul>
          <li>Lane fields sit among iD's own, in iD's style</li>
          <li>Choices shown with their road sign</li>
          <li><strong>i</strong> button: short overview and wiki link</li>
          <li>Rarely needed fields wait under “Add field”</li>
          <li>Access for every transport mode, direction and time</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_parking(); ?></div>
        <h3>Roadside and street parking</h3>
        <ul>
          <li><strong>+</strong> at each kerb: lanes, pavements, cycleways, parking</li>
          <li>Full wiki parking scheme: bays, fees, zones, permits</li>
          <li>Restrictions, times and time limits</li>
          <li>UK yellow and red lines</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_centre_line(); ?></div>
        <h3>Centre lines and overtaking</h3>
        <ul>
          <li>Dashed or double white centre lines</li>
          <li>Solid on the side that may not overtake</li>
          <li>Set from the sidebar, a lane, or the map</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_junction(); ?></div>
        <h3>Junctions drawn as they are</h3>
        <ul>
          <li>Lanes line up, taper and part round islands</li>
          <li>Guide lines show where each lane leads</li>
          <li>Roundabouts, crossings, stop lines, signs and railways</li>
          <li>UK markings: zig-zags, BUS LANE, advanced stop lines</li>
          <li>Painted markings found in Add Feature, tagged per the wiki</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_speed(); ?></div>
        <h3>Speed limits at a glance</h3>
        <ul>
          <li>Every lane coloured by its limit</li>
          <li>Roads missing a limit shown in red</li>
          <li>Pick a UK roundel, national limit or 20 zone</li>
          <li>Click roads or lanes to set it</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_route(); ?></div>
        <h3>See where a lane goes</h3>
        <ul>
          <li>Hover a lane to see every route from it</li>
          <li>For cars, vans, lorries, buses, taxis and bicycles</li>
          <li>Follows turn arrows, connections and restrictions</li>
          <li>Roads coloured by access for that vehicle</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_checks(); ?></div>
        <h3>Checks before upload</h3>
        <ul>
          <li>Lane values that don't match the lane count</li>
          <li>Widths too narrow, unmarked bus lanes, old values</li>
          <li>Turn arrows at dead ends, endless merges</li>
          <li>Broken connectivity relations</li>
          <li>Construction tagging mistakes</li>
          <li>One-click fixes where the answer is certain</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_connectivity(); ?></div>
        <h3>Which lane leads where</h3>
        <ul>
          <li>Every lane connection drawn through junctions</li>
          <li>Blue from turn arrows, orange from relations</li>
          <li>Dashed where a lane change is needed</li>
          <li>Click lanes to write a connectivity relation</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_water(); ?></div>
        <h3>Water and building work</h3>
        <ul>
          <li>Rivers, drains and ditches at their width</li>
          <li>Weirs, dams, lock gates and white water</li>
          <li>Construction sites, scaffolding and roadworks</li>
          <li>Roads being built drawn as they will be</li>
        </ul>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_lanes(); ?></div>
        <h3>Read the map</h3>
        <ul>
          <li>Map key explains every colour and symbol</li>
          <li>Walkthrough and Help show what's new over iD</li>
          <li>OpenStreetMap map fades in when zoomed out</li>
        </ul>
      </article>
    </div>
  </div>
</section>

<section id="how">
  <div class="section-inner">
    <div class="section-head">
      <h2>How it works</h2>
      <p>Three steps, and the changeset goes to OpenStreetMap the same way iD's does.</p>
    </div>

    <div class="steps">
      <article class="step">
        <div class="step-num">1</div>
        <h3>Pick a way</h3>
        <p>
          Select a road in the editor. Lane Studio reads whatever lane tags are already there and
          draws them, so you're correcting a picture rather than starting from a blank field.
        </p>
      </article>

      <article class="step">
        <div class="step-num">2</div>
        <h3>Lay out the lanes</h3>
        <p>
          Work on the carriageway directly — add a lane, mark it left-turn only, make the nearside a
          bus lane, or use the + at the kerb for pavements and parking. The tag list updates as you go.
        </p>
      </article>

      <article class="step">
        <div class="step-num">3</div>
        <h3>Review and upload</h3>
        <p>
          Read the checks, look over the final tags, and upload through your own OSM account as a
          normal changeset.
        </p>
      </article>
    </div>
  </div>
</section>

<?php if ($stats): $t = $stats['totals']; ?>
<section id="statistics" class="stats-section">
  <div class="section-inner">
    <div class="section-head">
      <h2>Lane Studio on the map</h2>
      <p>
        Every changeset saved with Lane Studio, read from OpenStreetMap's changeset feed and updated
        every few minutes.
      </p>
    </div>

    <?php stats_tiles([
        ['Changesets', stats_n($t['changesets']), stats_n($t['week']['changesets']) . ' in the last 7 days'],
        ['Mappers', stats_n($t['mappers']), null],
        ['Ways with lane tags changed', stats_n($t['lane_ways']), null],
        ['Km of road edited', stats_n($t['road_km'], 1), null],
    ], 'stats-tiles-4'); ?>

    <?php stats_map($stats, 'Map of changesets saved with Lane Studio'); ?>

    <div class="stats-more">
      <a class="btn-secondary" href="/statistics">All statistics <?php icon_arrow_right(); ?></a>
    </div>
  </div>
</section>
<?php endif; ?>

<section id="screens">
  <div class="section-inner">
    <div class="section-head">
      <h2>What it looks like</h2>
      <p>Some screenshots of the editor in action! Its constantly imrpoving and getting more features!</p>
    </div>

    <div class="showcase-row">
      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-junction.webp"
               alt="A junction approach with two lanes, each carrying its own turn arrow" loading="lazy">
        </div>
        <figcaption>Lanes, pedestrian crossings, level crossings, traffic calming and parking - all rendered.</figcaption>
      </figure>

      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-buslane.webp"
               alt="A carriageway with a bus lane and a cycle lane picked out from general traffic" loading="lazy">
        </div>
        <figcaption>Footpath - Bus Lane - Road - Cycle Lane - Parking</figcaption>
      </figure>

      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-speedlimit.webp"
               alt="A roundabout with every lane coloured by its speed limit." loading="lazy">
        </div>
        <figcaption>Visualise Speed Limits - and where they are missing.</figcaption>
      </figure>

      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-routing.webp"
               alt="A validation panel flagging a lane count that disagrees with the turn lane list" loading="lazy">
        </div>
        <figcaption>Visualised routing for every lane - including turn restrictions.</figcaption>
      </figure>
    </div>
  </div>
</section>

<section class="cta">
  <div class="section-inner">
    <h2>Try it on a junction you know</h2>
    <p>
      Lane Studio is in early access: it runs in your browser and edits go to OpenStreetMap under
      your own account. Expect rough edges, and tell me about the ones you hit.
    </p>
    <div class="cta-actions">
      <a class="btn-primary" href="<?= e($site['editor']) ?>" target="_blank" rel="noopener">
        Open the editor <?php icon_arrow_up_right(); ?>
      </a>
      <a class="btn-secondary" href="https://github.com/MarcelMarzec/LaneStudio/issues" target="_blank" rel="noopener">
        <?php icon_github(); ?> Report an issue
      </a>
    </div>
  </div>
</section>

<?php if ($stats) stats_scripts(); ?>

<?php require __DIR__ . '/includes/footer.php'; ?>
