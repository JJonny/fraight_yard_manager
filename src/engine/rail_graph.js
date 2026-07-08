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
