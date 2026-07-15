// Movement engine: rigid path-following trains over a RailGraph.
import {
  getSegment, getNode, segmentLength, pointOnSegment, segmentAngle,
  nextSegment, frontNodeOf, backNodeOf
} from './rail_graph.js';

export const UNIT_LENGTH = 28;        // px - per car/loco
export const UNIT_WIDTH  = 12;        // px
export const COUPLE_DIST = 6;         // px
export const PIXELS_PER_GEAR = 30;    // px/sec at gear ±1; gear 5 = 150 px/sec

// Speed in pixels per second from gear position [-5..5].
export function gearToSpeed(gear) {
  return gear * PIXELS_PER_GEAR;
}

// Compute total length (head→tail) of a train.
export function trainLength(train) {
  return train.units.reduce((s, u) => s + u.length, 0);
}

// Sum lengths of all path segments.
export function pathTotalLength(graph, path) {
  return path.reduce((s, p) => s + segmentLength(graph, getSegment(graph, p.segmentId)), 0);
}

// Convert a "distance from start of path[0]" into a world point.
export function pathPositionToWorld(graph, path, dist) {
  let acc = 0;
  for (const p of path) {
    const segLen = segmentLength(graph, getSegment(graph, p.segmentId));
    if (dist <= acc + segLen + 1e-6) {
      const local = Math.max(0, Math.min(segLen, dist - acc));
      const t = segLen === 0 ? 0 : local / segLen;
      const pt = pointOnSegment(graph, p.segmentId, t, p.dir);
      const ang = segmentAngle(graph, p.segmentId, p.dir, t);
      return { x: pt.x, y: pt.y, angle: ang, segmentId: p.segmentId };
    }
    acc += segLen;
  }
  // Beyond end – clamp to end of last
  const last = path[path.length - 1];
  const segLen = segmentLength(graph, getSegment(graph, last.segmentId));
  const pt = pointOnSegment(graph, last.segmentId, 1, last.dir);
  return { x: pt.x, y: pt.y, angle: segmentAngle(graph, last.segmentId, last.dir, 1), segmentId: last.segmentId };
}

// Position of every unit (head→tail) in world space.
export function unitWorldPositions(graph, train) {
  const positions = [];
  let cumulative = 0;
  for (let i = 0; i < train.units.length; i++) {
    const u = train.units[i];
    const centerDistFromHead = cumulative + u.length / 2;
    const dist = train.headPos - centerDistFromHead;
    const wp = pathPositionToWorld(graph, train.path, dist);
    positions.push({ ...wp, unit: u, index: i });
    cumulative += u.length;
  }
  return positions;
}

// Front of train (the locomotive's nose) world position.
export function trainHeadWorld(graph, train) {
  return pathPositionToWorld(graph, train.path, train.headPos);
}
export function trainTailWorld(graph, train) {
  return pathPositionToWorld(graph, train.path, train.headPos - trainLength(train));
}

// Build a path starting from an entry point heading inward.
// The entry node has exactly one segment leaving it; we follow it.
export function buildEntryPath(graph, entryNodeId) {
  const segs = graph.segments.filter(s => s.from === entryNodeId || s.to === entryNodeId);
  if (segs.length === 0) return null;
  const seg = segs[0];
  const dir = seg.from === entryNodeId ? 1 : -1;
  return [{ segmentId: seg.id, dir }];
}

// Try extending path forward (in direction of motion) by appending one segment.
// Returns true if extended.
function extendForward(graph, path) {
  const last = path[path.length - 1];
  const frontNode = frontNodeOf(graph, last.segmentId, last.dir);
  const next = nextSegment(graph, last.segmentId, frontNode);
  if (!next) return false;
  path.push({ segmentId: next.segmentId, dir: next.dir });
  return true;
}

// Try extending path backward by prepending one segment.
function extendBackward(graph, path) {
  const first = path[0];
  const backNode = backNodeOf(graph, first.segmentId, first.dir);
  const prev = nextSegment(graph, first.segmentId, backNode);
  if (!prev) return false;
  // We need this segment oriented so that its END is backNode (so train's path[0] starts from prev.start side).
  // nextSegment returns dir such that the segment is *exited* from backNode going outward — same as we want as
  // the prepended segment's traversal direction (start->end). Reverse it because for the train it's "behind".
  path.unshift({ segmentId: prev.segmentId, dir: -prev.dir });
  return true;
}

// Advance a train by dt seconds. Mutates the train. Returns updated train.
export function advanceTrain(graph, train, dt) {
  if (!train.path || train.path.length === 0) return train;
  const speed = gearToSpeed(train.speedPos); // px/sec, signed
  if (speed === 0) return train;
  let delta = speed * dt;
  const L = trainLength(train);

  let pathLen = pathTotalLength(graph, train.path);
  let headPos = train.headPos + delta;
  let tailPos = headPos - L;

  if (delta > 0) {
    // Extend forward as needed.
    while (headPos > pathLen) {
      const ok = extendForward(graph, train.path);
      if (!ok) { headPos = pathLen; train.speedPos = 0; break; }
      pathLen = pathTotalLength(graph, train.path);
    }
    tailPos = headPos - L;
    // Drop fully exited tail segments.
    while (train.path.length > 1) {
      const firstLen = segmentLength(graph, getSegment(graph, train.path[0].segmentId));
      if (tailPos >= firstLen) {
        train.path.shift();
        tailPos -= firstLen;
        headPos -= firstLen;
        pathLen -= firstLen;
      } else break;
    }
  } else {
    // Reverse.
    while (tailPos < 0) {
      const ok = extendBackward(graph, train.path);
      if (!ok) { tailPos = 0; headPos = L; train.speedPos = 0; break; }
      const newFirstLen = segmentLength(graph, getSegment(graph, train.path[0].segmentId));
      tailPos += newFirstLen;
      headPos += newFirstLen;
      pathLen += newFirstLen;
    }
    // Drop fully exited front segments.
    while (train.path.length > 1) {
      const lastLen = segmentLength(graph, getSegment(graph, train.path[train.path.length - 1].segmentId));
      if (headPos <= pathLen - lastLen) {
        train.path.pop();
        pathLen -= lastLen;
      } else break;
    }
  }

  train.headPos = headPos;
  return train;
}

// Distance below which two trains' bodies are considered "touching" for collision purposes.
export const COLLISION_PROXY_DIST = UNIT_LENGTH * 0.85;

// Stop a train when colliding with another. Brute force: if any pair of unit centers from
// different trains is closer than COLLISION_PROXY_DIST (overlap proxy), stop the moving one.
// Returns the list of colliding train-id pairs (deduplicated) so callers can couple them.
export function checkCollisions(graph, trains) {
  const allPositions = trains.map(t => ({ train: t, positions: unitWorldPositions(graph, t) }));
  const pairs = [];
  const seen = new Set();
  for (let i = 0; i < allPositions.length; i++) {
    for (let j = 0; j < allPositions.length; j++) {
      if (i === j) continue;
      const A = allPositions[i], B = allPositions[j];
      let hit = false;
      for (const a of A.positions) {
        for (const b of B.positions) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < COLLISION_PROXY_DIST) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) {
        if (A.train.speedPos !== 0) A.train.speedPos = 0;
        const key = [A.train.id, B.train.id].sort().join('|');
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push([A.train.id, B.train.id]);
        }
      }
    }
  }
  return pairs;
}
