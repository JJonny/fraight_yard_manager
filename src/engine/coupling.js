// Coupling and decoupling logic.
import {
  trainHeadWorld, trainTailWorld, trainLength, COUPLE_DIST, COLLISION_PROXY_DIST,
  pathTotalLength
} from './movement.js';
import { segmentLength, getSegment } from './rail_graph.js';

// Check if two world positions are on the same or adjacent track segments
// (adjacent = share a node, meaning the tracks meet at a junction).
function sameOrAdjacentSegment(graph, p, q) {
  if (p.segmentId === q.segmentId) return true;
  const segA = getSegment(graph, p.segmentId);
  const segB = getSegment(graph, q.segmentId);
  if (!segA || !segB) return false;
  return segA.from === segB.from || segA.from === segB.to ||
         segA.to === segB.from || segA.to === segB.to;
}

// Check all pairs of trains. If any heads/tails are close, merge them.
// `forcedPairs` (list of [idA, idB]) are pairs that must couple regardless of the normal
// tight distance threshold — used when checkCollisions() has already detected physical
// contact between two trains, so a collision always results in an actual coupling instead
// of the trains being stuck permanently at a standstill.
// Returns a new array of trains (some merged). Mutates safely.
export function autoCouple(graph, trains, forcedPairs = []) {
  // Clear recentlySplitFrom once the two halves have moved far enough apart.
  for (const A of trains) {
    if (!A.recentlySplitFrom) continue;
    const B = trains.find(t => t.id === A.recentlySplitFrom);
    if (!B) { A.recentlySplitFrom = null; continue; }
    const Atail = trainTailWorld(graph, A);
    const Ahead = trainHeadWorld(graph, A);
    const Btail = trainTailWorld(graph, B);
    const Bhead = trainHeadWorld(graph, B);
    if (dist(Ahead, Btail) > COUPLE_DIST * 4 && dist(Atail, Bhead) > COUPLE_DIST * 4) {
      A.recentlySplitFrom = null;
      B.recentlySplitFrom = null;
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    outer:
    for (let i = 0; i < trains.length; i++) {
      for (let j = 0; j < trains.length; j++) {
        if (i === j) continue;
        const A = trains[i], B = trains[j];
        // Never re-couple trains that were just split apart.
        if (A.recentlySplitFrom === B.id || B.recentlySplitFrom === A.id) continue;
        const isForced = forcedPairs.some(([x, y]) =>
          (x === A.id && y === B.id) || (x === B.id && y === A.id));
        // Forced pairs (collision-triggered) use a wider threshold so the coupling that
        // checkCollisions already detected (body-proximity based) is actually reached here
        // (head/tail world distance is a slightly different metric than unit-center proximity).
        const threshold = isForced ? Math.max(COUPLE_DIST + 2, COLLISION_PROXY_DIST + 2) : COUPLE_DIST + 2;
        const Ahead = trainHeadWorld(graph, A);
        const Atail = trainTailWorld(graph, A);
        const Bhead = trainHeadWorld(graph, B);
        const Btail = trainTailWorld(graph, B);

        // A's head touches B's tail → A is behind B, same direction; merge so B's units come first then A's.
        if (dist(Ahead, Btail) < threshold && sameOrAdjacentSegment(graph, Ahead, Btail)) {
          const merged = mergeSameDirection(graph, B, A); // B head, A tail
          replacePair(trains, i, j, merged);
          changed = true; break outer;
        }
        // A's tail touches B's head → B is behind A, same direction; merge so A first then B.
        if (dist(Atail, Bhead) < threshold && sameOrAdjacentSegment(graph, Atail, Bhead)) {
          const merged = mergeSameDirection(graph, A, B);
          replacePair(trains, i, j, merged);
          changed = true; break outer;
        }
        // A's head touches B's head → head-on collision (opposite directions).
        if (dist(Ahead, Bhead) < threshold && sameOrAdjacentSegment(graph, Ahead, Bhead)) {
          const merged = mergeOpposingNoses(graph, A, B);
          replacePair(trains, i, j, merged);
          changed = true; break outer;
        }
        // A's tail touches B's tail → rear-to-rear (both backed into each other).
        if (dist(Atail, Btail) < threshold && sameOrAdjacentSegment(graph, Atail, Btail)) {
          const merged = mergeOpposingTails(graph, A, B);
          replacePair(trains, i, j, merged);
          changed = true; break outer;
        }
      }
    }
  }
  return trains;
}

function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }

function replacePair(trains, i, j, merged) {
  // Remove higher index first.
  const hi = Math.max(i, j), lo = Math.min(i, j);
  trains.splice(hi, 1);
  trains.splice(lo, 1, merged);
}

// Reverse a path array so it describes the same segments traveled in the opposite direction
// (used when a train's orientation must be flipped to fit into a merged consist).
function reversePath(path) {
  return path.slice().reverse().map(p => ({ segmentId: p.segmentId, dir: -p.dir }));
}

function dedupPath(all) {
  const newPath = [];
  for (const p of all) {
    const last = newPath[newPath.length - 1];
    if (!last || last.segmentId !== p.segmentId) newPath.push({ ...p });
  }
  return newPath;
}

