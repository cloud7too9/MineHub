#!/usr/bin/env node
// build-bedrock-catalog.mjs
//
// Combines Mojang's bedrock-samples (textures + lang) with PrismarineJS
// minecraft-data (items / blocks index) into a single static catalog you can
// ship from a web server.
//
// Usage:
//   node build-bedrock-catalog.mjs \
//     --samples ./bedrock-samples \
//     --data    ./minecraft-data \
//     --version 1.21.60 \
//     --out     ./public \
//     --lang    de_DE
//
// Produces under <out>/:
//   bedrock-catalog.json    { meta, counts, byCategory, items[], blocks[] }
//   textures/items/*.png
//   textures/blocks/*.png
//
// Each item/block entry carries:
//   { id, name, displayName, category, stackSize, textures, ... }
//
// `category` is assigned by a heuristic (see CATEGORY_RULES below). Entries
// that don't match any rule land in `misc` — check that count after the first
// run and extend the rule list if useful things slip through.

import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCRIPT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// CLI

function printHelp() {
  process.stdout.write(`build-bedrock-catalog ${SCRIPT_VERSION}

Combine Mojang bedrock-samples and PrismarineJS minecraft-data into a single
static catalog (JSON + textures).

Required:
  --samples <dir>   Path to a checkout of Mojang/bedrock-samples
  --data    <dir>   Path to a checkout of PrismarineJS/minecraft-data
  --version <ver>   Bedrock version (e.g. 1.21.60). Used to locate
                    <data>/data/bedrock/<version>/.
  --out     <dir>   Output directory (created if missing).

Optional:
  --lang    <code>  Language code for displayName lookups, default en_US.
                    Resolves to <samples>/resource_pack/texts/<code>.lang.
  --pretty          Pretty-print JSON output (default: minified).
  --no-textures     Skip copying PNG files (write JSON only).
  --quiet           Suppress per-warning lines (still prints final summary).
  -h, --help        Show this help.
`);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      samples:     { type: 'string' },
      data:        { type: 'string' },
      version:     { type: 'string' },
      out:         { type: 'string' },
      lang:        { type: 'string', default: 'en_US' },
      pretty:      { type: 'boolean', default: false },
      'no-textures': { type: 'boolean', default: false },
      quiet:       { type: 'boolean', default: false },
      help:        { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
} catch (err) {
  process.stderr.write(`error: ${err.message}\n\n`);
  printHelp();
  process.exit(2);
}

const opts = parsed.values;

if (opts.help) {
  printHelp();
  process.exit(0);
}

const required = ['samples', 'data', 'version', 'out'];
const missing = required.filter((k) => !opts[k]);
if (missing.length) {
  process.stderr.write(`error: missing required option(s): ${missing.map((m) => '--' + m).join(', ')}\n\n`);
  printHelp();
  process.exit(2);
}

const SAMPLES = path.resolve(opts.samples);
const DATA    = path.resolve(opts.data);
const OUT     = path.resolve(opts.out);
const VERSION = opts.version;
const LANG    = opts.lang;
const PRETTY  = opts.pretty;
const COPY    = !opts['no-textures'];
const QUIET   = opts.quiet;

const RP = path.join(SAMPLES, 'resource_pack');

// ---------------------------------------------------------------------------
// Logging helpers

const warnings = [];
function warn(msg) {
  warnings.push(msg);
  if (!QUIET) process.stderr.write(`warn: ${msg}\n`);
}
function info(msg) {
  process.stdout.write(`${msg}\n`);
}

// ---------------------------------------------------------------------------
// Filesystem helpers

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(p) {
  const raw = await fs.readFile(p, 'utf8');
  // bedrock-samples ships JSON with // and /* */ comments. Strip them.
  return JSON.parse(stripJsonComments(raw));
}

function stripJsonComments(src) {
  let out = '';
  let i = 0;
  let inStr = false;
  let strCh = '';
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\' && i + 1 < src.length) { out += src[i + 1]; i += 2; continue; }
      if (c === strCh) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; out += c; i++; continue; }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Source validation

async function validateSources() {
  if (!(await exists(SAMPLES))) throw new Error(`--samples directory not found: ${SAMPLES}`);
  if (!(await exists(DATA)))    throw new Error(`--data directory not found: ${DATA}`);
  if (!(await exists(RP)))      throw new Error(`expected resource_pack/ inside --samples: ${RP}`);
}

// ---------------------------------------------------------------------------
// minecraft-data loader

async function loadMcData() {
  // Direct lookup first.
  const direct = path.join(DATA, 'data', 'bedrock', VERSION);
  let itemsPath  = path.join(direct, 'items.json');
  let blocksPath = path.join(direct, 'blocks.json');

  if (!(await exists(itemsPath)) || !(await exists(blocksPath))) {
    // Fall back to dataPaths.json index.
    const idxPath = path.join(DATA, 'data', 'dataPaths.json');
    if (!(await exists(idxPath))) {
      throw new Error(
        `bedrock data for ${VERSION} not found at ${direct} ` +
        `and dataPaths.json index missing at ${idxPath}`,
      );
    }
    const idx = await readJson(idxPath);
    const entry = idx?.bedrock?.[VERSION];
    if (!entry) {
      const known = Object.keys(idx?.bedrock ?? {}).join(', ') || '(none)';
      throw new Error(`version "${VERSION}" not in dataPaths.json bedrock index. Known: ${known}`);
    }
    if (entry.items)  itemsPath  = path.join(DATA, 'data', entry.items,  'items.json');
    if (entry.blocks) blocksPath = path.join(DATA, 'data', entry.blocks, 'blocks.json');
  }

  const [items, blocks] = await Promise.all([readJson(itemsPath), readJson(blocksPath)]);
  if (!Array.isArray(items))  throw new Error(`expected array in ${itemsPath}`);
  if (!Array.isArray(blocks)) throw new Error(`expected array in ${blocksPath}`);
  info(`loaded ${items.length} items, ${blocks.length} blocks from minecraft-data`);
  return { items, blocks, itemsPath, blocksPath };
}

// ---------------------------------------------------------------------------
// Texture index loader

async function loadTextureIndex(jsonRelPath) {
  const p = path.join(RP, jsonRelPath);
  if (!(await exists(p))) {
    warn(`texture index missing: ${p}`);
    return new Map();
  }
  const data = await readJson(p);
  const td = data?.texture_data ?? {};
  const out = new Map();
  for (const [key, val] of Object.entries(td)) {
    const t = val?.textures;
    if (!t) continue;
    const first = Array.isArray(t) ? t[0] : t;
    if (typeof first === 'string') out.set(key, first);
    else if (first && typeof first.path === 'string') out.set(key, first.path);
  }
  return out;
}

// ---------------------------------------------------------------------------
// .lang loader
//
// Bedrock .lang files are roughly:
//   tile.stone.name=Stein
//   item.diamond_sword.name=Diamantschwert        ## comment
//   ## leading comment
//
// They are typically UTF-8 with BOM. Values may contain '=' (rare) — split on
// first '='. Trailing "## comment" segments are stripped.

async function loadLang(code) {
  const p = path.join(RP, 'texts', `${code}.lang`);
  if (!(await exists(p))) {
    warn(`language file missing: ${p} (continuing with raw displayName)`);
    return new Map();
  }
  let raw = await fs.readFile(p, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const map = new Map();
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    const hash = value.indexOf('##');
    if (hash >= 0) value = value.slice(0, hash);
    value = value.trim();
    if (key) map.set(key, value);
  }
  info(`loaded ${map.size} translations from ${path.basename(p)}`);
  return map;
}

// ---------------------------------------------------------------------------
// Lookup helpers

function stripNs(name) {
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
}

function lookupTexture(textureMap, name) {
  const bare = stripNs(name);
  return textureMap.get(name) ?? textureMap.get(bare) ?? null;
}

function lookupTranslation(lang, name) {
  const bare = stripNs(name);
  const ns = `minecraft:${bare}`;
  // Mojang's .lang keys are historically inconsistent. Try the common patterns
  // in descending order of specificity. First hit wins.
  const candidates = [
    // Classic "<kind>.<name>.name"
    `item.${name}.name`,
    `item.${bare}.name`,
    `item.${ns}.name`,
    `tile.${name}.name`,
    `tile.${bare}.name`,
    `tile.${ns}.name`,
    // Double-name variant used for some blocks (e.g. tile.stone.stone.name)
    `tile.${bare}.${bare}.name`,
    `item.${bare}.${bare}.name`,
    // Modern "block.minecraft.<name>.name" / "item.minecraft.<name>.name"
    `block.minecraft.${bare}.name`,
    `item.minecraft.${bare}.name`,
    `block.${bare}.name`,
    // Some keys omit the .name suffix
    `item.${bare}`,
    `tile.${bare}`,
    `block.minecraft.${bare}`,
    `item.minecraft.${bare}`,
  ];
  for (const k of candidates) {
    const v = lang.get(k);
    if (v) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Category classifier
//
// Heuristic, ordered rules. First match wins, so the list is sorted from the
// most-specific (technical hides, spawn eggs, music discs) to the most
// generic (plants, natural stone, wood). Items/blocks that escape every rule
// land in `misc` — keep an eye on that bucket size after each run.

const CATEGORY_RULES = [
  ['technical', [
    /^air$/, /^cave_air$/, /^void_air$/,
    /portal$/, /_portal$/,
    /^barrier$/, /^deny$/, /^allow$/, /^border_block$/,
    /command_block$/, /^chain_command_block$/, /^repeating_command_block$/,
    /^structure_block$/, /^structure_void$/, /^jigsaw$/,
    /^light$/, /^light_block/,
    /^moving_piston$/, /^piston_arm_collision$/, /^sticky_piston_arm_collision$/,
    /^flowing_/, /^invisible_bedrock$/,
    /^info_update/, /^reserved\d*$/, /^unknown$/,
    /^client_request_placeholder_block$/, /^camera$/, /^debug_stick$/,
    /^standing_(sign|banner)$/, /^wall_sign$/, /^wall_banner$/,
  ]],
  ['spawn_egg',   [/spawn_egg$/]],
  ['music_disc',  [/^music_disc_/, /^record_/, /^disc_fragment/]],
  ['potion',      [/^potion$/, /^splash_potion$/, /^lingering_potion$/, /^experience_bottle$/, /^glass_bottle$/, /^dragon_breath$/]],
  ['armor',       [/_helmet$/, /_chestplate$/, /_leggings$/, /_boots$/, /^shield$/, /^elytra$/, /^turtle_helmet$/]],
  ['weapon',      [/_sword$/, /^bow$/, /^crossbow$/, /^trident$/, /_arrow$/, /^arrow$/, /^firework_rocket$/]],
  ['tool',        [/_pickaxe$/, /_shovel$/, /_axe$/, /_hoe$/, /^shears$/, /^flint_and_steel$/, /^fishing_rod$/, /^compass$/, /^recovery_compass$/, /^clock$/, /_map$/, /^empty_map$/, /^map$/, /^spyglass$/, /_bucket$/, /^bucket$/, /^brush$/, /^lead$/, /^name_tag$/, /^goat_horn$/, /^totem_of_undying$/]],
  ['transport',   [/^boat$/, /_boat$/, /^chest_boat$/, /_minecart$/, /^minecart$/, /_rail$/, /^rail$/, /^saddle$/, /_horse_armor$/, /^horse_armor$/, /^carrot_on_a_stick$/, /^warped_fungus_on_a_stick$/]],
  ['food',        [/^apple$/, /^bread$/, /^beef$/, /^porkchop$/, /^chicken$/, /^mutton$/, /^rabbit$/, /^cod$/, /^salmon$/, /^tropical_fish$/, /^pufferfish$/, /^cooked_/, /^baked_/, /^rotten_flesh$/, /^spider_eye$/, /^golden_apple$/, /^enchanted_golden_apple$/, /^golden_carrot$/, /^dried_kelp$/, /^honey_bottle$/, /^milk_bucket$/, /_stew$/, /^stew$/, /_soup$/, /^cake$/, /^cookie$/, /^pumpkin_pie$/, /^sweet_berries$/, /^glow_berries$/, /^chorus_fruit$/, /^popped_chorus_fruit$/, /^melon_slice$/, /^carrot$/, /^potato$/, /^baked_potato$/, /^poisonous_potato$/, /^beetroot$/, /^wheat$/, /^sugar$/]],
  ['dye',         [/_dye$/, /^ink_sac$/, /^glow_ink_sac$/, /^bone_meal$/, /^cocoa_beans$/, /^lapis_lazuli$/]],
  ['crop',        [/_seeds$/, /^wheat_seeds$/]],
  ['redstone',    [/^redstone$/, /^redstone_block$/, /^redstone_wire$/, /^redstone_torch$/, /^redstone_lamp$/, /^piston$/, /^sticky_piston$/, /^dropper$/, /^dispenser$/, /^hopper$/, /^repeater$/, /^comparator$/, /^observer$/, /^lever$/, /_button$/, /^button$/, /_pressure_plate$/, /^daylight_detector$/, /^tnt$/, /^target$/, /^note_block$/, /^tripwire_hook$/, /^string$/, /^activator_rail$/, /^detector_rail$/, /^powered_rail$/]],
  ['utility',     [/^crafting_table$/, /^furnace$/, /^blast_furnace$/, /^smoker$/, /^anvil$/, /_anvil$/, /^enchanting_table$/, /^brewing_stand$/, /^cauldron$/, /_cauldron$/, /^beacon$/, /^grindstone$/, /^loom$/, /^stonecutter(_block)?$/, /^cartography_table$/, /^fletching_table$/, /^smithing_table$/, /^barrel$/, /^chest$/, /^ender_chest$/, /^trapped_chest$/, /^lectern$/, /^bell$/, /^composter$/, /^bookshelf$/, /^chiseled_bookshelf$/, /^jukebox$/, /^respawn_anchor$/, /^lodestone$/, /^conduit$/, /^end_portal_frame$/, /^decorated_pot$/, /^crafter$/]],
  ['bed',         [/_bed$/]],
  ['shulker',     [/^shulker_box$/, /_shulker_box$/, /^shulker_shell$/]],
  ['mob_head',    [/_skull$/, /^skull$/, /_head$/]],
  ['decoration',  [/^torch$/, /^soul_torch$/, /^lantern$/, /^soul_lantern$/, /^chain$/, /_banner$/, /^banner$/, /_sign$/, /^sign$/, /_hanging_sign$/, /^flower_pot$/, /_candle$/, /^candle$/, /^amethyst_block$/, /^amethyst_cluster$/, /_amethyst_bud$/, /^budding_amethyst$/, /^sculk$/, /^sculk_vein$/, /^sculk_sensor$/, /^sculk_shrieker$/, /^sculk_catalyst$/, /^end_rod$/, /^lightning_rod$/, /^item_frame$/, /^glow_item_frame$/, /_painting$/, /^painting$/, /_carpet$/, /^carpet$/, /^snow_layer$/, /^cobweb$/, /^armor_stand$/]],
  ['wool',        [/_wool$/, /^wool$/]],
  ['glass',       [/_glass$/, /_glass_pane$/, /^glass$/, /^glass_pane$/, /^tinted_glass$/]],
  ['concrete',    [/_concrete$/, /_concrete_powder$/, /_terracotta$/, /^terracotta$/, /_glazed_terracotta$/]],
  ['plant',       [/_sapling$/, /^sapling$/, /_leaves$/, /^leaves$/, /^dandelion$/, /^poppy$/, /_tulip$/, /^blue_orchid$/, /^allium$/, /^azure_bluet$/, /^oxeye_daisy$/, /^cornflower$/, /^lily_of_the_valley$/, /^sunflower$/, /^lilac$/, /^peony$/, /^rose_bush$/, /^wither_rose$/, /^tall_grass$/, /^short_grass$/, /^grass$/, /^fern$/, /^large_fern$/, /^seagrass$/, /^tall_seagrass$/, /^kelp/, /^sugar_cane$/, /^bamboo/, /_vine$/, /^vine$/, /^cactus$/, /^dead_bush$/, /^lily_pad$/, /^sweet_berry_bush$/, /^nether_sprouts$/, /_roots$/, /_fungus$/, /^big_dripleaf$/, /^small_dripleaf$/, /^azalea$/, /^flowering_azalea$/, /^moss_carpet$/, /^pale_moss_carpet$/, /^moss_block$/, /^hanging_roots$/, /^spore_blossom$/, /^mangrove_propagule$/, /^pink_petals$/, /^pitcher_plant$/, /^torchflower$/, /^torchflower_crop$/, /^pitcher_crop$/]],
  ['mineral',     [/_ingot$/, /_nugget$/, /^diamond$/, /^emerald$/, /^quartz$/, /^nether_quartz$/, /^coal$/, /^charcoal$/, /^raw_iron$/, /^raw_gold$/, /^raw_copper$/, /^netherite_scrap$/, /^amethyst_shard$/, /^prismarine_(crystals|shard)$/, /^nautilus_shell$/, /^heart_of_the_sea$/, /^echo_shard$/, /^disc_fragment_5$/]],
  ['ore',         [/_ore$/]],
  ['wood',        [/_log$/, /^log$/, /_wood$/, /^wood$/, /_planks$/, /^planks$/, /_fence$/, /^fence$/, /_fence_gate$/, /_door$/, /^door$/, /_trapdoor$/, /^trapdoor$/, /_slab$/, /^slab$/, /_stairs$/, /^stairs$/, /^stripped_/, /_button$/, /_pressure_plate$/]],
  ['stone',       [/^stone$/, /^cobblestone/, /^mossy_cobblestone/, /^andesite/, /^diorite/, /^granite/, /^basalt/, /^polished_basalt$/, /^smooth_basalt$/, /^blackstone/, /^deepslate/, /^tuff/, /^calcite$/, /^dripstone_block$/, /^pointed_dripstone$/, /_bricks$/, /_brick$/, /^bedrock$/, /^end_stone/, /^netherrack$/, /^nether_bricks$/, /^red_nether_bricks$/, /^soul_soil$/, /^soul_sand$/, /^magma(_block)?$/, /^obsidian$/, /^crying_obsidian$/, /^glowstone$/, /^shroomlight$/, /^sea_lantern$/, /^prismarine/, /^purpur/]],
  ['natural',     [/^dirt$/, /_dirt$/, /^grass_block$/, /^mycelium$/, /^podzol$/, /^sand$/, /^red_sand$/, /^gravel$/, /^clay$/, /^mud$/, /^muddy_mangrove_roots$/, /^packed_mud$/, /^mud_bricks$/, /^snow_block$/, /^snow$/, /^ice$/, /^packed_ice$/, /^blue_ice$/, /^frosted_ice$/, /^water$/, /^lava$/, /^coarse_dirt$/, /^rooted_dirt$/, /^sponge$/, /^wet_sponge$/, /^bone_block$/, /^honeycomb(_block)?$/, /^honey_block$/, /^slime_block$/, /^dried_kelp_block$/]],
  ['egg',         [/^egg$/, /^turtle_egg$/, /^sniffer_egg$/, /^armadillo_scute$/, /^scute$/]],
  ['mob_drop',    [/^leather$/, /^feather$/, /^gunpowder$/, /^bone$/, /^rabbit_hide$/, /^rabbit_foot$/, /^phantom_membrane$/, /^blaze_rod$/, /^blaze_powder$/, /^ghast_tear$/, /^magma_cream$/, /^slime_ball$/, /^ender_pearl$/, /^ender_eye$/, /^nether_star$/, /^wither_skeleton_skull$/, /^nautilus_shell$/, /^heart_of_the_sea$/, /^copper_ingot$/, /^fire_charge$/]],
];

function classify(name) {
  const bare = stripNs(name);
  for (const [cat, rules] of CATEGORY_RULES) {
    for (const re of rules) if (re.test(bare)) return cat;
  }
  return 'misc';
}

// ---------------------------------------------------------------------------
// Texture copy
//
// Texture paths inside item_texture.json / terrain_texture.json are relative
// to the resource pack root and have no extension. We probe a few extensions
// and copy the first hit into <out>/<sameRelPath>.<ext>.
//
// Returns the web-relative path written, or null if no source PNG was found.

const COPY_EXTS = ['.png', '.tga', '.jpg', '.jpeg'];

async function copyTexture(textureRel, copiedSet) {
  // Normalize to forward-slash, resource-pack-relative.
  const rel = textureRel.replace(/\\/g, '/').replace(/^\.\//, '');
  for (const ext of COPY_EXTS) {
    const src = path.join(RP, rel + ext);
    if (!(await exists(src))) continue;
    const dstRel = rel + ext;
    if (!copiedSet.has(dstRel)) {
      const dst = path.join(OUT, dstRel);
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
      copiedSet.add(dstRel);
    }
    return dstRel;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build pipeline

async function build() {
  await validateSources();
  await fs.mkdir(OUT, { recursive: true });

  const [{ items, blocks, itemsPath, blocksPath }, itemTex, terrainTex, lang] = await Promise.all([
    loadMcData(),
    loadTextureIndex('textures/item_texture.json'),
    loadTextureIndex('textures/terrain_texture.json'),
    loadLang(LANG),
  ]);

  const copied = new Set();
  const categoryCounts = {};
  let texMissItems = 0;
  let texMissBlocks = 0;
  let trMissItems = 0;
  let trMissBlocks = 0;

  async function resolveTexture(name, preferTerrain) {
    const primary = preferTerrain ? terrainTex : itemTex;
    const secondary = preferTerrain ? itemTex : terrainTex;
    const texRel = lookupTexture(primary, name) ?? lookupTexture(secondary, name);
    if (!texRel) return null;
    if (COPY) return await copyTexture(texRel, copied);
    return texRel + '.png';
  }

  function bumpCategory(cat) {
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  // Items ------------------------------------------------------------------
  const outItems = [];
  for (const it of items) {
    const name = it.name;
    if (!name) continue;
    const textures = await resolveTexture(name, false);
    if (!textures) {
      texMissItems++;
      warn(`no texture for item: ${name}`);
    }
    const tr = lookupTranslation(lang, name);
    if (!tr) trMissItems++;
    const category = classify(name);
    bumpCategory(category);
    outItems.push({
      id: it.id,
      name,
      displayName: tr ?? it.displayName ?? name,
      category,
      stackSize: it.stackSize ?? 64,
      maxDurability: it.maxDurability,
      textures,
    });
  }

  // Blocks -----------------------------------------------------------------
  const outBlocks = [];
  for (const b of blocks) {
    const name = b.name;
    if (!name) continue;
    const textures = await resolveTexture(name, true);
    if (!textures) {
      texMissBlocks++;
      warn(`no texture for block: ${name}`);
    }
    const tr = lookupTranslation(lang, name);
    if (!tr) trMissBlocks++;
    const category = classify(name);
    bumpCategory(category);
    outBlocks.push({
      id: b.id,
      name,
      displayName: tr ?? b.displayName ?? name,
      category,
      stackSize: b.stackSize ?? 64,
      hardness: b.hardness,
      resistance: b.resistance,
      diggable: b.diggable,
      transparent: b.transparent,
      emitLight: b.emitLight,
      filterLight: b.filterLight,
      drops: b.drops,
      textures,
    });
  }

  const sortedCategories = Object.fromEntries(
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]),
  );

  // Catalog ----------------------------------------------------------------
  const catalog = {
    schemaVersion: 1,
    generator: { name: 'build-bedrock-catalog', version: SCRIPT_VERSION },
    bedrockVersion: VERSION,
    language: LANG,
    generatedAt: new Date().toISOString(),
    sources: {
      samples: path.relative(process.cwd(), SAMPLES) || '.',
      data: path.relative(process.cwd(), DATA) || '.',
      itemsJson: path.relative(DATA, itemsPath),
      blocksJson: path.relative(DATA, blocksPath),
    },
    counts: {
      items: outItems.length,
      blocks: outBlocks.length,
      texturesCopied: copied.size,
      missingTextures: { items: texMissItems, blocks: texMissBlocks },
      missingTranslations: { items: trMissItems, blocks: trMissBlocks },
      byCategory: sortedCategories,
    },
    items: outItems,
    blocks: outBlocks,
  };

  const space = PRETTY ? 2 : 0;
  await fs.writeFile(path.join(OUT, 'bedrock-catalog.json'), JSON.stringify(catalog, null, space));

  // Hash for cache-busting / integrity.
  const hash = createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0, 16);

  info('');
  info(`catalog written to ${OUT}/bedrock-catalog.json`);
  info(`  bedrock ${VERSION} / lang ${LANG}`);
  info(`  items   : ${outItems.length} (texture missing: ${texMissItems}, translation missing: ${trMissItems})`);
  info(`  blocks  : ${outBlocks.length} (texture missing: ${texMissBlocks}, translation missing: ${trMissBlocks})`);
  info(`  textures: ${copied.size} files copied`);
  info(`  digest  : ${hash}`);
  info(`  categories:`);
  for (const [cat, n] of Object.entries(sortedCategories)) {
    const tag = cat === 'misc' ? ' ← check this bucket' : '';
    info(`    ${cat.padEnd(12)} ${String(n).padStart(5)}${tag}`);
  }
  if (warnings.length && QUIET) info(`  warnings: ${warnings.length} (suppressed; rerun without --quiet to see)`);
}

// ---------------------------------------------------------------------------
// Entry

build().catch((err) => {
  const msg = err?.message || String(err);
  process.stderr.write(`\nerror: ${msg}\n`);
  if (process.env.DEBUG && err?.stack) process.stderr.write(err.stack + '\n');
  process.exit(1);
});
