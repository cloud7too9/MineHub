import { create } from 'zustand';
import { toKey, type Position } from '../utils/coordinates';
import type { BlockTyp } from '../utils/bloecke';

// Welt-Store: serialisierbare Build-Daten + Undo/Redo-Historie.
// Historie ist Session-Zustand pro Build (Build-Wechsel leert sie) und wird
// nicht persistiert — buildSpeicher liest ausschließlich `bloecke`.

export const MAX_BLOECKE = 10_000;
const MAX_HISTORIE = 50;

/** Ein Batch von Zell-Änderungen: Wert null = Zelle leeren */
export type ZellAenderungen = Record<string, BlockTyp | null>;

/** Ein Undo-Schritt: inverse (vorher) und vorwärts gerichtete (nachher) Änderungen */
interface WeltSchritt {
  vorher: ZellAenderungen;
  nachher: ZellAenderungen;
}

interface WorldState {
  /** Welt-Daten: Koordinaten-Key → Block-Typ. O(1) für Suchen/Löschen. */
  bloecke: Record<Position, BlockTyp>;
  vergangenheit: WeltSchritt[];
  zukunft: WeltSchritt[];

  /**
   * Zentrale Mutation: berechnet den Diff, respektiert das Block-Limit und
   * schreibt einen Undo-Schritt. Einzelklick wie Batch-Werkzeuge laufen hier durch —
   * ein Schritt = ein Undo, egal ob 1 oder 1000 Zellen.
   */
  setzeBloecke: (aenderungen: ZellAenderungen) => void;
  addBlock: (x: number, y: number, z: number, typ: BlockTyp) => void;
  removeBlock: (x: number, y: number, z: number) => void;
  clearWelt: () => void;
  /** Ersetzt die komplette Welt (Build-Wechsel) — ohne Historie, Historie wird geleert */
  ladeBloecke: (bloecke: Record<Position, BlockTyp>) => void;
  undo: () => void;
  redo: () => void;
}

function anwenden(
  bloecke: Record<Position, BlockTyp>,
  aenderungen: ZellAenderungen
): Record<Position, BlockTyp> {
  const neu: Record<string, BlockTyp> = { ...bloecke };
  for (const [key, typ] of Object.entries(aenderungen)) {
    if (typ === null) delete neu[key];
    else neu[key] = typ;
  }
  return neu;
}

export const useStore = create<WorldState>((set, get) => ({
  // Standalone: startet leer, alle Daten leben ausschließlich im Browser
  bloecke: {},
  vergangenheit: [],
  zukunft: [],

  setzeBloecke: (aenderungen) =>
    set((s) => {
      const vorher: ZellAenderungen = {};
      const nachher: ZellAenderungen = {};
      const bloecke: Record<string, BlockTyp> = { ...s.bloecke };
      let anzahl = Object.keys(s.bloecke).length;

      for (const [key, typ] of Object.entries(aenderungen)) {
        const alt = bloecke[key] ?? null;
        if (alt === typ) continue;
        if (typ === null) {
          delete bloecke[key];
          anzahl--;
        } else {
          if (alt === null) {
            if (anzahl >= MAX_BLOECKE) continue; // Limit: überschüssige Zellen still auslassen
            anzahl++;
          }
          bloecke[key] = typ;
        }
        vorher[key] = alt;
        nachher[key] = typ;
      }

      if (Object.keys(nachher).length === 0) return s;
      const vergangenheit = [...s.vergangenheit, { vorher, nachher }].slice(-MAX_HISTORIE);
      // Neue Änderung invalidiert den Redo-Zweig
      return { bloecke: bloecke as Record<Position, BlockTyp>, vergangenheit, zukunft: [] };
    }),

  addBlock: (x, y, z, typ) => {
    if (y < 0) return; // Nicht unter dem Boden bauen
    const key = toKey(x, y, z);
    if (get().bloecke[key]) return; // Bau-Klick überschreibt keine belegte Zelle
    get().setzeBloecke({ [key]: typ });
  },

  removeBlock: (x, y, z) => {
    get().setzeBloecke({ [toKey(x, y, z)]: null });
  },

  // Über die Batch-API — damit ist auch "Welt leeren" mit einem Undo umkehrbar
  clearWelt: () => {
    const alles: ZellAenderungen = {};
    for (const key of Object.keys(get().bloecke)) alles[key] = null;
    get().setzeBloecke(alles);
  },

  ladeBloecke: (bloecke) => set({ bloecke, vergangenheit: [], zukunft: [] }),

  undo: () =>
    set((s) => {
      const schritt = s.vergangenheit[s.vergangenheit.length - 1];
      if (!schritt) return s;
      return {
        bloecke: anwenden(s.bloecke, schritt.vorher),
        vergangenheit: s.vergangenheit.slice(0, -1),
        zukunft: [...s.zukunft, schritt],
      };
    }),

  redo: () =>
    set((s) => {
      const schritt = s.zukunft[s.zukunft.length - 1];
      if (!schritt) return s;
      return {
        bloecke: anwenden(s.bloecke, schritt.nachher),
        vergangenheit: [...s.vergangenheit, schritt],
        zukunft: s.zukunft.slice(0, -1),
      };
    }),
}));
