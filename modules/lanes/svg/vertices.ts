import type { coreGraph } from '../../core/graph';
import type { osmNode } from '../../osm/node';

/** Ways whose vertices matter from further out: roads, railways, waterways and runways */
const majorKeys = ['highway', 'railway', 'waterway', 'aeroway'];

/** The zoom from which the vertices of fences, hedges, field edges, buildings and other minor ways are drawn */
export const minorVertexZoom = 18;

/**
 * Whether a vertex iD would draw unselected (tagged, an end of a way, or shared with another way) is drawn: a
 * tagged one always; one only on minor ways not below `minorVertexZoom`; an end of a way; and a shared one only
 * where the ways meet, not where they only run along each other (a hedge or fence on a field edge shares every
 * node with the field, but meets it nowhere). Selected and hovered ways still show all their vertices.
 */
export function vertexImportance(node: osmNode, graph: coreGraph, zoom: number): boolean {
    if (node.hasInterestingTags()) return true;
    const parents = graph.parentWays(node);
    if (zoom < minorVertexZoom && parents.every(way => !majorKeys.some(key => way.tags[key]))) return false;
    if (node.isEndpoint(graph)) return true;
    // where the ways go from here: two ways along each other lead to the same two nodes
    const neighbours = new Set<string>();
    for (const way of parents) {
        way.nodes.forEach((id, i) => {
            if (id !== node.id) return;
            if (i > 0) neighbours.add(way.nodes[i - 1]);
            if (i < way.nodes.length - 1) neighbours.add(way.nodes[i + 1]);
        });
    }
    return neighbours.size > 2;
}
