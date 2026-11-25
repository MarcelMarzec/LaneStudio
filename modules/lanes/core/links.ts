import { laneStudioRepository } from '../version';

/** Where Lane Studio's website, repository, privacy policy, contact page, forum post and wiki page are (shown in the
 *  Lane Studio settings) */
export const laneStudioLinks = {
    website: 'https://lanestudio.marcelmarzec.com/',
    github: laneStudioRepository,
    privacy: `${laneStudioRepository}/blob/mm/lane-studio-main/docs/PRIVACY.md`,
    contact: `${laneStudioRepository}/issues`,
    forum: 'https://community.openstreetmap.org/t/introducing-lane-studio-a-visual-lane-editor-for-openstreetmap-built-on-id/150572',
    wiki: 'https://wiki.openstreetmap.org/wiki/Lane_Studio',
    changelog: `${laneStudioRepository}/blob/mm/lane-studio-main/docs/CHANGELOG.md`
};
