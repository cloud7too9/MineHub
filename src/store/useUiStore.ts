import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BLOCK_LISTE, istBlockTyp, migriereTyp, type BlockTyp } from '../utils/bloecke';
import { toKey } from '../utils/coordinates';

// UI-Store: Editier- und App-Zustand, getrennt vom serialisierbaren Welt-Store.
// detail, hotbar und auswahl werden geräteweit persistiert (localStorage) —
// sliceY ist bewusst Session-Zustand und startet immer mit "aus".

export type Modus = 'bauen' | 'abbauen' | 'markieren';
export type Detail = 'hoch' | 'minimal';
export type Ansicht = '3d' | '2d';
export type MarkierArt = 'box' | 'frei';
export type Zelle = [number, number, number];

export const HOTBAR_MIN = 2;
export const HOTBAR_MAX = 10;
const STANDARD_HOTBAR: BlockTyp[] = [
  'grass_block', 'dirt', 'stone', 'cobblestone', 'oak_planks', 'sand', 'brick_block', 'glass',
];

interface UiState {
  /** Aktiver Block-Typ zum Bauen */
  auswahl: BlockTyp;
  /** Aktives Werkzeug — auf Touch der Ersatz für den Rechtsklick */
  modus: Modus;
  /** Zielzelle unter dem Cursor (Platzierungs-/Abbau-Vorschau) */
  hover: [number, number, number] | null;
  /** Darstellung: 'hoch' = Texturen, 'minimal' = flache Farben */
  detail: Detail;
  /** Stilisierter Shader (Rim-Licht + Höhenverlauf) auf den Block-Materialien */
  shader: boolean;
  /** Zähler, der nach Pack-Import/-Entfernung Meshes neue Materialien ziehen lässt */
  texturenVersion: number;
  /** Aktive Blöcke in der Bottombar (HOTBAR_MIN–HOTBAR_MAX, keine leeren Slots) */
  hotbar: BlockTyp[];
  /** Layer-Slice: nur Ebenen bis einschließlich Y anzeigen — null = aus */
  sliceY: number | null;
  /** Kamera-Modus: 3D-Orbit oder 2D-Draufsicht (orthografisch) */
  ansicht: Ansicht;
  /** Markier-Werkzeug: 'box' = zwei Ecken spannen einen Quader, 'frei' = Zellen malen */
  markierArt: MarkierArt;
  markierung: { anker: Zelle | null; ende: Zelle | null };
  /** Freihand-Markierung: gemalte Zellen (Key-Set) */
  freiZellen: Record<string, true>;
  /** Aktiver Freihand-Strich — pointerId verhindert Streu-Zellen bei Multi-Touch */
  strich: { pointerId: number; letzte: Zelle } | null;
  sidebarOffen: boolean;
  pickerOffen: boolean;

  setAuswahl: (typ: BlockTyp) => void;
  setModus: (modus: Modus) => void;
  setHover: (pos: [number, number, number] | null) => void;
  setDetail: (detail: Detail) => void;
  setShader: (shader: boolean) => void;
  bumpTexturenVersion: () => void;
  setSliceY: (y: number | null) => void;
  setAnsicht: (ansicht: Ansicht) => void;
  /** Erster Punkt = Anker, zweiter = Ende; danach beginnt der nächste Punkt neu */
  setzeMarkierPunkt: (pos: Zelle) => void;
  setMarkierArt: (art: MarkierArt) => void;
  starteStrich: (pointerId: number, pos: Zelle) => void;
  zieheStrich: (pointerId: number, pos: Zelle) => void;
  endeStrich: (pointerId: number) => void;
  resetMarkierung: () => void;
  toggleHotbar: (typ: BlockTyp) => void;
  setHotbarGroesse: (n: number) => void;
  tauscheSlots: (a: number, b: number) => void;
  belegeSlot: (index: number, typ: BlockTyp) => void;
  setSidebarOffen: (offen: boolean) => void;
  setPickerOffen: (offen: boolean) => void;
}

