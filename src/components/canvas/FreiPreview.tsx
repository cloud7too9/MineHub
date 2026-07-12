import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useUiStore } from '../../store/useUiStore';
import { fromKey, type Position } from '../../utils/coordinates';

// Geteilte Ressourcen — ein Mesh für alle markierten Zellen
const GEO = new THREE.BoxGeometry(1.04, 1.04, 1.04);
const MAT = new THREE.MeshBasicMaterial({
  color: '#ffc857',
  transparent: true,
  opacity: 0.26,
  depthWrite: false,
});
const _matrix = new THREE.Matrix4();

/** Geister-Zellen der Freihand-Markierung als ein InstancedMesh. */
export function FreiPreview() {
  const modus = useUiStore((s) => s.modus);
  const markierArt = useUiStore((s) => s.markierArt);
  const freiZellen = useUiStore((s) => s.freiZellen);
  const ref = useRef<THREE.InstancedMesh>(null);

  const positionen = useMemo(
    () => Object.keys(freiZellen).map((key) => fromKey(key as Position)),
    [freiZellen]
  );

  const kapazitaet = useMemo(() => {
    let k = 64;
    while (k < positionen.length) k *= 2;
    return k;
  }, [positionen.length]);

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
  }, [positionen, kapazitaet]);

  if (modus !== 'markieren' || markierArt !== 'frei') return null;

  return (
    <instancedMesh
      key={kapazitaet}
      ref={ref}
      args={[GEO, MAT, kapazitaet]}
      frustumCulled={false}
      raycast={() => null}
    />
  );
}
