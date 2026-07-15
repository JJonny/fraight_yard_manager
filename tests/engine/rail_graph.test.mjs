import {
  createEmptyGraph, nextId,
  getNode, getSegment, getSwitch, getCurve,
  segmentsAt, nextSegment, frontNodeOf, backNodeOf,
  segmentLength, pointOnSegment, segmentAngle,
  findSwitchBranches, makeCurve, removeCurve, parallelizeSegments,
  evalCubicBezier, evalCubicBezierTangent,
} from '../../src/engine/rail_graph.js';
import { assert, results } from './helpers.mjs';

// Deep clone a graph, stripping the lazy _idx cache (which contains Map
// objects that JSON.parse would turn into plain {}).
function cloneGraph(g) {
  const copy = { ...g };
  delete copy._idx;
  return JSON.parse(JSON.stringify(copy));
}

// ── Fixtures ────────────────────────────────────────────────────────────────

// Linear: n0 --s1-- n1 --s2-- n2
const linear = {
  nodes: [
    { id: 'n0', x: 0, y: 0, type: 'node' },
    { id: 'n1', x: 500, y: 0, type: 'node' },
    { id: 'n2', x: 1000, y: 0, type: 'node' },
  ],
  segments: [
    { id: 's1', from: 'n0', to: 'n1' },
    { id: 's2', from: 'n1', to: 'n2' },
  ],
  switches: [],
  entryPoints: [],
  curves: [],
};

