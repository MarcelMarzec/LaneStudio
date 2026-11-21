import { dispatch as d3_dispatch } from 'd3-dispatch';

import type { MarkingType } from '../model/markings';
import type { SignChoice } from '../model/signs';

/**
 * The map tool: select lanes, paint a value onto lanes, drag lane widths, place road markings or signs (lane
 * connections have their own tool in the top bar, Connectivity)
 */
export type LaneTool = 'select' | 'paint' | 'width' | 'marking' | 'sign';

/** What the Paint tool writes: a lane key and value, or a lane type */
export interface PaintValue {
    /** a `*:lanes` key id, or `kind` for the lane type */
    key: string;
    value: string;
}

export interface LaneTools {
    tool(): LaneTool;
    setTool(tool: LaneTool): void;
    paint(): PaintValue;
    setPaint(paint: PaintValue): void;
    /** what the marking tool places: a crossing, stop sign, … */
    marking(): MarkingType;
    setMarking(type: MarkingType): void;
    /** what the sign tool places: a traffic sign, message sign or camera */
    sign(): SignChoice;
    setSign(choice: SignChoice): void;
    on(type: `change${string}`, listener: (() => void) | null): LaneTools;
}

const toolsByContext = new WeakMap<iD.Context, LaneTools>();

export function laneTools(context: iD.Context): LaneTools {
    const existing = toolsByContext.get(context);
    if (existing) return existing;

    const dispatch = d3_dispatch('change');
    let _tool: LaneTool = 'select';
    let _paint: PaintValue = { key: 'kind', value: 'bus' };
    let _marking: MarkingType = 'crossing';
    let _sign: SignChoice = 'GB:670';

    const tools: LaneTools = {
        tool: () => _tool,
        setTool(tool) {
            _tool = tool;
            context.container()
                .classed('lanes-tool-paint', tool === 'paint')
                .classed('lanes-tool-width', tool === 'width')
                .classed('lanes-tool-marking', tool === 'marking')
                .classed('lanes-tool-sign', tool === 'sign');
            dispatch.call('change', tools);
        },
        paint: () => _paint,
        setPaint(paint) {
            _paint = paint;
            dispatch.call('change', tools);
        },
        marking: () => _marking,
        setMarking(type) {
            _marking = type;
            dispatch.call('change', tools);
        },
        sign: () => _sign,
        setSign(choice) {
            _sign = choice;
            dispatch.call('change', tools);
        },
        on(type, listener) {
            dispatch.on(type as 'change', listener as () => void);
            return tools;
        }
    };

    // clicking empty map (iD then enters browse mode), drawing or saving puts the tool back to Select
    context.on('enter.lane-tools', () => {
        if (_tool !== 'select' && context.mode()?.id !== 'select') tools.setTool('select');
    });

    toolsByContext.set(context, tools);
    return tools;
}
