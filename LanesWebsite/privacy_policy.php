<?php
require_once __DIR__ . '/includes/config.php';

$title       = 'Privacy policy — Lane Studio';
$description = 'What Lane Studio does with your data. It runs in your browser, has no accounts '
             . 'of its own, and edits go to OpenStreetMap under your account.';
$theme       = 'orange';
$path        = '/privacy_policy';

$navLinks = [
    ['label' => 'Overview', 'href' => '/'],
    ['label' => 'Statistics', 'href' => '/statistics'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
    ['label' => 'marcelmarzec.com', 'href' => $site['home']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

require __DIR__ . '/includes/head.php';
?>

<section class="hero hero-narrow">
  <div class="section-inner">
    <div class="hero-body hero-body-wide">
      <p class="eyebrow">Legal</p>
      <h1>Lane Studio privacy policy</h1>
      <p class="hero-sub">
        Lane Studio is an editor, not a service. It runs in your browser, it has no accounts of
        its own, and your edits go to OpenStreetMap rather than to me.
      </p>
      <p class="hero-meta"><span>Last updated 10 November 2026</span></p>
    </div>
  </div>
</section>

<section class="section-bordered">
  <div class="section-inner">
    <div class="prose">
      <div class="alert" data-theme="orange" role="note">
        <strong>Lane Studio is in early access.</strong>
        The editor is open to use at
        <a href="<?= e($site['editor']) ?>">lanestudio.marcelmarzec.com/editor</a>, and this
        policy describes how it behaves now. It will keep changing as the editor does.
      </div>

      <h2>These pages</h2>
      <p>
        The pages on lanestudio.marcelmarzec.com that describe Lane Studio set no cookies, use no
        local storage and run no analytics. The site is hosted by
        <a href="https://www.fyfeweb.com" target="_blank" rel="noopener">FyFeWeb</a>, whose
        server keeps standard access logs (your IP address, the time, the page requested and your
        browser's user-agent) so the host can run the service securely; I do not analyse them.
        The typefaces come from Google Fonts, so Google receives your IP address when a page
        loads. The rest of this policy is about the statistics and the editor.
      </p>

      <h2>The statistics</h2>
      <p>
        The <a href="/statistics">statistics</a> and the map on the front page show every changeset
        saved with Lane Studio. They are made on this site's server from OpenStreetMap's public
        changeset data: each changeset whose <code>created_by</code> tag starts with
        <code>LaneStudio</code>, with its number, the mapper's username and user id, the time, the
        comment, the area edited and what it changed. That is kept in the site's database and shown on
        the map, in the latest changesets and on the leaderboard. Nothing is collected from you when
        you use the editor or visit these pages: it is all already public on OpenStreetMap.
      </p>
      <p>
        To be left off the leaderboard, with your name hidden on the map and in the latest
        changesets, use the <a href="<?= e($site['contact']) ?>">contact form</a>. Your changesets
        still count in the totals.
      </p>
      <p>
        The map loads the MapLibre library from
        <a href="https://www.jsdelivr.com/" target="_blank" rel="noopener">jsDelivr</a> and its map
        tiles from <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>,
        so they receive your IP address and the area of the map in view.
      </p>

      <h2>What Lane Studio is</h2>
      <p>
        Lane Studio is a fork of
        <a href="https://github.com/openstreetmap/iD" target="_blank" rel="noopener">iD</a>, the
        OpenStreetMap editor, with a visual lane editor in place of the raw tag list. It is
        JavaScript that runs in your browser. I do not operate a backend for it, and there is no
        Lane Studio account to create.
      </p>

      <h2>Your OpenStreetMap account</h2>
      <p>
        To save anything you sign in to OpenStreetMap. That sign-in happens on
        <code>openstreetmap.org</code>, not here — Lane Studio never sees your password. What it
        receives is an access token, which your browser stores so you are not asked to sign in
        again every time. It stays on your device and is not sent to me.
      </p>
      <p>
        Signing out, or clearing your browser's site data, removes it.
      </p>

      <h2>Your edits are public</h2>
      <p>
        This is the part worth reading twice. Anything you upload goes to OpenStreetMap as a
        changeset under your account, and OpenStreetMap data is public and permanent. Your
        username, the changeset comment, what you changed and when are all visible to anyone, and
        are redistributed under the
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Open
        Database Licence</a>. That is how OpenStreetMap works, and it is not something Lane Studio
        or I can undo once an edit is uploaded.
      </p>
      <p>
        The <a href="https://wiki.osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">OpenStreetMap
        Foundation privacy policy</a> governs what happens to your data once it arrives there.
      </p>

      <h2>Work in progress stays on your device</h2>
      <p>
        Edits you have not uploaded yet are held in your browser's local storage so you do not
        lose them if you close the tab. They are not transmitted anywhere until you choose to
        upload, and they are not visible to me at any point.
      </p>

      <h2>Map imagery and data services</h2>
      <p>
        An editor needs a map underneath it. Background imagery, map tiles and address lookups are
        fetched from third-party providers, and like any request your browser makes, those
        providers receive your IP address and the area of the map you are looking at. Which
        providers are involved depends on the imagery you select in the editor; each has its own
        privacy policy.
      </p>

      <h2>What I collect</h2>
      <p>
        Nothing from you. There is no analytics, no error reporting service, no telemetry and no
        advertising in Lane Studio. The only trace of your use is what you upload to OpenStreetMap,
        which is public, and which the statistics count.
      </p>

      <h2>Your rights</h2>
      <p>
        The only data about you here is the public changeset data the statistics show; ask through
        the contact form to be left off the leaderboard. For
        data held by OpenStreetMap, the OpenStreetMap Foundation is the controller and their
        policy explains how to exercise your rights. Questions about Lane Studio itself can go to
        the <a href="<?= e($site['contact']) ?>">contact form</a> or to the
        <a href="https://github.com/MarcelMarzec/LaneStudio" target="_blank" rel="noopener">issue
        tracker</a>.
      </p>

      <h2>Changes</h2>
      <p>
        Lane Studio is in early access and still gaining features, so this policy will change
        with it. The date at the top says when it last did, and the full history is public on
        <a href="<?= e($site['github']) ?>" target="_blank" rel="noopener">GitHub</a>.
      </p>
    </div>
  </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
