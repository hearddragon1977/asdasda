/** Walkable extents of the loaded city. AI clamps against this after the map is measured. */
export const mapBounds = {
  minX: -42.5,
  maxX: 42.5,
  minZ: -42.5,
  maxZ: 42.5,
};

export function clampToMap(pos: { x: number; z: number }): void {
  pos.x = Math.min(mapBounds.maxX, Math.max(mapBounds.minX, pos.x));
  pos.z = Math.min(mapBounds.maxZ, Math.max(mapBounds.minZ, pos.z));
}
