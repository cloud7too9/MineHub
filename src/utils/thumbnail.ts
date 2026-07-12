// Brücke zwischen R3F-Canvas und Build-Store: die Canvas registriert beim Mount
// eine Capture-Funktion, der Build-Store ruft sie beim Speichern auf — ohne dass
// der Store etwas von three.js wissen muss.

type CaptureFn = () => string | null;

let captureFn: CaptureFn | null = null;

export function setzeCapture(fn: CaptureFn | null): void {
  captureFn = fn;
}

/** Liefert ein Daten-URL-Thumbnail der aktuellen Szene — oder null, wenn keine Canvas da ist. */
export function erzeugeThumbnail(): string | null {
  try {
    return captureFn ? captureFn() : null;
  } catch {
    return null; // Thumbnail ist nice-to-have — Speichern darf daran nie scheitern
  }
}
