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
//   catalog.json         { version, language, counts, items[], blocks[] }
//   items.json           items[] only
//   blocks.json          blocks[] only
//   textures/items/*.png
//   textures/blocks/*.png

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

function lookupTranslation(lang, kinds, name) {
  const bare = stripNs(name);
  for (const kind of kinds) {
    for (const variant of [name, bare, `minecraft:${bare}`]) {
      const v = lang.get(`${kind}.${variant}.name`);
      if (v) return v;
    }
  }
  return null;
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
  let texMissItems = 0;
  let texMissBlocks = 0;
  let trMissItems = 0;
  let trMissBlocks = 0;

  // Items ------------------------------------------------------------------
  const outItems = [];
  for (const it of items) {
    const name = it.name;
    if (!name) continue;
    const texRel = lookupTexture(itemTex, name) ?? lookupTexture(terrainTex, name);
    let texturePath = null;
    if (texRel) {
      if (COPY) texturePath = await copyTexture(texRel, copied);
      else texturePath = texRel + '.png';
    }
    if (!texturePath) {
      texMissItems++;
      warn(`no texture for item: ${name}`);
    }
    const tr = lookupTranslation(lang, ['item', 'tile'], name);
    if (!tr) trMissItems++;
    outItems.push({
      id: it.id,
      name,
      displayName: tr ?? it.displayName ?? name,
      stackSize: it.stackSize ?? 64,
      maxDurability: it.maxDurability,
      texture: texturePath,
    });
  }

  // Blocks -----------------------------------------------------------------
  const outBlocks = [];
  for (const b of blocks) {
    const name = b.name;
    if (!name) continue;
    const texRel = lookupTexture(terrainTex, name) ?? lookupTexture(itemTex, name);
    let texturePath = null;
    if (texRel) {
      if (COPY) texturePath = await copyTexture(texRel, copied);
      else texturePath = texRel + '.png';
    }
    if (!texturePath) {
      texMissBlocks++;
      warn(`no texture for block: ${name}`);
    }
    const tr = lookupTranslation(lang, ['tile', 'item'], name);
    if (!tr) trMissBlocks++;
    outBlocks.push({
      id: b.id,
      name,
      displayName: tr ?? b.displayName ?? name,
      stackSize: b.stackSize ?? 64,
      hardness: b.hardness,
      resistance: b.resistance,
      diggable: b.diggable,
      transparent: b.transparent,
      emitLight: b.emitLight,
      filterLight: b.filterLight,
      drops: b.drops,
      texture: texturePath,
    });
  }

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
    },
    items: outItems,
    blocks: outBlocks,
  };

  const space = PRETTY ? 2 : 0;
  await Promise.all([
    fs.writeFile(path.join(OUT, 'catalog.json'), JSON.stringify(catalog, null, space)),
    fs.writeFile(path.join(OUT, 'items.json'),   JSON.stringify(outItems, null, space)),
    fs.writeFile(path.join(OUT, 'blocks.json'),  JSON.stringify(outBlocks, null, space)),
  ]);

  // Hash for cache-busting / integrity.
  const hash = createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0, 16);

  info('');
  info(`catalog written to ${OUT}`);
  info(`  bedrock ${VERSION} / lang ${LANG}`);
  info(`  items   : ${outItems.length} (texture missing: ${texMissItems}, translation missing: ${trMissItems})`);
  info(`  blocks  : ${outBlocks.length} (texture missing: ${texMissBlocks}, translation missing: ${trMissBlocks})`);
  info(`  textures: ${copied.size} files copied`);
  info(`  digest  : ${hash}`);
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
