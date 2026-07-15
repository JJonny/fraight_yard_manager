import {
  advanceTrain, checkCollisions, trainLength, trainHeadWorld, trainTailWorld,
  unitWorldPositions
} from '../../src/engine/movement.js';
import { graph, parallelGraph, assert, results, makeUnits, posEq } from './helpers.mjs';

// ── advanceTrain ──────────────────────────────────────────────────────────────
console.log('--- advanceTrain ---');
{
  const train = {
    id: 't1', name: 't1',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 0, speedPos: 3,
  };
  const before = trainHeadWorld(graph, train);
  advanceTrain(graph, train, 1);
  const after = trainHeadWorld(graph, train);
  assert(after.x > before.x, 'train moved forward');
  assert(train.speedPos === 3, 'speed unchanged after movement');
  console.log(`  head moved from x=${before.x.toFixed(1)} to x=${after.x.toFixed(1)}`);
}

{
  const train = {
    id: 't2', name: 't2',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 10, speedPos: 0,
  };
  const before = trainHeadWorld(graph, train);
  advanceTrain(graph, train, 1);
  assert(posEq(trainHeadWorld(graph, train), before), 'stationary train did not move');
}

{
  const train = {
    id: 't3', name: 't3',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 50, speedPos: -3,
  };
  const before = trainTailWorld(graph, train);
  advanceTrain(graph, train, 1);
  const after = trainTailWorld(graph, train);
  assert(after.x < before.x, 'train moved backward (tail shifted left)');
}

// ── trainLength / unitWorldPositions ──────────────────────────────────────────
console.log('--- trainLength / unitWorldPositions ---');
{
  const train = {
    id: 'ml', name: 'ml',
    units: makeUnits(3, 'u'),
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 84,
  };
  assert(trainLength(train) === 84, 'trainLength = 3 × 28 = 84');
  const pos = unitWorldPositions(graph, train);
  assert(pos.length === 3, 'unitWorldPositions has 3 entries');
  for (let i = 1; i < pos.length; i++) {
    const d = Math.hypot(pos[i].x - pos[i - 1].x, pos[i].y - pos[i - 1].y);
    assert(Math.abs(d - 28) < 1, `unit spacing ${i-1}→${i} ≈ 28px (got ${d.toFixed(2)})`);
  }
}

// ── checkCollisions ───────────────────────────────────────────────────────────
console.log('--- checkCollisions ---');
{
  const A = {
    id: 'A', name: 'A', units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }], headPos: 100, speedPos: 3,
  };
  const B = {
    id: 'B', name: 'B', units: [{ kind: 'loco', typeId: 'l1', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }], headPos: 110, speedPos: 0,
  };
  const pairs = checkCollisions(graph, [A, B]);
  assert(pairs.length === 1, 'one collision pair detected');
  assert(pairs[0].includes('A') && pairs[0].includes('B'), 'pair contains A and B');
  assert(A.speedPos === 0, 'moving train was stopped by collision');
}

{
  const A = {
    id: 'far1', name: 'A', units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }], headPos: 0, speedPos: 1,
  };
  const B = {
    id: 'far2', name: 'B', units: [{ kind: 'loco', typeId: 'l1', length: 28 }],
    path: [{ segmentId: 's2', dir: 1 }], headPos: 0, speedPos: 0,
  };
  const pairs = checkCollisions(graph, [A, B]);
  assert(pairs.length === 0, 'no collision when far apart');
}

// ── checkCollisions: parallel tracks (no false positive) ──────────────────────
console.log('--- checkCollisions: parallel tracks ---');
{
  // Two trains on different tracks 15px apart — must NOT collide.
  const A = {
    id: 'pA', name: 'pA', units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 'ps1', dir: 1 }], headPos: 250, speedPos: 3,
  };
  const B = {
    id: 'pB', name: 'pB', units: [{ kind: 'loco', typeId: 'l1', length: 28 }],
    path: [{ segmentId: 'ps2', dir: 1 }], headPos: 250, speedPos: 0,
  };
  const pairs = checkCollisions(parallelGraph, [A, B]);
  assert(pairs.length === 0, 'no collision on parallel tracks');
  assert(A.speedPos === 3, 'moving train NOT stopped on parallel track');
}

// ── Summary ───────────────────────────────────────────────────────────────────
results('movement.test.mjs');
