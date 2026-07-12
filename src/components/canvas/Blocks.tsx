import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { useUiStore } from '../../store/useUiStore';
import { BLOCK_INFO, type BlockTyp } from '../../utils/bloecke';
import { holeMaterial } from '../../utils/materialien';
import { fromKey, type Position } from '../../utils/coordinates';

// Geometrie einmalig auf Modul-Ebene — geteilt über alle Instanzen
const BOX_GEOMETRIE = new THREE.BoxGeometry(1, 1, 1);

// Wiederverwendbare Matrix — vermeidet Garbage pro Update
const _matrix = new THREE.Matrix4();

/** Ein InstancedMesh pro Block-Typ. Materialwechsel (Detail) tauscht nur die Referenz. */
function TypMesh({ typ }: { typ: BlockTyp }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const bloecke = useStore((s) => s.bloecke);
  const addBlock = useStore((s) => s.addBlock);
  const removeBlock = useStore((s) => s.removeBlock);

  const auswahl = useUiStore((s) => s.auswahl);
  const modus = useUiStore((s) => s.modus);
  const setHover = useUiStore((s) => s.setHover);
  const setzeMarkierPunkt = useUiStore((s) => s.setzeMarkierPunkt);
  const markierArt = useUiStore((s) => s.markierArt);
  const starteStrich = useUiStore((s) => s.starteStrich);
  const zieheStrich = useUiStore((s) => s.zieheStrich);
  const detail = useUiStore((s) => s.detail);
  const shader = useUiStore((s) => s.shader);
  const texturenVersion = useUiStore((s) => s.texturenVersion);
  const sliceY = useUiStore((s) => s.sliceY);

  // Positionen dieses Typs — Layer-Slice filtert hier: Blöcke oberhalb der
  // Slice-Ebene existieren im Mesh schlicht nicht (auch nicht fürs Raycasting).
  const positionen = useMemo(
    () =>
      (Object.keys(bloecke) as Position[])
        .filter((key) => bloecke[key] === typ)
        .map(fromKey)
        .filter((p) => sliceY === null || p[1] <= sliceY),
    [bloecke, typ, sliceY]
  );

  // Material lazy aus der Factory — stabile Referenz pro Typ×Detail×Shader.
  // basisMaterial dient nur als Konstruktor-Default; die material-Prop überschreibt live.
  // texturenVersion erzwingt nach Pack-Import einen frischen Factory-Durchlauf
  const material = useMemo(
    () => holeMaterial(typ, detail, shader),
    [typ, detail, shader, texturenVersion]
  );
  const basisMaterial = useMemo(() => holeMaterial(typ, 'minimal', false), [typ]);

  // Kapazität wächst in Zweierpotenzen — hält die Instanz-Puffer klein.
  // Ein Kapazitätssprung erzeugt das Mesh neu (key), der Effekt schreibt dann alle Matrizen.
  const kapazitaet = useMemo(() => {
    let k = 256;
    while (k < positionen.length) k *= 2;
    return k;
  }, [positionen.length]);

  // Instanz-Matrizen schreiben (Dirty-Update statt Mesh-Neuaufbau)
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    positionen.forEach(([x, y, z], i) => {
      _matrix.setPosition(x, y, z);
      mesh.setMatrixAt(i, _matrix);
    });
    mesh.count = positionen.length;
    mesh.visible = positionen.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
    // Wichtig: three cached die BoundingSphere fürs Raycasting — ohne Neuberechnung
    // würden Klicks auf neu gebaute Blöcke außerhalb der alten Sphere ins Leere gehen.
    mesh.computeBoundingSphere();
  }, [positionen, kapazitaet]);

  /** Zielzelle neben der getroffenen Fläche (Flächen-Normale zeigt die Richtung). */
  const zielZelle = (
    e: ThreeEvent<MouseEvent> | ThreeEvent<PointerEvent>
  ): [number, number, number] | null => {
    if (e.instanceId === undefined || !e.face) return null;
    const pos = positionen[e.instanceId];
    if (!pos) return null;
    const n = e.face.normal; // Instanzen sind nur verschoben, nie rotiert → Normale gilt im Welt-Raum
    return [pos[0] + Math.round(n.x), pos[1] + Math.round(n.y), pos[2] + Math.round(n.z)];
  };

  /** Im Slice-Modus wird nur bis einschließlich der Slice-Ebene gebaut. */
  const imSlice = (ziel: [number, number, number]) => sliceY === null || ziel[1] <= sliceY;

  // Tap/Linksklick ohne Drag — Verhalten hängt vom aktiven Werkzeug ab
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return; // Drag = Kamerabewegung, kein Bau-Klick
    if (e.instanceId === undefined) return;
    const pos = positionen[e.instanceId];
    if (modus === 'abbauen') {
      if (pos) removeBlock(pos[0], pos[1], pos[2]);
      return;
    }
    if (modus === 'markieren') {
      // Box: Klick setzt Ecken. Frei: läuft über pointerDown/Move, Klick tut nichts.
      if (markierArt === 'box' && pos) setzeMarkierPunkt([pos[0], pos[1], pos[2]]);
      return;
    }
    const ziel = zielZelle(e);
    if (ziel && imSlice(ziel)) addBlock(ziel[0], ziel[1], ziel[2], auswahl);
  };

  // Rechtsklick ohne Drag: entfernt immer — Desktop-Abkürzung unabhängig vom Werkzeug
  const onContextMenu = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5) return;
    if (e.instanceId === undefined) return;
    const pos = positionen[e.instanceId];
    if (pos) removeBlock(pos[0], pos[1], pos[2]);
  };

  // Freihand: Strich beginnt auf einer Fläche — Kamera ist im Frei-Modus gesperrt
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (modus !== 'markieren' || markierArt !== 'frei') return;
    e.stopPropagation();
    const pos = e.instanceId !== undefined ? positionen[e.instanceId] : undefined;
    if (pos) starteStrich(e.nativeEvent.pointerId, [pos[0], pos[1], pos[2]]);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (modus === 'markieren' && markierArt === 'frei') {
      const pos = e.instanceId !== undefined ? positionen[e.instanceId] : undefined;
      if (pos) zieheStrich(e.nativeEvent.pointerId, [pos[0], pos[1], pos[2]]);
      setHover(pos ? [pos[0], pos[1], pos[2]] : null);
      return;
    }
    if (modus === 'abbauen' || modus === 'markieren') {
      // Vorschau markiert den Block selbst (Abbau-Ziel bzw. Markier-Zelle)
      const pos = e.instanceId !== undefined ? positionen[e.instanceId] : undefined;
      setHover(pos ? [pos[0], pos[1], pos[2]] : null);
      return;
    }
    const ziel = zielZelle(e);
    setHover(ziel && imSlice(ziel) ? ziel : null);
  };

  return (
    <instancedMesh
      key={kapazitaet}
      ref={ref}
      args={[BOX_GEOMETRIE, basisMaterial as THREE.Material, kapazitaet]}
      material={material}
      frustumCulled={false} // BoundingSphere wächst nicht automatisch mit — Culling deaktivieren
      castShadow={!BLOCK_INFO[typ].transparent} // Transparente Blöcke werfen keinen Schatten
      receiveShadow
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerOut={() => setHover(null)}
    />
  );
}

export function Blocks() {
  // Bei 1356 Registry-Typen wird nur gemountet, was die Welt tatsächlich nutzt
  // (plus der aktuell gewählte Typ, damit das Mesh beim ersten Platzieren schon
  // existiert). Verschwindet ein Typ komplett, wird sein Mesh wieder abgebaut.
  const bloecke = useStore((s) => s.bloecke);
  const auswahl = useUiStore((s) => s.auswahl);

  const typen = useMemo(() => {
    const menge = new Set<BlockTyp>(Object.values(bloecke));
    menge.add(auswahl);
    return [...menge];
  }, [bloecke, auswahl]);

  return (
    <>
      {typen.map((typ) => (
        <TypMesh key={typ} typ={typ} />
      ))}
    </>
  );
}
