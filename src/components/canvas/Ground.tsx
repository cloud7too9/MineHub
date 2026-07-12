import type { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';

const GROESSE = 64;

/**
 * Sichtbare Bodenfläche, die zugleich als Kollisions-Ebene fürs Raycasting dient.
 * Blöcke sind auf Integer-Koordinaten ZENTRIERT (Block bei y=0 belegt [-0.5, 0.5]),
 * deshalb liegt die Ebene bei y = -0.5 und Klick-Punkte werden GERUNDET, nicht gefloort.
 */
export function Ground() {
  const addBlock = useStore((s) => s.addBlock);
  const auswahl = useUiStore((s) => s.auswahl);
  const modus = useUiStore((s) => s.modus);
  const setHover = useUiStore((s) => s.setHover);
  const setzeMarkierPunkt = useUiStore((s) => s.setzeMarkierPunkt);
  const markierArt = useUiStore((s) => s.markierArt);
  const starteStrich = useUiStore((s) => s.starteStrich);
  const zieheStrich = useUiStore((s) => s.zieheStrich);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return; // Drag = Kamerabewegung
    const x = Math.round(e.point.x);
    const z = Math.round(e.point.z);
    if (modus === 'bauen') addBlock(x, 0, z, auswahl);
    if (modus === 'markieren' && markierArt === 'box') setzeMarkierPunkt([x, 0, z]);
    // Abbauen: auf leerem Boden gibt es nichts zu entfernen
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (modus !== 'markieren' || markierArt !== 'frei') return;
    starteStrich(e.nativeEvent.pointerId, [Math.round(e.point.x), 0, Math.round(e.point.z)]);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const zelle: [number, number, number] = [Math.round(e.point.x), 0, Math.round(e.point.z)];
    if (modus === 'markieren' && markierArt === 'frei') {
      zieheStrich(e.nativeEvent.pointerId, zelle);
    }
    setHover(modus === 'abbauen' ? null : zelle);
  };

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.5, 0]}
        receiveShadow
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOut={() => setHover(null)}
      >
        <planeGeometry args={[GROESSE, GROESSE]} />
        <meshStandardMaterial color="#0d0f14" />
      </mesh>
      {/* Um 0.5 versetzt, damit die Linien auf den Zellgrenzen (±0.5) liegen */}
      <gridHelper
        args={[GROESSE, GROESSE, '#1f2a33', '#141a21']}
        position={[0.5, -0.49, 0.5]}
      />
    </group>
  );
}
