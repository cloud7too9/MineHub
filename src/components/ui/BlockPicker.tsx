import { useEffect, useMemo, useState } from 'react';
import { useUiStore, HOTBAR_MIN, HOTBAR_MAX } from '../../store/useUiStore';
import { BLOCK_LISTE, BLOCK_INFO, KATEGORIEN, type BlockTyp } from '../../utils/bloecke';
import { BlockKachel } from './BlockKachel';

// Bei 1356 Typen braucht das Raster eine Suche und einen Anzeige-Deckel —
// sonst hängen 1300+ DOM-Knoten (und Textur-Requests) am Picker.
const ANZEIGE_MAX = 120;

/**
 * Hotbar-Konfigurator. Zwei Ebenen, tap-basiert (kein Drag & Drop):
 *  - Mini-Hotbar oben: Slot antippen = auswählen, zweiten Slot antippen = tauschen.
 *  - Raster darunter (mit Suche): mit gewähltem Slot = Slot belegen (tauscht bei
 *    Duplikat), ohne = Toggle hinzufügen/entfernen. Stepper regelt die Slot-Anzahl.
 */
export function BlockPicker() {
  const offen = useUiStore((s) => s.pickerOffen);
  const setOffen = useUiStore((s) => s.setPickerOffen);
  const hotbar = useUiStore((s) => s.hotbar);
  const toggleHotbar = useUiStore((s) => s.toggleHotbar);
  const setHotbarGroesse = useUiStore((s) => s.setHotbarGroesse);
  const tauscheSlots = useUiStore((s) => s.tauscheSlots);
  const belegeSlot = useUiStore((s) => s.belegeSlot);

  const [slotAuswahl, setSlotAuswahl] = useState<number | null>(null);
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState('alle');

  // Slot-Auswahl und Suche beim Schließen verwerfen — frischer Zustand beim Wiederöffnen
  useEffect(() => {
    if (!offen) {
      setSlotAuswahl(null);
      setSuche('');
      setKategorie('alle');
    }
  }, [offen]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return BLOCK_LISTE.filter((typ) => {
      if (kategorie !== 'alle' && BLOCK_INFO[typ].kategorie !== kategorie) return false;
      if (!q) return true;
      return typ.includes(q) || BLOCK_INFO[typ].label.toLowerCase().includes(q);
    });
  }, [suche, kategorie]);

  if (!offen) return null;

  const sichtbar = treffer.slice(0, ANZEIGE_MAX);

  const onSlot = (i: number) => {
    if (slotAuswahl === null) setSlotAuswahl(i);
    else if (slotAuswahl === i) setSlotAuswahl(null);
    else {
      tauscheSlots(slotAuswahl, i);
      setSlotAuswahl(null);
    }
  };

  const onBlock = (typ: BlockTyp) => {
    if (slotAuswahl !== null) {
      belegeSlot(slotAuswahl, typ);
      setSlotAuswahl(null);
    } else {
      toggleHotbar(typ);
    }
  };

  return (
    <>
      {/* Unsichtbarer Backdrop — verhindert versehentliches Bauen hinter dem Picker */}
      <div className="picker-backdrop" onClick={() => setOffen(false)} />
      <div className="picker">
        <div className="picker-kopf">
          <span>Hotbar anpassen</span>
          <div className="stepper" title="Anzahl der Slots">
            <button
              onClick={() => setHotbarGroesse(hotbar.length - 1)}
              disabled={hotbar.length <= HOTBAR_MIN}
              aria-label="Weniger Slots"
            >
              −
            </button>
            <span>{hotbar.length}</span>
            <button
              onClick={() => setHotbarGroesse(hotbar.length + 1)}
              disabled={hotbar.length >= HOTBAR_MAX}
              aria-label="Mehr Slots"
            >
              ＋
            </button>
          </div>
          <button className="picker-schliessen" onClick={() => setOffen(false)} aria-label="Schließen">
            ×
          </button>
        </div>

        <div className="picker-minihotbar">
          {hotbar.map((typ, i) => (
            <button
              key={i}
              className={`mini-slot${slotAuswahl === i ? ' gewaehlt' : ''}`}
              onClick={() => onSlot(i)}
              title={`Slot ${i + 1}: ${BLOCK_INFO[typ].label}`}
            >
              <span className="mini-slot-nr">{i === 9 ? 0 : i + 1}</span>
              <BlockKachel typ={typ} groesse={22} />
            </button>
          ))}
        </div>

        <div className="picker-filter">
          <input
            className="picker-suche"
            type="search"
            placeholder={`${BLOCK_LISTE.length} Blöcke durchsuchen…`}
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
          <select
            className="picker-kategorie"
            value={kategorie}
            onChange={(e) => setKategorie(e.target.value)}
            aria-label="Kategorie"
          >
            <option value="alle">Alle</option>
            {KATEGORIEN.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>

        <div className="picker-raster">
          {sichtbar.map((typ) => {
            const slot = hotbar.indexOf(typ);
            return (
              <button
                key={typ}
                className={`picker-block${slot >= 0 ? ' aktiv' : ''}`}
                onClick={() => onBlock(typ)}
                title={typ}
              >
                <BlockKachel typ={typ} groesse={30} />
                <span className="picker-block-label">{BLOCK_INFO[typ].label}</span>
                {slot >= 0 && <span className="picker-slotnr">{slot + 1}</span>}
              </button>
            );
          })}
        </div>

        <div className="picker-hinweis">
          {treffer.length > ANZEIGE_MAX
            ? `${ANZEIGE_MAX} von ${treffer.length} Treffern — Suche verfeinern`
            : slotAuswahl !== null
              ? `Block wählen für Slot ${slotAuswahl + 1} — oder zweiten Slot zum Tauschen antippen`
              : 'Block antippen: hinzufügen/entfernen · Slot oben antippen: tauschen oder gezielt belegen'}
        </div>
      </div>
    </>
  );
}
