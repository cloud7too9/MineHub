import { useEffect } from 'react';
import { useStore, type ZellAenderungen } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';
import { BLOCK_INFO } from '../../utils/bloecke';
import { toKey } from '../../utils/coordinates';
import { BlockKachel } from './BlockKachel';

/**
 * Kompaktes Aktions-Panel des Markier-Werkzeugs (über der Bottombar).
 * Zwei Markier-Arten:
 *  - Box:  zwei Ecken spannen einen Quader auf
 *  - Frei: Ziehen über Flächen malt einzelne Zellen (Kamera-Drehung gesperrt)
 * Aktionen mit dem aktuellen Hotbar-Block als Parameter — jede Aktion ist EIN
 * Batch, ein einziges Undo macht sie komplett rückgängig.
 */
export function MarkierPanel() {
  const modus = useUiStore((s) => s.modus);
  const markierArt = useUiStore((s) => s.markierArt);
  const setMarkierArt = useUiStore((s) => s.setMarkierArt);
  const markierung = useUiStore((s) => s.markierung);
  const freiZellen = useUiStore((s) => s.freiZellen);
  const endeStrich = useUiStore((s) => s.endeStrich);
  const resetMarkierung = useUiStore((s) => s.resetMarkierung);
  const auswahl = useUiStore((s) => s.auswahl);
  const bloecke = useStore((s) => s.bloecke);
  const setzeBloecke = useStore((s) => s.setzeBloecke);

  // Strich endet, wenn der Zeiger irgendwo losgelassen wird — auch außerhalb der Canvas
  useEffect(() => {
    const ende = (e: PointerEvent) => endeStrich(e.pointerId);
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
    return () => {
      window.removeEventListener('pointerup', ende);
      window.removeEventListener('pointercancel', ende);
    };
  }, [endeStrich]);

  if (modus !== 'markieren') return null;

  /** Zell-Keys der aktuellen Auswahl — Box-Volumen oder gemalte Zellen. */
  const zellKeys = (): string[] => {
    if (markierArt === 'frei') return Object.keys(freiZellen);
    const { anker, ende } = markierung;
    if (!anker || !ende) return [];
    const keys: string[] = [];
    for (let x = Math.min(anker[0], ende[0]); x <= Math.max(anker[0], ende[0]); x++)
      for (let y = Math.min(anker[1], ende[1]); y <= Math.max(anker[1], ende[1]); y++)
        for (let z = Math.min(anker[2], ende[2]); z <= Math.max(anker[2], ende[2]); z++)
          keys.push(toKey(x, y, z));
    return keys;
  };

  const fuellen = () => {
    const aenderungen: ZellAenderungen = {};
    for (const key of zellKeys()) aenderungen[key] = auswahl;
    setzeBloecke(aenderungen);
  };

  const ersetzen = () => {
    const aenderungen: ZellAenderungen = {};
    for (const key of zellKeys()) {
      if ((bloecke as Record<string, unknown>)[key]) aenderungen[key] = auswahl;
    }
    setzeBloecke(aenderungen);
  };

  const loeschen = () => {
    const aenderungen: ZellAenderungen = {};
    for (const key of zellKeys()) {
      if ((bloecke as Record<string, unknown>)[key]) aenderungen[key] = null;
    }
    setzeBloecke(aenderungen);
  };

  // Status je Art
  const { anker, ende } = markierung;
  const anzahlFrei = Object.keys(freiZellen).length;
  const boxKomplett = markierArt === 'box' && anker !== null && ende !== null;
  const hatAuswahl = markierArt === 'frei' ? anzahlFrei > 0 : boxKomplett;

  let status: string;
  if (markierArt === 'box') {
    if (anker === null) status = 'Ecke 1 antippen';
    else if (ende === null) status = 'Ecke 2 antippen';
    else {
      const d = [
        Math.abs(anker[0] - ende[0]) + 1,
        Math.abs(anker[1] - ende[1]) + 1,
        Math.abs(anker[2] - ende[2]) + 1,
      ];
      status = `${d[0]}×${d[1]}×${d[2]} · ${d[0] * d[1] * d[2]} Zellen`;
    }
  } else {
    status =
      anzahlFrei === 0
        ? 'Über Flächen ziehen · Kamera-Drehen gesperrt'
        : `${anzahlFrei} Zellen`;
  }

  const zeigeReset = markierArt === 'frei' ? anzahlFrei > 0 : anker !== null;

  return (
    <div className="markier-panel">
      <div className="segment markier-art">
        <button className={markierArt === 'box' ? 'aktiv' : ''} onClick={() => setMarkierArt('box')}>
          Box
        </button>
        <button className={markierArt === 'frei' ? 'aktiv' : ''} onClick={() => setMarkierArt('frei')}>
          Frei
        </button>
      </div>
      <span className={`markier-status${hatAuswahl ? ' mono' : ''}`}>{status}</span>
      <div className="markier-aktionen">
        {hatAuswahl && (
          <>
            <button
              className="markier-btn"
              onClick={fuellen}
              title={`Füllen mit ${BLOCK_INFO[auswahl].label}`}
            >
              Füllen <BlockKachel typ={auswahl} groesse={14} />
            </button>
            <button
              className="markier-btn"
              onClick={ersetzen}
              title={`Vorhandene Blöcke ersetzen durch ${BLOCK_INFO[auswahl].label}`}
            >
              Ersetzen <BlockKachel typ={auswahl} groesse={14} />
            </button>
            <button className="markier-btn gefahr" onClick={loeschen}>
              Löschen
            </button>
          </>
        )}
        {zeigeReset && (
          <button className="markier-btn" onClick={resetMarkierung} aria-label="Markierung verwerfen">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
