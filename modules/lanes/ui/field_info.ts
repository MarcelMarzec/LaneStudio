/*
 * What the i button on each of Lane Studio's fields explains: a short overview (`_lanes.info.<topic>` in
 * data/lanes.yaml) and the OpenStreetMap wiki page about it. Every Lane Studio field has a topic here; a new field
 * gets a topic, its overview and a wiki page that exists (see CLAUDE.md).
 */

const SP = 'Street_parking';

/** Each topic's wiki page, as written after https://wiki.openstreetmap.org/wiki/ */
export const fieldInfoPages = {
    access: 'Key:access',
    advisory: 'Key:maxspeed:advisory',
    camera: 'Tag:highway=speed_camera',
    centre_line: 'Key:overtaking',
    change: 'Key:change',
    conditional: 'Conditional_restrictions',
    cycleway: 'Key:cycleway',
    destination: 'Key:destination',
    destination_arrow: 'Key:destination:arrow',
    destination_country: 'Key:destination:country',
    destination_int_ref: 'Key:destination:int_ref',
    destination_ref: 'Key:destination:ref',
    destination_street: 'Key:destination:street',
    destination_symbol: 'Key:destination:symbol',
    direction: 'Key:lanes',
    island_surface: 'Tag:area:highway=traffic_island',
    kerb: 'Key:kerb',
    kind: 'Key:access:lanes',
    lane_minspeed: 'Key:minspeed',
    lane_speed: 'Key:maxspeed',
    lane_strip: 'Lanes',
    lanes: 'Key:lanes',
    lookahead: 'Key:destination:lanes',
    managed: 'Key:active_traffic_management',
    marking_tool: 'Key:highway',
    maxheight: 'Key:maxheight',
    maxspeed: 'Key:maxspeed',
    maxspeed_conditional: 'Key:maxspeed:conditional',
    maxspeed_hgv: 'Key:maxspeed:hgv',
    maxweight: 'Key:maxweight',
    maxwidth: 'Key:maxwidth',
    minspeed: 'Key:minspeed',
    motorroad: 'Key:motorroad',
    other_keys: 'Lanes',
    paint: 'Lanes',
    parking: `${SP}#Parking_position`,
    parking_access: `${SP}#Access_restrictions_for_specific_user_groups_or_vehicle_types`,
    parking_capacity: 'Key:capacity',
    parking_charge: 'Key:charge',
    parking_direction: `${SP}#Special_rules_on_parking_direction`,
    parking_disabled: 'Key:disabled',
    parking_disc: 'Key:authentication:disc',
    parking_fee: 'Key:fee',
    parking_markings: `${SP}#Marked_parking_spaces`,
    parking_maxstay: 'Key:maxstay',
    parking_orientation: `${SP}#Parking_orientation`,
    parking_private: `${SP}#Residential_parking_permits,_parking_zones`,
    parking_reason: `${SP}#Reasons_for_parking_restrictions`,
    parking_restriction: `${SP}#No_parking,_no_stopping,_and_no_standing`,
    parking_staggered: `${SP}#Staggered_parking_on_narrow_roads`,
    parking_surface: `${SP}#Other_physical_attributes`,
    parking_times: 'Conditional_restrictions',
    parking_width: `${SP}#Other_physical_attributes`,
    parking_zone: `${SP}#Residential_parking_permits,_parking_zones`,
    payment: 'Key:payment:*',
    position: 'Lanes',
    priority: 'Key:priority',
    road_marking: 'Key:road_marking',
    roundabout: 'Tag:junction=roundabout',
    shoulder: 'Key:shoulder',
    shoulder_width: 'Key:shoulder',
    sidewalk: 'Key:sidewalk',
    sign: 'Key:traffic_sign',
    sign_direction: 'Key:direction',
    sign_tool: 'Key:traffic_sign',
    sign_value: 'Key:traffic_sign',
    street_parking: 'Key:parking',
    structure: 'Key:bridge',
    surface: 'Key:surface',
    toll: 'Key:toll',
    tools: 'Lanes',
    turbo: 'Tag:roundabout=turbo',
    turn: 'Key:turn',
    variable_speed: 'Key:maxspeed:variable',
    width: 'Key:width',
    width_start_end: 'Key:width:lanes'
} as const;

export type InfoTopic = keyof typeof fieldInfoPages;

/** The address of a topic's wiki page */
export function fieldInfoUrl(topic: InfoTopic): string {
    return `https://wiki.openstreetmap.org/wiki/${fieldInfoPages[topic].replace(/ /g, '_')}`;
}

/** The page's name as the link shows it ("Key:maxspeed", "Street parking") */
export function fieldInfoPageName(topic: InfoTopic): string {
    return fieldInfoPages[topic].split('#')[0].replace(/_/g, ' ');
}
