/** A lane's direction of travel, relative to the way's drawing direction */
export type LaneDirection = 'forward' | 'backward' | 'both_ways';

export const laneDirections: readonly LaneDirection[] = ['forward', 'backward', 'both_ways'];

/** Which side of the road traffic keeps to, from `countryCoder.driveSide` */
export type DriveSide = 'left' | 'right';

/** `forward` for `oneway=yes` (or implied), `backward` for `oneway=-1`, `false` for two-way roads */
export type LaneOneway = 'forward' | 'backward' | false;

/**
 * One lane. Its direction and index are given by where it sits in `LaneModel.lanes`:
 * index 0 is the leftmost lane as seen by a driver travelling in that lane's direction.
 */
export interface Lane {
    /** raw slot value per lane key id, e.g. `{ 'turn:lanes': 'left;through' }`; `''` = empty slot */
    values: Record<string, string>;
}

/** Points at one lane in a model */
export interface LaneRef {
    direction: LaneDirection;
    index: number;
}

/**
 * How a lane key is written:
 *  - `oneway`: plain `turn:lanes` on a one-way road
 *  - `directional`: `turn:lanes:forward`, `turn:lanes:backward`, `turn:lanes:both_ways` on a two-way road
 *  - `combined`: plain `access:lanes` on a two-way road, listing all lanes left to right along the way
 */
export type LaneKeyStyle = 'oneway' | 'directional' | 'combined';

export interface LaneKey {
    /** the key without a direction, e.g. `turn:lanes`, `destination:ref:lanes`, `width:lanes:start` */
    id: string;
    style: LaneKeyStyle;
    /**
     * `true` when the key is kept exactly as tagged and never rewritten:
     * `:conditional` keys, and keys whose value count does not match the lane count
     */
    readonly: boolean;
    /** the tag keys this key was read from, per direction (`all` for a plain key) */
    tagKeys: Partial<Record<LaneDirection | 'all', string>>;
}

export type LaneIssueCode =
    /** a key has a different number of values than there are lanes */
    | 'count_mismatch'
    /** `lanes:forward` + `lanes:backward` + `lanes:both_ways` is not `lanes` */
    | 'direction_counts_mismatch'
    /** a two-way road with an odd `lanes` and no `lanes:forward`/`lanes:backward` */
    | 'ambiguous_direction_counts'
    /** a key is tagged both plain and with `:forward`/`:backward` on a two-way road */
    | 'mixed_key_styles'
    /** `lanes` is not a whole number */
    | 'invalid_lane_count'
    /** the lane count changed but a read-only key was not updated */
    | 'key_not_updated';

export interface LaneIssue {
    code: LaneIssueCode;
    key?: string;
    direction?: LaneDirection;
    expected?: number;
    actual?: number;
}

export interface LaneModel {
    oneway: LaneOneway;
    driveSide: DriveSide;
    lanes: Record<LaneDirection, Lane[]>;
    /** every lane key on the way, by id, including keys Lane Studio has no special UI for */
    keys: Record<string, LaneKey>;
    /** where the lane count came from: tags, other lane keys, or the wiki's defaults (display only) */
    countSource: 'tagged' | 'inferred' | 'assumed';
    issues: LaneIssue[];
    /** lane key ids changed since parsing; only these are rewritten */
    touchedKeys: string[];
    /** whether lanes were added, removed or moved since parsing */
    countsTouched: boolean;
}
