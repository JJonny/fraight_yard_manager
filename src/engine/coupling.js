// Coupling and decoupling logic.
import {
  trainHeadWorld, trainTailWorld, trainLength, COUPLE_DIST,
  pathTotalLength, unitWorldPositions
} from './movement.js';
import { segmentLength, getSegment } from './rail_graph.js';

// Check all pairs of trains. If any heads/tails are close, merge them.
// Returns a new array of trains (some merged). Mutates safely.
export function autoCouple(graph, trains) {
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
        const Ahead = trainHeadWorld(graph, A);
        const Atail = trainTailWorld(graph, A);
        const Bhead = trainHeadWorld(graph, B);
        const Btail = trainTailWorld(graph, B);

        // A's head touches B's tail → A is behind B; merge so B's units come first then A's.
        if (dist(Ahead, Btail) < COUPLE_DIST + 2) {
          const merged = mergeTrains(graph, B, A); // B head, A tail
          replacePair(trains, i, j, merged);
          changed = true; break outer;
        }
        // A's tail touches B's head → B is behind A; merge so A first then B.
        if (dist(Atail, Bhead) < COUPLE_DIST + 2) {
          const merged = mergeTrains(graph, A, B);
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

// Merge two trains: `head` train is in front, `tail` train is behind.
// The merged path uses head's path; tail units appended to head's units list.
// We assume their paths align (touching). The merged train inherits head's controls/identity.
function mergeTrains(graph, head, tail) {
  // Compose path: tail's path then head's path. Trim duplicates if both share the join segment.
  // Simplification: build a unified path from tail.first to head.last, prefer head's segments where overlap.
  const newPath = [];
  // Start with tail's path (which leads up to the join), then head's path (which extends forward).
  // De-duplicate consecutive identical segment ids.
  const all = [...tail.path, ...head.path];
  for (const p of all) {
    const last = newPath[newPath.length - 1];
    if (!last || last.segmentId !== p.segmentId) newPath.push({ ...p });
  }
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

// Decouple a train between unit indices i and i+1. Returns [front, back].
// Front keeps locomotive control if it has a loco; otherwise back does.
export function decouple(graph, train, splitAfterIndex) {
  if (splitAfterIndex < 0 || splitAfterIndex >= train.units.length - 1) return [train];

  const frontUnits = train.units.slice(0, splitAfterIndex + 1);
  const backUnits  = train.units.slice(splitAfterIndex + 1);

  const frontLength = frontUnits.reduce((s, u) => s + u.length, 0);
  const backLength  = backUnits.reduce((s, u) => s + u.length, 0);

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
  let pathStartCut = 0;
  for (const p of parent.path) {
    const segLen = segmentLength(graph, getSegment(graph, p.segmentId));
    const segStart = acc, segEnd = acc + segLen;
    if (segEnd >= tailPos && segStart <= headPos) {
      path.push({ ...p });
      if (path.length === 1) pathStartCut = Math.max(0, tailPos - segStart);
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
