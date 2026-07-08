// Switch state and safety lock logic.
import { getSwitch, getNode } from './rail_graph.js';
import { unitWorldPositions } from './movement.js';

export const SWITCH_HITBOX_RADIUS = 14;

// Determine whether any unit of any train sits on top of the switch hitbox.
export function isSwitchBlocked(graph, trains, nodeId) {
  const node = getNode(graph, nodeId);
  if (!node) return false;
  for (const t of trains) {
    const positions = unitWorldPositions(graph, t);
    for (const p of positions) {
      const dx = p.x - node.x, dy = p.y - node.y;
      if (Math.hypot(dx, dy) < SWITCH_HITBOX_RADIUS + 8) return true;
    }
  }
  return false;
}

// Toggle a switch's active branch. Returns { ok, reason }.
export function toggleSwitch(graph, trains, nodeId) {
  const sw = getSwitch(graph, nodeId);
  if (!sw) return { ok: false, reason: 'No switch at node' };
  if (isSwitchBlocked(graph, trains, nodeId)) {
    return { ok: false, reason: 'Train on switch' };
  }
  sw.activeSegment = (sw.activeSegment === sw.defaultSegment)
    ? sw.divergingSegment
    : sw.defaultSegment;
  return { ok: true };
}
