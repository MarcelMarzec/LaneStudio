<?php
defined('SITE') or exit;
// Inline SVG icons. 24x24 viewBox, currentColor, sized by CSS.

// Renders an icon named in data, e.g. the 'icon' key in $socials.
function icon_by_name(string $name): void
{
    $fn = 'icon_' . $name;
    if (function_exists($fn)) {
        $fn();
    }
}

function icon_github(): void { ?>
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.57.1.78-.25.78-.55v-1.94c-3.2.7-3.87-1.54-3.87-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .96-.3 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.18-1.48 3.14-1.18 3.14-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.2.66.79.55A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5Z"/></svg>
<?php }

function icon_arrow_up_right(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>
<?php }

function icon_arrow_right(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>
<?php }

function icon_map_pin(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
<?php }

function icon_plane(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3.2-2 4.4-2.3.6a.8.8 0 0 0-.3 1.4l2.5 1.7 1.7 2.5a.8.8 0 0 0 1.4-.3l.6-2.3 4.4-2 3.2 4.6a1 1 0 0 0 1.7-.9Z"/></svg>
<?php }

function icon_truck(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6h11v11H2z"/><path d="M13 9h4.5l3.5 3.5V17H13z"/><circle cx="6.5" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/></svg>
<?php }

function icon_lanes(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 3v18"/><path d="M19 3v18"/><path d="M12 4v3"/><path d="M12 10.5v3"/><path d="M12 17v3"/></svg>
<?php }

function icon_tag(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 12 22l-9-9 8.6-8.6a2 2 0 0 1 1.4-.6H20a2 2 0 0 1 2 2v6.2a2 2 0 0 1-.6 1.4Z"/><circle cx="17" cy="7" r="1.4"/></svg>
<?php }

function icon_checks(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 12 4 4 7-7"/><path d="m12 16 2 2 8-8"/></svg>
<?php }

function icon_code(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 18-6-6 6-6"/><path d="m16 6 6 6-6 6"/></svg>
<?php }

function icon_linkedin(): void { ?>
<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3zM10 9h3.8v1.65h.05A4.17 4.17 0 0 1 17.6 8.7c4 0 4.4 2.5 4.4 5.8V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.2 1.46-2.2 2.96V21h-4z"/></svg>
<?php }

function icon_book(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5Z"/></svg>
<?php }

function icon_briefcase(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M2 13h20"/></svg>
<?php }

function icon_chevron_down(): void { ?>
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
<?php }

function icon_menu(): void { ?>
<svg class="icon-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/></svg>
<svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>
<?php }
