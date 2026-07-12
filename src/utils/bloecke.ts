import katalog from '../daten/katalog.json';

// Registry aller Block-Typen — Quelle ist der MineHub-Bedrock-Katalog
// (Mojang bedrock-samples + PrismarineJS/minecraft-data): deutsche Anzeigenamen,
// Kategorien, transparent/emitLight und pro Block ein repräsentativer Textur-Pfad.
// Flächen-Kandidaten werden aus diesem Pfad über die Bedrock-Suffix-Konvention
// abgeleitet (_top/_bottom/_normal/_side); Minimal-Farben bleiben Heuristik.

interface KatalogBlock {
  name: string;
  anzeige: string;
  kategorie: string;
  transparent: boolean;
  licht: number;
  nr: number;
  textur: string | null;
}

const KATALOG = katalog as {
  bedrockVersion: string;
  sprache: string;
  bloecke: KatalogBlock[];
};

export const KATALOG_VERSION = KATALOG.bedrockVersion;

export type BlockTyp = string;

/**
 * Textur-Kandidaten pro Fläche (Reihenfolge = Priorität). Aufgelöst wird erst
 * gegen das importierte Pack, dann gegen /textures/blocks/ — fehlt alles,
 * greift die Minimal-Farbe.
 */
interface BlockTextur {
  top: string[];
  seite: string[];
  unten: string[];
}

export interface BlockInfo {
  id: number;
  label: string;
  kategorie: string;
  /** Minimal-Darstellung (flache Farbe) und Fallback bei fehlender Textur */
  farbe: string;
  /** Lichtwert 0–15 — >0 bekommt emissives Material */
  leuchtet: number;
  /** Hoch = Cutout-Textur (alphaTest), Minimal = Alpha-Blending */
  transparent: boolean;
  textur: BlockTextur;
}

// --- Minimal-Farben: kuratiert → Farb-Präfix → Material-Keyword → Hash ---

const KURATIERT: Record<string, string> = {
  stone: '#8b929e', cobblestone: '#6f7680', stone_bricks: '#7c828c',
  grass_block: '#5fbf60', dirt: '#8a5a3b', gravel: '#9a938c',
  sand: '#e3cd8b', sandstone: '#d8c37e', red_sand: '#c1713a', red_sandstone: '#b4683a',
  oak_planks: '#b8865a', oak_log: '#6b4f2e', oak_leaves: '#3e8e41',
  brick_block: '#b4553e', snow: '#f2f6f9', snow_layer: '#f2f6f9', ice: '#9fd8f0',
  glass: '#cfe9f2', obsidian: '#120b1e', crying_obsidian: '#2a1454',
  gold_block: '#f5c542', iron_block: '#d8d8d8', diamond_block: '#4aedd9',
  emerald_block: '#17c544', lapis_block: '#1f4ba0', coal_block: '#2b2b2e',
  redstone_block: '#a80d00', netherite_block: '#443a3b', copper_block: '#c15a36',
  bedrock: '#3c3f45', netherrack: '#722e39', end_stone: '#dede9e',
  glowstone: '#ffd97a', sea_lantern: '#c8ecdf', shroomlight: '#f2954f',
  torch: '#ffd97a', lantern: '#ffb45c', magma: '#d96514',
  water: '#3f76e4', flowing_water: '#3f76e4', lava: '#e06b17', flowing_lava: '#e06b17',
  pumpkin: '#d88727', melon_block: '#8fae2c', clay: '#9aa3b0', mud: '#4c4056',
  hay_block: '#c9a833', bone_block: '#d9d3ba', slime: '#79c05a', honey_block: '#e9a83d',
  tnt: '#c43e33', bookshelf: '#a07850', crafting_table: '#94693c', furnace: '#6d7278',
  sponge: '#c3c14e', deepslate: '#4a4a52', calcite: '#dfdfda', tuff: '#6d6c66',
  amethyst_block: '#9a5cc6', dripstone_block: '#8a6a58', moss_block: '#5a7d2e',
  mycelium: '#6f6072', podzol: '#5b3f22', soul_sand: '#4e3b30', soul_soil: '#463228',
  basalt: '#4d4d52', blackstone: '#26222a', prismarine: '#639c97',
  quartz_block: '#ece9e2', purpur_block: '#a678a6',
};

const FARB_PRAEFIXE: [string, string][] = [
  ['light_blue_', '#6fa8dc'], ['light_gray_', '#9d9d97'], ['white_', '#e8e8e8'],
  ['orange_', '#e2822b'], ['magenta_', '#c74ebd'], ['yellow_', '#f0c22e'],
  ['lime_', '#80c71f'], ['pink_', '#ed8dac'], ['gray_', '#5e6266'],
  ['cyan_', '#169c9c'], ['purple_', '#8932b8'], ['blue_', '#3c44aa'],
  ['brown_', '#835432'], ['green_', '#5e7c16'], ['red_', '#b02e26'],
  ['black_', '#26262a'], ['silver_', '#9d9d97'],
];

