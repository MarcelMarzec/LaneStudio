import type { coreGraph } from '../../core/graph';
import type { osmRelation } from '../../osm/relation';
import type { osmWay } from '../../osm/way';
import { isLaneRoad } from '../core/roads';

export const isRingWay = (way: osmWay) =>
    way.tags.junction === 'roundabout' || way.tags.junction === 'circular';

export interface Roundabout {
    /** all ways of the ring, in no particular order */
    ring: osmWay[];
    /** roads that join or leave the ring */
    approaches: osmWay[];
    /** turn restrictions whose via is a ring node or ring way */
    restrictions: osmRelation[];
    /** ring ways tagged `roundabout=turbo` */
    turbo: osmWay[];
}

/** A standard turbo roundabout has six turn restrictions (Tag:roundabout=turbo) */
export const turboRestrictionCount = 6;

/** Gathers the whole ring a roundabout way belongs to, and what joins it */
export function roundaboutOf(way: osmWay, graph: coreGraph): Roundabout | null {
    if (!isRingWay(way)) return null;
    const junction = way.tags.junction;
    const ring = new Map<string, osmWay>([[way.id, way]]);
    const queue = [way];
    while (queue.length) {
        const current = queue.pop()!;
        for (const nodeID of current.nodes) {
            for (const parent of graph.parentWays(graph.entity(nodeID))) {
                const w = parent as osmWay;
                if (w.tags.junction === junction && !ring.has(w.id)) {
                    ring.set(w.id, w);
                    queue.push(w);
                }
            }
        }
    }

    const ringNodes = new Set([...ring.values()].flatMap(w => w.nodes));
    const approaches = new Map<string, osmWay>();
    const restrictions = new Map<string, osmRelation>();
    for (const nodeID of ringNodes) {
        const node = graph.entity(nodeID);
        for (const parent of graph.parentWays(node)) {
            if (!ring.has(parent.id) && isLaneRoad(parent)) approaches.set(parent.id, parent as osmWay);
        }
        for (const relation of graph.parentRelations(node)) {
            if (relation.tags.type === 'restriction') restrictions.set(relation.id, relation as osmRelation);
        }
    }
    for (const w of ring.values()) {
        for (const relation of graph.parentRelations(w)) {
            const via = (relation as osmRelation).members.find(m => m.role === 'via');
            if (relation.tags.type === 'restriction' && via && ring.has(via.id)) restrictions.set(relation.id, relation as osmRelation);
        }
    }

    const ringList = [...ring.values()];
    return {
        ring: ringList,
        approaches: [...approaches.values()],
        restrictions: [...restrictions.values()],
        turbo: ringList.filter(w => w.tags.roundabout === 'turbo')
    };
}

/**
 * Tags one ring segment as part of a simple turbo roundabout (Tag:roundabout=turbo):
 * `roundabout=turbo`, and `change:lanes=no|…|no` so drivers cannot change lanes on the ring.
 */
export function withTurbo(tags: Tags, on: boolean): Tags {
    const next = { ...tags };
    if (!on) {
        delete next.roundabout;
        return next;
    }
    next.roundabout = 'turbo';
    const lanes = parseInt(tags.lanes ?? '', 10);
    if (lanes > 1 && !tags['change:lanes']) {
        next['change:lanes'] = Array.from({ length: lanes }, () => 'no').join('|');
    }
    return next;
}