// Y-junction: n0 --s1-- n1(switch) --s2-- n2
//                                    \--s3-- n3
const yGraph = {
  nodes: [
    { id: 'n0', x: 0, y: 0, type: 'node' },
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

// 4-way: n0 --s1-- nx --s2-- n2
//                  |--s3-- n3
//                  \--s4-- n4
const fourWay = {
  nodes: [
    { id: 'n0', x: 0, y: 0, type: 'node' },
    { id: 'nx', x: 500, y: 0, type: 'switch' },
    { id: 'n2', x: 1000, y: 0, type: 'node' },
    { id: 'n3', x: 1000, y: 200, type: 'node' },
    { id: 'n4', x: 1000, y: -200, type: 'node' },
  ],
  segments: [
    { id: 's1', from: 'n0', to: 'nx' },
    { id: 's2', from: 'nx', to: 'n2' },
    { id: 's3', from: 'nx', to: 'n3' },
    { id: 's4', from: 'nx', to: 'n4' },
  ],
  switches: [
    { id: 'sw1', nodeId: 'nx', defaultSegment: 's2', divergingSegment: 's3', activeSegment: 's2', isLocked: false },
  ],
  entryPoints: [],
  curves: [],
};

// ── createEmptyGraph ────────────────────────────────────────────────────────
console.log('--- createEmptyGraph ---');
{
  const g = createEmptyGraph();
  assert(g.nodes.length === 0, 'empty nodes');
  assert(g.segments.length === 0, 'empty segments');
  assert(g.switches.length === 0, 'empty switches');
  assert(g.curves.length === 0, 'empty curves');
}

// ── nextId ──────────────────────────────────────────────────────────────────
console.log('--- nextId ---');
{
  const a = nextId('t');
  const b = nextId('t');
  assert(a !== b, 'nextId produces unique ids');
  assert(a.startsWith('t_'), 'nextId uses prefix');
}

// ── lookups ─────────────────────────────────────────────────────────────────
console.log('--- getNode / getSegment / getSwitch ---');
{
  assert(getNode(linear, 'n0').x === 0, 'getNode finds n0');
  assert(getNode(linear, 'missing') === null, 'getNode returns null for missing');
  assert(getSegment(linear, 's1').from === 'n0', 'getSegment finds s1');
  assert(getSegment(linear, 'zzz') === null, 'getSegment returns null for missing');
  assert(getSwitch(yGraph, 'n1').id === 'sw1', 'getSwitch finds switch');
  assert(getSwitch(yGraph, 'n0') === null, 'getSwitch returns null for non-switch node');
  assert(getSwitch(linear, 'n0') === null, 'getSwitch returns null for empty switches');
}

// ── getCurve ────────────────────────────────────────────────────────────────
console.log('--- getCurve / makeCurve / removeCurve ---');
{
  assert(getCurve(linear, 's1') === null, 'no curve initially');
  // remove _idx before cloning so JSON.parse doesn't serialize Map→{}
  let g = cloneGraph(linear);
  g = makeCurve(g, 's1', 0.3);
  delete g._idx;
  const c = getCurve(g, 's1');
  assert(c !== null, 'curve created');
  assert(c.strength === 0.3, 'curve strength correct');
  // Update existing curve.
  g = makeCurve(g, 's1', 0.7);
  delete g._idx;
  assert(getCurve(g, 's1').strength === 0.7, 'curve updated');
  // Remove.
  g = removeCurve(g, 's1');
  delete g._idx;
  assert(getCurve(g, 's1') === null, 'curve removed');
  // Remove non-existent is safe.
  const safe = removeCurve(cloneGraph(linear), 's1');
  assert(getCurve(safe, 's1') === null, 'remove non-existent is safe');
}

// ── segmentsAt ──────────────────────────────────────────────────────────────
console.log('--- segmentsAt ---');
{
  const segs = segmentsAt(linear, 'n1');
  assert(segs.length === 2, 'n1 has 2 segments');
  const filtered = segmentsAt(linear, 'n1', 's1');
  assert(filtered.length === 1 && filtered[0].id === 's2', 'exclude s1');
  const leaf = segmentsAt(linear, 'n0');
  assert(leaf.length === 1, 'n0 has 1 segment');
}

// ── frontNodeOf / backNodeOf ────────────────────────────────────────────────
console.log('--- frontNodeOf / backNodeOf ---');
{
  assert(frontNodeOf(linear, 's1', 1) === 'n1', 's1 dir+1 front = n1');
  assert(frontNodeOf(linear, 's1', -1) === 'n0', 's1 dir-1 front = n0');
  assert(backNodeOf(linear, 's1', 1) === 'n0', 's1 dir+1 back = n0');
  assert(backNodeOf(linear, 's1', -1) === 'n1', 's1 dir-1 back = n1');
}

// ── nextSegment ─────────────────────────────────────────────────────────────
console.log('--- nextSegment ---');
{
  // Linear: approach n1 from s1 → can go to s2.
  const res = nextSegment(linear, 's1', 'n1');
  assert(res.segmentId === 's2', 'linear: s1→n1→s2');
  assert(res.dir === 1, 'direction is +1 (n1→n2)');

  // Dead end: approach n2 from s2 → nothing beyond.
  const dead = nextSegment(linear, 's2', 'n2');
  assert(dead === null, 'dead end at n2');
}

// ── nextSegment with switch ────────────────────────────────────────────────
console.log('--- nextSegment: switch routing ---');
{
  // Approach switch n1 from s1, active=s2 → goes to s2.
  const r1 = nextSegment(yGraph, 's1', 'n1');
  assert(r1.segmentId === 's2', 'switch active=s2: takes s2');

  // Toggle active to s3.
  const y2 = cloneGraph(yGraph);
  y2.switches[0].activeSegment = 's3';
  const r2 = nextSegment(y2, 's1', 'n1');
  assert(r2.segmentId === 's3', 'switch active=s3: takes s3');

  // Coming from s2 → trunk s1 is always allowed.
  const r3 = nextSegment(yGraph, 's2', 'n1');
  assert(r3.segmentId === 's1', 'from s2 branch → trunk s1');

  // Coming from s3 → trunk s1 always allowed.
  const r4 = nextSegment(yGraph, 's3', 'n1');
  assert(r4.segmentId === 's1', 'from s3 branch → trunk s1');

  // 4-way: active=s2, approaching from s1 → only s2 (not s3, s4).
  const r5 = nextSegment(fourWay, 's1', 'nx');
  assert(r5.segmentId === 's2', '4-way: only active branch s2');
}

// ── segmentLength ───────────────────────────────────────────────────────────
console.log('--- segmentLength ---');
{
  const seg = getSegment(linear, 's1');
  const len = segmentLength(linear, seg);
  assert(Math.abs(len - 500) < 1, `s1 length ≈ 500 (got ${len.toFixed(1)})`);
}

// ── pointOnSegment ──────────────────────────────────────────────────────────
console.log('--- pointOnSegment ---');
{
  const p0 = pointOnSegment(linear, 's1', 0, 1);
  assert(Math.abs(p0.x) < 1 && Math.abs(p0.y) < 1, 't=0 dir+1 at origin');

  const p1 = pointOnSegment(linear, 's1', 1, 1);
  assert(Math.abs(p1.x - 500) < 1, 't=1 dir+1 at n1');

  const pm = pointOnSegment(linear, 's1', 0.5, 1);
  assert(Math.abs(pm.x - 250) < 1, 't=0.5 dir+1 at midpoint');

  // Reversed direction.
  const pr = pointOnSegment(linear, 's1', 0, -1);
  assert(Math.abs(pr.x - 500) < 1, 't=0 dir-1 at n1');

  assert(pointOnSegment(linear, 'zzz', 0) === null, 'missing segment returns null');
}

// ── segmentAngle ────────────────────────────────────────────────────────────
console.log('--- segmentAngle ---');
{
  const ang = segmentAngle(linear, 's1', 1);
  assert(Math.abs(ang) < 0.01, 'horizontal right = angle 0');

  const angRev = segmentAngle(linear, 's1', -1);
  assert(Math.abs(angRev - Math.PI) < 0.01, 'reversed = angle π');

  assert(segmentAngle(linear, 'zzz') === 0, 'missing segment returns 0');
}

// ── evalCubicBezier ─────────────────────────────────────────────────────────
console.log('--- evalCubicBezier ---');
{
  const P0 = { x: 0, y: 0 }, P3 = { x: 100, y: 0 };
  const P1 = { x: 33, y: 50 }, P2 = { x: 66, y: 50 };
  const at0 = evalCubicBezier(P0, P1, P2, P3, 0);
  const at1 = evalCubicBezier(P0, P1, P2, P3, 1);
  assert(Math.abs(at0.x) < 1 && Math.abs(at0.y) < 1, 'bezier t=0 at P0');
  assert(Math.abs(at1.x - 100) < 1 && Math.abs(at1.y) < 1, 'bezier t=1 at P3');
}

// ── evalCubicBezierTangent ──────────────────────────────────────────────────
console.log('--- evalCubicBezierTangent ---');
{
  const P0 = { x: 0, y: 0 }, P3 = { x: 100, y: 0 };
  const P1 = { x: 33, y: 50 }, P2 = { x: 66, y: 50 };
  const t0 = evalCubicBezierTangent(P0, P1, P2, P3, 0);
  assert(t0.y > 0, 'tangent at t=0 points upward');
}

// ── findSwitchBranches ─────────────────────────────────────────────────────
console.log('--- findSwitchBranches ---');
{
  const res = findSwitchBranches(yGraph, 'n1');
  assert(res !== null, 'found branches for 3-way');
  const branchSet = new Set([res.defaultSegment, res.divergingSegment]);
  assert(branchSet.has('s2') || branchSet.has('s3'), 'branches include s2 or s3');
  // Not the trunk.
  assert(!branchSet.has('s1'), 'branches do not include trunk s1');

  // 4-way.
  const res4 = findSwitchBranches(fourWay, 'nx');
  assert(res4 !== null, 'found branches for 4-way');

  // Node with <3 segments → null.
  const resLeaf = findSwitchBranches(linear, 'n0');
  assert(resLeaf === null, 'leaf node returns null');
}

// ── parallelizeSegments ─────────────────────────────────────────────────────
console.log('--- parallelizeSegments ---');
{
  // Single segment → no-op.
  const noop = parallelizeSegments(linear, ['s1'], 20);
  assert(noop === linear, 'single segment is no-op');
}

// ── Summary ─────────────────────────────────────────────────────────────────
results('rail_graph.test.mjs');
