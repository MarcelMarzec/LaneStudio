import { brandOf, logoFileOf } from '../../../../modules/lanes/core/brand_logos';

describe('brand logos', () => {
    it('reads a feature\'s brand from brand:wikidata', () => {
        expect(brandOf({ 'brand:wikidata': 'Q297410' })).toBe('Q297410');
        expect(brandOf({ 'brand:wikidata': 'Q297410;Q1' })).toBe('Q297410');
        expect(brandOf({ 'brand:wikidata': 'Asda' })).toBeUndefined();
        expect(brandOf({ brand: 'Asda' })).toBeUndefined();
    });

    it('prefers a brand\'s small logo, then its logo image', () => {
        const claim = (value: string) => [{ mainsnak: { datavalue: { value } } }];
        expect(logoFileOf({ P154: claim('Asda logo.svg'), P8972: claim('Asda icon.svg') })).toBe('Asda icon.svg');
        expect(logoFileOf({ P154: claim('Asda logo.svg') })).toBe('Asda logo.svg');
        expect(logoFileOf({ P18: claim('Store.jpg') })).toBeNull();
        expect(logoFileOf(undefined)).toBeNull();
    });
});
