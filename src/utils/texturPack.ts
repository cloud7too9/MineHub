import { unzipSync } from 'fflate';
import { get, set, del, keys, delMany, setMany } from 'idb-keyval';

// Texture-Pack-Import: ZIP → PNGs extrahieren → IndexedDB. Alles bleibt lokal
// im Browser — nichts wird hochgeladen, nichts landet im Repo oder Deployment.
// Dadurch sind auch Original-Minecraft-Texturen aus einer eigenen Installation
// unproblematisch nutzbar (privater Gebrauch auf dem eigenen Gerät).

export interface PackMeta {
  name: string;
  anzahl: number;
  importiert: number;
}

const META_KEY = 'texturpack:meta';
const PRAEFIX = 'textur:';
const MAX_DATEIEN = 4000;

/**
 * PNGs aus ZIP-Bytes ziehen, gekeyt auf den Basisnamen (klein, ohne .png).
 * Enthält das ZIP einen Block-Ordner (Java: textures/block/, Bedrock:
 * textures/blocks/), zählt nur der — sonst würden Items/GUI/Entities mitkommen.
 * Erste Fundstelle je Name gewinnt.
 */
export function extrahiereTexturen(bytes: Uint8Array): Map<string, Uint8Array> {
  const entpackt = unzipSync(bytes);
  const alle = Object.entries(entpackt).filter(
    ([pfad, daten]) => /\.png$/i.test(pfad) && daten.length > 0
  );
  const blockOrdner = alle.filter(([pfad]) => /(^|\/)blocks?\//i.test(pfad));
  const quelle = blockOrdner.length > 0 ? blockOrdner : alle;

  const map = new Map<string, Uint8Array>();
  for (const [pfad, daten] of quelle) {
    if (map.size >= MAX_DATEIEN) break;
    const name = (pfad.split('/').pop() ?? '').replace(/\.png$/i, '').toLowerCase();
    if (name && !map.has(name)) map.set(name, daten);
  }
  return map;
}

/** ZIP importieren; ersetzt ein evtl. vorhandenes Pack. */
export async function importiereZipPack(datei: File): Promise<PackMeta | { fehler: string }> {
  let map: Map<string, Uint8Array>;
  try {
    map = extrahiereTexturen(new Uint8Array(await datei.arrayBuffer()));
  } catch {
    return { fehler: 'ZIP konnte nicht gelesen werden (beschädigt oder kein ZIP).' };
  }
  if (map.size === 0) return { fehler: 'Keine PNG-Texturen im ZIP gefunden.' };

  await entfernePack();
  const eintraege: [string, Blob][] = [...map].map(([name, daten]) => [
    PRAEFIX + name,
    new Blob([daten as BlobPart], { type: 'image/png' }),
  ]);
  await setMany(eintraege);
  const meta: PackMeta = {
    name: datei.name.replace(/\.zip$/i, ''),
    anzahl: map.size,
    importiert: Date.now(),
  };
  await set(META_KEY, meta);
  return meta;
}

export async function entfernePack(): Promise<void> {
  const alle = await keys();
  const packKeys = alle.filter((k): k is string => typeof k === 'string' && k.startsWith(PRAEFIX));
  if (packKeys.length > 0) await delMany(packKeys);
  await del(META_KEY);
}

export async function holePackMeta(): Promise<PackMeta | null> {
  const roh = await get(META_KEY);
  return roh && typeof roh === 'object' ? (roh as PackMeta) : null;
}

/** Pack-Textur per Basisname (ohne .png, klein) — undefined wenn nicht im Pack. */
export async function holePackTextur(name: string): Promise<Blob | undefined> {
  return get(PRAEFIX + name);
}
