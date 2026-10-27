<?php
defined('SITE') or exit;
// Markdown renderer for the changelog, from marcelmarzec.com's blog. Covers what
// Obsidian produces with wikilinks turned off: headings, nested lists, task
// lists, tables, fenced code, block quotes, callouts, images, links and the
// usual inline marks. Everything is escaped first, so a source file cannot
// inject markup.
//
// Options accepted by both functions:
//   shift        how many levels to push headings down (changelog uses 1)
//   dropFirstH1  skip the file's own title, when the page supplies one
//   metaFrom     headings at or below this level become meta lines, not headings
//   assetBase    web directory relative image paths resolve against
//   linkBase     web directory relative .md links resolve against

function md_inline(string $text, array $opts = []): string
{
    $out = e($text);

    // Lift code spans out first so their contents cannot be re-parsed; a
    // stray asterisk inside one would otherwise read as emphasis.
    $codes = [];
    $out = preg_replace_callback('/`([^`]+)`/', function (array $m) use (&$codes): string {
        $codes[] = '<code>' . $m[1] . '</code>';
        return "\x00" . (count($codes) - 1) . "\x00";
    }, $out);

    // Images before links: the syntax differs only by the leading bang.
    $out = preg_replace_callback('/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/',
        function (array $m) use ($opts): string {
            $src = md_resolve_asset($m[2], $opts['assetBase'] ?? '');
            if ($src === null) {
                return e($m[1]);
            }
            $caption = $m[3] ?? '';
            $img = '<img src="' . $src . '" alt="' . $m[1] . '" loading="lazy" decoding="async">';
            return $caption === ''
                ? $img
                : '<figure>' . $img . '<figcaption>' . $caption . '</figcaption></figure>';
        }, $out);

    $out = preg_replace_callback('/\[([^\]]+)\]\(([^)\s]+)\)/', function (array $m) use ($opts): string {
        $href = md_resolve_link($m[2], $opts);
        if ($href === null) {
            return $m[1];
        }
        $external = str_starts_with(strtolower($href), 'http');
        return '<a href="' . $href . '"' . ($external ? ' target="_blank" rel="noopener"' : '')
            . '>' . $m[1] . '</a>';
    }, $out);

    $out = preg_replace('/\*\*([^*]+)\*\*/', '<strong>$1</strong>', $out);
    $out = preg_replace('/(?<![*\w])\*([^*\n]+)\*(?![*\w])/', '<em>$1</em>', $out);
    $out = preg_replace('/~~([^~]+)~~/', '<del>$1</del>', $out);
    // Obsidian's highlight.
    $out = preg_replace('/==([^=]+)==/', '<mark>$1</mark>', $out);

    return preg_replace_callback("/\x00(\d+)\x00/", fn(array $m): string => $codes[(int) $m[1]], $out);
}

// Image targets: absolute http(s) and root-relative pass through, a relative
// path resolves against the file's own folder. Anything else is refused.
function md_resolve_asset(string $src, string $base): ?string
{
    if (preg_match('#^https?://#i', $src)) {
        return $src;
    }
    if (str_starts_with($src, '/')) {
        return $src;
    }
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $src)) {
        return null;
    }
    return rtrim($base, '/') . '/' . ltrim(rawurldecode($src), './');
}

// Link targets, with one extra job: a link to another .md file becomes that
// post's URL, so linking between notes in Obsidian works on the web too.
function md_resolve_link(string $href, array $opts): ?string
{
    $plain = html_entity_decode($href, ENT_QUOTES, 'UTF-8');

    if (preg_match('/\.md$/i', $plain)) {
        $path = rawurldecode($plain);
        $relative = !str_starts_with($path, '/');
        $path = preg_replace('/\.md$/i', '', $path);

        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                array_pop($segments);
                continue;
            }
            $segments[] = md_slug($segment);
        }
        $tail = implode('/', array_filter($segments));
        $base = $relative ? rtrim($opts['linkBase'] ?? '/blog', '/') : '/blog';
        return e($base . '/' . $tail);
    }

    if (preg_match('#^(https?://|/|\#|mailto:)#i', $plain)) {
        return $href;
    }
    return null;
}

