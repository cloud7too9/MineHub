// Voxel-Koordinaten als Key-String — O(1)-Zugriff im Welt-Objekt
export type Position = `${number},${number},${number}`;

export const toKey = (x: number, y: number, z: number): Position => `${x},${y},${z}`;

export function fromKey(key: Position): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}
