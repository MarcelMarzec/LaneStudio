import { laneStudioRepository } from '../version';

/** Where Lane Studio's website, repository, privacy policy and contact page are (shown in the Lane Studio settings) */
export const laneStudioLinks = {
    website: 'https://lanestudio.marcelmarzec.com/',
    github: laneStudioRepository,
    privacy: `${laneStudioRepository}/blob/mm/lane-studio-main/PRIVACY.md`,
    contact: `${laneStudioRepository}/issues`,
    changelog: `${laneStudioRepository}/blob/mm/lane-studio-main/CHANGELOG.md`
};
