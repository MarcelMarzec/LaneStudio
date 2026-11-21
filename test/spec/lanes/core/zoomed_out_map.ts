import { zoomedOutOpacity } from '../../../../modules/lanes/core/zoomed_out_map';
import { laneSettings } from '../../../../modules/lanes/core/lane_settings';
import { prefs } from '../../../../modules/core/preferences';

describe('the OpenStreetMap map when zoomed out', () => {
    it('fades in over the imagery as the map zooms out past where editing ends', () => {
        expect(zoomedOutOpacity(18, 16)).toBe(0);
        expect(zoomedOutOpacity(16, 16)).toBe(0);
        expect(zoomedOutOpacity(15.5, 16)).toBe(0.5);
        expect(zoomedOutOpacity(15, 16)).toBe(1);
        expect(zoomedOutOpacity(10, 16)).toBe(1);
    });

    it('is on unless turned off in the Lane Studio pane, and remembered', () => {
        prefs('lanes-zoomed-out-map', null);
        const settings = laneSettings(iD.coreContext().assetPath('../dist/').init());
        expect(settings.showZoomedOutMap()).toBe(true);
        settings.setShowZoomedOutMap(false);
        expect(prefs('lanes-zoomed-out-map')).toBe('false');
        settings.setShowZoomedOutMap(true);
        expect(prefs('lanes-zoomed-out-map')).toBeNull();
    });
});
