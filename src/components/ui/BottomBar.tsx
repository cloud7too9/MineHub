import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';
import { BLOCK_INFO } from '../../utils/bloecke';
import { BlockKachel } from './BlockKachel';
import { BlockPicker } from './BlockPicker';
import { MarkierPanel } from './MarkierPanel';

/** Rückgängig/Wiederholen — jede Aktion (auch Batches) ist genau ein Schritt. */
function UndoRedo() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const kannUndo = useStore((s) => s.vergangenheit.length > 0);
  const kannRedo = useStore((s) => s.zukunft.length > 0);

  return (
    <div className="undo-gruppe">
      <button onClick={undo} disabled={!kannUndo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig">
        ↶
      </button>
      <button onClick={redo} disabled={!kannRedo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen">
        ↷
      </button>
    </div>
  );
}

/** Werkzeug-Umschalter — auf Touch der einzige Weg zu Abbauen/Markieren. */
function WerkzeugToggle() {
  const modus = useUiStore((s) => s.modus);
  const setModus = useUiStore((s) => s.setModus);

  return (
    <div className="modus-toggle">
      <button
        className={`modus-btn${modus === 'bauen' ? ' aktiv' : ''}`}
        onClick={() => setModus('bauen')}
        title="Bauen (B)"
      >
        +<span className="modus-text"> Bauen</span>
      </button>
      <button
        className={`modus-btn abbau${modus === 'abbauen' ? ' aktiv' : ''}`}
        onClick={() => setModus('abbauen')}
        title="Abbauen (X)"
      >
        −<span className="modus-text"> Abbauen</span>
      </button>
      <button
        className={`modus-btn markier${modus === 'markieren' ? ' aktiv' : ''}`}
        onClick={() => setModus('markieren')}
        title="Markieren (M)"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2"
            y="2"
            width="12"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="3 2.2"
          />
        </svg>
        <span className="modus-text"> Markieren</span>
      </button>
    </div>
  );
}

/** Die aktiven Slots — Auswahl per Tap/Klick oder Tasten 1–9 und 0. */
function HotbarSlots() {
  const auswahl = useUiStore((s) => s.auswahl);
  const setAuswahl = useUiStore((s) => s.setAuswahl);
  const hotbar = useUiStore((s) => s.hotbar);

  return (
    <div className="hotbar-slots">
      {hotbar.map((typ, i) => (
        <button
          key={typ}
          className={`slot${typ === auswahl ? ' aktiv' : ''}`}
          onClick={() => setAuswahl(typ)}
          title={`${BLOCK_INFO[typ].label} (Taste ${i === 9 ? 0 : i + 1})`}
        >
          <span className="slot-taste">{i === 9 ? 0 : i + 1}</span>
          <BlockKachel typ={typ} />
          <span className="slot-label">{BLOCK_INFO[typ].label}</span>
        </button>
      ))}
    </div>
  );
}

/** Bottombar: alles Editier-Relevante — Undo/Redo, Werkzeug, Hotbar, Anpassung. */
export function BottomBar() {
  const hotbar = useUiStore((s) => s.hotbar);
  const setAuswahl = useUiStore((s) => s.setAuswahl);
  const setModus = useUiStore((s) => s.setModus);
  const markierAktiv = useUiStore(
    (s) => s.markierung.anker !== null || Object.keys(s.freiZellen).length > 0
  );
  const resetMarkierung = useUiStore((s) => s.resetMarkierung);
  const pickerOffen = useUiStore((s) => s.pickerOffen);
  const setPickerOffen = useUiStore((s) => s.setPickerOffen);
  const setSidebarOffen = useUiStore((s) => s.setSidebarOffen);

  // Tastatur (Desktop): 1–9/0 = Hotbar-Slots (wechselt ins Bauen), B/X/M = Werkzeug,
  // Strg+Z / Strg+Y (bzw. Strg+Shift+Z) = Undo/Redo, Esc = Markierung/Panels schließen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const taste = e.key.toLowerCase();
        if (taste === 'z') {
          e.preventDefault();
          if (e.shiftKey) useStore.getState().redo();
          else useStore.getState().undo();
        }
        if (taste === 'y') {
          e.preventDefault();
          useStore.getState().redo();
        }
        return;
      }
      let idx = -1;
      if (e.key >= '1' && e.key <= '9') idx = Number(e.key) - 1;
      else if (e.key === '0') idx = 9;
      if (idx >= 0 && idx < hotbar.length) setAuswahl(hotbar[idx]);
      if (e.key === 'b' || e.key === 'B') setModus('bauen');
      if (e.key === 'x' || e.key === 'X') setModus('abbauen');
      if (e.key === 'm' || e.key === 'M') setModus('markieren');
      if (e.key === 'Escape') {
        // Erst die Markierung verwerfen, dann Panels schließen
        if (markierAktiv) {
          resetMarkierung();
          return;
        }
        setPickerOffen(false);
        setSidebarOffen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotbar, markierAktiv, resetMarkierung, setAuswahl, setModus, setPickerOffen, setSidebarOffen]);

  return (
    <div className="unten-stack">
      <BlockPicker />
      <MarkierPanel />
      <div className="bottombar">
        <UndoRedo />
        <WerkzeugToggle />
        <HotbarSlots />
        <button
          className={`btn-anpassen${pickerOffen ? ' aktiv' : ''}`}
          onClick={() => setPickerOffen(!pickerOffen)}
          title="Hotbar anpassen"
          aria-label="Hotbar anpassen"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <rect x="1" y="1" width="6" height="6" rx="1.2" />
            <rect x="9" y="1" width="6" height="6" rx="1.2" />
            <rect x="1" y="9" width="6" height="6" rx="1.2" />
            <rect x="9" y="9" width="6" height="6" rx="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Zentrierter Hinweis, solange die Welt leer ist — verschwindet mit dem ersten Block. */
export function LeereWeltHinweis() {
  const anzahl = useStore((s) => Object.keys(s.bloecke).length);
  if (anzahl > 0) return null;

  return (
    <div className="leer-hinweis">Tippe oder klicke auf das Grid, um den ersten Block zu setzen</div>
  );
}
