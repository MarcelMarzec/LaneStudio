import { select as d3_select } from 'd3-selection';

import { t } from '../../core/localizer';
import { uiPane } from '../../ui/pane';
import { uiSection } from '../../ui/section';

type Div = d3.Selection<HTMLDivElement>;

/**
 * One entry in the map key: what it is called, and how its swatch is drawn with the map's own classes (so it always
 * matches the map): a filled box, a line across it (`line`), two lines (`double`), or a symbol (`use`)
 */
interface KeyEntry {
    id: string;
    swatch: { fill?: string; line?: string; double?: [string, string]; use?: string; text?: string; zigzag?: boolean };
}

/** The map key's groups, each a section of the pane, in the order a road is looked at: lanes, lines, roadside, crossings, areas */
export const mapKeyGroups: { id: string; entries: KeyEntry[] }[] = [
    {
        id: 'lanes',
        entries: [
            { id: 'general', swatch: { fill: 'lane lane-general' } },
            { id: 'bus', swatch: { fill: 'lane lane-bus' } },
            { id: 'psv', swatch: { fill: 'lane lane-psv' } },
            { id: 'hov', swatch: { fill: 'lane lane-hov' } },
            { id: 'bicycle', swatch: { fill: 'lane lane-bicycle' } },
            { id: 'pedestrian', swatch: { fill: 'lane lane-pedestrian' } },
            { id: 'variable', swatch: { fill: 'lane lane-variable' } },
            { id: 'restricted', swatch: { fill: 'lane lane-restricted' } },
            { id: 'shoulder', swatch: { fill: 'roadside roadside-shoulder' } },
            { id: 'construction', swatch: { fill: 'works' } }
        ]
    },
    {
        id: 'lines',
        entries: [
            { id: 'dashed', swatch: { line: 'divider dashed' } },
            { id: 'solid', swatch: { line: 'divider solid' } },
            { id: 'unknown', swatch: { line: 'divider dashed unknown' } },
            { id: 'centre_solid', swatch: { double: ['divider solid', 'divider dashed'] } },
            { id: 'centre_double', swatch: { double: ['divider solid', 'divider solid'] } },
            { id: 'edge', swatch: { line: 'shoulder-edge' } },
            { id: 'bus_edge', swatch: { line: 'shoulder-edge bus-lane-edge' } },
            { id: 'advisory', swatch: { line: 'shoulder-edge advisory' } },
            { id: 'kerb', swatch: { line: 'kerb' } },
            { id: 'kerb_lowered', swatch: { line: 'kerb kerb-lowered' } },
            { id: 'kerb_flush', swatch: { line: 'kerb kerb-flush' } },
            { id: 'double_yellow', swatch: { line: 'kerb-marking double yellow' } },
            { id: 'single_yellow', swatch: { line: 'kerb-marking single yellow' } },
            { id: 'red', swatch: { line: 'kerb-marking double red' } },
            { id: 'connection', swatch: { line: 'connectivity-curve' } },
            { id: 'guide', swatch: { line: 'junction-guide' } }
        ]
    },
    {
        id: 'roadside',
        entries: [
            { id: 'sidewalk', swatch: { fill: 'roadside roadside-sidewalk' } },
            { id: 'sidewalk_unknown', swatch: { fill: 'roadside roadside-sidewalk_unknown' } },
            { id: 'sidewalk_lane', swatch: { fill: 'roadside roadside-sidewalk_lane' } },
            { id: 'cycle_lane', swatch: { fill: 'roadside roadside-cycle_lane', use: '#lanes-cycle' } },
            { id: 'cycle_track', swatch: { fill: 'roadside roadside-cycle_track' } },
            { id: 'cycle_buffer', swatch: { fill: 'roadside roadside-cycle_buffer' } },
            { id: 'parking', swatch: { fill: 'roadside roadside-parking' } },
            { id: 'parking_kerb', swatch: { fill: 'roadside roadside-parking parking-on_kerb' } },
            { id: 'bus_bay', swatch: { fill: 'roadside roadside-bus_bay' } },
            { id: 'footway', swatch: { fill: 'street-path street-path-footway' } },
            { id: 'cycleway', swatch: { fill: 'street-path street-path-cycleway' } }
        ]
    },
    {
        id: 'markings',
        entries: [
            { id: 'zebra', swatch: { fill: 'marking marking-zebra_bar' } },
            { id: 'studs', swatch: { line: 'marking marking-crossing_line dots' } },
            { id: 'zigzag', swatch: { zigzag: true } },
            { id: 'stop', swatch: { line: 'marking marking-stop_line' } },
            { id: 'give_way', swatch: { line: 'marking marking-give_way_line' } },
            { id: 'tactile_red', swatch: { fill: 'marking marking-tactile red' } },
            { id: 'tactile_buff', swatch: { fill: 'marking marking-tactile buff' } },
            { id: 'asl', swatch: { fill: 'marking marking-asl_box', use: '#lanes-cycle' } },
            { id: 'belisha', swatch: { use: '#lanes-belisha' } },
            { id: 'signals', swatch: { use: '#lanes-signals' } },
            { id: 'sharrow', swatch: { fill: 'lane lane-general', use: '#lanes-sharrow' } },
            { id: 'table', swatch: { fill: 'marking marking-calming table' } },
            { id: 'hatched', swatch: { fill: 'lane lane-restricted' } }
        ]
    },
    {
        id: 'areas',
        entries: [
            { id: 'asphalt', swatch: { fill: 'street-area surface-asphalt' } },
            { id: 'concrete', swatch: { fill: 'street-area surface-concrete' } },
            { id: 'paving', swatch: { fill: 'street-area surface-paving' } },
            { id: 'sett', swatch: { fill: 'street-area surface-sett' } },
            { id: 'gravel', swatch: { fill: 'street-area surface-gravel' } },
            { id: 'unpaved', swatch: { fill: 'street-area surface-unpaved' } },
            { id: 'grass', swatch: { fill: 'street-area surface-grass' } },
            { id: 'island', swatch: { fill: 'street-area street-area-island surface-concrete' } },
            { id: 'car_park', swatch: { fill: 'car-park' } }
        ]
    }
];

