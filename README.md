# MineHub — Bedrock Catalog Builder

Generates a static Bedrock Edition item/block catalog (JSON + textures) by
combining two upstream data sources:

- [`Mojang/bedrock-samples`](https://github.com/Mojang/bedrock-samples) —
  authoritative textures and `.lang` translations
- [`PrismarineJS/minecraft-data`](https://github.com/PrismarineJS/minecraft-data) —
  numeric IDs, stack sizes, hardness, drops, etc.

The output is suitable for serving from any static web host.

## Requirements

- Node.js **≥ 18.3** (uses `node:util.parseArgs`)
- No npm dependencies

## Usage

```bash
# 1. Fetch both source repos (--depth 1 keeps it under ~150 MB)
git clone --depth 1 https://github.com/Mojang/bedrock-samples.git
git clone --depth 1 https://github.com/PrismarineJS/minecraft-data.git

# 2. Build the catalog
node build-bedrock-catalog.mjs \
  --samples ./bedrock-samples \
  --data    ./minecraft-data \
  --version 1.21.60 \
  --out     ./public \
  --lang    de_DE

# 3. Source repos can be discarded
rm -rf bedrock-samples minecraft-data
```

PowerShell:

```powershell
node build-bedrock-catalog.mjs `
  --samples ./bedrock-samples `
  --data    ./minecraft-data `
  --version 1.21.60 `
  --out     ./public `
  --lang    de_DE

Remove-Item -Recurse -Force bedrock-samples, minecraft-data
```

## Flags

| Flag            | Required | Default  | Description                                           |
| --------------- | -------- | -------- | ----------------------------------------------------- |
| `--samples`     | yes      | —        | Path to `bedrock-samples` checkout                    |
| `--data`        | yes      | —        | Path to `minecraft-data` checkout                     |
| `--version`     | yes      | —        | Bedrock version, e.g. `1.21.60`                       |
| `--out`         | yes      | —        | Output directory (created)                            |
| `--lang`        | no       | `en_US`  | Language code; resolves `<samples>/resource_pack/texts/<code>.lang` |
| `--only`        | no       | —        | `items` or `blocks` — build just one kind (e.g. a forced/fast partial build) |
| `--pretty`      | no       | off      | Pretty-print JSON                                     |
| `--no-textures` | no       | off      | Skip PNG copy (JSON only)                             |
| `--quiet`       | no       | off      | Hide per-warning lines                                |
| `-h`, `--help`  | —        | —        | Show usage                                            |

## Output layout

Items and blocks are independent outputs, so `--only items` / `--only blocks`
produce just one of the two JSON files below (and only copy that kind's
textures):

```
<out>/
├── bedrock-catalog-items.json   ← { meta, counts, byCategory, items[] }
├── bedrock-catalog-blocks.json  ← { meta, counts, byCategory, blocks[] }
└── textures/
    ├── items/<name>.png
    └── blocks/<name>.png
```

(Texture subfolders mirror whatever layout `bedrock-samples` uses internally —
a handful of block textures, e.g. beds and cakes, physically live under
`textures/items/` upstream.)

`bedrock-catalog-blocks.json` shape (the items file is the same shape with
`kind: "items"` and an `items[]` array instead):

```jsonc
{
  "schemaVersion": 1,
  "bedrockVersion": "1.21.60",
  "language": "de_DE",
  "generatedAt": "2026-04-21T12:00:00.000Z",
  "kind": "blocks",
  "counts": {
    "blocks": 800,
    "texturesCopied": 780,
    "missingTextures": 3,
    "missingTranslations": 1,
    "byCategory": { "decoration": 240, "wood": 180, "stone": 160, "misc": 34 }
  },
  "blocks": [ { "id": 1, "name": "stone", "displayName": "Stein", "category": "stone", "stackSize": 64, "hardness": 1.5, "textures": "textures/blocks/stone.png" }, ... ]
}
```

Texture paths are `out`-relative — drop `<out>/` behind any HTTP root and they
resolve correctly.

## Display names & fallbacks

Translations come from `<samples>/resource_pack/texts/<lang>.lang`. Mojang's
keys are historically inconsistent, so the lookup walks the following list
(first hit wins):

```
item.<name>.name       | tile.<name>.name
item.<bare>.name       | tile.<bare>.name
item.minecraft:<bare>… | tile.minecraft:<bare>…
tile.<bare>.<bare>.name  ← double-name variant (tile.stone.stone.name)
block.minecraft.<bare>.name
item.minecraft.<bare>.name
block.<bare>.name
item.<bare> / tile.<bare> (no .name suffix)
```

If none of those match, the lookup also checks a **legacy index**: many
pre-1.13-flattening families (`tile.log.oak.name`, `tile.wool.white.name`, …)
were never re-keyed after their block/item names were flattened to
`oak_log` / `white_wool`. The script rebuilds `<variant>_<kind>` /
`<kind>_<variant>` candidates from every `tile.*.*.name` / `item.*.*.name` key
in the loaded `.lang` file (plus a couple of outright kind renames, e.g.
`stained_hardened_clay` → `terracotta`) and checks those too.

If nothing matches, the entry falls back to the English `displayName` from
minecraft-data — never to `null`.

## Texture resolution

`terrain_texture.json` / `item_texture.json` are keyed by per-face texture
names (`oak_log_top`, `dispenser_front_horizontal`, …), not by block/item
name — most blocks have **no** entry matching their own name. The actual
name → texture-key mapping the game uses lives in
`<samples>/resource_pack/blocks.json` (e.g. `"oak_log": { "textures": {
"up": "oak_log_top", "side": "oak_log_side" } }`). The script resolves
through that file as a fallback (preferring the `up` face, then `side`, then
whatever's available) whenever a direct name lookup misses — this is what
fixed the majority of `missingTextures` for common blocks like logs, grass,
dispensers, and rails.

Because some texture_data entries reference a path with no file behind them
on disk (every `*_candle_cake` block points at the nonexistent
`textures/blocks/cake`, for example), every candidate is verified to exist
on disk before being accepted; a dead reference falls through to the next
candidate instead of silently failing.

## Categories

Each entry carries a `category` string assigned by ~80 heuristic regex rules
(see `CATEGORY_RULES` in the script). Rules are evaluated in priority order;
entries that escape every rule land in **`misc`**.

Known categories: `technical` · `spawn_egg` · `music_disc` · `potion` ·
`armor` · `weapon` · `tool` · `transport` · `food` · `dye` · `crop` ·
`redstone` · `utility` · `bed` · `shulker` · `mob_head` · `decoration` ·
`wool` · `glass` · `concrete` · `plant` · `mineral` · `ore` · `wood` ·
`stone` · `natural` · `egg` · `mob_drop` · `misc`.

The per-category breakdown is printed at the end of each run — watch the
`misc` bucket; if useful items slip through, add a rule.

### Frontend filter idiom

The catalog is deliberately unfiltered. For a build planner UI you'll
typically want to hide non-placeable technical entries:

```js
blocks.filter(b => b.textures && b.category !== 'technical')
```

## Notes

- Bedrock JSON files often contain `//` and `/* */` comments; the script
  strips them before parsing.
- `.lang` files are read as UTF-8 (BOM tolerated). Inline `## comment`
  segments in values are stripped.
- If the exact `--version` folder is absent under `data/bedrock/`, the script
  falls back to the path declared in `data/dataPaths.json`.
- Items and blocks without a matching texture still appear in the catalog
  (`texture: null`); a warning is logged and counted.
