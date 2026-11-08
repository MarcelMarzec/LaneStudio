import fs from 'node:fs';
import { load } from 'js-yaml';

import { listDocs, sidebar, wikiText } from '../../../scripts/build_wiki.js';
import { laneStudioHelpPages } from '../../../modules/lanes/ui/help';
import { lanesIntroChapters } from '../../../modules/lanes/ui/intro';

describe('the wiki', () => {
    const docs = listDocs() as { file: string; page: string }[];
    const pages = docs.map(d => d.page);

    it('has a unique page name for every document, in every folder', () => {
        expect(new Set(pages).size).toBe(pages.length);
        expect(docs.some(d => d.file.startsWith('guide/'))).toBe(true);
        expect(docs.some(d => d.file.startsWith('develop/'))).toBe(true);
    });

    it('makes links between documents in any folder into wiki page links', () => {
        expect(wikiText('[a](Lanes.md#widths) [b](../FAQ.md) [c](../img/x.png)', pages, 'guide/Roadside.md'))
            .toBe('[a](Lanes#widths) [b](FAQ) [c](img/x.png)');
        expect(wikiText('[a](guide/Lanes.md) [b](../CLAUDE.md)', pages, 'LANES.md'))
            .toBe('[a](Lanes) [b](https://github.com/MarcelMarzec/LaneStudio/blob/mm/lane-studio-main/CLAUDE.md)');
    });

    it('lists sub pages under their main page, in the order it links them', () => {
        const text = sidebar(docs, (file: string) => fs.readFileSync(`docs/${file}`, 'utf8')) as string;
        const lines = text.split('\n');
        const guide = lines.indexOf('* [Guide](LANES)');
        expect(lines[guide + 1]).toBe('  * [Getting started](Getting-Started)');
        expect(lines.filter(l => l.startsWith('  * ')).length).toBe(docs.filter(d => d.file.includes('/')).length);
    });

    it('has every relative link pointing at a document that exists', () => {
        for (const doc of docs.filter(d => d.file !== 'CHANGELOG.md')) {
            const text = fs.readFileSync(`docs/${doc.file}`, 'utf8');
            const dir = doc.file.includes('/') ? doc.file.split('/')[0] + '/' : '';
            for (const [, target] of text.matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
                if (/^https?:/.test(target)) continue;
                const path = new URL(target, `file:///docs/${dir}`).pathname.replace(/^\//, '');
                expect(fs.existsSync(path), `${doc.file} → ${target}`).toBe(true);
            }
        }
    });
});

describe('walkthrough and help', () => {
    const strings = (load(fs.readFileSync('data/lanes.yaml', 'utf8')) as { en: Record<string, Record<string, Record<string, string>>> }).en;

    it('has a title and text for every help page', () => {
        for (const page of laneStudioHelpPages) {
            expect(strings.help[page].title, page).toBeTruthy();
            expect(strings.help[page].text, page).toBeTruthy();
        }
    });

    it('has a title for every walkthrough chapter', () => {
        for (const chapter of lanesIntroChapters) {
            const id = chapter.id.replace('lanes-', '');
            expect(strings.intro[id]?.title, chapter.id).toBeTruthy();
        }
    });
});
