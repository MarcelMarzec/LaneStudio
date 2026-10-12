import { actionChangeTags } from '../../actions/change_tags';
import type { Action } from '../../core/history';
import type { EntityId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { laneDriveSide } from '../core/drive_side';
import { parseLanes, serialiseLanes, type LaneModel } from '../model';

/**
 * Changes a way's lane tags through the lane model:
 * reads the way's tags, applies `change`, and writes back the smallest tag change.
 */
export function actionChangeLanes(wayID: EntityId, change: (model: LaneModel) => LaneModel): Action {
    return function(graph) {
        const way = graph.entity(wayID) as osmWay;
        const model = parseLanes(way.tags, { driveSide: laneDriveSide(way, graph) });
        const tags = serialiseLanes(change(model), way.tags);
        return actionChangeTags(wayID, tags)(graph);
    };
}
