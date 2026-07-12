import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';

/**
 * Kompakte Slice-Steuerung oben rechts in der Bühne — auf Mobilgeräten verdeckt
 * der Sidebar-Drawer die Szene, hier lässt sich die Ebene mit freiem Blick schieben.
 * Erscheint nur bei aktivem Slice; aktiviert wird über die Sidebar.
 */
export function SliceChip() {
  const sliceY = useUiStore((s) => s.sliceY);
  const setSliceY = useUiStore((s) => s.setSliceY);
  const bloecke = useStore((s) => s.bloecke);

  const maxEbene = useMemo(() => {
    let max = 0;
    for (const key of Object.keys(bloecke)) {
      const y = Number(key.split(',')[1]);
      if (y > max) max = y;
    }
    return max;
  }, [bloecke]);

  if (sliceY === null) return null;
  const wert = Math.min(sliceY, maxEbene);

  return (
    <div className="slice-chip">
      <button onClick={() => setSliceY(Math.max(0, wert - 1))} disabled={wert <= 0} aria-label="Ebene tiefer">
        −
      </button>
      <span>Y ≤ {wert}</span>
      <button
        onClick={() => setSliceY(Math.min(maxEbene, wert + 1))}
        disabled={wert >= maxEbene}
        aria-label="Ebene höher"
      >
        ＋
      </button>
      <button onClick={() => setSliceY(null)} aria-label="Slice ausschalten">
        ×
      </button>
    </div>
  );
}