const KEYWORDS: [string, string][] = [
  ['deepslate', '#4a4a52'], ['blackstone', '#26222a'], ['obsidian', '#120b1e'],
  ['water', '#3f76e4'], ['lava', '#e06b17'], ['fire', '#e0742f'], ['magma', '#d96514'],
  ['grass', '#5fbf60'], ['leaves', '#3e8e41'], ['leaf', '#3e8e41'], ['moss', '#5a7d2e'],
  ['vine', '#4a7d3a'], ['fern', '#4f8a3d'], ['bush', '#4f8a3d'], ['sapling', '#4f8a3d'],
  ['kelp', '#3d7a35'], ['cactus', '#587f3e'], ['bamboo', '#8fae2c'], ['azalea', '#5a7d2e'],
  ['flower', '#d977b6'], ['tulip', '#d977b6'], ['orchid', '#6fa8dc'], ['rose', '#c74e5b'],
  ['mushroom', '#a4756a'], ['fungus', '#a4756a'], ['nylium', '#8a4a5e'],
  ['crimson', '#7e3653'], ['warped', '#2a7a72'], ['nether', '#722e39'], ['soul', '#4e3b30'],
  ['end_', '#dede9e'], ['purpur', '#a678a6'], ['chorus', '#8a6a9a'],
  ['copper', '#c15a36'], ['iron', '#c8c8c8'], ['gold', '#f5c542'], ['diamond', '#4aedd9'],
  ['emerald', '#17c544'], ['lapis', '#1f4ba0'], ['redstone', '#a80d00'], ['coal', '#2b2b2e'],
  ['quartz', '#ece9e2'], ['amethyst', '#9a5cc6'], ['netherite', '#443a3b'],
  ['prismarine', '#639c97'], ['sculk', '#0b3c44'], ['glow', '#ffd97a'],
  ['torch', '#ffd97a'], ['lantern', '#ffb45c'], ['candle', '#e8d3a8'],
  ['sandstone', '#d8c37e'], ['sand', '#e3cd8b'], ['gravel', '#9a938c'],
  ['terracotta', '#985e43'], ['mud', '#4c4056'], ['dirt', '#8a5a3b'], ['clay', '#9aa3b0'],
  ['planks', '#b8865a'], ['log', '#6b4f2e'], ['wood', '#6b4f2e'], ['stripped', '#c19a5f'],
  ['oak', '#b8865a'], ['spruce', '#6b4a2b'], ['birch', '#d7cb8d'], ['jungle', '#a5744f'],
  ['acacia', '#ba6337'], ['cherry', '#e2b1c8'], ['mangrove', '#773934'],
  ['granite', '#9a6b5c'], ['diorite', '#c9c9c9'], ['andesite', '#888a85'],
  ['tuff', '#6d6c66'], ['basalt', '#4d4d52'], ['calcite', '#dfdfda'],
  ['brick', '#a05545'], ['stone', '#8b929e'], ['cobble', '#6f7680'],
  ['glass', '#cfe9f2'], ['ice', '#9fd8f0'], ['snow', '#f2f6f9'], ['powder', '#eef4f8'],
  ['coral', '#e07f9d'], ['slime', '#79c05a'], ['honey', '#e9a83d'], ['wax', '#c15a36'],
  ['element', '#7a8699'], ['command', '#b08262'], ['structure', '#6a5a72'],
];

function hashFarbe(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  return `hsl(${hue}, 32%, 52%)`;
}

function farbeFuer(id: string): string {
  const kuratiert = KURATIERT[id];
  if (kuratiert) return kuratiert;
  for (const [praefix, farbe] of FARB_PRAEFIXE) {
    if (id.startsWith(praefix)) return farbe;
  }
  for (const [wort, farbe] of KEYWORDS) {
    if (id.includes(wort)) return farbe;
  }
  return hashFarbe(id);
}

// --- Flächen-Kandidaten aus dem repräsentativen Katalog-Pfad ableiten ---

const BASIS_PFAD = 'textures/blocks';

/** Bekannte Bedrock-Suffixe vom Dateinamen strippen → Basisname der Textur-Familie. */
const SUFFIX_MUSTER = /_(top|bottom|normal|side|front_off|front_on|front|off|on|lit)$/;

function ohneEndung(pfad: string): { ordner: string; basis: string } {
  const teile = pfad.replace(/\.png$/i, '').split('/');
  const datei = teile.pop() ?? '';
  return { ordner: teile.join('/'), basis: datei.replace(SUFFIX_MUSTER, '') };
}

function eindeutig(liste: string[]): string[] {
  return [...new Set(liste)];
}

/**
 * Kandidaten pro Fläche: Bedrock-Konvention (_top / _side|_normal / _bottom)
 * relativ zur Textur-Familie des repräsentativen Pfads, dieser selbst als Fallback.
 */
