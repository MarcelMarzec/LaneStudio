// Lane Studio: a road and lane editor built on iD.
// `../id` installs the polyfills and the `window.iD` global that iD's own code expects.
import '../id';

import { laneStudioInit } from './core/boot';
import { laneStudioVersion } from './version';

export * from './model';
export { actionChangeLanes } from './actions/change_lanes';

const LaneStudio = {
    init: laneStudioInit,
    version: laneStudioVersion
};

declare global {
    interface Window {
        LaneStudio: typeof LaneStudio;
    }
}

window.LaneStudio = LaneStudio;
