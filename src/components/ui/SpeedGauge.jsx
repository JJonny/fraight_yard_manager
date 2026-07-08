import React from 'react';

export default function SpeedGauge({ value }) {
  const positions = [-5,-4,-3,-2,-1,0,1,2,3,4,5];
  return (
    <div className="bg-neutral-900/90 border border-neutral-700 rounded-lg p-3 w-fit">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1 text-center">Throttle</div>
      <div className="flex items-center gap-1">
        {positions.map(p => {
          const active = p === value;
          const isZero = p === 0;
          const color = active
            ? (p > 0 ? 'bg-emerald-500' : p < 0 ? 'bg-amber-500' : 'bg-neutral-300')
            : isZero ? 'bg-neutral-600' : 'bg-neutral-800';
          return (
            <div key={p} className={`w-5 h-8 rounded ${color} flex items-center justify-center text-[10px] font-bold ${active ? 'text-black' : 'text-neutral-500'}`}>
              {p}
            </div>
          );
        })}
      </div>
    </div>
  );
}
