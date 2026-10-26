import { select as d3_select } from 'd3-selection';

import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import { modeBrowse } from '../../modes/browse';
import type { osmWay } from '../../osm/way';
import { utilKeybinding } from '../../util';
import { actionChangeLanes } from '../actions/change_lanes';
import { parseLanes, setLaneValue } from '../model';
import { mphLimits, withRoadSpeed } from '../ui/speed_roundels';
import { speedPanel } from '../ui/speed_panel';
import { laneRouting } from './lane_routing';
import { laneSpeed } from './lane_speed';
import { isDrag, roadOf } from './mode_routing';

/**
 * The Speed Limit tool: lanes are coloured by their speed limit (roads with none stand out), and with a limit
 * picked in the panel, clicking a road sets it (shift-click: that lane only). Keys 1 to 7 pick 10 to 70 mph;
 * Esc lets go of the pick, then leaves.
 */
export function modeLaneSpeed(context: iD.Context) {
    const speed = laneSpeed(context);
    // the lanes layer finds the lane under the pointer for the Routing tool; this tool asks it too
    const lanes = laneRouting(context);
    const panel = speedPanel(context);
    const keybinding = utilKeybinding('lanes-speed');

    /** A click sets the picked limit on the whole road; shift-click on that lane alone (the national limit is for whole roads) */
    function click(event: MouseEvent) {
        const pick = speed.picked();
        const point = context.map().mouse(event) as [number, number] | null;
        if (!pick || !point) return;
        // the lane drawn there, whatever is on top of it; over a road's own line where its lanes are not drawn, its nearest lane
        const road = roadOf(event.target);
        const lane = lanes.laneAt(point) ?? (road ? lanes.laneAt(point, road) : null);
        if (lane?.kind !== 'lane') return;
        const way = context.entity(lane.wayID) as osmWay;
        if (!event.shiftKey) {
            context.perform(actionChangeTags(way.id, withRoadSpeed(way.tags, pick)), t('_lanes.annotation.speed'));
        } else if (pick.kind !== 'national' && !parseLanes(way.tags).keys['maxspeed:lanes']?.readonly) {
            const value = pick.kind === 'mph' ? `${pick.mph} mph` : '';
            context.perform(actionChangeLanes(way.id, m => setLaneValue(m, lane.ref, 'maxspeed:lanes', value)), t('_lanes.annotation.speed'));
        }
    }

    const mode = {
        id: 'lanes-speed',
        button: 'lanes-speed',
        title: t.append('_lanes.speed_tool.title'),
        description: t.append('_lanes.toolbar.speed.tooltip'),
        enter() {
            speed.setActive(true);
            keybinding.on('⎋', () => {
                if (speed.picked()) speed.setPicked(null);
                else context.enter(modeBrowse(context) as any);
            }, true);
            mphLimits.forEach((mph, i) => keybinding.on(String(i + 1), () => speed.setPicked({ kind: 'mph', mph }), true));
            d3_select(document).call(keybinding);
            let down: [number, number] | null = null;
            context.surface()
                .on('pointerdown.lanes-speed', (event: PointerEvent) => {
                    down = [event.clientX, event.clientY];
                })
                .on('click.lanes-speed', (event: MouseEvent) => {
                    // a click ending a drag (panning the map) sets nothing
                    if (!isDrag(down, [event.clientX, event.clientY])) click(event);
                });
            panel.show();
        },
        exit() {
            d3_select(document).call(keybinding.unbind);
            context.surface()
                .on('pointerdown.lanes-speed', null)
                .on('click.lanes-speed', null);
            panel.hide();
            speed.setPicked(null);
            speed.setActive(false);
        },
        selectedIDs: () => [] as string[]
    };
    return mode;
}
