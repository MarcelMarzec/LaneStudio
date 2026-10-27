<?php
require_once __DIR__ . '/includes/config.php';

// Serves every ErrorDocument. Apache puts the original status in
// REDIRECT_STATUS; opened directly there is none, so it falls back to 404.
$status = (int) ($_SERVER['REDIRECT_STATUS'] ?? 404);

$messages = [
    400 => ['Bad request', 'That request was malformed, so the server could not read it.'],
    401 => ['Not authorised', 'This page needs credentials that were not provided.'],
    403 => ['Forbidden', "There's nothing here you're allowed to look at."],
    404 => ['Page not found', "That page doesn't exist — it may have moved, or the link may be wrong."],
    500 => ['Something went wrong', 'The server hit an error dealing with that request. It is not your fault.'],
    502 => ['Bad gateway', 'The server got an invalid response upstream. Try again shortly.'],
    503 => ['Temporarily unavailable', 'The site is briefly offline or overloaded. Try again shortly.'],
];

[$heading, $body] = $messages[$status] ?? ['Something went wrong', 'The server could not complete that request.'];

if (!isset($messages[$status])) {
    $status = 500;
}

http_response_code($status);

$title       = $heading . ' — ' . $site['name'];
$description = $body;
$theme       = 'orange';
$path        = '/error';
$noindex     = true;

$navLinks = [
    ['label' => 'Overview', 'href' => '/'],
    ['label' => 'Changelog', 'href' => '/changelog'],
    ['label' => 'Contact', 'href' => $site['contact']],
];
$navCta = ['label' => 'Open editor', 'href' => $site['editor'], 'icon' => 'external'];

require __DIR__ . '/includes/head.php';
?>

<section class="error-page">
  <div class="section-inner">
    <p class="error-code"><?= (int) $status ?></p>
    <h1><?= e($heading) ?></h1>
    <p class="error-body"><?= e($body) ?></p>

    <div class="cta-actions">
      <a class="btn-primary" href="/">
        Back to the home page <?php icon_arrow_right(); ?>
      </a>
      <a class="btn-secondary" href="<?= e($site['contact']) ?>">
        Tell me what broke
      </a>
    </div>
  </div>
</section>

<?php require __DIR__ . '/includes/footer.php'; ?>
