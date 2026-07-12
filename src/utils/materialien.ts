import * as THREE from 'three';
import { BLOCK_INFO, type BlockTyp } from './bloecke';
import { ladeErsteTextur } from './texturen';
import type { Detail } from '../store/useUiStore';

// Lazy Material-Factory: bei 1356 Block-Typen werden Materialien (und Texturen)
// erst beim ersten Gebrauch eines Typs erzeugt — nicht 1356 × 4 Varianten beim Start.
// Cache-Key: Typ × Detail × Shader. Der Shader-Toggle tauscht nur die Referenz
// am InstancedMesh, wie schon der Detail-Umschalter.
//
// Transparenz: Hoch = Cutout (alphaTest, depthWrite an, keine Sortier-Artefakte),
// Minimal = Alpha-Blending (bewusst akzeptierte Artefakte im Farb-Modus).

type BlockMaterial = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;

/** Lichtwert 0–15 → Emissiv-Intensität */
const emissivIntensitaet = (licht: number) => 0.25 + 0.5 * (licht / 15);

/**
 * Stilisierter Shader via onBeforeCompile auf den Standard-Materialien:
 * Rim-Licht (Fresnel, cyan — passt zur Akzentfarbe) + Höhenverlauf kühl→warm.
 * Instancing, Schatten und Nebel bleiben erhalten, weil die three-Chunks
 * nur ergänzt statt ersetzt werden.
 */
function aktiviereShader(mat: BlockMaterial): BlockMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWeltPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 voxelWPos = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          voxelWPos = instanceMatrix * voxelWPos;
        #endif
        vWeltPos = ( modelMatrix * voxelWPos ).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWeltPos;')
      .replace(
        '#include <dithering_fragment>',
        `float voxelRim = pow( 1.0 - max( dot( normalize( vViewPosition ), normal ), 0.0 ), 2.6 );
        float voxelHoehe = clamp( vWeltPos.y / 14.0, 0.0, 1.0 );
        gl_FragColor.rgb *= mix( vec3( 0.88, 0.96, 1.04 ), vec3( 1.06, 1.01, 0.94 ), voxelHoehe );
        gl_FragColor.rgb += voxelRim * vec3( 0.0, 0.55, 0.65 ) * 0.30;
        #include <dithering_fragment>`
      );
  };
  // Eigener Cache-Key — sonst teilt three das Programm mit der Nicht-Shader-Variante
  mat.customProgramCacheKey = () => 'voxel-stylized';
  return mat;
}

function basisMaterial(typ: BlockTyp, shader: boolean): BlockMaterial {
  const { farbe, leuchtet, transparent } = BLOCK_INFO[typ];
  let mat: BlockMaterial;
  if (leuchtet > 0) {
    mat = new THREE.MeshStandardMaterial({
      color: farbe,
      emissive: farbe,
      emissiveIntensity: emissivIntensitaet(leuchtet),
    });
  } else if (transparent) {
    mat = new THREE.MeshLambertMaterial({
      color: farbe,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
  } else {
    mat = new THREE.MeshLambertMaterial({ color: farbe });
  }
  return shader ? aktiviereShader(mat) : mat;
}

// --- Flächen-Material mit Textur (asynchron nachgeladen, Farbe als Fallback) ---

const flaechenCache = new Map<string, BlockMaterial>();

function texturMaterial(
  kandidaten: string[],
  fallbackFarbe: string,
  leuchtet: number,
  transparent: boolean,
  shader: boolean
): BlockMaterial {
  const key = `${kandidaten.join(',')}|${fallbackFarbe}|${leuchtet}|${transparent}|${shader}`;
  const vorhanden = flaechenCache.get(key);
  if (vorhanden) return vorhanden;

  let mat: BlockMaterial;
  if (leuchtet > 0) {
    mat = new THREE.MeshStandardMaterial({
      color: fallbackFarbe,
      emissive: fallbackFarbe,
      emissiveIntensity: emissivIntensitaet(leuchtet),
    });
  } else if (transparent) {
    // Cutout: solange keine Textur da ist, wirkt alphaTest nicht → solide Fallback-Farbe
    mat = new THREE.MeshLambertMaterial({ color: fallbackFarbe, alphaTest: 0.5 });
  } else {
    mat = new THREE.MeshLambertMaterial({ color: fallbackFarbe });
  }
  if (shader) aktiviereShader(mat);
  flaechenCache.set(key, mat);

  void ladeErsteTextur(kandidaten).then((tex) => {
    if (!tex) return;
    mat.map = tex;
    mat.color.set('#ffffff'); // Textur nicht einfärben
    if (leuchtet > 0 && mat instanceof THREE.MeshStandardMaterial) {
      mat.emissiveMap = tex;
      mat.emissive.set('#ffffff');
    }
    mat.needsUpdate = true;
  });

  return mat;
}

// --- Öffentliche Factory ---

const materialCache = new Map<string, BlockMaterial | BlockMaterial[]>();

/** Material für Typ × Detail × Shader — gecacht, Referenz bleibt stabil. */
export function holeMaterial(
  typ: BlockTyp,
  detail: Detail,
  shader: boolean
): BlockMaterial | BlockMaterial[] {
  const key = `${typ}|${detail}|${shader}`;
  const vorhanden = materialCache.get(key);
  if (vorhanden) return vorhanden;

  let material: BlockMaterial | BlockMaterial[];
  if (detail === 'minimal') {
    material = basisMaterial(typ, shader);
  } else {
    const { farbe, leuchtet, transparent, textur } = BLOCK_INFO[typ];
    const seite = texturMaterial(textur.seite, farbe, leuchtet, transparent, shader);
    const top = texturMaterial(textur.top, farbe, leuchtet, transparent, shader);
    const unten = texturMaterial(textur.unten, farbe, leuchtet, transparent, shader);
    // Gruppen-Reihenfolge der BoxGeometry: +x, −x, +y (top), −y (unten), +z, −z
    material = [seite, seite, top, unten, seite, seite];
  }
  materialCache.set(key, material);
  return material;
}

/** Nach Pack-Import/-Entfernung: Material-Caches leeren, damit Meshes frische Materialien ziehen. */
export function leereMaterialCache(): void {
  materialCache.clear();
  flaechenCache.clear();
}
