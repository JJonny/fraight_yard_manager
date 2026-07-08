import React from 'react';
import { WAGON_LIST } from '../../assets/wagon_types.js';
import { LOCO_LIST } from '../../assets/loco_types.js';

export default function Legend() {
  return (
    <div className="bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 max-w-[260px]">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">Legend</div>
      <div className="text-[10px] text-neutral-400 mb-1">Wagons</div>
      <div className="flex flex-col gap-1 mb-2">
        {WAGON_LIST.map(w => (
          <div key={w.id} className="flex items-center gap-2 text-xs">
            <div className="w-5 h-4 rounded border border-neutral-700" style={{ background: w.color }} />
            <span>{w.label}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-neutral-400 mb-1">Locomotives</div>
      <div className="flex flex-col gap-1">
        {LOCO_LIST.map(l => (
          <div key={l.id} className="flex items-center gap-2 text-xs">
            <div className="w-7 h-4 rounded border border-neutral-700 flex items-center justify-center gap-0.5" style={{ background: l.color }}>
              {Array.from({ length: l.dots }).map((_, k) => (
                <span key={k} className="w-1 h-1 rounded-full" style={{ background: l.textColor }} />
              ))}
            </div>
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
