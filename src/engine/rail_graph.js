// RailGraph data model and helpers.

export const SCHEMA_VERSION = '1.0';

export function createEmptyGraph() {
  return {
    nodes: [],        // { id, x, y, type: 'node'|'switch'|'entry' }
    segments: [],     // { id, from, to, curve? }
    switches: [],     // { id, nodeId, defaultSegment, divergingSegment, activeSegment, isLocked }
    entryPoints: []   // { id, label, nodeId }
  };
}

let _id = 1;
export const nextId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;

export function getNode(graph, id) {
  return graph.nodes.find(n => n.id === id);
}
export function getSegment(graph, id) {
  return graph.segments.find(s => s.id === id);
}
export function getSwitch(graph, nodeId) {
  return graph.switches.find(s => s.nodeId === nodeId);
}

export function segmentLength(graph, segment) {
  const a = getNode(graph, segment.from);
  const b = getNode(graph, segment.to);
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

// Position along a segment given direction (+1 means from->to, -1 means to->from)
// t in [0,1] from the START side determined by direction.
export function pointOnSegment(graph, segmentId, t, dir = 1) {
  const seg = getSegment(graph, segmentId);
  if (!seg) return null;
  const a = getNode(graph, seg.from);
  const b = getNode(graph, seg.to);
  const tt = dir > 0 ? t : (1 - t);
  return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
}

export function segmentAngle(graph, segmentId, dir = 1) {
  const seg = getSegment(graph, segmentId);
  const a = getNode(graph, seg.from);
  const b = getNode(graph, seg.to);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return dir > 0 ? ang : ang + Math.PI;
}

// All segments connected to a node, except optionally one.
export function segmentsAt(graph, nodeId, excludeSegmentId = null) {
  return graph.segments.filter(s => (s.from === nodeId || s.to === nodeId) && s.id !== excludeSegmentId);
}

// Given we're approaching `nodeId` along `currentSegmentId`, return the next segment to take.
// Honors switch state: if the node is a switch, only allow the activeSegment.
// Returns { segmentId, dir } where dir is +1 if leaving via from->to, -1 if to->from.
export function nextSegment(graph, currentSegmentId, nodeId) {
  const sw = getSwitch(graph, nodeId);
  let candidates = segmentsAt(graph, nodeId, currentSegmentId);
  if (sw) {
    // Only the active branch is traversable. The "trunk" side is also valid (any non-active branch
    // that is NOT the inactive branch). We treat defaultSegment & divergingSegment as the two
    // selectable branches; any other connected segment (the trunk) is always allowed.
    const branchIds = new Set([sw.defaultSegment, sw.divergingSegment].filter(Boolean));
    candidates = candidates.filter(s => !branchIds.has(s.id) || s.id === sw.activeSegment);
  }
  if (candidates.length === 0) return null;
  // Pick the first viable continuation.
  const next = candidates[0];
  const dir = next.from === nodeId ? 1 : -1;
  return { segmentId: next.id, dir };
}

// Given a segment with a direction, return the node we're heading toward (front node).
export function frontNodeOf(graph, segmentId, dir) {
  const seg = getSegment(graph, segmentId);
  return dir > 0 ? seg.to : seg.from;
}
export function backNodeOf(graph, segmentId, dir) {
  const seg = getSegment(graph, segmentId);
  return dir > 0 ? seg.from : seg.to;
}

export function parallelizeSegments(graph, segmentIds, spacing) {
  if (segmentIds.length < 2) return graph;

  const refId = segmentIds[0];
  const ref = getSegment(graph, refId);
  const refA = getNode(graph, ref.from);
  const refB = getNode(graph, ref.to);

  const dx = refB.x - refA.x;
  const dy = refB.y - refA.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return graph;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // Determine majority side
  const otherIds = segmentIds.slice(1);
  let pos = 0, neg = 0;
  for (const sid of otherIds) {
    const seg = getSegment(graph, sid);
    const a = getNode(graph, seg.from);
    const b = getNode(graph, seg.to);
    const sd = ((a.x + b.x) / 2 - refA.x) * nx + ((a.y + b.y) / 2 - refA.y) * ny;
    if (sd >= 0) pos++; else neg++;
  }
  const sign = pos >= neg ? 1 : -1;

  // Sort by perpendicular distance
  const ranked = otherIds.map(sid => {
    const seg = getSegment(graph, sid);
    const a = getNode(graph, seg.from);
    const b = getNode(graph, seg.to);
    const sd = ((a.x + b.x) / 2 - refA.x) * nx + ((a.y + b.y) / 2 - refA.y) * ny;
    return { id: sid, dist: Math.abs(sd) };
  }).sort((a, b) => a.dist - b.dist);

  // Assign each unique node the minimum rank among segments using it
  const nodeRank = {};
  for (let k = 0; k < ranked.length; k++) {
    const seg = getSegment(graph, ranked[k].id);
    for (const nodeId of [seg.from, seg.to]) {
      if (!(nodeId in nodeRank) || k < nodeRank[nodeId]) {
        nodeRank[nodeId] = k;
      }
    }
  }

  // Reposition nodes
  const newNodes = graph.nodes.map(n => ({ ...n }));
  const lenSq = len * len;

  for (const [nodeId, rank] of Object.entries(nodeRank)) {
    const node = getNode(graph, nodeId);
    const t = ((node.x - refA.x) * dx + (node.y - refA.y) * dy) / lenSq;
    const offset = sign * (rank + 1) * spacing;
    const npx = refA.x + t * dx + offset * nx;
    const npy = refA.y + t * dy + offset * ny;
    const idx = newNodes.findIndex(n => n.id === nodeId);
    if (idx !== -1) {
      newNodes[idx] = { ...newNodes[idx], x: npx, y: npy };
    }
  }

  return { ...graph, nodes: newNodes };
}
