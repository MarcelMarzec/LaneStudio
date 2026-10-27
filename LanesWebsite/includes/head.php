<?php
defined('SITE') or exit;
// Opens the document and <main>. Pages set $title, $description, $theme and
// $path first; footer.php closes up.
require_once __DIR__ . '/icons.php';

$canonical = rtrim($site['url'], '/') . ($path ?? '/');

// Social preview. Pages may set $ogImage (a site-relative path); without one
// there is no preview image.
$ogImage = isset($ogImage) ? rtrim($site['url'], '/') . $ogImage : null;
$ogType  = $ogType ?? 'website';
?>
<!doctype html>
<html lang="<?= e($site['locale']) ?>" data-theme="<?= e($theme ?? 'orange') ?>">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title><?= e($title) ?></title>
    <meta name="description" content="<?= e($description) ?>">
    <meta name="author" content="<?= e($site['author']) ?>">
    <meta name="theme-color" content="#090909">
    <?php if (!empty($noindex)): ?>
      <meta name="robots" content="noindex">
    <?php else: ?>
      <link rel="canonical" href="<?= e($canonical) ?>">
    <?php endif; ?>

    <meta property="og:type" content="<?= e($ogType) ?>">
    <meta property="og:site_name" content="<?= e($site['name']) ?>">
    <meta property="og:locale" content="en_GB">
    <meta property="og:title" content="<?= e($title) ?>">
    <meta property="og:description" content="<?= e($description) ?>">
    <meta property="og:url" content="<?= e($canonical) ?>">
    <?php if ($ogImage): ?>
      <meta property="og:image" content="<?= e($ogImage) ?>">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:image" content="<?= e($ogImage) ?>">
    <?php else: ?>
      <meta name="twitter:card" content="summary">
    <?php endif; ?>
    <meta name="twitter:title" content="<?= e($title) ?>">
    <meta name="twitter:description" content="<?= e($description) ?>">

    <link rel="icon" href="/assets/img/lanestudio-mark.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/css/site.css?v=2">
    <?php if (!empty($jsonLd)): ?>
      <script type="application/ld+json"><?= json_encode(
          $jsonLd,
          JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
      ) ?></script>
    <?php endif; ?>
  </head>

  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <?php require __DIR__ . '/nav.php'; ?>
    <main id="main">
