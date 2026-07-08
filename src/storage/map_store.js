// LocalStorage-based map package store.
import { SCHEMA_VERSION } from '../engine/rail_graph.js';

const KEY = 'trainz_maps_v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}
function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new Error('Недостаточно места в localStorage. Попробуйте уменьшить фоновое изображение или удалить старые карты.');
    }
    throw e;
  }
}

export function listMaps() {
  const all = readAll();
  return Object.values(all).map(m => ({ id: m.meta.id, name: m.meta.name, createdAt: m.meta.createdAt }));
}

export function loadMap(id) {
  const all = readAll();
  return all[id] || null;
}

export function saveMap({ id, name, background, railGraph, imgSize }) {
  const all = readAll();
  const meta = {
    id: id || `map_${Date.now()}`,
    name: name || 'Untitled Map',
    createdAt: Date.now(),
    schemaVersion: SCHEMA_VERSION
  };
  all[meta.id] = { meta, background, railGraph, imgSize };
  writeAll(all);
  return meta.id;
}

export function deleteMap(id) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}
