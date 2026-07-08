import React, { useMemo, useState } from 'react';
import { Plus, Save, FolderOpen, Trash2, X } from 'lucide-react';
import { LOCO_LIST, LOCO_TYPES } from '../../assets/loco_types.js';
import { WAGON_LIST, WAGON_TYPES } from '../../assets/wagon_types.js';
import { listConsists, loadConsist, saveConsist, deleteConsist } from '../../storage/consist_store.js';

const MAX_LOCOS = 5;
const MAX_WAGONS = 100;

export default function ConsistBuilder() {
  const [units, setUnits] = useState([]); // [{ kind:'loco'|'wagon', typeId }]
  const [pickKind, setPickKind] = useState('loco');
  const [pickType, setPickType] = useState('sd40');
  const [count, setCount] = useState(1);
  const [name, setName] = useState('');
  const [editId, setEditId] = useState(null);
  const [list, setList] = useState(listConsists());

  const refresh = () => setList(listConsists());

  const stats = useMemo(() => {
    const locos = units.filter(u => u.kind === 'loco').length;
    const wagons = units.filter(u => u.kind === 'wagon').length;
    return { locos, wagons, total: locos + wagons };
  }, [units]);

  const autoName = useMemo(() => {
    // Group consecutive same-type units → "3_AC4400_10hopper_5tank"
    const groups = [];
    for (const u of units) {
      const last = groups[groups.length - 1];
      if (last && last.kind === u.kind && last.typeId === u.typeId) last.count++;
      else groups.push({ kind: u.kind, typeId: u.typeId, count: 1 });
    }
    return groups.map(g => {
      const label = g.kind === 'loco' ? LOCO_TYPES[g.typeId].label.replace(/[^A-Za-z0-9]/g, '') : g.typeId;
      return `${g.count}_${label}`;
    }).join('_') || 'empty';
  }, [units]);

  function addUnits() {
    const toAdd = Array.from({ length: Math.max(1, count) }, () => ({ kind: pickKind, typeId: pickType }));
    const next = [...units, ...toAdd];
    const locos = next.filter(u => u.kind === 'loco').length;
    const wagons = next.filter(u => u.kind === 'wagon').length;
    if (locos > MAX_LOCOS) return alert(`Max ${MAX_LOCOS} locomotives`);
    if (wagons > MAX_WAGONS) return alert(`Max ${MAX_WAGONS} wagons`);
    setUnits(next);
  }

  function removeAt(i) {
    setUnits(units.filter((_, idx) => idx !== i));
  }

  function clearAll() { setUnits([]); }

  function doSave() {
    if (units.length === 0) return alert('Empty consist');
    // Convert to grouped format expected by spec.
    const groups = [];
    for (const u of units) {
      const last = groups[groups.length - 1];
      if (last && last.type === (u.kind === 'loco' ? 'loco' : 'wagon') && (last.locoId || last.wagonId) === u.typeId) {
        last.count++;
      } else {
        groups.push(u.kind === 'loco'
          ? { type: 'loco', locoId: u.typeId, count: 1 }
          : { type: 'wagon', wagonId: u.typeId, count: 1 });
      }
    }
    const id = saveConsist({ id: editId, name: (name.trim() || autoName), units: groups });
    setEditId(id);
    refresh();
    alert('Consist saved.');
  }

  function doLoad(id) {
    const c = loadConsist(id);
    if (!c) return;
    const flat = [];
    for (const g of c.units) {
      for (let i = 0; i < g.count; i++) {
        if (g.type === 'loco') flat.push({ kind: 'loco', typeId: g.locoId });
        else flat.push({ kind: 'wagon', typeId: g.wagonId });
      }
    }
    setUnits(flat);
    setName(c.meta.name);
    setEditId(c.meta.id);
  }

  function doDelete(id) {
    if (!confirm('Delete consist?')) return;
    deleteConsist(id);
    if (editId === id) { setEditId(null); setUnits([]); setName(''); }
    refresh();
  }

  return (
    <div className="w-full h-full flex">
      {/* Side panel */}
      <div className="w-72 border-r border-neutral-800 bg-neutral-950 p-3 flex flex-col gap-4 overflow-y-auto">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Add Units</div>
          <div className="flex gap-2 mb-2">
            <button onClick={() => { setPickKind('loco'); setPickType('sd40'); }}
                    className={`flex-1 px-2 py-1 rounded text-xs ${pickKind === 'loco' ? 'bg-emerald-700' : 'bg-neutral-800'}`}>Loco</button>
            <button onClick={() => { setPickKind('wagon'); setPickType('hopper'); }}
                    className={`flex-1 px-2 py-1 rounded text-xs ${pickKind === 'wagon' ? 'bg-emerald-700' : 'bg-neutral-800'}`}>Wagon</button>
          </div>
          <select value={pickType} onChange={e => setPickType(e.target.value)}
                  className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2">
            {(pickKind === 'loco' ? LOCO_LIST : WAGON_LIST).map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <div className="flex gap-2 mb-2">
            <input type="number" min={1} value={count} onChange={e => setCount(parseInt(e.target.value) || 1)}
                   className="w-20 px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm" />
            <button onClick={addUnits}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
              <Plus size={14} /> Add
            </button>
          </div>
          <button onClick={clearAll}
                  className="w-full px-2 py-1 bg-red-800 hover:bg-red-700 rounded text-xs">Clear All</button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Consist</div>
          <input value={name} onChange={e => setName(e.target.value)}
                 placeholder={autoName}
                 className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2" />
          <div className="text-xs text-neutral-400 mb-2">
            Locos: {stats.locos}/{MAX_LOCOS} · Wagons: {stats.wagons}/{MAX_WAGONS}
          </div>
          <button onClick={doSave}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-sm">
            <Save size={14} /> {editId ? 'Update' : 'Save'} Consist
          </button>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Saved Consists</div>
          <div className="flex flex-col gap-1">
            {list.length === 0 && <div className="text-xs text-neutral-600">None yet</div>}
            {list.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-xs bg-neutral-900 p-2 rounded border border-neutral-800">
                <span className="truncate">{c.name}</span>
                <div className="flex gap-1">
                  <button onClick={() => doLoad(c.id)} className="p-1 hover:text-emerald-400" title="Load">
                    <FolderOpen size={12} />
                  </button>
                  <button onClick={() => doDelete(c.id)} className="p-1 hover:text-red-400" title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visualization */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 py-2 border-b border-neutral-800 text-sm text-neutral-400">
          Head <span className="text-neutral-200">(LEFT)</span> ─── Tail <span className="text-neutral-200">(RIGHT)</span>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 bg-neutral-800">
          <div className="flex items-center gap-1 h-full min-h-[120px]">
            {units.length === 0 && <div className="text-neutral-500">Empty consist — add units from the panel</div>}
            {units.map((u, i) => <UnitCard key={i} unit={u} index={i} onRemove={() => removeAt(i)} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function UnitCard({ unit, index, onRemove }) {
  const isLoco = unit.kind === 'loco';
  const def = isLoco ? LOCO_TYPES[unit.typeId] : WAGON_TYPES[unit.typeId];
  return (
    <div className="relative group" title={def.label}>
      <div
        className="flex items-center justify-center rounded border-2 border-neutral-900 shadow"
        style={{
          width: isLoco ? 90 : 70,
          height: 50,
          background: def.color,
          color: def.textColor
        }}
      >
        {isLoco ? (
          <div className="flex gap-1">
            {Array.from({ length: def.dots }).map((_, k) => (
              <span key={k} className="w-2 h-2 rounded-full" style={{ background: def.textColor }} />
            ))}
          </div>
        ) : (
          <span className="text-[10px] font-bold uppercase">{unit.typeId}</span>
        )}
      </div>
      <button onClick={onRemove}
              className="absolute -top-2 -right-2 hidden group-hover:flex w-5 h-5 items-center justify-center bg-red-600 text-white rounded-full text-xs">
        <X size={10} />
      </button>
      <div className="text-[9px] text-neutral-500 text-center mt-1">{index + 1}</div>
    </div>
  );
}
