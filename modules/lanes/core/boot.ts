import { coreContext, type coreContext as Context } from '../../core/context';
import { localizer, t } from '../../core/localizer';
import { coreValidatorAddRule } from '../../core/validator';
import { prefs } from '../../core/preferences';
import { uiEntityEditorAddSection } from '../../ui/entity_editor';
import { uiInitAddPane } from '../../ui/init';
import { services } from '../../services';
import { utilStringQs } from '../../util';
import { laneKeys } from './lane_keys';
import { svgLanes } from '../svg/lanes';
import { validationLaneTags } from '../validations/lane_tags';
import { uiSectionLanes } from '../ui/section_lanes';
import { uiSectionMarkings } from '../ui/section_markings';
import { uiSectionStreetFeature } from '../ui/section_street_feature';
import { laneStudioSplash } from '../ui/splash';
import { uiPaneLaneStudio } from '../ui/pane_settings';
import { laneSettings } from './lane_settings';
import { laneStudioVersion } from '../version';

export interface LaneStudioOptions {
    /** where `dist/` is served from, relative to the page */
    assetPath?: string;
}

/** Boots iD's core with Lane Studio's settings and returns the iD context */
export function laneStudioInit(container: HTMLElement, options: LaneStudioOptions = {}): Context {
    // Keep saved edits, preferences and the edit lock apart from a plain iD on the same origin
    prefs.prefix('lanes_');

    // Lane Studio's own strings, read with `t('_lanes.…')`
    localizer.addLocaleDir('lanes', 'locales/lanes');

    // the lane tags rule runs with iD's own validation rules
    coreValidatorAddRule(validationLaneTags);

    const context = coreContext.call({})
        .assetPath(options.assetPath ?? 'dist/')
        .containerNode(container)
        .createdBy(`LaneStudio ${laneStudioVersion}`)
        .documentTitleBase('Lane Studio');

    // the Lanes section sits in iD's sidebar, after the issues and before the preset fields
    uiEntityEditorAddSection(uiSectionLanes);
    uiEntityEditorAddSection(uiSectionMarkings);
    uiEntityEditorAddSection(uiSectionStreetFeature);

    // Lane Studio's settings pane, first in the pane bar
    uiInitAddPane(uiPaneLaneStudio);

    context.container().classed('lane-studio', true);
    laneSettings(context);
    context.init();
    // after init (it needs the UI), but before iD's UI renders and decides on its own splash
    laneStudioSplash(context);

    // iD's Issues pane looks up rule names under `issues.<rule>` in its general strings
    // (merged as soon as strings load, before iD's UI first renders)
    localizer.ensureLoaded().then(() => {
        localizer.mergeStrings('general', 'en', {
            issues: { lane_tags: { title: t('_lanes.validation.title'), tip: t('_lanes.validation.tip') } }
        });
    }).catch(() => { /* without strings the rule still runs, unnamed */ });

    // iD sends logins back to `<page path>land.html`, which only works for a page served as a folder
    // index; Lane Studio may also be served as /lanes.html, so point it at land.html next to the page
    const osm = services.osm;
    if (osm) {
        const redirect = new URL('land.html', window.location.href);
        redirect.search = '';
        redirect.hash = '';
        osm.switch({ url: osm.getUrlRoot(), apiUrl: osm.getApiUrlRoot(), redirect_uri: redirect.href });
    }

    // the lanes layer, drawn under iD's own data
    context.layers().add([{ id: 'lanes', layer: svgLanes(context.projection, context) }]);

    // Delete removes selected lanes, [ and ] step between lanes
    laneKeys(context);

    // like iD, hide boundaries unless the URL asks for a specific set of hidden features
    const q = utilStringQs(window.location.hash);
    if (!q.hasOwnProperty('disable_features')) {
        context.features().disable('boundaries');
    }

    return context;
}
