<?php
// Site content and helpers. Every page requires this first.

// Marks a legitimate entry point; the partials refuse to run without it.
define('SITE', true);

$site = [
    'name'      => 'Lane Studio',
    'author'    => 'Marcel Marzec',
    'url'       => 'https://lanestudio.marcelmarzec.com',
    'locale'    => 'en-GB',
    'home'      => 'https://marcelmarzec.com',
    'contact'   => 'https://marcelmarzec.com/contact',
    'github'    => 'https://github.com/MarcelMarzec/LaneStudio',
    'editor'    => 'https://lanestudio.marcelmarzec.com/editor/',
    'changelog' => 'https://github.com/MarcelMarzec/LaneStudio/blob/mm/lane-studio-main/CHANGELOG.md',
    // Affiliate link: disclosed wherever it appears.
    'host'      => 'https://portal.fyfeweb.com/aff.php?aff=80',
];

// Shown in the footer.
$socials = [
    [
        'label' => 'GitHub',
        'href'  => 'https://github.com/MarcelMarzec/LaneStudio',
        'icon'  => 'github',
    ],
    [
        'label' => 'OSM Wiki',
        'href'  => 'https://wiki.openstreetmap.org/wiki/Lane_Studio',
        'icon'  => 'book',
    ],
    [
        'label' => 'OpenStreetMap',
        'href'  => 'https://www.openstreetmap.org/user/Marcelm005',
        'icon'  => 'map_pin',
    ],
];

function e(?string $value): string
{
    return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8');
}

function is_external(string $href): bool
{
    return str_starts_with($href, 'http');
}

// Attributes for an outbound link; empty string for an internal one.
function external_attrs(string $href): string
{
    return is_external($href) ? ' target="_blank" rel="noopener"' : '';
}
