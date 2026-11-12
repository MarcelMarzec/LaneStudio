import { actionChangeTags } from '../../actions/change_tags';
import { t } from '../../core/localizer';
import type { OsmEntity, WayId } from '../../osm';
import type { osmWay } from '../../osm/way';
import { uiSection } from '../../ui/section';
import { utilDisplayName } from '../../util';
import { parkingGeometry } from '../geometry/parking';
import {
    isTrafficIsland, isStreetParking, parkingOnCarriageway, islandSurface,
    roadMarkingValues, strokeValues, patternValues, markingColours, streetParkingValues, arrowValues, restrictionReasons, symbolValues
} from '../model/street_features';
import { markingKind } from '../geometry/road_marking';
import type { InfoTopic } from './field_info';
import { fieldNote, laneField, tagChrome } from './lane_fields';
import { areaParkingScope, parkingDetails } from './parking_fields';

type Div = d3.Selection<HTMLDivElement>;
type FeatureKind = 'island' | 'road_marking' | 'parking';

const islandSurfaces = ['concrete', 'asphalt', 'paving_stones', 'sett', 'grass'];
const kerbValues = ['raised', 'lowered', 'flush', 'rolled'];

/** What the street feature section edits on a feature: an island, a painted marking or street parking */
export function featureKind(entity: OsmEntity): FeatureKind | null {
    if (entity.tags.road_marking) return 'road_marking';
    if (entity.type !== 'way') return null;
    if (isTrafficIsland(entity.tags)) return 'island';
    if (isStreetParking(entity.tags)) return 'parking';
    return null;
}

/**
 * A sidebar section for the street features Lane Studio draws beside its lanes: traffic islands
 * (surface and kerb), painted road markings (style, colour, pattern) and street parking.
 */