/** Persistierte Hotbar validieren — alte deutsche IDs migrieren, entfernte Typen raus, zu kurz → auffüllen. */
function sanitisiereHotbar(wert: unknown): BlockTyp[] {
  const liste = Array.isArray(wert)
    ? wert.filter((e): e is string => typeof e === 'string').map(migriereTyp).filter(istBlockTyp)
    : [];
  const eindeutig = [...new Set(liste)].slice(0, HOTBAR_MAX);
  if (eindeutig.length >= HOTBAR_MIN) return eindeutig;
  const nachschub = [...STANDARD_HOTBAR, ...BLOCK_LISTE].filter((t) => !eindeutig.includes(t));
  while (eindeutig.length < HOTBAR_MIN && nachschub.length > 0) {
    eindeutig.push(nachschub.shift() as BlockTyp);
  }
  return eindeutig;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      auswahl: 'stone',
      modus: 'bauen',
      hover: null,
      detail: 'hoch',
      shader: false,
      texturenVersion: 0,
      hotbar: [...STANDARD_HOTBAR],
      sliceY: null,
      ansicht: '3d',
      markierArt: 'box',
      markierung: { anker: null, ende: null },
      freiZellen: {},
      strich: null,
      sidebarOffen: false,
      pickerOffen: false,

      // Blockwahl wechselt automatisch zurück ins Bauen
      setAuswahl: (typ) => set({ auswahl: typ, modus: 'bauen' }),
      setModus: (modus) =>
        set({
          modus,
          hover: null,
          markierung: { anker: null, ende: null },
          freiZellen: {},
          strich: null,
        }),
      setHover: (pos) => set({ hover: pos }),
      setDetail: (detail) => set({ detail }),
      setShader: (shader) => set({ shader }),
      bumpTexturenVersion: () => set((s) => ({ texturenVersion: s.texturenVersion + 1 })),
      setSliceY: (sliceY) => set({ sliceY, hover: null }),
      setAnsicht: (ansicht) => set({ ansicht }),

      setzeMarkierPunkt: (pos) =>
        set((s) => {
          const { anker, ende } = s.markierung;
          if (anker === null || ende !== null) {
            return { markierung: { anker: pos, ende: null } };
          }
          return { markierung: { anker, ende: pos } };
        }),

      // Art-Wechsel verwirft beide Auswahlen — kein versteckter Zustand
      setMarkierArt: (markierArt) =>
        set({
          markierArt,
          markierung: { anker: null, ende: null },
          freiZellen: {},
          strich: null,
        }),

      starteStrich: (pointerId, pos) =>
        set((s) => ({
          strich: { pointerId, letzte: pos },
          freiZellen: { ...s.freiZellen, [toKey(pos[0], pos[1], pos[2])]: true },
        })),

      // Zwischen zwei Move-Events interpolieren — schnelle Striche reißen sonst Lücken
      zieheStrich: (pointerId, pos) =>
        set((s) => {
          if (!s.strich || s.strich.pointerId !== pointerId) return s;
          const l = s.strich.letzte;
          if (l[0] === pos[0] && l[1] === pos[1] && l[2] === pos[2]) return s;
          const freiZellen = { ...s.freiZellen };
          const schritte = Math.max(
            Math.abs(pos[0] - l[0]),
            Math.abs(pos[1] - l[1]),
            Math.abs(pos[2] - l[2])
          );
          for (let i = 1; i <= schritte; i++) {
            const f = i / schritte;
            freiZellen[
              toKey(
                Math.round(l[0] + (pos[0] - l[0]) * f),
                Math.round(l[1] + (pos[1] - l[1]) * f),
                Math.round(l[2] + (pos[2] - l[2]) * f)
              )
            ] = true;
          }
          return { freiZellen, strich: { pointerId, letzte: pos } };
        }),

      endeStrich: (pointerId) =>
        set((s) => (s.strich && s.strich.pointerId === pointerId ? { strich: null } : s)),

      resetMarkierung: () =>
        set({ markierung: { anker: null, ende: null }, freiZellen: {}, strich: null }),

      // Aktiven Block antippen entfernt ihn (bis MIN), inaktiven fügt hinzu (bis MAX)
      toggleHotbar: (typ) =>
        set((s) => {
          if (s.hotbar.includes(typ)) {
            if (s.hotbar.length <= HOTBAR_MIN) return s;
            const hotbar = s.hotbar.filter((t) => t !== typ);
            // Fällt der aktive Block raus, rückt der erste Slot nach
            return { hotbar, auswahl: s.auswahl === typ ? hotbar[0] : s.auswahl };
          }
          if (s.hotbar.length >= HOTBAR_MAX) return s;
          return { hotbar: [...s.hotbar, typ] };
        }),

      // Vergrößern füllt mit ungenutzten Registry-Blöcken auf, Verkleinern kappt hinten
      setHotbarGroesse: (n) =>
        set((s) => {
          const ziel = Math.max(HOTBAR_MIN, Math.min(HOTBAR_MAX, Math.round(n)));
          if (ziel === s.hotbar.length) return s;
          if (ziel < s.hotbar.length) {
            const hotbar = s.hotbar.slice(0, ziel);
            return { hotbar, auswahl: hotbar.includes(s.auswahl) ? s.auswahl : hotbar[0] };
          }
          const frei = BLOCK_LISTE.filter((t) => !s.hotbar.includes(t));
          return { hotbar: [...s.hotbar, ...frei.slice(0, ziel - s.hotbar.length)] };
        }),

      tauscheSlots: (a, b) =>
        set((s) => {
          if (a === b || s.hotbar[a] === undefined || s.hotbar[b] === undefined) return s;
          const hotbar = [...s.hotbar];
          [hotbar[a], hotbar[b]] = [hotbar[b], hotbar[a]];
          return { hotbar };
        }),

      // Slot gezielt belegen — ist der Block schon woanders, wird getauscht (Eindeutigkeit)
      belegeSlot: (index, typ) =>
        set((s) => {
          if (index < 0 || index >= s.hotbar.length || s.hotbar[index] === typ) return s;
          const hotbar = [...s.hotbar];
          const woanders = hotbar.indexOf(typ);
          if (woanders >= 0) {
            [hotbar[index], hotbar[woanders]] = [hotbar[woanders], hotbar[index]];
          } else {
            hotbar[index] = typ;
          }
          return { hotbar, auswahl: hotbar.includes(s.auswahl) ? s.auswahl : typ };
        }),

      setSidebarOffen: (sidebarOffen) => set({ sidebarOffen }),
      setPickerOffen: (pickerOffen) => set({ pickerOffen }),
    }),
    {
      name: 'voxel-editor-ui',
      version: 1,
      partialize: (s) => ({
        detail: s.detail,
        shader: s.shader,
        hotbar: s.hotbar,
        auswahl: s.auswahl,
        ansicht: s.ansicht,
      }),
      // Persistierte Daten defensiv zusammenführen — Registry kann sich geändert haben
      merge: (persistiert, aktuell) => {
        const p = (persistiert ?? {}) as Partial<
          Pick<UiState, 'detail' | 'shader' | 'hotbar' | 'auswahl' | 'ansicht'>
        >;
        const hotbar = sanitisiereHotbar(p.hotbar);
        const migriert = typeof p.auswahl === 'string' ? migriereTyp(p.auswahl) : '';
        const auswahl = istBlockTyp(migriert) ? migriert : hotbar[0];
        const detail: Detail = p.detail === 'minimal' ? 'minimal' : 'hoch';
        const ansicht: Ansicht = p.ansicht === '2d' ? '2d' : '3d';
        return { ...aktuell, hotbar, auswahl, detail, ansicht, shader: p.shader === true };
      },
    }
  )
);
