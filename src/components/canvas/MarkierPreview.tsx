import { Edges } from '@react-three/drei';
import { useUiStore } from '../../store/useUiStore';

/**
 * Live-Vorschau der Markierung: sobald der Anker steht, spannt sich die Box
 * bis zur Hover-Zelle auf; mit gesetztem Ende steht sie fest (etwas kräftiger).
 * Leicht aufgemaßt gegen Z-Fighting, vom Raycasting ausgenommen.
 */
export function MarkierPreview() {
  const modus = useUiStore((s) => s.modus);
  const markierArt = useUiStore((s) => s.markierArt);
  const markierung = useUiStore((s) => s.markierung);
  const hover = useUiStore((s) => s.hover);

  if (modus !== 'markieren' || markierArt !== 'box' || markierung.anker === null) return null;

  const a = markierung.anker;
  const b = markierung.ende ?? hover ?? a;
  const fest = markierung.ende !== null;

  const min = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
  const max = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
  const groesse: [number, number, number] = [
    max[0] - min[0] + 1.04,
    max[1] - min[1] + 1.04,
    max[2] - min[2] + 1.04,
  ];
  const mitte: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  return (
    <mesh position={mitte} raycast={() => null}>
      <boxGeometry args={groesse} />
      <meshBasicMaterial color="#ffc857" transparent opacity={fest ? 0.2 : 0.12} depthWrite={false} />
      <Edges color="#ffc857" />
    </mesh>
  );
}
