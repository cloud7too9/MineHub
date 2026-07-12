import { Canvas } from '@react-three/fiber';
import { OrbitControls, MapControls, OrthographicCamera } from '@react-three/drei';
import { Ground } from './Ground';
import { Blocks } from './Blocks';
import { HoverPreview } from './HoverPreview';
import { MarkierPreview } from './MarkierPreview';
import { FreiPreview } from './FreiPreview';
import { ThumbnailCapture } from './ThumbnailCapture';
import { useUiStore } from '../../store/useUiStore';

export function Scene() {
  const ansicht = useUiStore((s) => s.ansicht);
  const modus = useUiStore((s) => s.modus);
  const markierArt = useUiStore((s) => s.markierArt);
  // Freihand-Zeichnen: Ziehen malt Zellen — Drehen/Schwenken der Kamera ist
  // währenddessen gesperrt (Zoom bleibt aktiv), sonst würde jeder Strich die
  // Ansicht verreißen. Zuverlässiger als ein Lock erst ab pointerdown, weil die
  // Controls sonst die ersten Move-Events noch mitnehmen.
  const freiLock = modus === 'markieren' && markierArt === 'frei';

  return (
    // dpr-Deckel bei 2 — auf High-DPI-Phones sonst unnötig teuer
    <Canvas shadows dpr={[1, 2]} camera={{ position: [16, 14, 16], fov: 50 }}>
      {/* Hintergrund im App-Grundton; Nebel nur in 3D — in der orthografischen
          Draufsicht liegt alles auf gleicher Kameradistanz und würde absaufen */}
      <color attach="background" args={['#060709']} />
      {ansicht === '3d' && <fog attach="fog" args={['#060709', 40, 90]} />}

      <ambientLight intensity={0.55} />
      <directionalLight
        position={[12, 20, 8]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />

      <Ground />
      <Blocks />
      <HoverPreview />
      <MarkierPreview />
      <FreiPreview />
      <ThumbnailCapture />

      {/* 2D: orthografische Draufsicht, -Z zeigt nach oben; makeDefault stellt
          beim Zurückschalten automatisch die Perspektiv-Kamera wieder her */}
      {ansicht === '2d' && (
        <OrthographicCamera
          makeDefault
          position={[0, 80, 0]}
          up={[0, 0, -1]}
          zoom={26}
          near={0.1}
          far={200}
        />
      )}
      {ansicht === '2d' ? (
        <MapControls
          makeDefault
          enableRotate={false}
          enablePan={!freiLock}
          screenSpacePanning
          minZoom={8}
          maxZoom={90}
        />
      ) : (
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableRotate={!freiLock}
          enablePan={!freiLock}
          minDistance={4}
          maxDistance={60}
          // Kamera bleibt knapp über dem Horizont — kein Blick von unten
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      )}
    </Canvas>
  );
}
