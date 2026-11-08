import { t } from '../../core/localizer';

/**
 * Lane Studio's pages in the Help pane (`H`), before iD's own: what Lane Studio adds to iD and how to use it, in
 * short. Their text is `_lanes.help.<page>.text` in `data/lanes.yaml` (Markdown); the full guide is on the wiki.
 */
export const laneStudioHelpPages = ['lane_studio', 'lanes', 'roadside', 'tools', 'drawing'] as const;

export const laneStudioHelpDocs = laneStudioHelpPages.map(page => ({
    titleKey: `_lanes.help.${page}.title`,
    markdown: () => t(`_lanes.help.${page}.text`)
}));
