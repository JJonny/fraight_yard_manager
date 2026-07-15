import React, { useRef, useState } from 'react';
import { Upload, Save, FolderOpen, Trash2, Circle, GitBranch, LogIn, MousePointer2 } from 'lucide-react';
import { createEmptyGraph, nextId, getNode, getSegment, segmentsAt, parallelizeSegments, findSwitchBranches, getCurve, computeCurveControlPoints, makeCurve, removeCurve, getSwitch } from '../../engine/rail_graph.js';
import { listMaps, loadMap, saveMap, deleteMap } from '../../storage/map_store.js';

// Compress a dataURL to JPEG, capping longest side at maxPx.
function compressImage(dataUrl, maxPx = 1920, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > maxPx || h > maxPx) {
        const scale = maxPx / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = dataUrl;
  });
}

const TOOLS = [
  { id: 'select',  label: 'Select',  icon: MousePointer2 },
  { id: 'node',    label: 'Node',    icon: Circle },
  { id: 'segment', label: 'Segment', icon: GitBranch },
  { id: 'switch',  label: 'Switch',  icon: GitBranch },
  { id: 'entry',   label: 'Entry',   icon: LogIn }
];

export default function MapEditor() {
  const [bgImage, setBgImage] = useState(null);   // dataURL
  const [imgSize, setImgSize] = useState({ w: 1024, h: 640 });
  const [graph, setGraph] = useState(createEmptyGraph());
  const [tool, setTool] = useState('node');
  const [pendingFromNode, setPendingFromNode] = useState(null);
  const [mapName, setMapName] = useState('');
  const [currentMapId, setCurrentMapId] = useState(null);
  const [mapList, setMapList] = useState(listMaps());
  const [selected, setSelected] = useState(null); // { kind:'node'|'segment', id }
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [parallelOffset, setParallelOffset] = useState(40);
  const [curveStrength, setCurveStrength] = useState(0.3);

  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [multiKind, setMultiKind] = useState(null); // 'node' | 'segment' | null — for Ctrl+click multi-select
  const fileRef = useRef(null);

  const refreshMapList = () => setMapList(listMaps());

  function onUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setBgImage(dataUrl);
      const img = new Image();
      img.onload = () => setImgSize({ w: img.width, h: img.height });
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  }

  function svgClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (imgSize.w / rect.width);
    const y = (e.clientY - rect.top) * (imgSize.h / rect.height);
    if (tool === 'node') {
      const n = { id: nextId('n'), x, y, type: 'node' };
      setGraph(g => ({ ...g, nodes: [...g.nodes, n] }));
    } else if (tool === 'select') {
      setSelected(null);
      setSelectedIds(new Set());
      setMultiKind(null);
    }
  }

  function onNodeClick(e, node) {
    e.stopPropagation();
    if (tool === 'segment') {
      if (!pendingFromNode) {
        setPendingFromNode(node.id);
      } else if (pendingFromNode !== node.id) {
        const seg = { id: nextId('s'), from: pendingFromNode, to: node.id };
        setGraph(g => ({ ...g, segments: [...g.segments, seg] }));
        setPendingFromNode(null);
      } else {
        setPendingFromNode(null);
      }
    } else if (tool === 'switch') {
      const segs = segmentsAt(graph, node.id);
      if (segs.length < 3) {
        alert('Switch nodes need at least 3 connected segments.');
        return;
      }
      const branches = findSwitchBranches(graph, node.id);
      if (!branches) return;
      setGraph(g => ({
        ...g,
        nodes: g.nodes.map(n => n.id === node.id ? { ...n, type: 'switch' } : n),
        switches: [
          ...g.switches.filter(s => s.nodeId !== node.id),
          { id: nextId('sw'), nodeId: node.id, defaultSegment: branches.defaultSegment, divergingSegment: branches.divergingSegment, activeSegment: branches.defaultSegment, isLocked: false }
        ]
      }));
    } else if (tool === 'entry') {
      const label = prompt('Entry point label (e.g. "Track 1"):', `Track ${graph.entryPoints.length + 1}`);
      if (!label) return;
      setGraph(g => ({
        ...g,
        nodes: g.nodes.map(n => n.id === node.id ? { ...n, type: 'entry' } : n),
        entryPoints: [
          ...g.entryPoints.filter(ep => ep.nodeId !== node.id),
          { id: nextId('ep'), label, nodeId: node.id }
        ]
      }));
    } else if (tool === 'select') {
      if (e.ctrlKey || e.metaKey) {
        if (multiKind === null || multiKind === 'node') {
          setMultiKind('node');
          setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(node.id)) next.delete(node.id);
            else next.add(node.id);
            return next;
          });
        }
      } else {
        setSelected({ kind: 'node', id: node.id });
        setSelectedIds(new Set());
        setMultiKind(null);
      }
    }
  }

  function onSegmentClick(e, seg) {
    e.stopPropagation();
    if (tool === 'select') {
      if (e.ctrlKey || e.metaKey) {
        if (multiKind === null || multiKind === 'segment') {
          setMultiKind('segment');
          setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(seg.id)) next.delete(seg.id);
            else next.add(seg.id);
            return next;
          });
        }
      } else {
        setSelected({ kind: 'segment', id: seg.id });
        setSelectedIds(new Set());
        setMultiKind(null);
      }
    }
  }

  function onNodePointerDown(e, node) {
    if (tool !== 'select' || e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();

    const svg = e.currentTarget.ownerSVGElement;
    svg.getBoundingClientRect();
    e.target.setPointerCapture(e.pointerId);

    const isNodeSelected = (selected?.kind === 'node' && selected.id === node.id) || selectedIds.has(node.id);
    let movingNodes;
    if (isNodeSelected) {
      const movingIds = new Set();
      if (selected?.kind === 'node') movingIds.add(selected.id);
      for (const id of selectedIds) movingIds.add(id);
      movingNodes = graph.nodes.filter(n => movingIds.has(n.id));
    } else {
      setSelected({ kind: 'node', id: node.id });
      setSelectedIds(new Set());
      setMultiKind(null);
      movingNodes = [{ id: node.id, x: node.x, y: node.y }];
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startNodes: movingNodes.map(n => ({ id: n.id, x: n.x, y: n.y })),
      startX: e.clientX,
      startY: e.clientY,
    };
    setIsDragging(true);
  }

  function svgPointerMove(e) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - drag.startX) * (imgSize.w / rect.width);
    const dy = (e.clientY - drag.startY) * (imgSize.h / rect.height);

    const startMap = {};
    for (const sn of drag.startNodes) startMap[sn.id] = sn;

    setGraph(g => ({
      ...g,
      nodes: g.nodes.map(n =>
        startMap[n.id]
          ? { ...n, x: startMap[n.id].x + dx, y: startMap[n.id].y + dy }
          : n
      ),
    }));
  }

  function svgPointerUp(e) {
    if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
  }

  function svgContextMenu(e) {
    e.preventDefault();
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.kind === 'node') {
      setGraph(g => {
        const remainingSegments = g.segments.filter(s => s.from !== selected.id && s.to !== selected.id);
        const remainingIds = new Set(remainingSegments.map(s => s.id));
        return {
          ...g,
          nodes: g.nodes.filter(n => n.id !== selected.id),
          segments: remainingSegments,
          switches: g.switches.filter(s => s.nodeId !== selected.id),
          entryPoints: g.entryPoints.filter(ep => ep.nodeId !== selected.id),
          curves: g.curves.filter(c => remainingIds.has(c.segmentId)),
        };
      });
    } else {
      setGraph(g => ({
        ...g,
        segments: g.segments.filter(s => s.id !== selected.id),
        switches: g.switches.filter(sw => sw.defaultSegment !== selected.id && sw.divergingSegment !== selected.id),
        curves: g.curves.filter(c => c.segmentId !== selected.id),
      }));
    }
    setSelected(null);
  }

  function applyParallelize() {
    if (selectedIds.size < 2) return;
    const ids = [...selectedIds];
    setGraph(g => parallelizeSegments(g, ids, parallelOffset));
    setSelectedIds(new Set());
    setSelected(null);
  }

  function isSegmentCurveable(graph, segmentId) {
    const seg = getSegment(graph, segmentId);
    if (!seg) return false;
    if (getSwitch(graph, seg.from) || getSwitch(graph, seg.to)) return false;
    const atFrom = segmentsAt(graph, seg.from, seg.id);
    const atTo = segmentsAt(graph, seg.to, seg.id);
    return atFrom.length === 1 && atTo.length === 1;
  }

  function applyCurveToggle() {
    if (!selected || selected.kind !== 'segment') return;
    const existing = getCurve(graph, selected.id);
    if (existing) {
      setGraph(g => removeCurve(g, selected.id));
    } else {
      setGraph(g => makeCurve(g, selected.id, curveStrength));
    }
  }

  async function doSave() {
    if (!bgImage) return alert('Upload a background image first.');
    if (!mapName.trim()) return alert('Enter a map name.');
    try {
      const compressed = await compressImage(bgImage, 1920, 0.75);
      const id = saveMap({ id: currentMapId, name: mapName.trim(), background: compressed, railGraph: graph, imgSize });
      setCurrentMapId(id);
      refreshMapList();
      alert('Map saved.');
    } catch (e) {
      alert('Ошибка сохранения: ' + e.message);
    }
  }

  function doLoad(id) {
    const m = loadMap(id);
    if (!m) return;
    setBgImage(m.background);
    setGraph(m.railGraph);
    setMapName(m.meta.name);
    setCurrentMapId(m.meta.id);
    if (m.imgSize) {
      // Use stored original size — image may be compressed to different dimensions.
      setImgSize(m.imgSize);
    } else {
      const img = new Image();
      img.onload = () => setImgSize({ w: img.width, h: img.height });
      img.src = m.background;
    }
  }

  function doDelete(id) {
    if (!confirm('Delete map?')) return;
    deleteMap(id);
    refreshMapList();
  }

  return (
    <div className="w-full h-full flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-neutral-800 bg-neutral-950 p-3 flex flex-col gap-4 overflow-y-auto">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Background</div>
          <button onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm">
            <Upload size={14} /> Upload Image
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Tool</div>
          <div className="grid grid-cols-2 gap-2">
            {TOOLS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id}
                  onClick={() => { setTool(t.id); setPendingFromNode(null); }}
                  className={`flex items-center gap-2 px-2 py-2 rounded text-sm border ${tool === t.id ? 'bg-emerald-700 border-emerald-500' : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'}`}>
                  <Icon size={14} /> {t.label}
                </button>
              );
            })}
          </div>
          {tool === 'segment' && (
            <div className="text-xs text-neutral-400 mt-2">
              {pendingFromNode ? 'Click second node' : 'Click first node'}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Selection</div>
          {selected ? (
            <div className="text-xs text-neutral-300">
              {selected.kind} <code>{selected.id}</code>
              <button onClick={deleteSelected}
                      className="mt-2 w-full flex items-center justify-center gap-2 px-2 py-1 bg-red-700 hover:bg-red-600 rounded text-xs">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          ) : <div className="text-xs text-neutral-500">Nothing selected</div>}
        </div>

        {selectedIds.size >= 2 && multiKind === 'segment' && (
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Parallelize</div>
            <div className="text-xs text-neutral-400 mb-1">
              Reference: <code className="text-neutral-300">{selectedIds.values().next().value}</code>
            </div>
            <div className="flex gap-2 mb-2">
              <input type="number" min="1" step="1"
                     value={parallelOffset}
                     onChange={e => setParallelOffset(Math.max(1, parseInt(e.target.value) || 1))}
                     className="w-24 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm"
                     placeholder="Offset px" />
              <span className="text-xs text-neutral-500 self-center">px</span>
            </div>
            <button onClick={applyParallelize}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
              Make Parallel
            </button>
          </div>
        )}

        {selected?.kind === 'segment' && isSegmentCurveable(graph, selected.id) && (
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Curve</div>
            {getCurve(graph, selected.id) ? (
              <div className="flex gap-2 mb-2">
                <input type="range" min="0.05" max="1" step="0.05"
                       value={curveStrength}
                       onChange={e => {
                         const v = parseFloat(e.target.value);
                         setCurveStrength(v);
                         setGraph(g => makeCurve(g, selected.id, v));
                       }}
                       className="w-full" />
                <span className="text-xs text-neutral-400 w-8 text-right">{curveStrength.toFixed(2)}</span>
              </div>
            ) : (
              <div className="flex gap-2 mb-2">
                <input type="range" min="0.05" max="1" step="0.05"
                       value={curveStrength}
                       onChange={e => setCurveStrength(parseFloat(e.target.value))}
                       className="w-full" />
                <span className="text-xs text-neutral-400 w-8 text-right">{curveStrength.toFixed(2)}</span>
              </div>
            )}
            <button onClick={applyCurveToggle}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
              {getCurve(graph, selected.id) ? 'Make Straight' : 'Make Curve'}
            </button>
          </div>
        )}

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Map Package</div>
          <input value={mapName} onChange={e => setMapName(e.target.value)}
                 placeholder="Map name"
                 className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2" />
          <button onClick={doSave}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
            <Save size={14} /> Save Map
          </button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Saved Maps</div>
          <div className="flex flex-col gap-1">
            {mapList.length === 0 && <div className="text-xs text-neutral-600">None yet</div>}
            {mapList.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-neutral-900 p-2 rounded border border-neutral-800">
                <span className="truncate">{m.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => doLoad(m.id)} className="p-1 hover:text-emerald-400" title="Load">
                    <FolderOpen size={12} />
                  </button>
                  <button onClick={() => doDelete(m.id)} className="p-1 hover:text-red-400" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-neutral-500 mt-auto">
          <div className="font-semibold text-neutral-400 mb-1">Stats</div>
          Nodes: {graph.nodes.length} · Segments: {graph.segments.length}<br/>
          Switches: {graph.switches.length} · Entries: {graph.entryPoints.length}
          {selectedIds.size > 0 && <> · Selected: {selectedIds.size}</>}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0 relative bg-neutral-800 overflow-auto overscroll-x-none">
        <div className="relative" style={{ width: imgSize.w, height: imgSize.h }}>
          {bgImage && <img src={bgImage} alt="bg" className="absolute inset-0 w-full h-full" draggable={false} />}
          {!bgImage && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500">
              Upload a background image to begin
            </div>
          )}
          <svg
            className="absolute inset-0"
            width={imgSize.w}
            height={imgSize.h}
            viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
            onClick={svgClick}
            onPointerMove={svgPointerMove}
            onPointerUp={svgPointerUp}
            onContextMenu={svgContextMenu}
            style={{ cursor: isDragging ? 'grabbing' : tool === 'node' ? 'crosshair' : 'default' }}
          >
            {/* Segments */}
            {graph.segments.map(s => {
              const a = getNode(graph, s.from);
              const b = getNode(graph, s.to);
              if (!a || !b) return null;
              const isSel = selected?.kind === 'segment' && selected.id === s.id;
              const isMultiSel = selectedIds.has(s.id);
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              // Perpendicular offset for label
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ox = (-dy / len) * 12;
              const oy = (dx / len) * 12;
  const stroke = isSel || isMultiSel ? '#fbbf24' : '#10b981';
  return (
    <g key={s.id} onClick={(e) => onSegmentClick(e, s)} style={{ cursor: 'pointer' }}>
      {(() => {
        const curve = getCurve(graph, s.id);
        if (curve) {
          const cps = computeCurveControlPoints(graph, s.id, curve.strength);
          if (cps) {
            const d = `M ${a.x},${a.y} C ${cps.cp1.x},${cps.cp1.y} ${cps.cp2.x},${cps.cp2.y} ${b.x},${b.y}`;
            return (
              <path d={d} stroke={stroke} strokeWidth={4} fill="none" strokeLinecap="round" />
            );
          }
        }
        return (
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={stroke} strokeWidth={4} strokeLinecap="round" />
        );
      })()}
      <text x={mx + ox} y={my + oy}
            fill={isSel || isMultiSel ? '#fbbf24' : '#86efac'}
            fontSize="11" textAnchor="middle" dominantBaseline="middle"
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
        {s.id}
      </text>
    </g>
  );
            })}
            {/* Nodes */}
            {graph.nodes.map(n => {
              const isSel = selected?.kind === 'node' && selected.id === n.id;
              const isPending = pendingFromNode === n.id;
              const fill = n.type === 'switch' ? '#1e3a8a' : n.type === 'entry' ? '#f59e0b' : '#60a5fa';
              return (
                <g key={n.id}>
                  <circle cx={n.x} cy={n.y} r={isSel || isPending ? 9 : 6}
                          fill={fill} stroke={isSel ? '#fbbf24' : isPending ? '#fff' : '#0a0a0a'} strokeWidth={2}
                          onClick={(e) => onNodeClick(e, n)}
                          onPointerDown={(e) => onNodePointerDown(e, n)}
                          style={{ cursor: tool === 'select' ? (isDragging ? 'grabbing' : 'grab') : 'pointer' }} />
                  {n.type === 'entry' && (
                    <text x={n.x + 10} y={n.y - 10} fill="#fde68a" fontSize="12">
                      {graph.entryPoints.find(ep => ep.nodeId === n.id)?.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
