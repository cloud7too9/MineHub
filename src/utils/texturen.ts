import * as THREE from 'three';
import { holePackTextur } from './texturPack';

// Textur-Auflösung mit Kandidaten-Ketten: pro Fläche wird eine Liste möglicher
// Dateinamen durchprobiert (z. B. ['oak_log_side.png', 'oak_log.png']), jeweils
// erst gegen das importierte Pack (IndexedDB), dann gegen /texturen/ (statisch).
// Erster Treffer gewinnt, sonst bleibt die Minimal-Farbe. Dadurch funktionieren
// Java-Namenskonventionen generisch für alle 1357 Typen ohne handgepflegte Maps.

const lader = new THREE.TextureLoader();

let einzelCache = new Map<string, Promise<THREE.Texture | null>>();
let kettenCache = new Map<string, Promise<THREE.Texture | null>>();
let vorschauCache = new Map<string, Promise<string | null>>();
let objectUrls: string[] = [];

function konfiguriere(tex: THREE.Texture): THREE.Texture {
  // Scharfer Pixel-Look: kein Filtern, keine Mipmaps
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ladeVonUrl(url: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    lader.load(
      url,
      (tex) => resolve(konfiguriere(tex)),
      undefined,
      () => resolve(null)
    );
  });
}

/** Eine Datei auflösen: Pack (IndexedDB) vor statischem /texturen/. */
function ladeEinzeln(datei: string): Promise<THREE.Texture | null> {
  let promise = einzelCache.get(datei);
  if (!promise) {
    promise = (async () => {
      // Pack-Lookup über den Basisnamen (Kandidaten tragen volle Pfade)
      const name = (datei.split('/').pop() ?? datei).replace(/\.png$/i, '').toLowerCase();
      const blob = await holePackTextur(name);
      if (blob) {
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        const tex = await ladeVonUrl(url);
        if (tex) return tex;
      }
      return ladeVonUrl(`/${datei}`);
    })();
    einzelCache.set(datei, promise);
  }
  return promise;
}

/** Kandidaten der Reihe nach probieren — erster Treffer gewinnt. */
export function ladeErsteTextur(kandidaten: string[]): Promise<THREE.Texture | null> {
  const key = kandidaten.join('|');
  let promise = kettenCache.get(key);
  if (!promise) {
    promise = (async () => {
      for (const datei of kandidaten) {
        const tex = await ladeEinzeln(datei);
        if (tex) return tex;
      }
      return null;
    })();
    kettenCache.set(key, promise);
  }
  return promise;
}

/**
 * Vorschau-URL für UI-Kacheln — nur Pack-Blobs werden aufgelöst; statische
 * Kandidaten laufen im UI über CSS-Multi-Background (404-Layer malen einfach nicht).
 */
export function holeVorschauUrl(kandidaten: string[]): Promise<string | null> {
  const key = kandidaten.join('|');
  let promise = vorschauCache.get(key);
  if (!promise) {
    promise = (async () => {
      for (const datei of kandidaten) {
        const name = (datei.split('/').pop() ?? datei).replace(/\.png$/i, '').toLowerCase();
        const blob = await holePackTextur(name);
        if (blob) {
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return url;
        }
      }
      return null;
    })();
    vorschauCache.set(key, promise);
  }
  return promise;
}

/** Nach Pack-Import/-Entfernung: alles verwerfen, damit die neue Kette greift. */
export function leereTexturCache(): void {
  for (const promise of einzelCache.values()) {
    void promise.then((tex) => tex?.dispose());
  }
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls = [];
  einzelCache = new Map();
  kettenCache = new Map();
  vorschauCache = new Map();
}
