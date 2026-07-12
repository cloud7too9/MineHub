import { useEffect, useState } from 'react';
import { BLOCK_INFO, type BlockTyp } from '../../utils/bloecke';
import { useUiStore } from '../../store/useUiStore';
import { holeVorschauUrl } from '../../utils/texturen';

/**
 * Farb-/Textur-Kachel eines Blocks für Hotbar und Picker.
 * Detail 'hoch': Pack-Textur (asynchron aus IndexedDB aufgelöst) oder statische
 * Kandidaten als CSS-Multi-Background — 404-Layer malen schlicht nicht, die
 * Minimal-Farbe liegt immer darunter und greift automatisch.
 */
export function BlockKachel({ typ, groesse = 26 }: { typ: BlockTyp; groesse?: number }) {
  const detail = useUiStore((s) => s.detail);
  const texturenVersion = useUiStore((s) => s.texturenVersion);
  const info = BLOCK_INFO[typ];
  const [packUrl, setPackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (detail !== 'hoch') return;
    let aktiv = true;
    void holeVorschauUrl(info.textur.seite).then((url) => {
      if (aktiv) setPackUrl(url);
    });
    return () => {
      aktiv = false;
    };
  }, [typ, detail, texturenVersion, info.textur.seite]);

  const hintergrund =
    detail === 'hoch'
      ? packUrl
        ? `url(${packUrl})`
        : info.textur.seite.map((datei) => `url(/${datei})`).join(', ')
      : undefined;

  return (
    <span
      className={`block-kachel${info.leuchtet > 0 ? ' leuchtet' : ''}`}
      style={{
        width: groesse,
        height: groesse,
        backgroundColor: info.farbe,
        backgroundImage: hintergrund,
      }}
    />
  );
}
