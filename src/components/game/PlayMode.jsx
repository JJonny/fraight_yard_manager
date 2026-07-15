import React, { useEffect, useRef, useState } from 'react';
import { Play, Unlink, AlertTriangle } from 'lucide-react';
import { listMaps, loadMap } from '../../storage/map_store.js';
import { listConsists, loadConsist } from '../../storage/consist_store.js';
import { LOCO_TYPES } from '../../assets/loco_types.js';
import { WAGON_TYPES } from '../../assets/wagon_types.js';
import {
  UNIT_LENGTH, UNIT_WIDTH, PIXELS_PER_GEAR, advanceTrain, unitWorldPositions,
  buildEntryPath, trainLength, pathTotalLength,
  checkCollisions
} from '../../engine/movement.js';
import { autoCouple, decouple } from '../../engine/coupling.js';
import { toggleSwitch, isSwitchBlocked, SWITCH_HITBOX_RADIUS } from '../../engine/switch.js';
import { getNode, frontNodeOf, backNodeOf, getCurve, computeCurveControlPoints } from '../../engine/rail_graph.js';
import SpeedGauge from '../ui/SpeedGauge.jsx';
import Legend from '../ui/Legend.jsx';

const SPAWN_COOLDOWN_MS = 30_000;

export default function PlayMode() {
  const [maps] = useState(listMaps());
  const [consists] = useState(listConsists());
  const [selectedMapId, setSelectedMapId] = useState(maps[0]?.id || '');
  const [mapPkg, setMapPkg] = useState(null);
  const [graph, setGraph] = useState(null);
  const [trains, setTrains] = useState([]);
  const trainsRef = useRef([]);
  const activeTrainIdRef = useRef(null);
  const [, force] = useState(0);
  const tick = () => force(x => x + 1);

  const [pickedConsist, setPickedConsist] = useState('');
  const [pickedEntry, setPickedEntry] = useState('');
  const [lastSpawnByEntry, setLastSpawnByEntry] = useState({});
  const [activeTrainId, setActiveTrainId] = useState(null);
  const [warning, setWarning] = useState(null);
  const [exitTargetEntryId, setExitTargetEntryId] = useState('');
  const [switchVersion, setSwitchVersion] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef(null);

  // Selection for decoupling: array of {trainId, unitIndex}
  const [selection, setSelection] = useState([]);

  // Load map.
  useEffect(() => {
    if (!selectedMapId) return;
    const m = loadMap(selectedMapId);
    if (m) {
      setMapPkg(m);
      // Deep clone graph so toggling switches doesn't mutate stored copy.
      setGraph(JSON.parse(JSON.stringify(m.railGraph)));
      setTrains([]);
      trainsRef.current = [];
      setLastSpawnByEntry({});
      setActiveTrainId(null);
      activeTrainIdRef.current = null;
      setSelection([]);
    }
  }, [selectedMapId]);

  // Game loop.
  useEffect(() => {
    if (!graph) return;
    let raf;
    let last = performance.now();
    const loop = (now) => {
      try {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const ts = trainsRef.current;

        for (const t of ts) {
          if (t.isExiting) {
            // Advance manually past the track boundary at constant speed.
            const spd = t.exitSpeed; // px/sec, always positive
            t.headPos += t.exitDir > 0 ? spd * dt : -(spd * dt);
            continue;
          }

          const prevSpeed = t.speedPos;
          advanceTrain(graph, t, dt);

          // Detect arrival at exit entry (forward: head hits entry node dead-end).
          if (t.exitEntryNodeId && !t.isExiting) {
            const pLen = pathTotalLength(graph, t.path);
            const tl = trainLength(t);
            const last_ = t.path[t.path.length - 1];
            const first_ = t.path[0];

            if (frontNodeOf(graph, last_.segmentId, last_.dir) === t.exitEntryNodeId
                && t.headPos >= pLen - 2) {
              // Head has reached the exit entry going forward.
              t.isExiting = true;
              t.exitDir = 1;
              t.exitAnchor = pLen;
              t.exitSpeed = Math.max(1, Math.abs(prevSpeed)) * PIXELS_PER_GEAR;
              t.speedPos = 0;
            } else if (backNodeOf(graph, first_.segmentId, first_.dir) === t.exitEntryNodeId
                && t.headPos - tl <= 2) {
              // Tail has reached the exit entry going backward.
              t.isExiting = true;
              t.exitDir = -1;
              t.exitAnchor = 0;
              t.exitSpeed = Math.max(1, Math.abs(prevSpeed)) * PIXELS_PER_GEAR;
              t.speedPos = 0;
            }
          }
        }

        // Remove trains that have fully exited (all unit opacities reached 0).
        const activeTrans = ts.filter(t => {
          if (!t.isExiting) return true;
          const tl = trainLength(t);
          if (t.exitDir > 0) return t.headPos <= t.exitAnchor + tl + UNIT_LENGTH;
          else return t.headPos >= -(UNIT_LENGTH);
        });
        // If active train was removed, clear selection.
        if (activeTrans.length < ts.length) {
          const removedIds = ts.filter(t => !activeTrans.includes(t)).map(t => t.id);
          if (removedIds.includes(activeTrainIdRef.current)) {
            setActiveTrainId(null);
            activeTrainIdRef.current = null;
          }
        }

        // Capture the currently controlled loco unit (by reference) so we can re-find it
        // after any merge below, even if the merge changes which train id "wins".
        const prevActiveTrain = activeTrans.find(t => t.id === activeTrainIdRef.current);
        const prevActiveUnit = prevActiveTrain ? prevActiveTrain.units[prevActiveTrain.activeLocoIndex] : null;

        // Collisions: stop a train if its head reaches another train's bounds, and report
        // which pairs actually collided so they can be coupled together below (a collision
        // between two trains on the same track IS a coupling event, not a permanent wall).
        const collidedPairs = checkCollisions(graph, activeTrans);
        // Auto-coupling (exiting trains are at map edges, safe to include).
        autoCouple(graph, activeTrans, collidedPairs);

        // If a merge happened, keep control focus on the same physical loco, regardless of
        // which train id survived the merge.
        if (prevActiveUnit && !activeTrans.some(t => t.id === activeTrainIdRef.current)) {
          const ownerTrain = activeTrans.find(t => t.units.includes(prevActiveUnit));
          if (ownerTrain) {
            ownerTrain.activeLocoIndex = ownerTrain.units.indexOf(prevActiveUnit);
            activeTrainIdRef.current = ownerTrain.id;
            setActiveTrainId(ownerTrain.id);
          }
        }

        trainsRef.current = activeTrans;
        setTrains([...activeTrans]);
      } catch (err) {
        console.error('Game loop error:', err);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  // Keyboard input.
  useEffect(() => {
    function onKey(e) {
      if (!activeTrainId) return;
      const t = trainsRef.current.find(t => t.id === activeTrainId);
      if (!t || t.isExiting) return;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        t.speedPos = Math.min(5, t.speedPos + 1);
        tick();
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        t.speedPos = Math.max(-5, t.speedPos - 1);
        tick();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // also block vertical scroll
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTrainId]);

  // Prevent browser back/forward swipe on trackpad (passive:false needed for preventDefault).
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); };
    document.addEventListener('wheel', handler, { passive: false });
    return () => document.removeEventListener('wheel', handler);
  }, []);

  function spawnConsist() {
    if (!pickedConsist || !pickedEntry || !graph) return;
    const last = lastSpawnByEntry[pickedEntry] || 0;
    const now = Date.now();
    if (now - last < SPAWN_COOLDOWN_MS) {
      const sec = Math.ceil((SPAWN_COOLDOWN_MS - (now - last)) / 1000);
      flashWarning(`Entry on cooldown: ${sec}s`);
      return;
    }
    const c = loadConsist(pickedConsist);
    if (!c) return;
    const ep = graph.entryPoints.find(e => e.id === pickedEntry);
    if (!ep) return;
    const path = buildEntryPath(graph, ep.nodeId);
    if (!path) { flashWarning('Entry has no track'); return; }

    // Build flat units with lengths.
    const units = [];
    for (const g of c.units) {
      for (let i = 0; i < g.count; i++) {
        units.push(g.type === 'loco'
          ? { kind: 'loco', typeId: g.locoId, length: UNIT_LENGTH }
          : { kind: 'wagon', typeId: g.wagonId, length: UNIT_LENGTH });
      }
    }
    if (units.length === 0) return;

    const L = units.reduce((s, u) => s + u.length, 0);
    // Spawn so head is just inside the entry node (headPos = small value).
    const train = {
      id: `train_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
      name: c.meta.name,
      units,
      path,
      headPos: Math.min(L * 0.2, pathTotalLength(graph, path)),
      speedPos: 2,
      activeLocoIndex: units.findIndex(u => u.kind === 'loco')
    };
    trainsRef.current = [...trainsRef.current, train];
    setTrains([...trainsRef.current]);
    setLastSpawnByEntry({ ...lastSpawnByEntry, [pickedEntry]: now });
    setActiveTrainId(train.id);
    activeTrainIdRef.current = train.id;
  }

  function flashWarning(msg) {
    setWarning(msg);
    setTimeout(() => setWarning(null), 2200);
  }

  function sendToExit() {
    if (!activeTrainId || !exitTargetEntryId || !graph) return;
    const t = trainsRef.current.find(t => t.id === activeTrainId);
    if (!t || t.isExiting) return;
    const ep = graph.entryPoints.find(e => e.id === exitTargetEntryId);
    if (!ep) return;
    t.exitEntryNodeId = ep.nodeId;
    t.exitEntryId = ep.id;
    // Give the train a nudge if stopped so it can find the exit.
    if (t.speedPos === 0) { t.speedPos = 2; }
    tick();
  }

  function onSwitchClick(nodeId) {
    const res = toggleSwitch(graph, trainsRef.current, nodeId);
    if (!res.ok) flashWarning(res.reason);
    setSwitchVersion(v => v + 1);
  }

  function onUnitClick(trainId, unitIndex) {
    const train = trainsRef.current.find(t => t.id === trainId);
    if (!train) return;
    // Make this train active if it has a loco; else just selection.
    if (train.units[unitIndex].kind === 'loco') {
      setActiveTrainId(trainId);
      activeTrainIdRef.current = trainId;
      train.activeLocoIndex = unitIndex;
    }
    // Selection logic for decoupling.
    setSelection(prev => {
      const exists = prev.find(s => s.trainId === trainId && s.unitIndex === unitIndex);
      if (exists) return prev.filter(s => !(s.trainId === trainId && s.unitIndex === unitIndex));
      // Same train only; max 2.
      const sameTrain = prev.filter(s => s.trainId === trainId);
      if (sameTrain.length >= 2) return [{ trainId, unitIndex }];
      return [...sameTrain, { trainId, unitIndex }];
    });
  }

  const decoupleAvailable = (() => {
    if (selection.length !== 2) return null;
    if (selection[0].trainId !== selection[1].trainId) return null;
    const t = trainsRef.current.find(t => t.id === selection[0].trainId);
    if (!t || t.speedPos !== 0) return null;
    const i1 = Math.min(selection[0].unitIndex, selection[1].unitIndex);
    const i2 = Math.max(selection[0].unitIndex, selection[1].unitIndex);
    if (i2 - i1 !== 1) return null;
    return { trainId: t.id, splitAfter: i1 };
  })();

  function doDecouple() {
    if (!decoupleAvailable) return;
    const t = trainsRef.current.find(t => t.id === decoupleAvailable.trainId);
    if (!t) return;
    const wasActive = t.id === activeTrainIdRef.current;
    const prevLocoUnit = wasActive ? t.units[t.activeLocoIndex] : null;
    const [front, back] = decouple(graph, t, decoupleAvailable.splitAfter);
    trainsRef.current = trainsRef.current.flatMap(x => x.id === t.id ? [front, back] : [x]);
    if (wasActive) {
      const owner = [front, back].find(h => prevLocoUnit && h.units.includes(prevLocoUnit));
      if (owner && owner.units.some(u => u.kind === 'loco')) {
        owner.activeLocoIndex = owner.units.indexOf(prevLocoUnit);
        activeTrainIdRef.current = owner.id;
        setActiveTrainId(owner.id);
      } else {
        const withLoco = [front, back].find(h => h.units.some(u => u.kind === 'loco'));
        if (withLoco) {
          withLoco.activeLocoIndex = withLoco.units.findIndex(u => u.kind === 'loco');
          activeTrainIdRef.current = withLoco.id;
          setActiveTrainId(withLoco.id);
        } else {
          activeTrainIdRef.current = null;
          setActiveTrainId(null);
        }
      }
    }
    setTrains([...trainsRef.current]);
    setSelection([]);
  }

  if (!graph || !mapPkg) {
    return (
      <div className="w-full h-full flex items-center justify-center flex-col gap-4">
        <div className="text-neutral-400">Select a map to begin</div>
        <select value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}
                className="px-3 py-2 bg-neutral-800 rounded border border-neutral-700">
          <option value="">— pick a map —</option>
          {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {maps.length === 0 && <div className="text-xs text-neutral-500">No maps saved. Create one in &quot;Create Map&quot; first.</div>}
      </div>
    );
  }

  const activeTrain = trainsRef.current.find(t => t.id === activeTrainId);
  // Use stored original imgSize so rail coordinates always match the image coordinate space,
  // even if the saved background was compressed to smaller pixel dimensions.
  const imgSize = mapPkg.imgSize || { w: 1024, h: 640 };

  return (
    <div className="w-full h-full relative overflow-hidden bg-neutral-950">
      {/* Top bar: spawn controls */}
      <div className="absolute top-3 left-3 right-3 z-10 flex gap-3 items-start flex-wrap">
        <div className="bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 flex items-end gap-2 flex-wrap">
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Map</div>
            <select value={selectedMapId} onChange={e => setSelectedMapId(e.target.value)}
                    className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-sm">
              {maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Consist</div>
            <select value={pickedConsist} onChange={e => setPickedConsist(e.target.value)}
                    className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-sm">
              <option value="">—</option>
              {consists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase text-neutral-500">Entry</div>
            <select value={pickedEntry} onChange={e => setPickedEntry(e.target.value)}
                    className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-sm">
              <option value="">—</option>
              {graph.entryPoints.map(ep => <option key={ep.id} value={ep.id}>{ep.label}</option>)}
            </select>
          </div>
          <button onClick={spawnConsist}
                  className="flex items-center gap-1 px-3 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
            <Play size={14} /> Load Consist
          </button>
        </div>

        {warning && (
          <div className="bg-amber-700/90 border border-amber-500 text-amber-100 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <AlertTriangle size={14} /> {warning}
          </div>
        )}
      </div>

      {/* Scene — with middle-click drag panning */}
      <div className="absolute inset-0 overflow-hidden"
           style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
           onMouseDown={e => {
             if (e.button === 1) {
               e.preventDefault();
               setIsPanning(true);
               panRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
             }
           }}
           onMouseMove={e => {
             if (!panRef.current) return;
             const dx = e.clientX - panRef.current.startX;
             const dy = e.clientY - panRef.current.startY;
             setPan({ x: panRef.current.origX + dx, y: panRef.current.origY + dy });
           }}
           onMouseUp={e => {
             if (e.button === 1) {
               panRef.current = null;
               setIsPanning(false);
             }
           }}
           onMouseLeave={() => {
             if (panRef.current) {
               panRef.current = null;
               setIsPanning(false);
             }
           }}
           onWheel={e => {
             setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
           }}>
        <div className="relative" style={{
          width: imgSize.w, height: imgSize.h,
          transform: `translate(${pan.x}px, ${pan.y}px)`,
        }}>
          {mapPkg.background && (
            <img src={mapPkg.background} alt="map" draggable={false}
                 style={{ width: imgSize.w, height: imgSize.h }} />
          )}
          <SceneOverlay
            graph={graph}
            trains={trains}
            activeTrainId={activeTrainId}
            selection={selection}
            onSwitchClick={onSwitchClick}
            onUnitClick={onUnitClick}
            imgSize={imgSize}
            switchVersion={switchVersion}
          />
        </div>
      </div>

      {/* Bottom-left: speed gauge for active train */}
      <div className="absolute bottom-3 left-3 z-10 flex items-end gap-3">
        {activeTrain && (
          <div className="flex flex-col gap-2">
            <div className="text-xs text-neutral-300 flex items-center gap-2">
              {activeTrain.name}
              {activeTrain.isExiting && (
                <span className="text-amber-400 text-[10px] uppercase tracking-wide">Departing…</span>
              )}
              {activeTrain.exitEntryId && !activeTrain.isExiting && (
                <span className="text-sky-400 text-[10px] uppercase tracking-wide">
                  → {graph.entryPoints.find(e => e.id === activeTrain.exitEntryId)?.label}
                </span>
              )}
            </div>
            <SpeedGauge value={activeTrain.speedPos} />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={doDecouple}
                disabled={!decoupleAvailable || activeTrain.isExiting}
                title={!decoupleAvailable ? 'Stop the train and select two adjacent units to decouple.' : 'Decouple selected'}
                className={`flex items-center gap-1 px-3 py-1 rounded text-xs ${decoupleAvailable && !activeTrain.isExiting ? 'bg-amber-600 hover:bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
              >
                <Unlink size={12} /> Decouple
              </button>
              {!activeTrain.isExiting && (
                <div className="flex items-center gap-1">
                  <select
                    value={exitTargetEntryId}
                    onChange={e => setExitTargetEntryId(e.target.value)}
                    className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700 text-xs"
                  >
                    <option value="">Exit via…</option>
                    {graph.entryPoints.map(ep => (
                      <option key={ep.id} value={ep.id}>{ep.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={sendToExit}
                    disabled={!exitTargetEntryId}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${exitTargetEntryId ? 'bg-sky-700 hover:bg-sky-600' : 'bg-neutral-800 text-neutral-500 cursor-not-allowed'}`}
                  >
                    Send
                  </button>
                </div>
              )}
              <div className="text-[10px] text-neutral-500 self-center">A/D or ←/→</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom-right: legend */}
      <div className="absolute bottom-3 right-3 z-10">
        <Legend />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function SceneOverlay({ graph, trains, activeTrainId, selection, onSwitchClick, onUnitClick, imgSize, switchVersion }) {
  const switchBlocked = React.useMemo(() => {
    const map = {};
    for (const sw of graph.switches) {
      map[sw.nodeId] = isSwitchBlocked(graph, trains, sw.nodeId);
    }
    return map;
  }, [graph, trains]);

  const segmentsSvg = React.useMemo(() => (
    graph.segments.map(s => {
      const a = getNode(graph, s.from);
      const b = getNode(graph, s.to);
      if (!a || !b) return null;
      const sw = graph.switches.find(w => w.defaultSegment === s.id || w.divergingSegment === s.id);
      let stroke = '#10b981';
      if (sw) stroke = sw.activeSegment === s.id ? '#22c55e' : '#525252';
      const curve = getCurve(graph, s.id);
      if (curve) {
        const cps = computeCurveControlPoints(graph, s.id, curve.strength);
        if (cps) {
          const d = `M ${a.x},${a.y} C ${cps.cp1.x},${cps.cp1.y} ${cps.cp2.x},${cps.cp2.y} ${b.x},${b.y}`;
          return (
            <path key={s.id} d={d} stroke={stroke} strokeWidth={4} fill="none" strokeLinecap="round" />
          );
        }
      }
      return (
        <line key={s.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={stroke} strokeWidth={4} strokeLinecap="round" />
      );
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [graph, switchVersion]);

  const entryBases = React.useMemo(() => (
    graph.entryPoints.map(ep => {
      const node = getNode(graph, ep.nodeId);
      if (!node) return null;
      return (
        <g key={ep.id}>
          <circle cx={node.x} cy={node.y} r={6} fill="#f59e0b" stroke="#000" strokeWidth={2} />
          <text x={node.x + 10} y={node.y - 10} fill="#fde68a" fontSize="12">{ep.label}</text>
        </g>
      );
    })
  ), [graph]);

  const entryHighlights = React.useMemo(() => (
    graph.entryPoints.map(ep => {
      const node = getNode(graph, ep.nodeId);
      if (!node) return null;
      const isExitTarget = trains.some(t => t.exitEntryId === ep.id && !t.isExiting);
      const isDeparting = trains.some(t => t.exitEntryId === ep.id && t.isExiting);
      if (!isExitTarget && !isDeparting) return null;
      return (
        <circle key={`hl-${ep.id}`} cx={node.x} cy={node.y} r={10}
                fill="none"
                stroke={isDeparting ? '#f59e0b' : '#38bdf8'}
                strokeWidth={2}
                strokeDasharray={isDeparting ? undefined : '3 3'} />
      );
    })
  ), [graph, trains]);

  return (
    <svg
      width={imgSize.w} height={imgSize.h}
      viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
      className="absolute top-0 left-0 pointer-events-none"
    >
      {segmentsSvg}
      {graph.switches.map(sw => {
        const node = getNode(graph, sw.nodeId);
        if (!node) return null;
        const blocked = switchBlocked[sw.nodeId];
        return (
          <g key={sw.id} className="pointer-events-auto" style={{ cursor: 'pointer' }}
             onClick={() => onSwitchClick(sw.nodeId)}>
            <circle cx={node.x} cy={node.y} r={SWITCH_HITBOX_RADIUS}
                    fill={blocked ? 'rgba(220,38,38,0.4)' : 'rgba(167,139,250,0.4)'}
                    stroke={blocked ? '#ef4444' : '#a78bfa'} strokeWidth={2} />
          </g>
        );
      })}
      {entryBases}
      {entryHighlights}
      {trains.map(t => (
        <TrainRender
          key={t.id}
          graph={graph}
          train={t}
          isActive={t.id === activeTrainId}
          selection={selection.filter(s => s.trainId === t.id)}
          onUnitClick={(idx) => onUnitClick(t.id, idx)}
        />
      ))}
    </svg>
  );
}

function unitOpacity(train, unitIndex) {
  // centerDist: distance along the path from path-start to this unit's center.
  let cumulative = 0;
  for (let i = 0; i < unitIndex; i++) cumulative += train.units[i].length;
  const u = train.units[unitIndex];
  const cumFromHead = cumulative + u.length / 2;
  const centerDist = train.headPos - cumFromHead;

  if (train.isExiting) {
    if (train.exitDir > 0) {
      // Forward exit: unit fades as it goes past exitAnchor.
      const excess = centerDist - train.exitAnchor;
      if (excess > 0) return Math.max(0, 1 - excess / u.length);
    } else {
      // Reverse exit: unit fades as centerDist drops below 0 (exitAnchor = 0).
      if (centerDist < 0) return Math.max(0, 1 + centerDist / u.length);
    }
    return 1;
  }

  // Spawn fade: unit center is still off-path behind entry (centerDist < 0).
  if (centerDist < 0) return Math.max(0, 1 + centerDist / u.length);
  return 1;
}

function TrainRender({ graph, train, isActive, selection, onUnitClick }) {
  const positions = unitWorldPositions(graph, train);
  return (
    <g>
      {positions.map((p, i) => {
        const u = train.units[i];
        const def = u.kind === 'loco' ? LOCO_TYPES[u.typeId] : WAGON_TYPES[u.typeId];
        const isLoco = u.kind === 'loco';
        const isSelected = selection.some(s => s.unitIndex === i);
        const isActiveLoco = isActive && i === train.activeLocoIndex;
        const w = UNIT_LENGTH - 2;
        const h = UNIT_WIDTH;
        const opacity = unitOpacity(train, i);
        const transform = `translate(${p.x},${p.y}) rotate(${(p.angle * 180) / Math.PI})`;
        return (
          <g key={i} transform={transform} opacity={opacity}
             className={train.isExiting ? undefined : 'pointer-events-auto'}
             onClick={train.isExiting ? undefined : (e) => { e.stopPropagation(); onUnitClick(i); }}
             style={train.isExiting ? undefined : { cursor: 'pointer' }}>
            <rect x={-w/2} y={-h/2} width={w} height={h}
                  fill={def.color}
                  stroke={isSelected ? '#fbbf24' : isActiveLoco ? '#22d3ee' : '#000'}
                  strokeWidth={isSelected || isActiveLoco ? 2.5 : 1} />
            {isLoco && Array.from({ length: def.dots }).map((_, k) => (
              <circle key={k}
                      cx={-w/2 + 6 + k * 5}
                      cy={0}
                      r={1.6}
                      fill={def.textColor} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
