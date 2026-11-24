<?php
// The XML sitemap, served at /sitemap.xml (see .htaccess and router.php) and
// named in robots.txt. Lists the website's pages and the editor. Each page's
// lastmod is when its file last changed; the changelog's is the newer of the
// page and the copy of docs/CHANGELOG.md the deploy puts in includes/.
require_once __DIR__ . '/includes/config.php';

header('Content-Type: application/xml; charset=utf-8');

$base = rtrim($site['url'], '/');
$mtime = fn(string ...$files): ?int => ($times = array_filter(array_map(
    fn(string $f): int|false => @filemtime(__DIR__ . '/' . $f),
    $files
))) ? max($times) : null;

$urls = [
    ['loc' => '/',               'lastmod' => $mtime('index.php')],
    ['loc' => '/editor/',        'lastmod' => null],
    ['loc' => '/statistics',     'lastmod' => $mtime('statistics.php')],
    ['loc' => '/changelog',      'lastmod' => $mtime('changelog.php', 'includes/changelog.md')],
    ['loc' => '/privacy_policy', 'lastmod' => $mtime('privacy_policy.php')],
];

echo '<?xml version="1.0" encoding="UTF-8"?>', "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<?php foreach ($urls as $url): ?>
  <url>
    <loc><?= htmlspecialchars($base . $url['loc'], ENT_XML1 | ENT_QUOTES, 'UTF-8') ?></loc>
<?php if ($url['lastmod']): ?>
    <lastmod><?= date('Y-m-d', $url['lastmod']) ?></lastmod>
<?php endif; ?>
  </url>
<?php endforeach; ?>
</urlset>
