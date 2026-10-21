import { select as d3_select } from 'd3-selection';

import { uiVersion, uiVersionSetProduct } from '../../../../modules/ui/version';

describe('the version in the footer', () => {
    afterEach(() => uiVersionSetProduct(null));

    it('names Lane Studio, linking to its repository, once it says so', () => {
        const context = iD.coreContext().assetPath('../dist/').init();
        uiVersionSetProduct({
            name: 'Lane Studio', version: '9.8.7', href: 'https://example.com/lane-studio',
            releaseHref: v => `https://example.com/lane-studio/${v}`
        });
        const footer = d3_select(document.createElement('div'));
        footer.call(uiVersion(context) as any);
        const link = footer.select('a').node() as HTMLAnchorElement;
        expect(link.textContent).toBe('9.8.7');
        expect(link.getAttribute('href')).toBe('https://example.com/lane-studio');
        expect(link.getAttribute('title')).toBe(`Lane Studio 9.8.7, built on iD ${context.version}`);
    });

    it('names iD when nothing else is set', () => {
        const context = iD.coreContext().assetPath('../dist/').init();
        const footer = d3_select(document.createElement('div'));
        footer.call(uiVersion(context) as any);
        expect(footer.select('a').text()).toBe(context.version);
        expect(footer.select('a').attr('href')).toBe('https://github.com/openstreetmap/iD');
    });
});