/** A swatch 44 by 18 pixels, drawn with the lanes layer's classes over a road-coloured ground */
function drawSwatch(selection: d3.Selection<SVGSVGElement>, entry: KeyEntry) {
    const s = entry.swatch;
    selection.append('rect').attr('class', 'lanes-key-ground').attr('width', 44).attr('height', 18);
    if (s.fill) selection.append('rect').attr('class', s.fill).attr('x', 2).attr('y', 2).attr('width', 40).attr('height', 14);
    if (s.line) selection.append('path').attr('class', s.line).attr('d', 'M2 9H42');
    if (s.double) {
        selection.append('path').attr('class', s.double[0]).attr('d', 'M2 7H42');
        selection.append('path').attr('class', s.double[1]).attr('d', 'M2 11H42');
    }
    if (s.zigzag) selection.append('path').attr('class', 'marking marking-zigzag').attr('d', 'M2 11L8 7L14 11L20 7L26 11L32 7L38 11L42 8.5');
    if (s.use) selection.append('use').attr('href', s.use).attr('transform', 'translate(22,9) rotate(90) scale(0.7)');
}

/** One group of the key as a section of the pane, folded away as iD's sections are (and remembered) */
function uiSectionMapKey(context: iD.Context, group: typeof mapKeyGroups[number]) {
    const section = (uiSection(`lanes-key-${group.id}`, context) as any)
        .label(() => t.append(`_lanes.key.groups.${group.id}`))
        .disclosureContent(render);

    function render(selection: Div) {
        const list = selection.selectAll<HTMLUListElement, number>('ul.lanes-key-list').data([0]);
        const enter = list.enter().append('ul').attr('class', 'lanes-key-list');
        for (const entry of group.entries) {
            const item = enter.append('li').attr('class', `lanes-key-item lanes-key-${entry.id}`);
            const svg = item.append('svg').attr('class', 'lanes-layer lanes-key-swatch').attr('width', 44).attr('height', 18)
                .attr('aria-hidden', 'true') as unknown as d3.Selection<SVGSVGElement>;
            drawSwatch(svg, entry);
            item.append('span').attr('class', 'lanes-key-label').text(t(`_lanes.key.entries.${entry.id}`));
        }
    }

    return section;
}

/** The icon on the pane button: a list of three coloured swatches */
function ensureKeyIcon() {
    if (document.getElementById('lanes-icon-key')) return;
    const svg = d3_select(document.body).append('svg')
        .attr('class', 'lanes-icon-defs').attr('width', 0).attr('height', 0).style('position', 'absolute');
    svg.append('symbol').attr('id', 'lanes-icon-key').attr('viewBox', '0 0 20 20').html(
        '<rect x="2" y="3" width="5" height="3.5" rx="0.8" fill="currentColor"/><rect x="9" y="4" width="9" height="1.6" fill="currentColor"/>' +
        '<rect x="2" y="8.3" width="5" height="3.5" rx="0.8" fill="currentColor"/><rect x="9" y="9.2" width="9" height="1.6" fill="currentColor"/>' +
        '<rect x="2" y="13.6" width="5" height="3.5" rx="0.8" fill="currentColor"/><rect x="9" y="14.5" width="9" height="1.6" fill="currentColor"/>');
}

/** The Map key pane: what every colour, line and symbol Lane Studio draws means */
export function uiPaneMapKey(context: iD.Context) {
    ensureKeyIcon();
    return (uiPane('lanes-key', context) as any)
        .key(t('_lanes.key.key'))
        .label(t.append('_lanes.key.title'))
        .description(t.append('_lanes.key.description'))
        .iconName('lanes-icon-key')
        .sections(mapKeyGroups.map(group => uiSectionMapKey(context, group)));
}
