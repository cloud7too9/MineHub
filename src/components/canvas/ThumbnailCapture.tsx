import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { setzeCapture } from '../../utils/thumbnail';

const THUMB_BREITE = 144;

/**
 * Registriert die Thumbnail-Capture-Funktion beim Build-Store-Modul.
 * Render-on-Demand statt preserveDrawingBuffer: direkt vor dem Auslesen wird
 * einmal explizit gerendert — der WebGL-Puffer ist im selben Task noch lesbar,
 * und es gibt keinen permanenten Performance-Preis.
 */
export function ThumbnailCapture() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    setzeCapture(() => {
      gl.render(scene, camera);
      const quelle = gl.domElement;
      if (quelle.width === 0 || quelle.height === 0) return null;
      const ziel = document.createElement('canvas');
      ziel.width = THUMB_BREITE;
      ziel.height = Math.max(1, Math.round((THUMB_BREITE * quelle.height) / quelle.width));
      const ctx = ziel.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(quelle, 0, 0, ziel.width, ziel.height);
      // WebP wo verfügbar (~5–10 KB); Safari fällt still auf PNG zurück
      return ziel.toDataURL('image/webp', 0.7);
    });
    return () => setzeCapture(null);
  }, [gl, scene, camera]);

  return null;
}
