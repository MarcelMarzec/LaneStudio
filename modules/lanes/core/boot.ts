import { coreContext, type coreContext as Context } from '../../core/context';
import { localizer } from '../../core/localizer';
import { prefs } from '../../core/preferences';
import { uiEntityEditorAddSection } from '../../ui/entity_editor';
import { utilStringQs } from '../../util';
import { svgLanes } from '../svg/lanes';
import { uiSectionLanes } from '../ui/section_lanes';
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

    const context = coreContext.call({})
        .assetPath(options.assetPath ?? 'dist/')
        .containerNode(container)
        .createdBy(`LaneStudio ${laneStudioVersion}`)
        .documentTitleBase('Lane Studio');

    // the Lanes section sits in iD's sidebar, after the issues and before the preset fields
    uiEntityEditorAddSection(uiSectionLanes);

    context.container().classed('lane-studio', true);
    context.init();

    // the lanes layer, drawn under iD's own data
    context.layers().add([{ id: 'lanes', layer: svgLanes(context.projection, context) }]);

    // like iD, hide boundaries unless the URL asks for a specific set of hidden features
    const q = utilStringQs(window.location.hash);
    if (!q.hasOwnProperty('disable_features')) {
        context.features().disable('boundaries');
    }

    return context;
}
