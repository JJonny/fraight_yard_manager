import React, { useEffect, useRef, useState } from 'react';
import { Upload, Save, FolderOpen, Trash2, Circle, GitBranch, LogIn, MousePointer2 } from 'lucide-react';
import { createEmptyGraph, nextId, getNode, getSegment, segmentsAt } from '../../engine/rail_graph.js';
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
  const [switchConfig, setSwitchConfig] = useState(null); // { nodeId, choosing:'default'|'diverging' }
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
      // Convert this node into a switch. Need >=3 segments connected.
      const segs = segmentsAt(graph, node.id);
      if (segs.length < 3) {
        alert('Switch nodes need at least 3 connected segments.');
        return;
      }
      // Choose default and diverging via prompts.
      const labels = segs.map((s, i) => `${i+1}: ${s.id}`).join('\n');
      const dIdx = parseInt(prompt(`Default branch (1-${segs.length}):\n${labels}`), 10);
      const vIdx = parseInt(prompt(`Diverging branch (1-${segs.length}):\n${labels}`), 10);
      if (!dIdx || !vIdx || dIdx === vIdx) return;
      const def = segs[dIdx - 1].id;
      const div = segs[vIdx - 1].id;
      setGraph(g => ({
        ...g,
        nodes: g.nodes.map(n => n.id === node.id ? { ...n, type: 'switch' } : n),
        switches: [
          ...g.switches.filter(s => s.nodeId !== node.id),
          { id: nextId('sw'), nodeId: node.id, defaultSegment: def, divergingSegment: div, activeSegment: def, isLocked: false }
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
      setSelected({ kind: 'node', id: node.id });
      setSelectedIds(new Set());
    }
  }

  function onSegmentClick(e, seg) {
    e.stopPropagation();
    if (tool === 'select') {
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(seg.id)) next.delete(seg.id);
          else next.add(seg.id);
          return next;
        });
      } else {
        setSelected({ kind: 'segment', id: seg.id });
        setSelectedIds(new Set());
      }
    }
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.kind === 'node') {
      setGraph(g => ({
        ...g,
        nodes: g.nodes.filter(n => n.id !== selected.id),
        segments: g.segments.filter(s => s.from !== selected.id && s.to !== selected.id),
        switches: g.switches.filter(s => s.nodeId !== selected.id),
        entryPoints: g.entryPoints.filter(ep => ep.nodeId !== selected.id)
      }));
    } else {
      setGraph(g => ({
        ...g,
        segments: g.segments.filter(s => s.id !== selected.id),
        switches: g.switches.filter(sw => sw.defaultSegment !== selected.id && sw.divergingSegment !== selected.id)
      }));
    }
    setSelected(null);
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
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0 relative bg-neutral-800 overflow-auto">
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
            style={{ cursor: tool === 'node' ? 'crosshair' : 'default' }}
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
              return (
                <g key={s.id} onClick={(e) => onSegmentClick(e, s)} style={{ cursor: 'pointer' }}>
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                          stroke={isSel || isMultiSel ? '#fbbf24' : '#10b981'} strokeWidth={4}
                          strokeLinecap="round" />
                  <text x={mx + ox} y={my + oy}
                        fill={isSel ? '#fbbf24' : '#86efac'}
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
              const fill = n.type === 'switch' ? '#a78bfa' : n.type === 'entry' ? '#f59e0b' : '#60a5fa';
              return (
                <g key={n.id}>
                  <circle cx={n.x} cy={n.y} r={isSel || isPending ? 9 : 6}
                          fill={fill} stroke={isSel ? '#fbbf24' : isPending ? '#fff' : '#0a0a0a'} strokeWidth={2}
                          onClick={(e) => onNodeClick(e, n)}
                          style={{ cursor: 'pointer' }} />
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
