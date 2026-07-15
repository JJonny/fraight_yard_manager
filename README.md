# Railroad Shunting Simulator

A browser-based railroad shunting (switching) simulator. Design your own track layouts, build train consists out of locomotives and wagons, then drive them on the layout — couple, decouple, and throw switches to sort cars, all rendered live on an SVG canvas.

Built with **React 18**, **Vite 5**, and **TailwindCSS 3**. There is no backend — everything is persisted locally in the browser via `localStorage`.

## Features

- **Map Editor** — build rail networks visually on an SVG canvas:
  - Place nodes, switches, and entry points; connect them with track segments.
  - Drag nodes to reposition track, delete nodes/segments/switches.
  - Toggle a segment into a curved (bezier) track piece.
  - Parallelize a segment to quickly lay out yard ladders.
  - Upload and use a background image (auto-compressed) to trace real-world layouts.
  - Save, load, rename, and delete maps.
- **Consist Builder** — assemble trains from a catalog of locomotives and wagons, save them as reusable consists.
- **Play Mode** — spawn a consist at an entry point and drive it live:
  - Keyboard-controlled throttle (`A`/`D` or `←`/`→`) across 11 gears (`-5` to `5`).
  - Automatic coupling when units touch; manual decoupling between adjacent units.
  - Click switches to change their active route (blocked while a train is too close, to avoid derailing).
  - Multiple trains and entry points, with spawn cooldowns per entry.

## Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| UI         | React 18                             |
| Build tool | Vite 5                               |
| Styling    | TailwindCSS 3                        |
| Icons      | lucide-react                         |
| Engine     | Plain JS modules (no framework deps) |
| Persistence| Browser `localStorage`               |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (recent LTS recommended)
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Starts the Vite dev server at `http://localhost:5173`.

### Production Build

```bash
npm run build
```

Outputs a production-ready bundle to `dist/`.

### Preview Production Build

```bash
npm run preview
```

> There are currently no test, lint, or typecheck scripts configured for this project.

## Project Structure

```
src/
├── main.jsx                     # App entrypoint
├── App.jsx                      # Top-level screen switcher (menu / editor / consist / play)
├── index.css                    # Tailwind base styles
├── engine/                      # Pure JS simulation engine
│   ├── rail_graph.js            #   Graph data model + routing (nextSegment)
│   ├── movement.js              #   Train physics tick (advanceTrain) + physical constants
│   ├── coupling.js              #   autoCouple() / decouple()
│   └── switch.js                #   toggleSwitch() + hitbox blocking logic
├── components/
│   ├── editor/MapEditor.jsx     # Map/track editor screen
│   ├── consist/ConsistBuilder.jsx # Train consist builder screen
│   ├── game/PlayMode.jsx        # Live driving/switching screen
│   └── ui/                      # Shared UI widgets (SpeedGauge, Legend)
├── assets/
│   ├── loco_types.js            # Locomotive catalog
│   └── wagon_types.js           # Wagon catalog
└── storage/
    ├── map_store.js             # CRUD for saved maps (localStorage key: trainz_maps_v1)
    └── consist_store.js         # CRUD for saved consists (localStorage key: trainz_consists_v1)
```

## Engine Notes

- Train speed = `gear × PIXELS_PER_GEAR` px/sec, with gear ranging from `-5` to `5`.
- Physical constants (`src/engine/movement.js`): `UNIT_LENGTH = 28`, `UNIT_WIDTH = 12`, `COUPLE_DIST = 6`, `PIXELS_PER_GEAR = 30`.
- Switches are blocked from toggling while any unit's center is within `SWITCH_HITBOX_RADIUS + 8` px (~22px) of the switch node.

## Data Model

**RailGraph** (persisted and used at runtime):

```js
{
  nodes: [{ id, x, y, type }],                // type: 'node' | 'switch' | 'entry'
  segments: [{ id, from, to }],
  switches: [{ id, nodeId, defaultSegment, divergingSegment, activeSegment, isLocked }],
  entryPoints: [{ id, label, nodeId }],
  curves: [{ id, segmentId, strength }],       // optional bezier curve override per segment
}
```

**Train** (runtime, in `PlayMode`):

```js
{
  id, name,
  units: [{ kind, typeId, length }],
  path: [{ segmentId, dir }],
  headPos, speedPos, activeLocoIndex
}
```

## Persistence & Known Limitations

- All data lives in browser `localStorage` — nothing is sent to a server, and clearing site data will erase saved maps/consists.
- Map backgrounds are stored as base64 data URLs. Very large images can exceed the browser's storage quota, which throws a `QuotaExceededError` (or `NS_ERROR_DOM_QUOTA_REACHED` on Firefox). This is caught and reported when saving **maps**.
- Saving **consists** does not currently guard against quota errors — a quota failure there will throw uncaught.
- Only 2 locomotive types and 5 wagon types are defined out of the box (`src/assets/`).

## Contributing

Adding new physical constants or vehicle/asset types requires changes in **both** the engine (`src/engine/`) and the React components that render them (`MapEditor.jsx`, `PlayMode.jsx`, `ConsistBuilder.jsx`).

## License

No license has been specified for this project.