function md_slug(string $text): string
{
    $slug = strtolower(strip_tags($text));
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    return trim($slug, '-');
}

function md_to_html(string $md, array $opts = []): string
{
    $shift       = (int) ($opts['shift'] ?? 0);
    $dropFirstH1 = (bool) ($opts['dropFirstH1'] ?? false);
    $metaFrom    = (int) ($opts['metaFrom'] ?? 7);

    $lines = preg_split('/\R/', $md);
    $html = [];
    $para = [];
    $stack = [];          // open list elements, outermost first
    $items = [];          // text of the item currently open at each depth
    $titleSeen = false;

    $flushPara = function () use (&$para, &$html, $opts): void {
        if ($para) {
            $html[] = '<p>' . md_inline(implode(' ', $para), $opts) . '</p>';
            $para = [];
        }
    };
    $closeItem = function () use (&$stack, &$items, &$html, $opts): void {
        if (!$stack) {
            return;
        }
        $top = count($stack) - 1;
        if ($items[$top] !== null) {
            $text = md_inline(implode(' ', $items[$top]['text']), $opts);
            $class = $items[$top]['task'] === null ? '' : ' class="md-task"';
            $box = $items[$top]['task'] === null ? ''
                : '<span class="md-check' . ($items[$top]['task'] ? ' is-done' : '') . '"></span>';
            $html[] = '<li' . $class . '>' . $box . $text;
            $items[$top] = null;
        }
    };
    $closeList = function () use (&$stack, &$items, &$html, &$closeItem): void {
        while ($stack) {
            $closeItem();
            $html[] = '</li>';
            $html[] = '</' . array_pop($stack) . '>';
            array_pop($items);
        }
    };

    for ($i = 0; $i < count($lines); $i++) {
        $line = $lines[$i];

        // Fenced code, taken verbatim.
        if (preg_match('/^\s*```+\s*([\w+-]*)\s*$/', $line, $m)) {
            $flushPara();
            $closeList();
            $lang = $m[1];
            $body = [];
            for ($i++; $i < count($lines); $i++) {
                if (preg_match('/^\s*```+\s*$/', $lines[$i])) {
                    break;
                }
                $body[] = $lines[$i];
            }
            $attr = $lang === '' ? '' : ' class="language-' . e($lang) . '"';
            $html[] = '<pre><code' . $attr . '>' . e(implode("\n", $body)) . '</code></pre>';
            continue;
        }

        // Block quote, and Obsidian's callout which is a quote with a marker.
        if (preg_match('/^\s*>\s?(.*)$/', $line, $m)) {
            $flushPara();
            $closeList();
            $block = [$m[1]];
            for ($j = $i + 1; $j < count($lines); $j++) {
                if (!preg_match('/^\s*>\s?(.*)$/', $lines[$j], $n)) {
                    break;
                }
                $block[] = $n[1];
                $i = $j;
            }
            $html[] = md_block_quote($block, $opts);
            continue;
        }

        // Table: a row of cells followed by a separator row.
        if (str_contains($line, '|') && isset($lines[$i + 1])
            && preg_match('/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/', $lines[$i + 1])
            && str_contains($lines[$i + 1], '-')) {
            $flushPara();
            $closeList();
            $rows = [$line];
            for ($j = $i + 2; $j < count($lines); $j++) {
                if (!str_contains($lines[$j], '|') || trim($lines[$j]) === '') {
                    break;
                }
                $rows[] = $lines[$j];
                $i = $j;
            }
            $i = max($i, $i);
            $html[] = md_table($rows, $opts);
            continue;
        }

        if (trim($line) === '') {
            $flushPara();
            $closeList();
            continue;
        }

        if (preg_match('/^(#{1,6})\s+(.*)$/', $line, $m)) {
            $flushPara();
            $closeList();
            $level = strlen($m[1]);
            $text = md_inline(trim($m[2]), $opts);

            if ($level === 1 && $dropFirstH1 && !$titleSeen) {
                $titleSeen = true;
                continue;
            }
            if ($level >= $metaFrom) {
                $html[] = '<p class="md-meta">' . $text . '</p>';
                continue;
            }
            $tag = 'h' . min(6, $level + $shift);
            $html[] = '<' . $tag . ' id="' . e(md_slug($m[2])) . '">' . $text . '</' . $tag . '>';
            continue;
        }

        if (preg_match('/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/', $line)) {
            $flushPara();
            $closeList();
            $html[] = '<hr>';
            continue;
        }

        // List item, at any indent. Four spaces (or a tab) is one level.
        if (preg_match('/^(\s*)([*+-]|\d+[.)])\s+(.*)$/', $line, $m)) {
            $flushPara();
            $depth = (int) floor(strlen(str_replace("\t", '    ', $m[1])) / 2);
            $kind = ctype_digit($m[2][0]) ? 'ol' : 'ul';

            $task = null;
            $text = $m[3];
            if (preg_match('/^\[([ xX])\]\s+(.*)$/', $text, $t)) {
                $task = strtolower($t[1]) === 'x';
                $text = $t[2];
            }

            while (count($stack) > $depth + 1) {
                $closeItem();
                $html[] = '</li>';
                $html[] = '</' . array_pop($stack) . '>';
                array_pop($items);
            }

            if (count($stack) === $depth + 1) {
                $closeItem();
                $html[] = '</li>';
                if (end($stack) !== $kind) {
                    $html[] = '</' . array_pop($stack) . '>';
                    array_pop($items);
                }
            }

            while (count($stack) < $depth + 1) {
                $html[] = '<' . $kind . ($task === null ? '' : ' class="md-tasks"') . '>';
                $stack[] = $kind;
                $items[] = null;
            }

            $items[count($stack) - 1] = ['text' => [$text], 'task' => $task];
            continue;
        }

        // An indented line under a list item continues it.
        if ($stack && $items[count($stack) - 1] !== null && preg_match('/^\s+\S/', $line)) {
            $items[count($stack) - 1]['text'][] = trim($line);
            continue;
        }

        $closeList();
        $para[] = trim($line);
    }

    $flushPara();
    $closeList();

    return implode("\n", $html);
}