export function uiSectionStreetFeature(context: iD.Context) {
    let _entityIDs: string[] = [];

    const entity = (): OsmEntity | undefined => {
        if (_entityIDs.length !== 1) return undefined;
        const found = context.hasEntity(_entityIDs[0] as WayId);
        return found && featureKind(found) ? found : undefined;
    };

    // uiSection is plain JavaScript, so its chained setters are not typed
    const section = (uiSection('street-feature', context) as any)
        .label(() => {
            const e = entity();
            return t.append(`_lanes.street_feature.${e ? featureKind(e) : 'island'}`);
        })
        .shouldDisplay(() => !!entity())
        .disclosureContent(render);

    function retag(e: OsmEntity, changes: Record<string, string | undefined>) {
        const tags: Tags = { ...e.tags };
        for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === '') delete tags[key];
            else tags[key] = value;
        }
        context.perform(actionChangeTags(e.id, tags), t('_lanes.annotation.street_feature'));
    }

    const options = (values: readonly string[]) => values.map(value => ({ value }));

    function field(wrap: Div, e: OsmEntity, key: string, label: string, values: readonly string[], titles?: (v: string) => string, info?: InfoTopic) {
        laneField(context, wrap as any, {
            ...tagChrome(context, e.id, [key], t('_lanes.annotation.street_feature'), info ?? (featureKind(e) === 'island' ? 'island_surface' : 'road_marking')),
            id: `sf-${key.replace(/[^a-z_]/g, '-')}`,
            label,
            value: e.tags[key] ?? '',
            suggestions: values.map(value => ({ value, title: titles ? titles(value) : value })),
            onChange: value => retag(e, { [key]: value })
        });
    }

    function render(selection: Div) {
        selection.selectAll('*').remove();
        const e = entity();
        if (!e) return;
        const kind = featureKind(e)!;
        const wrap = selection.append('div').attr('class', 'lanes-editor street-feature-editor');

        if (kind === 'island') {
            field(wrap, e, 'surface', t('_lanes.street_feature.surface'), islandSurfaces);
            // the kerb is mapped on the island's outline
            laneField(context, wrap as any, {
                ...tagChrome(context, e.id, ['barrier', 'kerb'], t('_lanes.annotation.street_feature'), 'kerb'),
                id: 'sf-kerb',
                label: t('_lanes.street_feature.kerb'),
                value: e.tags.barrier === 'kerb' ? (e.tags.kerb ?? 'raised') : '',
                suggestions: options(kerbValues),
                onChange: value => retag(e, value ? { barrier: 'kerb', kerb: value } : { barrier: undefined, kerb: undefined })
            });
            fieldNote(wrap, t('_lanes.street_feature.island_hint') + (e.tags.surface ? '' : ` (${islandSurface(e.tags)})`));
            return;
        }

        if (kind === 'road_marking') {
            field(wrap, e, 'road_marking', t('_lanes.street_feature.marking'), roadMarkingValues);
            const marking = markingKind(e.tags.road_marking);
            if (marking === 'arrow') {
                // an arrow is mapped from its base to its tip
                field(wrap, e, 'arrow', t('_lanes.street_feature.arrow'), arrowValues);
            } else if (e.type === 'node' && marking === 'stop_line') {
                field(wrap, e, 'direction', t('_lanes.street_feature.direction'), ['forward', 'backward', 'both']);
            } else if (e.type !== 'node') {
                const paired = !!(e.tags['stroke:left'] || e.tags['stroke:right']);
                if (paired) {
                    field(wrap, e, 'stroke:left', t('_lanes.street_feature.stroke_left'), ['solid', 'dashed', 'dotted']);
                    field(wrap, e, 'stroke:right', t('_lanes.street_feature.stroke_right'), ['solid', 'dashed', 'dotted']);
                } else {
                    field(wrap, e, 'stroke', t('_lanes.street_feature.stroke'), strokeValues);
                }
                field(wrap, e, 'pattern', t('_lanes.street_feature.pattern'), patternValues, v => t(`_lanes.street_feature.patterns.${v}`));
                if (marking === 'restriction') field(wrap, e, 'reason', t('_lanes.street_feature.reason'), restrictionReasons);
                field(wrap, e, 'width', t('_lanes.street_feature.width'), ['0.1', '0.15', '0.2', '0.3', '0.5']);
                field(wrap, e, 'dasharray', t('_lanes.street_feature.dasharray'), ['1,1', '2,4', '3,6', '4,2', '6,3']);
            } else if (marking === 'symbol') {
                field(wrap, e, 'symbol', t('_lanes.street_feature.symbol'), symbolValues);
            } else {
                field(wrap, e, 'inscription', t('_lanes.street_feature.inscription'), ['STOP', 'SLOW', 'KEEP CLEAR', 'BUS', 'BUS STOP', 'SCHOOL', 'LOOK RIGHT', 'LOOK LEFT']);
            }
            field(wrap, e, 'colour', t('_lanes.street_feature.colour'), markingColours);
            return;
        }

        // street parking: where it is, then the same fields as parking along a road (wiki: Street parking)
        field(wrap, e, 'parking', t('_lanes.street_feature.parking_type'), streetParkingValues,
            v => t(`_lanes.street_feature.parking_types.${v}`), 'street_parking');
        parkingDetails(context, wrap, areaParkingScope(context, e));

        const graph = context.graph();
        const nearby = context.history().intersects(e.extent(graph).padByMeters(40));
        const shape = parkingGeometry([e, ...nearby.filter(n => n.id !== e.id)], graph).find(p => p.id === e.id);
        const road = shape?.roadID ? graph.hasEntity(shape.roadID as WayId) as osmWay | undefined : undefined;
        fieldNote(wrap, !road
            ? t('_lanes.street_feature.not_joined')
            : t(parkingOnCarriageway(e.tags) ? '_lanes.street_feature.joined_lane' : '_lanes.street_feature.joined',
                { road: utilDisplayName(road, {}) || road.tags.highway }));
    }

    section.entityIDs = function(val?: string[]) {
        if (!arguments.length) return _entityIDs;
        _entityIDs = val ?? [];
        return section;
    };

    return section;
}
