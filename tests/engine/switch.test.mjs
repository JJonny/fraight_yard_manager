import { isSwitchBlocked, toggleSwitch } from '../../src/engine/switch.js';
import { assert, results } from './helpers.mjs';

// Y-junction graph:
//   n0 --s1-- n1 (switch) --s2-- n2
//                   \--s3-- n3
const graph = {
  nodes: [
    { id: 'n0', x: 0,   y: 0, type: 'node' },
    { id: 'n1', x: 500, y: 0, type: 'switch' },
    { id: 'n2', x: 1000, y: 0, type: 'node' },
    { id: 'n3', x: 1000, y: 200, type: 'node' },
  ],
  segments: [
    { id: 's1', from: 'n0', to: 'n1' },
    { id: 's2', from: 'n1', to: 'n2' },
    { id: 's3', from: 'n1', to: 'n3' },
  ],
  switches: [
    { id: 'sw1', nodeId: 'n1', defaultSegment: 's2', divergingSegment: 's3', activeSegment: 's2', isLocked: false },
  ],
  entryPoints: [],
  curves: [],
};

// ── isSwitchBlocked ─────────────────────────────────────────────────────────
console.log('--- isSwitchBlocked ---');

// No trains → not blocked.
{
  const blocked = isSwitchBlocked(graph, [], 'n1');
  assert(!blocked, 'no trains: not blocked');
}

// Train far away on s1 → not blocked.
{
  const train = {
    id: 'far', name: 'far',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 10,
  };
  const blocked = isSwitchBlocked(graph, [train], 'n1');
  assert(!blocked, 'train far from switch: not blocked');
}

// Train head right at the switch node (n1 at x=500) → blocked.
{
  // headPos = 486 means unit center is at ~486 - 14 = 472 from start, still within range.
  // With segment s1 length 500, headPos near 500 puts unit center near node.
  const train = {
    id: 'close', name: 'close',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 500,
  };
  const blocked = isSwitchBlocked(graph, [train], 'n1');
  assert(blocked, 'train head at switch node: blocked');
}

// Train on s2 (past switch) → blocked.
{
  const train = {
    id: 'past', name: 'past',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's2', dir: 1 }],
    headPos: 14,
  };
  const blocked = isSwitchBlocked(graph, [train], 'n1');
  assert(blocked, 'train just past switch on s2: blocked');
}

// Non-existent node → not blocked.
{
  const blocked = isSwitchBlocked(graph, [], 'nonexistent');
  assert(!blocked, 'nonexistent node: not blocked');
}

// Multi-unit train, one unit near switch.
{
  const train = {
    id: 'multi', name: 'multi',
    units: [
      { kind: 'loco', typeId: 'l0', length: 28 },
      { kind: 'wagon', typeId: 'w0', length: 28 },
      { kind: 'wagon', typeId: 'w1', length: 28 },
    ],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 556, // 3 units × 28 = 84 total; tail at 556−84=472; 2nd unit center ~556−42=514, close to n1
  };
  const blocked = isSwitchBlocked(graph, [train], 'n1');
  assert(blocked, 'multi-unit train with unit near switch: blocked');
}

// ── toggleSwitch ────────────────────────────────────────────────────────────
console.log('--- toggleSwitch ---');

// No switch at node.
{
  const res = toggleSwitch(graph, [], 'n0');
  assert(!res.ok, 'no switch: returns ok=false');
  assert(res.reason === 'No switch at node', `reason is "No switch at node" (got "${res.reason}")`);
}

// Train on switch → blocked.
{
  const train = {
    id: 'blocker', name: 'blocker',
    units: [{ kind: 'loco', typeId: 'l0', length: 28 }],
    path: [{ segmentId: 's1', dir: 1 }],
    headPos: 500,
  };
  const res = toggleSwitch(graph, [train], 'n1');
  assert(!res.ok, 'train on switch: toggle blocked');
  assert(res.reason === 'Train on switch', `reason is "Train on switch" (got "${res.reason}")`);
}

// No train → toggle succeeds, activeSegment flips.
{
  const sw = graph.switches[0];
  const before = sw.activeSegment;
  const expected = before === 's2' ? 's3' : 's2';
  const res = toggleSwitch(graph, [], 'n1');
  assert(res.ok, 'no train: toggle ok');
  assert(sw.activeSegment === expected, `activeSegment flipped to ${expected}`);
  // Toggle back.
  toggleSwitch(graph, [], 'n1');
  assert(sw.activeSegment === before, 'toggled back to original');
}

// ── Summary ─────────────────────────────────────────────────────────────────
results('switch.test.mjs');
