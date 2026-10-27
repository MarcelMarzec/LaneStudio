<?php
// Development only: the built-in server ignores .htaccess, so this reproduces
// its routing for `php -S localhost:8080 router.php`, run from this folder.
// Not deployed.

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;

// Partials and raw Markdown are never served, matching the .htaccess rules.
// Checked before the static-file branch below, which would otherwise hand the
// file over.
if (str_starts_with($path, '/includes/') || preg_match('/\.md$/i', $path)) {
    http_response_code(403);
    $_SERVER['REDIRECT_STATUS'] = 403;
    require __DIR__ . '/error.php';
    return true;
}

// Real files (CSS, images) are served by the built-in server itself.
if ($path !== '/' && is_file($file)) {
    return false;
}

if (is_dir($file) && is_file($file . '/index.php')) {
    require $file . '/index.php';
    return true;
}

if (is_file(rtrim($file, '/') . '.php')) {
    require rtrim($file, '/') . '.php';
    return true;
}

$_SERVER['REDIRECT_STATUS'] = 404;
require __DIR__ . '/error.php';
return true;
