import { useUiStore } from '../../store/useUiStore';

const FARBEN = {
  bauen: '#00e5ff',
  abbauen: '#ff5c5c',
  markieren: '#ffc857',
} as const;

/**
 * Halbtransparenter Geisterblock auf der Zielzelle unter dem Cursor.
 * Bauen: Cyan auf der Zelle, in der der nächste Block landet.
 * Abbauen: Rot auf dem Block, der entfernt würde.
 * Markieren: Amber auf der Zelle für die nächste Ecke — sobald der Anker steht,
 * übernimmt die Live-Box der MarkierPreview.
 */
export function HoverPreview() {
  const hover = useUiStore((s) => s.hover);
  const modus = useUiStore((s) => s.modus);
  const anker = useUiStore((s) => s.markierung.anker);
  if (!hover) return null;
  if (modus === 'markieren' && anker !== null) return null;

  return (
    <mesh position={hover} raycast={() => null}>
      <boxGeometry args={[1.02, 1.02, 1.02]} />
      <meshBasicMaterial color={FARBEN[modus]} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}
