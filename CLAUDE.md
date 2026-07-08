# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:5173)
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

No test or lint scripts are configured.

## Architecture

**Railroad Shunting Simulator** — a browser-based train sim built with React + Vite + TailwindCSS. No backend; all persistence via `localStorage`.

### App Modes

`App.jsx` owns a single `mode` state that switches between four screens:
- `menu` → main menu
- `editor` → `MapEditor` (draw track layouts)
- `consist` → `ConsistBuilder` (assemble trains)
- `play` → `PlayMode` (interactive simulation)

### Engine (pure JS, no React)

The game logic lives in `src/engine/` and is intentionally decoupled from React:

| File | Responsibility |
|------|----------------|
| `rail_graph.js` | Graph data model (nodes, segments, switches, entry points). `nextSegment()` is the key routing function — it respects switch state to determine which segment a train can enter next. |
| `movement.js` | Train physics. Position is represented as `headPos` (distance along a `path` array of `{segmentId, dir}` objects). `advanceTrain(graph, train, dt)` advances position, extends/prunes path, and stops on proximity to other trains. Speed = `gear × PIXELS_PER_GEAR` px/sec (gear ∈ [-5, 5]). |
| `coupling.js` | `autoCouple()` merges trains whose head/tail are within `COUPLE_DIST`. `decouple()` splits a train at a unit boundary and recomputes paths for both halves. |
| `switch.js` | `toggleSwitch()` flips `activeSegment`; blocked if any unit center is within `SWITCH_HITBOX_RADIUS` of the node. |

Physical constants (all in pixels): `UNIT_LENGTH = 28`, `UNIT_WIDTH = 12`, `COUPLE_DIST = 6`, `PIXELS_PER_GEAR = 30`.

### Storage

`src/storage/map_store.js` and `consist_store.js` wrap `localStorage` with a simple CRUD API. Keys: `trainz_maps_v1`, `trainz_consists_v1`. Maps store the background image as a base64 data URL — large images can hit `QuotaExceededError`.

### Key Data Shapes

**Train** (runtime, in `PlayMode`):
```js
{ id, name, units: [{kind, typeId, length}], path: [{segmentId, dir}], headPos, speedPos, activeLocoIndex }
```

**RailGraph** (persisted + runtime):
```js
{ nodes: [{id, x, y}], segments: [{id, from, to}], switches: [{nodeId, defaultSegment, divergingSegment, activeSegment}], entryPoints: [{id, label, nodeId}] }
```

### PlayMode Game Loop

`requestAnimationFrame` at ~60 FPS: `advanceTrain` → `autoCouple` → `setState`. Keyboard `A`/`D` (or arrow keys) changes throttle by ±1 gear. The active train is whichever was most recently spawned or selected.

### Asset Definitions

`src/assets/loco_types.js` and `wagon_types.js` define the static catalogue of vehicle types (id, name, color, properties). These are imported by both `ConsistBuilder` and `PlayMode`.