// A quote block, or a callout when the first line carries Obsidian's marker.
function md_block_quote(array $lines, array $opts): string
{
    $type = null;
    $title = '';

    if (preg_match('/^\s*\[!([a-zA-Z]+)\][-+]?\s*(.*)$/', $lines[0] ?? '', $m)) {
        $type = strtolower($m[1]);
        $title = trim($m[2]);
        array_shift($lines);
    }

    $body = md_to_html(implode("\n", $lines), $opts);

    if ($type === null) {
        return '<blockquote>' . $body . '</blockquote>';
    }

    $heading = $title === '' ? ucfirst($type) : $title;
    return '<div class="callout" data-callout="' . e($type) . '">'
        . '<p class="callout-title">' . md_inline($heading, $opts) . '</p>'
        . $body . '</div>';
}

function md_table(array $rows, array $opts): string
{
    // Split on unescaped pipes only: \| is a literal pipe in a cell.
    $cells = function (string $row): array {
        $row = trim($row);
        $row = preg_replace('/^\||\|$/', '', $row);
        return array_map(
            fn(string $cell): string => str_replace('\|', '|', trim($cell)),
            preg_split('/(?<!\\\\)\|/', $row)
        );
    };

    $head = $cells(array_shift($rows));
    $out = ['<div class="md-table-wrap"><table>', '<thead><tr>'];
    foreach ($head as $cell) {
        $out[] = '<th>' . md_inline($cell, $opts) . '</th>';
    }
    $out[] = '</tr></thead><tbody>';

    foreach ($rows as $row) {
        $out[] = '<tr>';
        foreach ($cells($row) as $cell) {
            $out[] = '<td>' . md_inline($cell, $opts) . '</td>';
        }
        $out[] = '</tr>';
    }

    $out[] = '</tbody></table></div>';
    return implode('', $out);
}
