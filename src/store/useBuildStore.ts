import { create } from 'zustand';
import { useStore, MAX_BLOECKE } from './useStore';
import { useUiStore } from './useUiStore';
import * as speicher from '../utils/buildSpeicher';
import type { BuildMeta, BuildExport } from '../utils/buildSpeicher';
import { erzeugeThumbnail } from '../utils/thumbnail';

// Build-Verwaltung: mehrere Builds in IndexedDB, Autosave debounced,
// Export/Import als JSON, Thumbnails der letzten Ansicht. Der Welt-Store bleibt
// die einzige Quelle der aktuellen Blöcke — dieser Store orchestriert nur.

const AUTOSAVE_MS = 600;
const THUMB_INTERVALL_MS = 10_000;

interface BuildState {
  bereit: boolean;
  builds: BuildMeta[];
  aktivId: string | null;

  init: () => Promise<void>;
  neuerBuild: () => Promise<void>;
  wechsleBuild: (id: string) => Promise<void>;
  loescheBuild: (id: string) => Promise<void>;
  benenneUm: (id: string, name: string) => Promise<void>;
  exportiereAktiv: () => void;
  /** Liefert null bei Erfolg, sonst eine Fehlermeldung für den Nutzer. */
  importiereDatei: (datei: File) => Promise<string | null>;
}

// Init-Guard — React StrictMode ruft Effekte im Dev-Modus doppelt auf
let initPromise: Promise<void> | null = null;
let speicherTimer: number | undefined;
let letztesThumb = 0;

function neueId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function neueMeta(name: string): BuildMeta {
  const jetzt = Date.now();
  return { id: neueId(), name, erstellt: jetzt, geaendert: jetzt, anzahl: 0 };
}

/** Slice ist Build-bezogener Sichtzustand — beim Build-Wechsel zurücksetzen. */
function resetSlice(): void {
  useUiStore.getState().setSliceY(null);
}

