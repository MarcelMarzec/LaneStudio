<?php
defined('SITE') or exit;
// Sticky header. Pages set $navLinks and $navCta; the brand is Lane Studio's.
// A $navLinks entry with 'items' becomes a dropdown. The mobile menu is a
// checkbox and :has(), the dropdown is <details>, so neither needs JavaScript.
$brandLabel = $site['name'];
$brandHref  = '/';
$brandMark  = '/assets/img/lanestudio-mark.svg';
?>
<header class="nav">
  <input class="nav-toggle-input" type="checkbox" id="nav-toggle" aria-label="Open navigation menu">
  <div class="nav-inner">
    <a class="nav-brand" href="<?= e($brandHref) ?>">
      <img src="<?= e($brandMark) ?>" alt="" width="26" height="26">
      <span><?= e($brandLabel) ?></span>
    </a>

    <nav class="nav-links" aria-label="Primary">
      <?php foreach ($navLinks as $link): ?>
        <?php if (!empty($link['items'])): ?>
          <details class="nav-dropdown">
            <summary><?= e($link['label']) ?><?php icon_chevron_down(); ?></summary>
            <div class="nav-dropdown-menu">
              <?php foreach ($link['items'] as $item): ?>
                <a href="<?= e($item['href']) ?>"<?= external_attrs($item['href']) ?><?=
                  !empty($item['arrow']) ? ' data-theme="' . e($item['arrow']) . '"' : '' ?>>
                  <span><?= e($item['label']) ?></span>
                  <?php is_external($item['href']) ? icon_arrow_up_right() : icon_arrow_right(); ?>
                </a>
              <?php endforeach; ?>
            </div>
          </details>
        <?php else: ?>
          <a href="<?= e($link['href']) ?>"><?= e($link['label']) ?></a>
        <?php endif; ?>
      <?php endforeach; ?>
    </nav>

    <div class="nav-right">
      <?php if (!empty($navCta)): ?>
        <a class="nav-cta nav-cta-accent" href="<?= e($navCta['href']) ?>"<?= external_attrs($navCta['href']) ?>>
          <?php ($navCta['icon'] ?? 'github') === 'github' ? icon_github() : icon_arrow_up_right(); ?>
          <span><?= e($navCta['label']) ?></span>
        </a>
      <?php endif; ?>
      <label class="nav-toggle" for="nav-toggle">
        <?php icon_menu(); ?>
        <span class="visually-hidden">Menu</span>
      </label>
    </div>
  </div>
  <label class="nav-backdrop" for="nav-toggle" aria-hidden="true"></label>
</header>
