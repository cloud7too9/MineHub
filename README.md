# VoxelEditor

Browserbasierter Minecraft-artiger Voxel-Editor als PWA. Standalone — alle Daten leben im Browser, kein Backend.

**Stack:** React 18 · TypeScript · Vite · React Three Fiber · Zustand · vite-plugin-pwa

## Features (v0.10.0)

- 3D-Bauen auf einem 64×64-Grid, Orbit-Kamera (Maus + Touch)
- **2D/3D-Umschalter:** orthografische Draufsicht mit Pan/Zoom (MapControls) —
  ideal für Grundrisse, kombiniert mit Layer-Slice ein Etagen-Editor
- **Undo/Redo:** 50 Schritte, `Strg+Z`/`Strg+Y` — jede Aktion (auch Batches wie
  Füllen oder Welt leeren) ist genau ein Schritt
- **Markier-Werkzeug** mit zwei Arten: **Box** (zwei Ecken spannen einen Quader) und
  **Freihand** (Ziehen über Flächen malt Zellen, mit Strich-Interpolation gegen Lücken;
  Kamera-Drehen/-Schwenken ist währenddessen gesperrt, Zoom bleibt aktiv).
  Aktionen: Füllen / Ersetzen / Löschen mit dem aktuellen Hotbar-Block als Parameter —
  ein Batch, ein Undo
- **1356 Block-Typen** — Quelle ist der MineHub-Bedrock-Katalog (`src/daten/katalog.json`,
  gebaut aus Mojang bedrock-samples + PrismarineJS/minecraft-data, Bedrock 1.26.30):
  **deutsche Anzeigenamen**, 18 Kategorien, transparent/emitLight, plus Eigenkreation `neon`.
  Zwei Darstellungsstufen:
  - **Hoch:** 678 echte 16×16-Bedrock-Texturen unter `public/textures/blocks/` (TGA→PNG
    konvertiert), Flächen-Kandidaten aus dem Katalog-Pfad über Bedrock-Suffixe
    (`_top`/`_side`/`_normal`/`_bottom`) abgeleitet, kuratierte Ausnahmen in `FLAECHEN`
  - **Minimal:** flache Farben per Keyword-Heuristik (performanter, cleaner Look)
- **Picker mit Kategorie-Filter + Suche** (matcht ID und deutschen Namen)
- **Shader-Umschalter:** stilisiertes Material (Fresnel-Rim-Licht in Akzent-Cyan +
  Höhenverlauf kühl→warm) via `onBeforeCompile` — Instancing, Schatten und Nebel
  bleiben erhalten; Toggle in der Sidebar, wirkt auf beide Detail-Stufen
- **Hotbar-Konfigurator:** 2–10 Slots, Blöcke frei belegbar, Position per Tausch-Tap,
  Anzahl per Stepper — alles persistiert. Tasten `1`–`9` und `0` für Slot 10
- **Layer-Slice:** nur Ebenen bis Y anzeigen (Slider in der Sidebar, Chip in der Bühne) —
  Bauen oberhalb der Slice-Ebene ist deaktiviert, ideal für Innenräume
- **Sidebar** (App-Ebene): Block-/Layer-Statistik mit Y-Spanne, Detail-Umschalter, Steuerungshilfe, Welt leeren — mobil als Drawer, ab 768px permanent
- **Bottombar** (Editier-Ebene): Werkzeug-Toggle Bauen/Abbauen, Hotbar, Anpassen
- Platzierungs-/Abbau-Vorschau (Geisterblock cyan/rot)
- Tastatur: `1`–`0` Hotbar · `B`/`X`/`M` Werkzeug · `Strg+Z`/`Y` Undo/Redo · `Esc` verwirft Markierung / schließt Panels
- **Build-Verwaltung:** mehrere Builds parallel (IndexedDB), Autosave (600 ms debounced),
  Wechseln/Umbenennen/Löschen in der Sidebar, Export/Import als JSON, **Thumbnails**
  der letzten Ansicht (Render-on-Demand, kein preserveDrawingBuffer)
- **Glas:** Hoch-Modus als Cutout-Textur (alphaTest, keine Sortier-Artefakte),
  Minimal-Modus mit Alpha-Blending; Glas wirft keinen Schatten
- Installierbar als PWA, offlinefähig (Service Worker precacht App + Texturen)

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal testen
```

## Eigene Texturen

**Texture-Pack-Import (empfohlen):** In der Sidebar unter „Texturen" ein ZIP mit
PNG-Dateien importieren. Die Texturen landen ausschließlich in der IndexedDB des
Browsers — nichts wird hochgeladen, nichts landet im Repo oder Deployment. Dadurch
sind auch Original-Minecraft-Texturen aus der eigenen Installation für den privaten
Gebrauch nutzbar. Erkannt werden Java-Resource-Packs (`assets/minecraft/textures/block/`),
Bedrock-Packs (`textures/blocks/`) und flache ZIPs; gematcht wird über den Dateinamen.

**Auflösung pro Fläche** über Kandidaten-Ketten (Pack → `public/textures/blocks/` →
Minimal-Farbe). Pack-Matching läuft über den Datei-Basisnamen — Bedrock-Namen wie
`log_oak.png` matchen direkt.

Fehlt eine Datei, fällt der Block automatisch auf seine Minimal-Farbe zurück.
Eigene Dateien (z. B. Original-Minecraft-Texturen aus lokaler Installation) einfach
unter gleichem Namen ablegen — **urheberrechtlich geschützte Texturen aber nicht
öffentlich deployen oder ins Repo committen.** Die mitgelieferten Texturen sind
eigene, per `scripts/erzeuge_texturen.py` generierte Assets und unproblematisch.

```bash
python3 scripts/erzeuge_texturen.py   # Standard-Texturen neu generieren
```

## Architektur

- `src/utils/bloecke.ts` + `src/daten/assets.json` — datengetriebene Registry (1357 Typen), Farb-Heuristik, ID-Migration
- `src/utils/texturen.ts` / `materialien.ts` — Textur-Loader mit Farb-Fallback, lazy Material-Factory (Typ × Detail × Shader)
- `src/store/useStore.ts` — Welt-Store: nur serialisierbare Build-Daten (`Record<"x,y,z", BlockTyp>`)
- `src/store/useBuildStore.ts` + `src/utils/buildSpeicher.ts` — Build-Verwaltung (IndexedDB, Autosave, Export/Import)
- `src/store/useUiStore.ts` — UI-Store: Auswahl, Werkzeug, Hotbar, Detail (teilweise persistiert)
- `src/components/canvas/` — R3F-Szene: ein InstancedMesh pro *genutztem* Block-Typ (dynamisch gemountet), wachsende Kapazität
- `src/components/ui/` — Sidebar, Bottombar, Block-Picker

## Roadmap

- **v1.0:** Kopieren/Verschieben auf Markier-Basis, Pipette, Politur-Pass
- Später: Hotbar-Drag&Drop, typgefiltertes Ersetzen
