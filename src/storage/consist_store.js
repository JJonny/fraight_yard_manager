// LocalStorage-based consist package store.
import { SCHEMA_VERSION } from '../engine/rail_graph.js';

const KEY = 'trainz_consists_v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}
function writeAll(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

export function listConsists() {
  const all = readAll();
  return Object.values(all).map(c => ({ id: c.meta.id, name: c.meta.name, createdAt: c.meta.createdAt, units: c.units }));
}

export function loadConsist(id) {
  const all = readAll();
  return all[id] || null;
}

export function saveConsist({ id, name, units }) {
  const all = readAll();
  const meta = {
    id: id || `consist_${Date.now()}`,
    name: name || 'Untitled Consist',
    createdAt: Date.now(),
    schemaVersion: SCHEMA_VERSION
  };
  all[meta.id] = { meta, units };
  writeAll(all);
  return meta.id;
}

export function deleteConsist(id) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}