function texturAusPfad(pfad: string): BlockTextur {
  const { ordner, basis } = ohneEndung(pfad);
  const p = (name: string) => `${ordner}/${name}.png`;
  return {
    top: eindeutig([p(`${basis}_top`), pfad, p(basis)]),
    seite: eindeutig([p(`${basis}_side`), p(`${basis}_normal`), p(basis), pfad]),
    unten: eindeutig([p(`${basis}_bottom`), p(`${basis}_top`), p(basis), pfad]),
  };
}

/** Ohne Katalog-Pfad: name-basierte Kandidaten im Standard-Ordner. */
function texturAusName(name: string): BlockTextur {
  return texturAusPfad(`${BASIS_PFAD}/${name}.png`);
}

const einheitlich = (datei: string): BlockTextur => {
  const pfad = `${BASIS_PFAD}/${datei}`;
  return { top: [pfad], seite: [pfad], unten: [pfad] };
};

/** Ausnahmen, die weder Katalog-Pfad noch Namensschema treffen (Bedrock-Dateinamen). */
const FLAECHEN: Record<string, BlockTextur> = {
  grass_block: {
    top: [`${BASIS_PFAD}/grass_top.png`],
    seite: [`${BASIS_PFAD}/grass_side.png`],
    unten: [`${BASIS_PFAD}/dirt.png`],
  },
  podzol: {
    top: [`${BASIS_PFAD}/dirt_podzol_top.png`],
    seite: [`${BASIS_PFAD}/dirt_podzol_side.png`, `${BASIS_PFAD}/dirt.png`],
    unten: [`${BASIS_PFAD}/dirt.png`],
  },
  mycelium: {
    top: [`${BASIS_PFAD}/mycelium_top.png`],
    seite: [`${BASIS_PFAD}/mycelium_side.png`, `${BASIS_PFAD}/dirt.png`],
    unten: [`${BASIS_PFAD}/dirt.png`],
  },
  grass_path: {
    top: [`${BASIS_PFAD}/grass_path_top.png`],
    seite: [`${BASIS_PFAD}/grass_path_side.png`, `${BASIS_PFAD}/dirt.png`],
    unten: [`${BASIS_PFAD}/dirt.png`],
  },
  bookshelf: {
    top: [`${BASIS_PFAD}/planks_oak.png`],
    seite: [`${BASIS_PFAD}/bookshelf.png`],
    unten: [`${BASIS_PFAD}/planks_oak.png`],
  },
  crafting_table: {
    top: [`${BASIS_PFAD}/crafting_table_top.png`],
    seite: [`${BASIS_PFAD}/crafting_table_side.png`, `${BASIS_PFAD}/planks_oak.png`],
    unten: [`${BASIS_PFAD}/planks_oak.png`],
  },
};

// --- Registry aufbauen ---

export const BLOCK_INFO: Record<BlockTyp, BlockInfo> = {};

for (const b of KATALOG.bloecke) {
  BLOCK_INFO[b.name] = {
    id: b.nr,
    label: b.anzeige,
    kategorie: b.kategorie,
    farbe: farbeFuer(b.name),
    leuchtet: b.licht,
    transparent: b.transparent,
    textur: FLAECHEN[b.name] ?? (b.textur ? texturAusPfad(b.textur) : texturAusName(b.name)),
  };
}

// Eigenkreation aus v0.1 — bleibt als Bonus-Block erhalten
BLOCK_INFO.neon = {
  id: -1,
  label: 'Neon',
  kategorie: 'decoration',
  farbe: '#00e5ff',
  leuchtet: 12,
  transparent: false,
  textur: einheitlich('neon.png'),
};

/** Anzeige-/Suchreihenfolge: Katalog-Reihenfolge, neon am Ende. */
export const BLOCK_LISTE: BlockTyp[] = Object.keys(BLOCK_INFO);

/** Vorhandene Kategorien in Katalog-Reihenfolge — für den Picker-Filter. */
export const KATEGORIEN: string[] = [...new Set(BLOCK_LISTE.map((t) => BLOCK_INFO[t].kategorie))];

export function istBlockTyp(wert: unknown): wert is BlockTyp {
  return typeof wert === 'string' && wert in BLOCK_INFO;
}

// --- Migration: deutsche IDs aus v0.1–v0.7 → Bedrock-IDs (Builds, Hotbar, Auswahl) ---

const ALT_ZU_NEU: Record<string, BlockTyp> = {
  gras: 'grass_block', erde: 'dirt', stein: 'stone', bruchstein: 'cobblestone',
  steinziegel: 'stone_bricks', eichenstamm: 'oak_log', eichenbretter: 'oak_planks',
  laub: 'oak_leaves', sandstein: 'sandstone', kies: 'gravel', ziegel: 'brick_block',
  schnee: 'snow', eis: 'ice', glas: 'glass', wolle_weiss: 'white_wool',
  wolle_rot: 'red_wool', wolle_blau: 'blue_wool', gold: 'gold_block',
  // sand, obsidian, neon: Name unverändert
};

export function migriereTyp(typ: string): string {
  return ALT_ZU_NEU[typ] ?? typ;
}
