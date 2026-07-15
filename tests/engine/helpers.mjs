// Shared fixtures and helpers for engine tests.

export const graph = {
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

// Two parallel tracks ~15px apart — close enough to trigger the old distance-only bug.
export const parallelGraph = {
  nodes: [
    { id: 'pn0', x: 0, y: 0, type: 'node' },
    { id: 'pn1', x: 500, y: 0, type: 'node' },
    { id: 'pn2', x: 0, y: 15, type: 'node' },
    { id: 'pn3', x: 500, y: 15, type: 'node' },
  ],
  segments: [
    { id: 'ps1', from: 'pn0', to: 'pn1' },
    { id: 'ps2', from: 'pn2', to: 'pn3' },
  ],
  switches: [],
  entryPoints: [],
  curves: [],
};

let _passed = 0;
let _failed = 0;

export function assert(cond, msg) {
  if (cond) { _passed++; }
  else { _failed++; console.error(`  FAIL: ${msg}`); }
}

export function results(label) {
  console.log(`\n=== ${label}: ${_passed} passed, ${_failed} failed ===`);
  process.exit(_failed > 0 ? 1 : 0);
}

export function makeUnits(n, prefix) {
  return Array.from({ length: n }, (_, i) => ({
    kind: 'loco', typeId: `${prefix}${i}`, length: 28,
  }));
}

export function posEq(a, b, tolerance = 1) {
  return Math.hypot(a.x - b.x, a.y - b.y) < tolerance;
}
