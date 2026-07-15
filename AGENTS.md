# AGENTS.md — Railroad Shunting Simulator

## Commands

```bash
npm run dev      # Dev server at http://localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

No test, lint, or typecheck scripts exist.

## Architecture

**Stack:** React 18 + Vite 5 + TailwindCSS 3. No backend. All persistence via `localStorage`.

**Entrypoint:** `src/main.jsx` → `src/App.jsx`. App owns a `mode` state switching between four screens (`menu`, `editor`, `consist`, `play`).

**Engine (`src/engine/`, pure JS):**
- `rail_graph.js` — graph data model (nodes, segments, switches, entry points). `nextSegment()` is the key routing function.
- `movement.js` — train physics. `advanceTrain()` is the main tick. Speed = `gear × PIXELS_PER_GEAR` px/sec (gear ∈ [-5, 5]).
- `coupling.js` — `autoCouple()` / `decouple()`.
- `switch.js` — `toggleSwitch()`; blocked if any unit center is within `SWITCH_HITBOX_RADIUS + 8` (~22px) of the node. Note: `SWITCH_HITBOX_RADIUS` (14px) itself is only the visual hitbox circle radius drawn in `PlayMode` — the actual block check adds 8px of margin on top.

**Physical constants** (all in `movement.js`): `UNIT_LENGTH = 28`, `UNIT_WIDTH = 12`, `COUPLE_DIST = 6`, `PIXELS_PER_GEAR = 30`.

**Storage (`src/storage/`):** CRUD wrappers over `localStorage`. Keys: `trainz_maps_v1`, `trainz_consists_v1`. Maps store background images as base64 data URLs — oversize images can throw `QuotaExceededError` (caught as both `QuotaExceededError` and `NS_ERROR_DOM_QUOTA_REACHED` for Firefox).

**Assets (`src/assets/`):** `loco_types.js` and `wagon_types.js` define the static vehicle catalogue (id, label, color). Only 2 loco types and 5 wagon types.

## Key data shapes

**Train** (runtime in `PlayMode`):
```js
{ id, name, units: [{kind, typeId, length}], path: [{segmentId, dir}], headPos, speedPos, activeLocoIndex }
```

**RailGraph** (persisted + runtime):
```js
{
  nodes: [{id, x, y, type}],                 // type: 'node' | 'switch' | 'entry'
  segments: [{id, from, to}],
  switches: [{id, nodeId, defaultSegment, divergingSegment, activeSegment, isLocked}],
  entryPoints: [{id, label, nodeId}],
  curves: [{id, segmentId, strength}],       // optional bezier curve override per segment
}
```

## Rules

- **Git operations:** NEVER commit, stage, branch, or perform any git operations. The user handles all git work.

## Gotchas

- Adding new physical constants or asset types requires changes in both the engine and the React components that render them.
- `src/storage/map_store.js:14` catches both `QuotaExceededError` and `NS_ERROR_DOM_QUOTA_REACHED` (Firefox). Error messages are in Russian.
- `src/storage/consist_store.js` does **not** have this try/catch around `localStorage.setItem` — a quota error there will throw uncaught.
- The existing `CLAUDE.md` in the repo root also has guidance — check it for additional context.
