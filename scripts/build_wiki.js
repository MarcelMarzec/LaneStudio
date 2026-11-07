/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the GitHub wiki's pages from `docs/` into a folder (the wiki's own git repository, checked out by the
 * **Sync docs to the wiki** workflow). `docs/` is the source of truth: the wiki is a copy, rewritten on every sync.
 *
 * - each `docs/NAME.md` becomes the page `NAME`; the guide (`LANES.md`) is also the wiki's `Home`;
 * - links between documents lose their `.md` (wiki pages are flat and have no extension);
 * - links to anything else in the repository (code, README, CLAUDE.md) become links to it on GitHub;
 * - images in `docs/img/` are copied, and linked from the wiki's own copy;
 * - `_Sidebar.md` lists the pages, `_Footer.md` says where they come from.
 *
 * Usage: node scripts/build_wiki.js <wiki folder> [<repository url>] [<branch>]
 */

const repo = process.argv[3] ?? 'https://github.com/MarcelMarzec/LaneStudio';
const branch = process.argv[4] ?? 'mm/lane-studio-main';
const titles = {
  LANES: 'Guide', FAQ: 'FAQ', ARCHITECTURE: 'Architecture', API: 'API', ACCESSIBILITY: 'Accessibility',
  PRIVACY: 'Privacy', CONTRIBUTING: 'Contributing', RELEASING: 'Releasing', SECURITY: 'Security',
  CODE_OF_CONDUCT: 'Code of conduct', CHANGELOG: 'Changelog'
};

/** A document's text with its links made to work on the wiki */
export function wikiText(text, pages) {
  return text.replace(/(\]\(|src=")([^)"\s]+)/g, (whole, open, target) => {
    if (/^(https?:|mailto:|#|\/)/.test(target)) return whole;
    const [file, anchor] = target.split('#');
    const hash = anchor ? `#${anchor}` : '';
    const name = file.replace(/\.md$/, '');
    if (file.endsWith('.md') && pages.includes(name)) return open + name + hash;
    if (file.startsWith('img/')) return open + file + hash;
    // anything else in the repository, on GitHub
    const inRepo = path.posix.normalize(path.posix.join('docs', file));
    const kind = file.endsWith('/') ? 'tree' : 'blob';
    return `${open}${repo}/${kind}/${branch}/${inRepo}${hash}`;
  });
}

export function buildWiki(out) {
  const files = fs.readdirSync('docs').filter(f => f.endsWith('.md'));
  const pages = files.map(f => f.replace(/\.md$/, ''));
  // the wiki is a copy: pages no longer in docs/ go too
  for (const f of fs.readdirSync(out)) {
    if (f.endsWith('.md')) fs.rmSync(path.join(out, f));
  }
  for (const f of files) {
    const text = wikiText(fs.readFileSync(path.join('docs', f), 'utf8'), pages);
    fs.writeFileSync(path.join(out, f), text);
    if (f === 'LANES.md') fs.writeFileSync(path.join(out, 'Home.md'), text);
  }
  fs.rmSync(path.join(out, 'img'), { recursive: true, force: true });
  fs.cpSync('docs/img', path.join(out, 'img'), { recursive: true });

  const order = Object.keys(titles).filter(p => pages.includes(p));
  const rest = pages.filter(p => !order.includes(p)).sort();
  fs.writeFileSync(path.join(out, '_Sidebar.md'), '**Lane Studio**\n\n' +
    [...order, ...rest].map(p => `* [${titles[p] ?? p}](${p})`).join('\n') + '\n');
  fs.writeFileSync(path.join(out, '_Footer.md'),
    `Copied from [docs/](${repo}/tree/${branch}/docs) on every change; edit the files there, not here.\n`);
  console.log(`Wrote ${files.length} pages to ${out}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node scripts/build_wiki.js <wiki folder> [<repository url>] [<branch>]');
    process.exit(1);
  }
  buildWiki(out);
}
