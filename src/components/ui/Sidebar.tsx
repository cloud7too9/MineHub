import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';
import { useBuildStore } from '../../store/useBuildStore';
import type { BuildMeta } from '../../utils/buildSpeicher';
import {
  importiereZipPack,
  entfernePack,
  holePackMeta,
  type PackMeta,
} from '../../utils/texturPack';
import { leereTexturCache } from '../../utils/texturen';
import { leereMaterialCache } from '../../utils/materialien';

/** Isometrischer Würfel — gleiche Geometrie wie das App-Icon. */
function WuerfelIcon({ groesse = 22 }: { groesse?: number }) {
  return (
    <svg width={groesse} height={groesse} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="50,52 17.1,33 50,14 82.9,33" fill="#00e5ff" />
      <polygon points="50,52 17.1,33 17.1,71 50,90" fill="#00a0b9" />
      <polygon points="50,52 82.9,33 82.9,71 50,90" fill="#006980" />
    </svg>
  );
}

/** Build-Liste: wechseln per Klick, umbenennen/löschen per Item-Buttons, Neu + Import. */
function BuildListe() {
  const builds = useBuildStore((s) => s.builds);
  const aktivId = useBuildStore((s) => s.aktivId);
  const wechsleBuild = useBuildStore((s) => s.wechsleBuild);
  const loescheBuild = useBuildStore((s) => s.loescheBuild);
  const benenneUm = useBuildStore((s) => s.benenneUm);
  const neuerBuild = useBuildStore((s) => s.neuerBuild);
  const importiereDatei = useBuildStore((s) => s.importiereDatei);
  const dateiRef = useRef<HTMLInputElement>(null);

  const onUmbenennen = (meta: BuildMeta) => {
    const name = window.prompt('Neuer Name:', meta.name);
    if (name) void benenneUm(meta.id, name);
  };

  const onLoeschen = (meta: BuildMeta) => {
    if (window.confirm(`Build „${meta.name}" löschen? Das kann nicht rückgängig gemacht werden.`)) {
      void loescheBuild(meta.id);
    }
  };

  const onDatei = async (e: ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = ''; // gleiche Datei erneut wählbar
    if (!datei) return;
    const fehler = await importiereDatei(datei);
    if (fehler) window.alert(fehler);
  };

  return (
    <section className="sidebar-sektion">
      <h2>Builds</h2>
      <div className="build-liste">
        {builds.map((meta) => (
          <div
            key={meta.id}
            className={`build-item${meta.id === aktivId ? ' aktiv' : ''}`}
            onClick={() => void wechsleBuild(meta.id)}
          >
            {meta.thumb ? (
              <img className="build-thumb" src={meta.thumb} alt="" />
            ) : (
              <span className="build-thumb platzhalter">
                <WuerfelIcon groesse={14} />
              </span>
            )}
            <div className="build-item-text">
              <span className="build-item-name">{meta.name}</span>
              <span className="build-item-meta">
                {meta.anzahl} Blöcke · {new Date(meta.geaendert).toLocaleDateString('de-DE')}
              </span>
            </div>
            <button
              className="build-item-btn"
              onClick={(e) => {
                e.stopPropagation();
                onUmbenennen(meta);
              }}
              title="Umbenennen"
              aria-label={`${meta.name} umbenennen`}
            >
              ✎
            </button>
            <button
              className="build-item-btn gefahr"
              onClick={(e) => {
                e.stopPropagation();
                onLoeschen(meta);
              }}
              title="Löschen"
              aria-label={`${meta.name} löschen`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="btn-reihe">
        <button className="btn-sekundaer" onClick={() => void neuerBuild()}>
          + Neu
        </button>
        <button className="btn-sekundaer" onClick={() => dateiRef.current?.click()}>
          Import
        </button>
      </div>
      <input
        ref={dateiRef}
        className="datei-versteckt"
        type="file"
        accept="application/json,.json"
        onChange={(e) => void onDatei(e)}
      />
    </section>
  );
}

/** Texture-Pack-Verwaltung: ZIP-Import nach IndexedDB, Status, Entfernen. */
function TexturenSektion() {
  const texturenVersion = useUiStore((s) => s.texturenVersion);
  const bumpTexturenVersion = useUiStore((s) => s.bumpTexturenVersion);
  const [meta, setMeta] = useState<PackMeta | null>(null);
  const [laedt, setLaedt] = useState(false);
  const dateiRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void holePackMeta().then(setMeta);
  }, [texturenVersion]);

  /** Nach jeder Pack-Änderung: Caches leeren, Meshes neue Materialien ziehen lassen. */
  const aktualisiere = () => {
    leereTexturCache();
    leereMaterialCache();
    bumpTexturenVersion();
  };

  const onDatei = async (e: ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = '';
    if (!datei) return;
    setLaedt(true);
    const ergebnis = await importiereZipPack(datei);
    setLaedt(false);
    if ('fehler' in ergebnis) {
      window.alert(ergebnis.fehler);
      return;
    }
    aktualisiere();
  };

  const onEntfernen = async () => {
    if (!window.confirm('Importiertes Texture-Pack entfernen?')) return;
    await entfernePack();
    aktualisiere();
  };

  return (
    <section className="sidebar-sektion">
      <h2>Texturen</h2>
      <div className="stat-zeile">
        <span>Quelle</span>
        <strong>{meta ? meta.name : 'Standard'}</strong>
      </div>
      {meta && (
        <div className="stat-zeile">
          <span>Dateien</span>
          <strong>{meta.anzahl}</strong>
        </div>
      )}
      <div className="btn-reihe btn-block">
        <button
          className="btn-sekundaer"
          onClick={() => dateiRef.current?.click()}
          disabled={laedt}
        >
          {laedt ? 'Importiere…' : 'Pack importieren'}
        </button>
        {meta && (
          <button className="btn-sekundaer" onClick={() => void onEntfernen()}>
            Entfernen
          </button>
        )}
      </div>
      <input
        ref={dateiRef}
        className="datei-versteckt"
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => void onDatei(e)}
      />
      <p className="sektion-hinweis">
        ZIP mit PNG-Texturen (Java-Namen, z.&nbsp;B. oak_planks.png) — bleibt lokal im
        Browser, wird nie hochgeladen oder deployt
      </p>
    </section>
  );
}

/**
 * Sidebar: alles App-Spezifische — Builds, Statistik, Darstellung, Steuerung, Welt-Aktionen.
 * Mobil als Drawer (Öffner-Button oben links), ab 768px permanent eingeblendet.
 */
export function Sidebar() {
  const bloecke = useStore((s) => s.bloecke);
  const clearWelt = useStore((s) => s.clearWelt);
  const offen = useUiStore((s) => s.sidebarOffen);
  const setOffen = useUiStore((s) => s.setSidebarOffen);
  const detail = useUiStore((s) => s.detail);
  const setDetail = useUiStore((s) => s.setDetail);
  const shader = useUiStore((s) => s.shader);
  const setShader = useUiStore((s) => s.setShader);
  const sliceY = useUiStore((s) => s.sliceY);
  const setSliceY = useUiStore((s) => s.setSliceY);
  const exportiereAktiv = useBuildStore((s) => s.exportiereAktiv);

  const anzahl = Object.keys(bloecke).length;

  // Sortierte Liste belegter Y-Ebenen. Die Anzeige nutzt Länge und Spanne —
  // die Liste selbst ist die Vorbereitung für die spätere Layer-Slice-Ansicht.
  const ebenen = useMemo(() => {
    const ys = new Set<number>();
    for (const key of Object.keys(bloecke)) ys.add(Number(key.split(',')[1]));
    return [...ys].sort((a, b) => a - b);
  }, [bloecke]);

  const maxEbene = ebenen.length > 0 ? ebenen[ebenen.length - 1] : 0;

  const spanne =
    ebenen.length === 0
      ? null
      : ebenen[0] === ebenen[ebenen.length - 1]
        ? `Y ${ebenen[0]}`
        : `Y ${ebenen[0]}–${ebenen[ebenen.length - 1]}`;

  const onClear = () => {
    // Destruktive Aktion — direkte Nachfrage statt stillem Löschen
    if (window.confirm('Aktuellen Build leeren? Das kann nicht rückgängig gemacht werden.')) {
      clearWelt();
    }
  };

  return (
    <>
      <button className="sidebar-oeffner" onClick={() => setOffen(true)} aria-label="Menü öffnen">
        <WuerfelIcon />
      </button>
      <div
        className={`sidebar-backdrop${offen ? ' sichtbar' : ''}`}
        onClick={() => setOffen(false)}
      />
      <aside className={`sidebar${offen ? ' offen' : ''}`}>
        <div className="sidebar-kopf">
          <WuerfelIcon />
          <div className="sidebar-titel">
            <span>
              Voxel<em>Editor</em>
            </span>
            <span className="sidebar-version">v0.10.0</span>
          </div>
          <button
            className="sidebar-schliessen"
            onClick={() => setOffen(false)}
            aria-label="Menü schließen"
          >
            ×
          </button>
        </div>

        <BuildListe />

        <section className="sidebar-sektion">
          <h2>Statistik</h2>
          <div className="stat-zeile">
            <span>Blöcke</span>
            <strong>{anzahl}</strong>
          </div>
          <div className="stat-zeile">
            <span>Layer</span>
            <span>
              <strong>{ebenen.length}</strong>
              {spanne && <span className="stat-nebenwert">{spanne}</span>}
            </span>
          </div>
          <button className="btn-sekundaer btn-block" onClick={exportiereAktiv}>
            Als JSON exportieren
          </button>
        </section>

        <section className="sidebar-sektion">
          <h2>Darstellung</h2>
          <div className="segment">
            <button className={detail === 'hoch' ? 'aktiv' : ''} onClick={() => setDetail('hoch')}>
              Hoch
            </button>
            <button
              className={detail === 'minimal' ? 'aktiv' : ''}
              onClick={() => setDetail('minimal')}
            >
              Minimal
            </button>
          </div>
          <p className="sektion-hinweis">Hoch = Texturen · Minimal = flache Farben</p>
          <div className="segment segment-abstand">
            <button className={!shader ? 'aktiv' : ''} onClick={() => setShader(false)}>
              Shader aus
            </button>
            <button className={shader ? 'aktiv' : ''} onClick={() => setShader(true)}>
              Shader an
            </button>
          </div>
          <p className="sektion-hinweis">Stilisiert: Rim-Licht + Höhenverlauf</p>
        </section>

        <TexturenSektion />

        <section className="sidebar-sektion">
          <h2>Layer-Slice</h2>
          <div className="segment">
            <button className={sliceY === null ? 'aktiv' : ''} onClick={() => setSliceY(null)}>
              Aus
            </button>
            <button
              className={sliceY !== null ? 'aktiv' : ''}
              onClick={() => setSliceY(maxEbene)}
              disabled={anzahl === 0}
            >
              An
            </button>
          </div>
          {sliceY !== null && (
            <>
              <input
                type="range"
                className="slice-slider"
                min={0}
                max={maxEbene}
                value={Math.min(sliceY, maxEbene)}
                onChange={(e) => setSliceY(Number(e.target.value))}
              />
              <div className="stat-zeile">
                <span>Sichtbar bis</span>
                <strong>Y ≤ {Math.min(sliceY, maxEbene)}</strong>
              </div>
            </>
          )}
          <p className="sektion-hinweis">
            {sliceY !== null
              ? 'Bauen oberhalb der Slice-Ebene ist deaktiviert'
              : 'Blendet Ebenen oberhalb von Y aus — für den Blick ins Innere'}
          </p>
        </section>

        <section className="sidebar-sektion">
          <h2>Steuerung</h2>
          <div className="info-hilfe hilfe-maus">
            <div>
              <kbd>Linksklick</kbd> bauen · <kbd>Rechtsklick</kbd> abbauen
            </div>
            <div>
              <kbd>Ziehen</kbd> Kamera · <kbd>Scrollen</kbd> Zoom
            </div>
            <div>
              <kbd>1</kbd>–<kbd>0</kbd> Hotbar · <kbd>B</kbd>/<kbd>X</kbd>/<kbd>M</kbd> Werkzeug
            </div>
            <div>
              <kbd>Strg</kbd>+<kbd>Z</kbd> Rückgängig · <kbd>Strg</kbd>+<kbd>Y</kbd> Wiederholen
            </div>
          </div>
          <div className="info-hilfe hilfe-touch">
            <div>Tippen: bauen, abbauen oder markieren (Werkzeug unten)</div>
            <div>1 Finger ziehen: Kamera · 2 Finger: Zoom</div>
          </div>
        </section>

        <section className="sidebar-sektion sidebar-fuss">
          <button className="btn-leeren" onClick={onClear}>
            Build leeren
          </button>
        </section>
      </aside>
    </>
  );
}