// Merge two trains: `head` train is in front, `tail` train is behind, BOTH traveling in the
// same direction (the classic "pushing into the back of another train/consist" case).
// The merged path uses head's path; tail units appended to head's units list.
function mergeSameDirection(graph, head, tail) {
  // Compose path: tail's path then head's path. Trim duplicates if both share the join segment.
  const newPath = dedupPath([...tail.path, ...head.path]);
  const merged = {
    id: head.id,
    name: head.name,
    units: [...head.units, ...tail.units],
    path: newPath,
    headPos: 0,
    speedPos: head.speedPos,
    color: head.color,
    activeLocoIndex: head.activeLocoIndex ?? 0
  };
  // headPos: distance from start of newPath to the front of head train.
  // Compute by: take head's headPos relative to head.path start, add length of any tail-only segments prepended.
  let prependedLen = 0;
  for (const p of tail.path) {
    if (head.path[0] && p.segmentId === head.path[0].segmentId) break;
    prependedLen += segmentLength(graph, getSegment(graph, p.segmentId));
  }
  merged.headPos = head.headPos + prependedLen;
  return merged;
}

// Build a "mirror image" view of a train: the same physical train, described as if it had
// been traveling in the opposite direction all along (path reversed+flipped, units reversed,
// headPos re-expressed so the train's own TAIL becomes this view's "headPos"/nose reference).
// This lets head-on / tail-to-tail merges reuse the already-correct mergeSameDirection() logic
// instead of re-deriving the path/length bookkeeping by hand (error-prone, see history of bugs).
function reversedTrainView(graph, train) {
  return {
    path: reversePath(train.path),
    headPos: pathTotalLength(graph, train.path) - train.headPos + trainLength(train),
    units: train.units.slice().reverse(),
  };
}

// Merge two trains meeting NOSE-TO-NOSE (head-on collision — both were traveling toward each
// other on the same track from opposite directions). Neither original nose can remain an "end"
// of the merged consist since it is now buried mid-train: `front` is folded into its mirror
// view (so its own TAIL becomes the merged nose) and merged the same way a same-direction
// pursuit would be, with `back` kept as-is behind the coupling point.
function mergeOpposingNoses(graph, front, back) {
  const merged = mergeSameDirection(graph, reversedTrainView(graph, front), back);
  merged.id = back.id;
  merged.name = back.name;
  merged.color = back.color;
  merged.speedPos = 0;
  merged.activeLocoIndex = front.units.length + (back.activeLocoIndex ?? 0);
  return merged;
}

// Merge two trains meeting TAIL-TO-TAIL (rear-to-rear — both were backing toward each other).
// `front`'s original nose stays the merged nose; `back` is folded into its mirror view and
// merged in behind it.
function mergeOpposingTails(graph, front, back) {
  const merged = mergeSameDirection(graph, front, reversedTrainView(graph, back));
  merged.speedPos = 0;
  return merged;
}


// Decouple a train between unit indices i and i+1. Returns [front, back].
// Front keeps locomotive control if it has a loco; otherwise back does.
export function decouple(graph, train, splitAfterIndex) {
  if (splitAfterIndex < 0 || splitAfterIndex >= train.units.length - 1) return [train];

  const frontUnits = train.units.slice(0, splitAfterIndex + 1);
  const backUnits  = train.units.slice(splitAfterIndex + 1);

  const frontLength = frontUnits.reduce((s, u) => s + u.length, 0);

  // Front train occupies [headPos - frontLength, headPos]
  // Back train occupies  [headPos - frontLength - backLength, headPos - frontLength]
  const frontHeadPos = train.headPos;
  const backHeadPos  = train.headPos - frontLength;

  const front = makeSubTrain(graph, train, frontUnits, frontHeadPos);
  const back  = makeSubTrain(graph, train, backUnits, backHeadPos);

  // Distinct ids
  back.id = train.id + '_b';
  back.name = (train.name || 'Train') + ' (rear)';
  back.speedPos = 0;
  front.speedPos = 0;
  // Prevent immediate re-coupling: each half ignores the other until they move apart.
  front.recentlySplitFrom = back.id;
  back.recentlySplitFrom = front.id;
  return [front, back];
}

function makeSubTrain(graph, parent, units, headPos) {
  const L = units.reduce((s, u) => s + u.length, 0);
  const tailPos = headPos - L;

  // Find which path segments are needed: those whose [acc, acc+len] overlaps [tailPos, headPos].
  let acc = 0;
  const path = [];
  for (const p of parent.path) {
    const segLen = segmentLength(graph, getSegment(graph, p.segmentId));
    const segStart = acc, segEnd = acc + segLen;
    if (segEnd >= tailPos && segStart <= headPos) {
      path.push({ ...p });
    }
    acc += segLen;
  }
  return {
    id: parent.id,
    name: parent.name,
    units,
    path,
    // headPos relative to NEW path[0] start = (original headPos) - (original distance to new path[0] start)
    // The new path[0]'s original start was at distance `parentDistToNewFirst`.
    headPos: (() => {
      // recompute
      let parentDistToNewFirst = 0;
      for (const p of parent.path) {
        if (p.segmentId === path[0].segmentId) break;
        parentDistToNewFirst += segmentLength(graph, getSegment(graph, p.segmentId));
      }
      return headPos - parentDistToNewFirst;
    })(),
    speedPos: 0,
    color: parent.color,
    activeLocoIndex: 0
  };
}
