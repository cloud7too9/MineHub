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
| `--pretty`      | no       | off      | Pretty-print JSON                                     |
| `--no-textures` | no       | off      | Skip PNG copy (JSON only)                             |
| `--quiet`       | no       | off      | Hide per-warning lines                                |
| `-h`, `--help`  | —        | —        | Show usage                                            |

## Output layout

```
<out>/
├── bedrock-catalog.json   ← combined { meta, counts, byCategory, items[], blocks[] }
└── textures/
    ├── items/<name>.png
    └── blocks/<name>.png
```

`bedrock-catalog.json` shape:

```jsonc
{
  "schemaVersion": 1,
  "bedrockVersion": "1.21.60",
  "language": "de_DE",
  "generatedAt": "2026-04-21T12:00:00.000Z",
  "counts": {
    "items": 1200,
    "blocks": 800,
    "texturesCopied": 1900,
    "missingTextures":     { "items": 12, "blocks": 3 },
    "missingTranslations": { "items":  4, "blocks": 1 },
    "byCategory": { "decoration": 240, "wood": 180, "stone": 160, "misc": 34 }
  },
  "items":  [ { "id": 311, "name": "diamond_sword", "displayName": "Diamantschwert", "category": "weapon", "stackSize": 1, "textures": "textures/items/diamond_sword.png" }, ... ],
  "blocks": [ { "id":   1, "name": "stone",         "displayName": "Stein",          "category": "stone",  "stackSize": 64, "hardness": 1.5, "textures": "textures/blocks/stone.png" }, ... ]
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

If nothing matches, the entry falls back to the English `displayName` from
minecraft-data — never to `null`.

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
