<?php
require_once __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/markdown.php';

$title       = 'Changelog — Lane Studio';
$description = 'What changed in each version of Lane Studio, from the CHANGELOG.md in its '
             . 'repository.';
$theme       = 'orange';
$path        = '/changelog';

$navLinks = [
    ['label' => 'Overview', 'href' => '/'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
    ['label' => 'marcelmarzec.com', 'href' => $site['home']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

// The deploy workflow copies the repository's CHANGELOG.md into includes/;
// run from a checkout, the page reads it from the repository root instead.
$markdown = '';
foreach ([__DIR__ . '/includes/changelog.md', __DIR__ . '/../CHANGELOG.md'] as $source) {
    if (is_readable($source)) {
        $markdown = file_get_contents($source);
        break;
    }
}

require __DIR__ . '/includes/head.php';
?>

<section class="hero hero-narrow">
  <div class="section-inner">
    <div class="hero-body hero-body-wide">
      <p class="eyebrow">Lane Studio</p>
      <h1>Changelog</h1>
      <p class="hero-sub">
        What changed in each version, taken from
        <a href="<?= e($site['changelog']) ?>"
           target="_blank" rel="noopener">CHANGELOG.md</a>
        in the repository.
      </p>
    </div>
  </div>
</section>

<section class="section-bordered">
  <div class="section-inner">
    <div class="prose prose-changelog">
      <?php if ($markdown !== ''): ?>
        <?= md_to_html($markdown, ['shift' => 1, 'dropFirstH1' => true, 'metaFrom' => 5]) ?>
      <?php else: ?>
        <p>
          The changelog could not be loaded. You can read it
          <a href="<?= e($site['changelog']) ?>"
             target="_blank" rel="noopener">on GitHub</a> instead.
        </p>
      <?php endif; ?>
    </div>
  </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
