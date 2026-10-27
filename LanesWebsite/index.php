<?php
require_once __DIR__ . '/includes/config.php';

$title       = 'Lane Studio — a visual road and lane editor for OpenStreetMap';
$description = 'Lane Studio is a visual road and lane editor for OpenStreetMap. Lay out turn '
             . 'lanes, bus lanes and cycle lanes on the carriageway and let it write the tags. '
             . 'A fork of iD, now in early access.';
$theme       = 'orange';
$path        = '/';

$navLinks = [
    ['label' => 'The problem', 'href' => '#problem'],
    ['label' => 'Features', 'href' => '#features'],
    ['label' => 'How it works', 'href' => '#how'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
    ['label' => 'marcelmarzec.com', 'href' => $site['home']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

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
      <img src="/assets/img/lanestudio-editor.svg"
           alt="The Lane Studio editor: a selected carriageway on a dark map with a turn arrow on
                each lane, beside a panel listing the lanes and the OpenStreetMap tags they produce"
           width="720" height="480" fetchpriority="high">
      <figcaption>
        An illustration of the editor rather than a screenshot — open it to see the real thing.
      </figcaption>
    </figure>
  </div>
</section>

<section class="section-bordered" id="problem">
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
        <p>
          Add, remove and reorder lanes on a drawing of the road itself. Direction, turn markings,
          bus and cycle lanes, width — set per lane, in the order you'd see them from the driver's
          seat.
        </p>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_tag(); ?></div>
        <h3>Correct tags, written for you</h3>
        <p>
          Lane Studio generates the <code>lanes</code>, <code>turn:lanes</code> and
          <code>:forward</code>/<code>:backward</code> keys from what you drew, in the order the
          wiki specifies. You can still see and edit the raw tags at any point.
        </p>
      </article>

      <article class="feature-card">
        <div class="feature-icon"><?php icon_checks(); ?></div>
        <h3>Checks before upload</h3>
        <p>
          Counts that don't add up, turn lists that disagree with the lane total, a bus lane
          tagged on the wrong side — flagged while you're still editing, not after a router
          trips over it.
        </p>
      </article>
    </div>
  </div>
</section>

<section class="section-bordered" id="how">
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
          Work on the carriageway directly — split a lane, mark it left-turn only, make the
          nearside a bus lane. The tag preview updates as you go.
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

<section id="screens">
  <div class="section-inner">
    <div class="section-head">
      <h2>What it looks like</h2>
      <p>Illustrations of what the editor does. The editor itself is open to use.</p>
    </div>

    <div class="showcase-row">
      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-junction.svg"
               alt="A junction approach with three lanes, each carrying its own turn arrow"
               width="400" height="260" loading="lazy">
        </div>
        <figcaption>Turn lanes on a junction approach, with the tags they produce.</figcaption>
      </figure>

      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-buslane.svg"
               alt="A carriageway with a bus lane and a cycle lane picked out from general traffic"
               width="400" height="260" loading="lazy">
        </div>
        <figcaption>Bus and cycle lanes, tagged on the correct side of the way.</figcaption>
      </figure>

      <figure class="showcase-card">
        <div class="frame">
          <img src="/assets/img/ls-validate.svg"
               alt="A validation panel flagging a lane count that disagrees with the turn lane list"
               width="400" height="260" loading="lazy">
        </div>
        <figcaption>Contradictions caught before the changeset is uploaded.</figcaption>
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

<?php require __DIR__ . '/includes/footer.php'; ?>
