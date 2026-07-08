import React, { useState } from 'react';
import { Map, Train, Play, ArrowLeft } from 'lucide-react';
import MapEditor from './components/editor/MapEditor.jsx';
import ConsistBuilder from './components/consist/ConsistBuilder.jsx';
import PlayMode from './components/game/PlayMode.jsx';

export default function App() {
  const [mode, setMode] = useState('menu'); // 'menu' | 'editor' | 'consist' | 'play'

  const back = () => setMode('menu');

  return (
    <div className="w-full h-full flex flex-col bg-neutral-900 text-neutral-100">
      {mode !== 'menu' && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-800 bg-neutral-950">
          <button onClick={back} className="flex items-center gap-1 text-sm text-neutral-300 hover:text-white">
            <ArrowLeft size={16} /> Menu
          </button>
          <div className="text-sm text-neutral-500">/ {mode}</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        {mode === 'menu' && <MainMenu onSelect={setMode} />}
        {mode === 'editor' && <MapEditor />}
        {mode === 'consist' && <ConsistBuilder />}
        {mode === 'play' && <PlayMode />}
      </div>
    </div>
  );
}

function MainMenu({ onSelect }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-8">
      <h1 className="text-4xl font-bold tracking-wide">Railroad Shunting Simulator</h1>
      <div className="flex gap-4">
        <MenuButton icon={<Map size={28} />} label="Create Map" onClick={() => onSelect('editor')} />
        <MenuButton icon={<Train size={28} />} label="Create Consist" onClick={() => onSelect('consist')} />
        <MenuButton icon={<Play size={28} />} label="Play Map" onClick={() => onSelect('play')} />
      </div>
    </div>
  );
}

function MenuButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-48 h-40 flex flex-col items-center justify-center gap-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition"
    >
      {icon}
      <span className="text-lg font-medium">{label}</span>
    </button>
  );
}