export const useBuildStore = create<BuildState>((set, get) => {
  /**
   * Aktuelle Welt sofort unter dem aktiven Build wegschreiben (+ Meta aktualisieren).
   * Thumbnails sind gedrosselt (alle 10 s), bei erzwungenen Saves (Wechsel,
   * Tab verlassen) immer frisch — nicht bei jedem 600-ms-Autosave rendern.
   */
  async function speichereAktiv(erzwingeThumb = false): Promise<void> {
    const { aktivId, builds } = get();
    if (!aktivId) return;
    const bloecke = useStore.getState().bloecke;

    let thumb: string | undefined;
    if (erzwingeThumb || Date.now() - letztesThumb > THUMB_INTERVALL_MS) {
      const t = erzeugeThumbnail();
      if (t) {
        thumb = t;
        letztesThumb = Date.now();
      }
    }

    await speicher.speichereBuildBloecke(aktivId, bloecke);
    const neu = builds.map((m) =>
      m.id === aktivId
        ? {
            ...m,
            geaendert: Date.now(),
            anzahl: Object.keys(bloecke).length,
            ...(thumb ? { thumb } : {}),
          }
        : m
    );
    set({ builds: neu });
    await speicher.speichereIndex(neu);
  }

  function planeSpeichern(): void {
    window.clearTimeout(speicherTimer);
    speicherTimer = window.setTimeout(() => void speichereAktiv(), AUTOSAVE_MS);
  }

  /** Ausstehendes Autosave sofort ausführen — vor jedem Build-Wechsel Pflicht. */
  async function flush(): Promise<void> {
    window.clearTimeout(speicherTimer);
    await speichereAktiv(true);
  }

  return {
    bereit: false,
    builds: [],
    aktivId: null,

    init: () => {
      if (!initPromise) {
        initPromise = (async () => {
          let builds = await speicher.ladeIndex();
          let aktivId = await speicher.ladeAktivId();

          // Erststart: leeren Standard-Build anlegen
          if (builds.length === 0) {
            const meta = neueMeta('Build 1');
            builds = [meta];
            aktivId = meta.id;
            await speicher.speichereBuildBloecke(meta.id, {});
            await speicher.speichereIndex(builds);
            await speicher.speichereAktivId(meta.id);
          }
          if (!aktivId || !builds.some((b) => b.id === aktivId)) {
            aktivId = builds[0].id;
            await speicher.speichereAktivId(aktivId);
          }

          const bloecke = await speicher.ladeBuildBloecke(aktivId, MAX_BLOECKE);
          set({ bereit: true, builds, aktivId });
          useStore.getState().ladeBloecke(bloecke);

          // Autosave: jede Welt-Änderung debounced persistieren
          useStore.subscribe((s, vorher) => {
            if (s.bloecke !== vorher.bloecke) planeSpeichern();
          });

          // Best effort beim Tab-Wechsel/Schließen — 600ms Debounce sonst verloren
          window.addEventListener('pagehide', () => void flush());
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') void flush();
          });
        })();
      }
      return initPromise;
    },

    neuerBuild: async () => {
      await flush();
      const meta = neueMeta(`Build ${get().builds.length + 1}`);
      const builds = [...get().builds, meta];
      await speicher.speichereBuildBloecke(meta.id, {});
      await speicher.speichereIndex(builds);
      await speicher.speichereAktivId(meta.id);
      // aktivId vor ladeBloecke setzen — das Autosave des Ladens zielt sonst auf den alten Build
      set({ builds, aktivId: meta.id });
      resetSlice();
      useStore.getState().ladeBloecke({});
    },

    wechsleBuild: async (id) => {
      if (id === get().aktivId || !get().builds.some((b) => b.id === id)) return;
      await flush();
      const bloecke = await speicher.ladeBuildBloecke(id, MAX_BLOECKE);
      await speicher.speichereAktivId(id);
      set({ aktivId: id });
      resetSlice();
      useStore.getState().ladeBloecke(bloecke);
    },

    loescheBuild: async (id) => {
      // Kein flush: Daten dieses Builds werden gerade verworfen. Timer trotzdem stoppen,
      // damit kein spätes Autosave den gelöschten Key wiederbelebt.
      window.clearTimeout(speicherTimer);
      const { builds, aktivId } = get();
      const rest = builds.filter((b) => b.id !== id);
      await speicher.loescheBuildBloecke(id);

      // Letzter Build gelöscht → frischer leerer Standard-Build
      if (rest.length === 0) {
        const meta = neueMeta('Build 1');
        await speicher.speichereBuildBloecke(meta.id, {});
        await speicher.speichereIndex([meta]);
        await speicher.speichereAktivId(meta.id);
        set({ builds: [meta], aktivId: meta.id });
        resetSlice();
        useStore.getState().ladeBloecke({});
        return;
      }

      await speicher.speichereIndex(rest);
      if (id === aktivId) {
        const neuAktiv = rest[0];
        const bloecke = await speicher.ladeBuildBloecke(neuAktiv.id, MAX_BLOECKE);
        await speicher.speichereAktivId(neuAktiv.id);
        set({ builds: rest, aktivId: neuAktiv.id });
        resetSlice();
        useStore.getState().ladeBloecke(bloecke);
      } else {
        set({ builds: rest });
      }
    },

    benenneUm: async (id, name) => {
      const n = name.trim();
      if (!n) return;
      const builds = get().builds.map((b) => (b.id === id ? { ...b, name: n } : b));
      set({ builds });
      await speicher.speichereIndex(builds);
    },

    exportiereAktiv: () => {
      const { aktivId, builds } = get();
      const meta = builds.find((b) => b.id === aktivId);
      if (!meta) return;
      const daten: BuildExport = {
        format: 'voxel-editor-build',
        version: 1,
        name: meta.name,
        bloecke: useStore.getState().bloecke,
      };
      const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${meta.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'build'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    importiereDatei: async (datei) => {
      try {
        const roh: unknown = JSON.parse(await datei.text());
        // Sowohl Export-Format als auch rohe Block-Records akzeptieren
        const huelle = roh as { bloecke?: unknown; name?: unknown };
        const quelle = huelle?.bloecke ?? roh;
        const bloecke = speicher.sanitisiereBloecke(quelle, MAX_BLOECKE);
        if (Object.keys(bloecke).length === 0) {
          return 'Keine gültigen Blöcke in der Datei gefunden.';
        }
        await flush();
        const name =
          (typeof huelle?.name === 'string' && huelle.name.trim()) ||
          datei.name.replace(/\.json$/i, '') ||
          'Import';
        const meta = { ...neueMeta(name), anzahl: Object.keys(bloecke).length };
        const builds = [...get().builds, meta];
        await speicher.speichereBuildBloecke(meta.id, bloecke);
        await speicher.speichereIndex(builds);
        await speicher.speichereAktivId(meta.id);
        set({ builds, aktivId: meta.id });
        resetSlice();
        useStore.getState().ladeBloecke(bloecke);
        return null;
      } catch {
        return 'Datei konnte nicht gelesen werden (kein gültiges JSON).';
      }
    },
  };
});
