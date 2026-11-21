import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { rendererBackgroundSource } from '../../renderer/background_source';
import { laneSettings } from './lane_settings';

/** The standard OpenStreetMap map's tiles (iD's `MAPNIK` background), as the overlay shown when zoomed out */
export const zoomedOutMapID = 'lanes_osm_zoomed_out';
const osmTiles = 'https://tile.openstreetmap.org/{zoom}/{x}/{y}.png';

/**
 * How opaque the OpenStreetMap map is over the imagery at a zoom: none where editing starts (`editable`, iD's 16) and
 * above, fully one zoom level out, fading in between
 */
export function zoomedOutOpacity(zoom: number, editable: number): number {
    return Math.max(0, Math.min(1, editable - zoom));
}

/**
 * Zoomed out too far to edit, the imagery gives way to the standard OpenStreetMap map, which fades in over it as the
 * map zooms out past where editing ends, and out again as it zooms back in. It is an overlay of the background
 * (kept out of the URL, the Background pane and the changeset's imagery), turned off in the Lane Studio pane, and
 * not shown over a background that is already an OpenStreetMap map. Lane Studio's locator overlay, which draws the
 * roads over the imagery when zoomed out, fades out as the map fades in.
 */
export function laneStudioZoomedOutMap(context: iD.Context) {
    const settings = laneSettings(context);
    const background = context.background() as any;
    let _source: any = null;
    let _syncing = false;

    const wanted = () => settings.showZoomedOutMap() && background.baseLayerSource()?.category !== 'osmbasedmap';
    const shown = () => !!_source && (background.overlayLayerSources() as unknown[]).includes(_source);

    /** Sets the overlays' opacity for the zoom */
    function fade() {
        const container = context.container();
        if (!container || container.empty()) return;
        const opacity = zoomedOutOpacity(context.map().zoom(), context.minEditableZoom());
        const on = shown();
        container.selectAll<HTMLDivElement, any>('.layer-overlay').each(function(layer) {
            const source = layer?.source?.();
            const div = d3_select(this);
            if (source?.id === zoomedOutMapID) {
                div.classed('lanes-zoomed-out-map', true).style('opacity', String(opacity));
            } else if (source?.isLocatorOverlay?.()) {
                div.classed('lanes-zoomed-out-locator', on);
                (this as HTMLDivElement).style.opacity = on ? String(1 - opacity) : '';
            }
        });
    }

    /** Adds or takes away the overlay as the setting and the background say */
    function sync() {
        if (!_source || _syncing) return;
        _syncing = true;
        if (wanted() !== shown()) background.toggleOverlayLayer(_source);
        _syncing = false;
        fade();
    }

    background.ensureLoaded().then(() => {
        const mapnik = background.findSource('MAPNIK');
        _source = rendererBackgroundSource({
            id: zoomedOutMapID,
            name: t('_lanes.zoomed_out.name'),
            type: 'tms',
            template: mapnik?.template?.() ?? osmTiles,
            overlay: true,
            // (no tiles are fetched where it is not shown)
            zoomExtent: [0, context.minEditableZoom()],
            overzoom: false,
            terms_url: 'https://www.openstreetmap.org/copyright',
            terms_text: '© OpenStreetMap contributors'
        });
        // (not in the URL's overlays, nor in the imagery a changeset says it used)
        _source.isHidden = () => true;
        background.on('change.lanes-zoomed-out', sync);
        settings.on('change.lanes-zoomed-out', sync);
        context.map().on('move.lanes-zoomed-out', fade).on('drawn.lanes-zoomed-out', fade);
        sync();
    }).catch(() => { /* without imagery there is nothing to fade from */ });
}
