/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Writes the GitHub wiki's pages from `docs/` into a folder (the wiki's own git repository, checked out by the
 * **Sync docs to the wiki** workflow). `docs/` is the source of truth: the wiki is a copy, rewritten on every sync.
 *
 * - each `docs/NAME.md` becomes the page `NAME`, and each page in a section folder (`docs/guide/`, `docs/develop/`)
 *   a sub page under its section's main page; page names are file names, so they are unique across folders;
 * - the guide (`LANES.md`) is also the wiki's `Home`;
 * - links between documents (relative, from any folder) lose their path and `.md` (wiki pages are flat);
 * - links to anything else in the repository (code, README, CLAUDE.md) become links to it on GitHub;
 * - images in `docs/img/` are copied, and linked from the wiki's own copy;
 * - `_Sidebar.md` lists the pages, sub pages indented under their section in the order its page links them;
 *   `_Footer.md` says where they come from.
 *
 * Usage: node scripts/build_wiki.js <wiki folder> [<repository url>] [<branch>]
 */

const repo = process.argv[3] ?? 'https://github.com/MarcelMarzec/LaneStudio';
const branch = process.argv[4] ?? 'mm/lane-studio-main';

/** The main pages in the sidebar's order, their titles, and the folder of sub pages each heads */
export const mainPages = [
    { page: 'LANES', title: 'Guide', folder: 'guide' },
    { page: 'FAQ', title: 'FAQ' },
    { page: 'ARCHITECTURE', title: 'Developers', folder: 'develop' },
    { page: 'API', title: 'API' },
    { page: 'CONTRIBUTING', title: 'Contributing' },
    { page: 'RELEASING', title: 'Releasing' },
    { page: 'ACCESSIBILITY', title: 'Accessibility' },
    { page: 'PRIVACY', title: 'Privacy' },
    { page: 'SECURITY', title: 'Security' },
    { page: 'CODE_OF_CONDUCT', title: 'Code of conduct' },
    { page: 'CHANGELOG', title: 'Changelog' }
];

/** Every document under `docs/`: its path from `docs/` and its page name */
export function listDocs(root = 'docs') {
    const docs = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.md')) docs.push({ file: entry.name, page: entry.name.replace(/\.md$/, '') });
        if (entry.isDirectory() && entry.name !== 'img') {
            for (const f of fs.readdirSync(path.join(root, entry.name)).filter(f => f.endsWith('.md')).sort()) {
                docs.push({ file: `${entry.name}/${f}`, page: f.replace(/\.md$/, '') });
            }
        }
    }
    return docs;
}

/** A document's text with its links made to work on the wiki; `file` is its path from `docs/` */
export function wikiText(text, pages, file = '') {
    const dir = path.posix.dirname(file);
    return text.replace(/(\]\(|src=")([^)"\s]+)/g, (whole, open, target) => {
        if (/^(https?:|mailto:|#|\/)/.test(target)) return whole;
        const [link, anchor] = target.split('#');
        const hash = anchor ? `#${anchor}` : '';
        // where the link points, from docs/
        const inDocs = path.posix.normalize(path.posix.join(dir, link));
        const name = path.posix.basename(link).replace(/\.md$/, '');
        if (link.endsWith('.md') && !inDocs.startsWith('..') && pages.includes(name)) return open + name + hash;
        if (inDocs.startsWith('img/')) return open + inDocs + hash;
        // anything else in the repository, on GitHub
        const inRepo = path.posix.normalize(path.posix.join('docs', inDocs));
        const kind = link.endsWith('/') ? 'tree' : 'blob';
        return `${open}${repo}/${kind}/${branch}/${inRepo}${hash}`;
    });
}

/** A page's title: its first heading */
function titleOf(text, fallback) {
    return text.match(/^#+\s+(.+)$/m)?.[1].trim() ?? fallback;
}

/** The sidebar: the main pages in order, each section's sub pages indented under it, any other pages after */
export function sidebar(docs, read) {
    const lines = ['**Lane Studio**', ''];
    const listed = new Set();
    for (const main of mainPages) {
        if (!docs.some(d => d.page === main.page)) continue;
        lines.push(`* [${main.title}](${main.page})`);
        listed.add(main.page);
        // sub pages in the order the main page links them (the reading order), any it doesn't link after
        const mainText = read(`${main.page}.md`);
        const at = doc => {
            const i = mainText.indexOf(`(${doc.file}`);
            return i === -1 ? Infinity : i;
        };
        const subs = docs.filter(d => main.folder && d.file.startsWith(`${main.folder}/`)).sort((a, b) => at(a) - at(b));
        for (const sub of subs) {
            lines.push(`  * [${titleOf(read(sub.file), sub.page)}](${sub.page})`);
            listed.add(sub.page);
        }
    }
    for (const doc of docs.filter(d => !listed.has(d.page))) lines.push(`* [${titleOf(read(doc.file), doc.page)}](${doc.page})`);
    return lines.join('\n') + '\n';
}

export function buildWiki(out) {
    const docs = listDocs();
    const pages = docs.map(d => d.page);
    const dupes = pages.filter((p, i) => pages.indexOf(p) !== i);
    if (dupes.length) throw new Error(`Page names must be unique across docs/ folders: ${dupes.join(', ')}`);
    const read = file => fs.readFileSync(path.join('docs', file), 'utf8');
    // the wiki is a copy: pages no longer in docs/ go too
    for (const f of fs.readdirSync(out)) {
        if (f.endsWith('.md')) fs.rmSync(path.join(out, f));
    }
    for (const doc of docs) {
        const text = wikiText(read(doc.file), pages, doc.file);
        fs.writeFileSync(path.join(out, `${doc.page}.md`), text);
        if (doc.file === 'LANES.md') fs.writeFileSync(path.join(out, 'Home.md'), text);
    }
    fs.rmSync(path.join(out, 'img'), { recursive: true, force: true });
    fs.cpSync('docs/img', path.join(out, 'img'), { recursive: true });

    fs.writeFileSync(path.join(out, '_Sidebar.md'), sidebar(docs, read));
    fs.writeFileSync(path.join(out, '_Footer.md'),
        `Copied from [docs/](${repo}/tree/${branch}/docs) on every change; edit the files there, not here.\n`);
    console.log(`Wrote ${docs.length} pages to ${out}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
    const out = process.argv[2];
    if (!out) {
        console.error('Usage: node scripts/build_wiki.js <wiki folder> [<repository url>] [<branch>]');
        process.exit(1);
    }
    buildWiki(out);
}
