// RailGraph data model and helpers.

export const SCHEMA_VERSION = '1.0';

export function createEmptyGraph() {
  return {
    nodes: [],        // { id, x, y, type: 'node'|'switch'|'entry' }
    segments: [],     // { id, from, to, curve? }
    switches: [],     // { id, nodeId, defaultSegment, divergingSegment, activeSegment, isLocked }
    entryPoints: [],   // { id, label, nodeId }
    curves: [],
  };
}

let _id = 1;
export const nextId = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${(_id++).toString(36)}`;

// ---------------------------------------------------------------------------
// Lazy Map-based indexes — built once per graph object, invalidated when the
// graph reference changes (the editor/play always produce a new object).
// ---------------------------------------------------------------------------
function _ensureIndexes(graph) {
  if (graph._idx) return graph._idx;
  const nodeMap = new Map();
  for (const n of graph.nodes) nodeMap.set(n.id, n);
  const segmentMap = new Map();
  for (const s of graph.segments) segmentMap.set(s.id, s);
  const switchMap = new Map();
  for (const sw of graph.switches) switchMap.set(sw.nodeId, sw);
  const curveMap = new Map();
  for (const c of graph.curves) curveMap.set(c.segmentId, c);
  // segmentsByNode: nodeId → [segment]
  const segmentsByNode = new Map();
  for (const s of graph.segments) {
    let arr = segmentsByNode.get(s.from);
    if (!arr) { arr = []; segmentsByNode.set(s.from, arr); }
    arr.push(s);
    if (s.to !== s.from) {
      arr = segmentsByNode.get(s.to);
      if (!arr) { arr = []; segmentsByNode.set(s.to, arr); }
      arr.push(s);
    }
  }
  const idx = { nodeMap, segmentMap, switchMap, curveMap, segmentsByNode };
  graph._idx = idx;
  return idx;
}

export function evalCubicBezier(P0, P1, P2, P3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * P0.x + 3 * mt2 * t * P1.x + 3 * mt * t2 * P2.x + t3 * P3.x,
    y: mt3 * P0.y + 3 * mt2 * t * P1.y + 3 * mt * t2 * P2.y + t3 * P3.y,
  };
}

export function evalCubicBezierTangent(P0, P1, P2, P3, t) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: 3 * mt2 * (P1.x - P0.x) + 6 * mt * t * (P2.x - P1.x) + 3 * t2 * (P3.x - P2.x),
    y: 3 * mt2 * (P1.y - P0.y) + 6 * mt * t * (P2.y - P1.y) + 3 * t2 * (P3.y - P2.y),
  };
}

export function bezierArcLength(P0, P1, P2, P3, n = 20) {
  let len = 0;
  let prev = P0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const pt = evalCubicBezier(P0, P1, P2, P3, t);
    len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    prev = pt;
  }
  return len;
}

const _arcTableCache = new Map();

function _arcKey(P0, P1, P2, P3) {
  return `${P0.x.toFixed(0)},${P0.y.toFixed(0)}|${P1.x.toFixed(0)},${P1.y.toFixed(0)}|${P2.x.toFixed(0)},${P2.y.toFixed(0)}|${P3.x.toFixed(0)},${P3.y.toFixed(0)}`;
}

function _buildArcTable(P0, P1, P2, P3, n = 50) {
  const table = [{ t: 0, s: 0 }];
  let prev = P0;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const pt = evalCubicBezier(P0, P1, P2, P3, t);
    const ds = Math.hypot(pt.x - prev.x, pt.y - prev.y);
    table.push({ t, s: table[table.length - 1].s + ds });
    prev = pt;
  }
  const total = table[table.length - 1].s;
  for (const row of table) row.s = total > 0 ? row.s / total : row.t;
  return table;
}

function _arcTToBezierT(P0, P1, P2, P3, s) {
  s = Math.max(0, Math.min(1, s));
  const key = _arcKey(P0, P1, P2, P3);
  let table = _arcTableCache.get(key);
  if (!table) {
    table = _buildArcTable(P0, P1, P2, P3);
    _arcTableCache.set(key, table);
  }
  let lo = 0, hi = table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].s < s) lo = mid;
    else hi = mid;
  }
  const t0 = table[lo].t, s0 = table[lo].s;
  const t1 = table[hi].t, s1 = table[hi].s;
  const frac = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
  return t0 + frac * (t1 - t0);
}

export function getNode(graph, id) {
  return _ensureIndexes(graph).nodeMap.get(id) || null;
}
export function getSegment(graph, id) {
  return _ensureIndexes(graph).segmentMap.get(id) || null;
}
export function getSwitch(graph, nodeId) {
  return _ensureIndexes(graph).switchMap.get(nodeId) || null;
}

export function getCurve(graph, segmentId) {
  return _ensureIndexes(graph).curveMap.get(segmentId) || null;
}

export function makeCurve(graph, segmentId, strength) {
  const existing = getCurve(graph, segmentId);
  if (existing) {
    return {
      ...graph,
      curves: graph.curves.map(c =>
        c.segmentId === segmentId ? { ...c, strength } : c
      ),
    };
  }
  return {
    ...graph,
    curves: [...graph.curves, { id: nextId('c'), segmentId, strength }],
  };
}

export function removeCurve(graph, segmentId) {
  return {
    ...graph,
    curves: graph.curves.filter(c => c.segmentId !== segmentId),
  };
}

export function computeCurveControlPoints(graph, segmentId, strength) {
  const seg = getSegment(graph, segmentId);
  if (!seg) return null;
  const P0 = getNode(graph, seg.from);
  const P3 = getNode(graph, seg.to);
  if (!P0 || !P3) return null;
  const fromSegs = segmentsAt(graph, seg.from, seg.id);
  const toSegs = segmentsAt(graph, seg.to, seg.id);
  if (fromSegs.length !== 1 || toSegs.length !== 1) return null;
  const prevSeg = fromSegs[0];
  const nextSeg = toSegs[0];
  const A = getNode(graph, prevSeg.from === seg.from ? prevSeg.to : prevSeg.from);
  const D = getNode(graph, nextSeg.from === seg.to ? nextSeg.to : nextSeg.from);
  if (!A || !D) return null;
  const chordLen = Math.hypot(P3.x - P0.x, P3.y - P0.y) || 1;
  const scale = strength * chordLen;
  const dx1 = P0.x - A.x, dy1 = P0.y - A.y;
  const len1 = Math.hypot(dx1, dy1) || 1;
  const dx2 = D.x - P3.x, dy2 = D.y - P3.y;
  const len2 = Math.hypot(dx2, dy2) || 1;
  return {
    cp1: { x: P0.x + (dx1 / len1) * scale, y: P0.y + (dy1 / len1) * scale },
    cp2: { x: P3.x - (dx2 / len2) * scale, y: P3.y - (dy2 / len2) * scale },
  };
}

export function segmentLength(graph, segment) {
  const a = getNode(graph, segment.from);
  const b = getNode(graph, segment.to);
  if (!a || !b) return 0;
  const curve = getCurve(graph, segment.id);
  if (curve) {
    const cps = computeCurveControlPoints(graph, segment.id, curve.strength);
    if (cps) {
      return bezierArcLength(a, cps.cp1, cps.cp2, b);
    }
  }
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Position along a segment given direction (+1 means from->to, -1 means to->from)
// t in [0,1] from the START side determined by direction.
export function pointOnSegment(graph, segmentId, t, dir = 1) {
  const seg = getSegment(graph, segmentId);
  if (!seg) return null;
  const a = getNode(graph, seg.from);
  const b = getNode(graph, seg.to);
  if (!a || !b) return null;
  const curve = getCurve(graph, segmentId);
  if (curve) {
    const cps = computeCurveControlPoints(graph, segmentId, curve.strength);
    if (cps) {
      const frac = dir > 0 ? t : (1 - t);
      const bezierT = _arcTToBezierT(a, cps.cp1, cps.cp2, b, frac);
      return evalCubicBezier(a, cps.cp1, cps.cp2, b, bezierT);
    }
  }
  const tt = dir > 0 ? t : (1 - t);
  return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
}

export function segmentAngle(graph, segmentId, dir = 1, t = null) {
  const seg = getSegment(graph, segmentId);
  if (!seg) return 0;
  const a = getNode(graph, seg.from);
  const b = getNode(graph, seg.to);
  if (!a || !b) return 0;
  const curve = getCurve(graph, segmentId);
  if (curve) {
    const cps = computeCurveControlPoints(graph, segmentId, curve.strength);
    if (cps) {
      const frac = t !== null ? (dir > 0 ? t : (1 - t)) : (dir > 0 ? 1 : 0);
      const bezierT = _arcTToBezierT(a, cps.cp1, cps.cp2, b, frac);
      const tangent = evalCubicBezierTangent(a, cps.cp1, cps.cp2, b, bezierT);
      return Math.atan2(tangent.y, tangent.x);
    }
  }
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  return dir > 0 ? ang : ang + Math.PI;
}

// All segments connected to a node, except optionally one.
export function segmentsAt(graph, nodeId, excludeSegmentId = null) {
  const idx = _ensureIndexes(graph);
  const all = idx.segmentsByNode.get(nodeId) || [];
  if (excludeSegmentId === null) return all;
  return all.filter(s => s.id !== excludeSegmentId);
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

// Given a node connected to 3+ segments, find the pair with the smallest angle between them.
// Those two become the switch branches (default / diverging); the rest are trunk tracks.
export function findSwitchBranches(graph, nodeId) {
  const segs = segmentsAt(graph, nodeId);
  if (segs.length < 3) return null;

  const node = getNode(graph, nodeId);

  function angleBetween(segA, segB) {
    const otherA = getNode(graph, segA.from === nodeId ? segA.to : segA.from);
    const otherB = getNode(graph, segB.from === nodeId ? segB.to : segB.from);
    const dx1 = otherA.x - node.x, dy1 = otherA.y - node.y;
    const dx2 = otherB.x - node.x, dy2 = otherB.y - node.y;
    const dot = dx1 * dx2 + dy1 * dy2;
    const mag1 = Math.hypot(dx1, dy1);
    const mag2 = Math.hypot(dx2, dy2);
    return Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
  }

  let minAngle = Infinity;
  let bestPair = [null, null];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const angle = angleBetween(segs[i], segs[j]);
      if (angle < minAngle) {
        minAngle = angle;
        bestPair = [segs[i].id, segs[j].id];
      }
    }
  }

  return { defaultSegment: bestPair[0], divergingSegment: bestPair[1] };
}
