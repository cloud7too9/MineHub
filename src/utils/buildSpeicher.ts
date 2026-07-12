import { get, set, del } from 'idb-keyval';
import { istBlockTyp, migriereTyp, type BlockTyp } from './bloecke';
import type { Position } from './coordinates';

// Persistenz-Schicht der Build-Verwaltung (IndexedDB via idb-keyval).
// Layout: 'builds:index' → BuildMeta[] (leichtgewichtig, für die Liste),
//         'builds:aktiv' → id,  'build:<id>' → Block-Record (nur bei Bedarf geladen).

export interface BuildMeta {
  id: string;
  name: string;
  erstellt: number;
  geaendert: number;
  /** Denormalisierte Blockzahl — Liste anzeigen ohne Block-Daten zu laden */
  anzahl: number;
  /** Daten-URL (WebP/PNG, ~144px) der letzten Szenen-Ansicht */
  thumb?: string;
}

export interface BuildExport {
  format: 'voxel-editor-build';
  version: 1;
  name: string;
  bloecke: Record<Position, BlockTyp>;
}

const INDEX_KEY = 'builds:index';
const AKTIV_KEY = 'builds:aktiv';
const buildKey = (id: string) => `build:${id}`;

const KEY_MUSTER = /^-?\d+,-?\d+,-?\d+$/;

/** Unbekannte Daten (IndexedDB nach Registry-Änderung, JSON-Import) defensiv validieren. */
export function sanitisiereBloecke(wert: unknown, max: number): Record<Position, BlockTyp> {
  const ergebnis: Record<Position, BlockTyp> = {};
  if (typeof wert !== 'object' || wert === null) return ergebnis;
  let n = 0;
  for (const [key, roh] of Object.entries(wert)) {
    if (n >= max) break;
    // Alte deutsche Block-IDs (v0.1–v0.7) transparent auf Bedrock-IDs migrieren
    const typ = typeof roh === 'string' ? migriereTyp(roh) : roh;
    if (KEY_MUSTER.test(key) && istBlockTyp(typ)) {
      ergebnis[key as Position] = typ;
      n++;
    }
  }
  return ergebnis;
}

export async function ladeIndex(): Promise<BuildMeta[]> {
  const roh = await get(INDEX_KEY);
  return Array.isArray(roh) ? (roh as BuildMeta[]) : [];
}

export async function speichereIndex(metas: BuildMeta[]): Promise<void> {
  await set(INDEX_KEY, metas);
}

export async function ladeAktivId(): Promise<string | null> {
  const roh = await get(AKTIV_KEY);
  return typeof roh === 'string' ? roh : null;
}

export async function speichereAktivId(id: string): Promise<void> {
  await set(AKTIV_KEY, id);
}

export async function ladeBuildBloecke(id: string, max: number): Promise<Record<Position, BlockTyp>> {
  return sanitisiereBloecke(await get(buildKey(id)), max);
}

export async function speichereBuildBloecke(
  id: string,
  bloecke: Record<Position, BlockTyp>
): Promise<void> {
  await set(buildKey(id), bloecke);
}

export async function loescheBuildBloecke(id: string): Promise<void> {
  await del(buildKey(id));
}
