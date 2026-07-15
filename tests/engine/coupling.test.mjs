import { unitWorldPositions } from '../../src/engine/movement.js';
import { autoCouple, decouple } from '../../src/engine/coupling.js';
import { graph, parallelGraph, assert, results, makeUnits } from './helpers.mjs';

// ── autoCouple: pursuit (same-direction, head-tail) ───────────────────────────
console.log('--- autoCouple: pursuit merge ---');
{
  const trains = [
    { id: 'A', name: 'A', units: makeUnits(2, 'a'), path: [{ segmentId: 's1', dir: 1 }], headPos: 100, speedPos: 0, activeLocoIndex: 0 },
    { id: 'B', name: 'B', units: makeUnits(2, 'b'), path: [{ segmentId: 's1', dir: 1 }], headPos: 150, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(graph, trains);
  assert(trains.length === 1, 'pursuit merge produced 1 train');
  if (trains.length === 1) {
    const ids = trains[0].units.map(u => u.typeId).join(',');
    assert(ids === 'b0,b1,a0,a1', `unit order after pursuit: ${ids}`);
    console.log(`  merged units: ${ids}`);
  }
}

// ── autoCouple: head-on nose-to-nose ─────────────────────────────────────────
console.log('--- autoCouple: head-on nose-to-nose ---');
{
  const trains = [
    { id: 'A', name: 'A', units: makeUnits(3, 'a'), path: [{ segmentId: 's1', dir: 1 }], headPos: 500, speedPos: 0, activeLocoIndex: 2 },
    { id: 'B', name: 'B', units: makeUnits(3, 'b'), path: [{ segmentId: 's2', dir: -1 }], headPos: 500, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(graph, trains);
  assert(trains.length === 1, 'head-on merge produced 1 train');
  if (trains.length === 1) {
    const merged = trains[0];
    const ids = merged.units.map(u => u.typeId).join(',');
    console.log(`  merged units: ${ids}`);
    assert(ids === 'a2,a1,a0,b0,b1,b2', `head-on unit order: ${ids}`);
    assert(merged.activeLocoIndex === 3, `activeLocoIndex→b0 (idx 3): got ${merged.activeLocoIndex}`);
    const pos = unitWorldPositions(graph, merged);
    let continuous = true;
    for (let i = 1; i < pos.length; i++) {
      const d = Math.hypot(pos[i].x - pos[i - 1].x, pos[i].y - pos[i - 1].y);
      if (Math.abs(d - 28) > 1) continuous = false;
    }
    assert(continuous, 'merged units are evenly spaced (continuous positions)');
  }
}

// ── autoCouple: tail-to-tail (opposing) ──────────────────────────────────────
console.log('--- autoCouple: tail-to-tail ---');
{
  const trains = [
    { id: 'A', name: 'A', units: makeUnits(2, 'a'), path: [{ segmentId: 's1', dir: 1 }], headPos: 300, speedPos: 0, activeLocoIndex: 0 },
    { id: 'B', name: 'B', units: makeUnits(2, 'b'), path: [{ segmentId: 's1', dir: -1 }], headPos: 312, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(graph, trains);
  assert(trains.length === 1, 'tail-to-tail merge produced 1 train');
  if (trains.length === 1) {
    const merged = trains[0];
    const ids = merged.units.map(u => u.typeId).join(',');
    console.log(`  merged units: ${ids}`);
    assert(ids === 'a0,a1,b1,b0', `tail-to-tail unit order: ${ids}`);
    const pos = unitWorldPositions(graph, merged);
    let continuous = true;
    for (let i = 1; i < pos.length; i++) {
      const d = Math.hypot(pos[i].x - pos[i - 1].x, pos[i].y - pos[i - 1].y);
      if (Math.abs(d - 28) > 1) { continuous = false; console.log(`    gap ${i-1}→${i}: ${d.toFixed(2)}px`); }
    }
    assert(continuous, 'merged tail-to-tail units are evenly spaced');
  }
}

// ── autoCouple: forced pairs (collision coupling) ─────────────────────────────
console.log('--- autoCouple: forced pairs with wide threshold ---');
{
  // A.head(100) vs B.tail(122): dist=22. Normal threshold 8, forced ≈25.8.
  const t1 = [
    { id: 'A', name: 'A', units: makeUnits(1, 'a'), path: [{ segmentId: 's1', dir: 1 }], headPos: 100, speedPos: 0, activeLocoIndex: 0 },
    { id: 'B', name: 'B', units: makeUnits(1, 'b'), path: [{ segmentId: 's1', dir: 1 }], headPos: 150, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(graph, t1);
  assert(t1.length === 2, 'no coupling without forcedPairs at distance 22');

  const t2 = [
    { id: 'C', name: 'C', units: makeUnits(1, 'c'), path: [{ segmentId: 's1', dir: 1 }], headPos: 100, speedPos: 0, activeLocoIndex: 0 },
    { id: 'D', name: 'D', units: makeUnits(1, 'd'), path: [{ segmentId: 's1', dir: 1 }], headPos: 150, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(graph, t2, [['C', 'D']]);
  assert(t2.length === 1, 'forced pair coupled at distance 22');
}

// ── decouple ──────────────────────────────────────────────────────────────────
console.log('--- decouple ---');
{
  const train = {
    id: 'dc', name: 'DC',
    units: makeUnits(4, 'u'),
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 112, speedPos: 0,
  };
  const [front, back] = decouple(graph, train, 1);
  assert(front !== back, 'decouple returned two trains');
  assert(front.units.length === 2, `front has 2 units: got ${front.units.length}`);
  assert(back.units.length === 2, `back has 2 units: got ${back.units.length}`);
  assert(front.recentlySplitFrom === back.id, 'front knows about back');
  assert(back.recentlySplitFrom === front.id, 'back knows about front');
  const fids = front.units.map(u => u.typeId).join(',');
  const bids = back.units.map(u => u.typeId).join(',');
  assert(fids === 'u0,u1', `front units: ${fids}`);
  assert(bids === 'u2,u3', `back units: ${bids}`);
  console.log(`  front: ${fids}, back: ${bids}`);
}

// ── recentlySplitFrom prevents re-coupling ────────────────────────────────────
console.log('--- recentlySplitFrom prevents re-coupling ---');
{
  const train = {
    id: 'rs', name: 'RS',
    units: makeUnits(4, 'u'),
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 112, speedPos: 0,
  };
  const [front, back] = decouple(graph, train, 1);
  const trains = [front, back];
  autoCouple(graph, trains);
  assert(trains.length === 2, 'recentlySplitFrom prevents re-coupling');
}

// ── pursuit with unit object identity preserved through merge ─────────────────
console.log('--- autoCouple: pursuit with unit identity preserved ---');
{
  const trains = [
    { id: 'A', name: 'A', units: makeUnits(2, 'a'), path: [{ segmentId: 's1', dir: 1 }], headPos: 100, speedPos: 0, activeLocoIndex: 0 },
    { id: 'B', name: 'B', units: makeUnits(2, 'b'), path: [{ segmentId: 's1', dir: 1 }], headPos: 50, speedPos: 0, activeLocoIndex: 1 },
  ];
  const prevUnitB1 = trains[1].units[1];
  autoCouple(graph, trains);
  assert(trains.length === 1, 'merge happened');
  if (trains.length === 1) {
    const merged = trains[0];
    assert(merged.units.includes(prevUnitB1), 'B active unit object identity preserved');
    assert(merged.units.indexOf(prevUnitB1) === 3, 'B active unit is now last (idx 3)');
    console.log(`  activeLocoIndex: ${merged.activeLocoIndex}, merged units: ${merged.units.map(u=>u.typeId).join(',')}`);
  }
}

// ── autoCouple: parallel tracks (no false coupling) ───────────────────────────
console.log('--- autoCouple: parallel tracks ---');
{
  // Two trains on different tracks 15px apart — must NOT couple.
  const trains = [
    { id: 'pA', name: 'pA', units: makeUnits(2, 'a'), path: [{ segmentId: 'ps1', dir: 1 }], headPos: 250, speedPos: 0, activeLocoIndex: 0 },
    { id: 'pB', name: 'pB', units: makeUnits(2, 'b'), path: [{ segmentId: 'ps2', dir: 1 }], headPos: 250, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(parallelGraph, trains);
  assert(trains.length === 2, 'trains on parallel tracks did NOT couple');
}
{
  // Forced pair on different tracks — must still NOT couple (track takes precedence).
  const trains = [
    { id: 'pC', name: 'pC', units: makeUnits(1, 'c'), path: [{ segmentId: 'ps1', dir: 1 }], headPos: 250, speedPos: 0, activeLocoIndex: 0 },
    { id: 'pD', name: 'pD', units: makeUnits(1, 'd'), path: [{ segmentId: 'ps2', dir: 1 }], headPos: 250, speedPos: 0, activeLocoIndex: 0 },
  ];
  autoCouple(parallelGraph, trains, [['pC', 'pD']]);
  assert(trains.length === 2, 'forced pair on different tracks did NOT couple');
}

// ── Summary ───────────────────────────────────────────────────────────────────
results('coupling.test.mjs');
