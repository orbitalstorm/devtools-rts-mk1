# Changelog — DevTools RTS-MK1

All notable changes to **DevTools RTS-MK1** (`https://devtools-rts-mk1.orbital8.cloud`) follow strict non-reusable `v1.x.y` versioning.

## [v1.0.0] — 2026-10-29

### Added
- **Initial Release of the Isolated DevTools Portal & Tactical Map Editor (`https://devtools-rts-mk1.orbital8.cloud`)**:
  - Created standalone repository `orbitalstorm/devtools-rts-mk1` and production container `devtools-rts-mk1-web:v1.0.0` (port `4310`), strictly isolated from the player game (`rts-mk1.orbital8.cloud`).
  - **Map Size Configuration & Live Resizing (`src/shared/map-editor-engine.ts`)**: Support for all 5 official presets (`72×72`, `144×144`, `160×160`, `192×192`, `216×216`) plus custom `W×H` dimensions (`48×48` to `256×256`) and procedural seed initialization (`generateProceduralMap`).
  - **Terrain & Environment Painting Tools (`src/shared/map-editor-engine.ts`, `src/renderer/editor-canvas-renderer.ts`)**: Continuous brush (`1×1` to `13×13`, Circle/Square/Diamond/Spray), Line tool, Rectangle fill, Flood Fill bucket, selective Eraser, Eyedropper, and 5 real-time Symmetry modes (`NONE`, `MIRROR_X`, `MIRROR_Y`, `ROTATIONAL_180`, `QUADRANT_4WAY`) across all 5 ground strata (`GRASS`, `DIRT`, `STONE`, `CLIFF`, `CONCRETE_SLAB`).
  - **Resource & Vegetation Placement**: Ore brush with adjustable richness (`100..1500 CR/tile`), organic multi-lobed Ore Vein Stamp (`SMALL_VEIN`, `NATURAL_VEIN`, `CONTESTED_BASIN`), `2×2` Silver Ore boulder stamp (`SILVER_ORE`) with optional Stone docking apron, and destructible tree brush (`TREE_PINE`, `TREE_OAK`, `TREE_PALM`, `MIXED`).
  - **Faction Spawn Points & Pre-Placed Entities**: Configurable `Slot 1..4` spawns (`GDI`, `NOD`, `ORDOS`, `ANY`) with automatic `8×8` `CONCRETE_SLAB` pad, `STONE`/`DIRT` halos, starting credits, initial base preview, and pre-placed buildings/defenses/units.
  - **Tactical Overlays, Distance Ruler, Live Rules Auditor & SQLite/JSON Persistence (`src/server/db/index.ts`, `src/app/api/maps/route.ts`)**: Real-time `MAP_GENERATION_RULES` balance auditor, interactive radar minimap, spawn safety radius rings (`15t`, `20t`, `24t`, `28t`, `34t`), A* passability overlay, tactical distance ruler, 40-step Undo/Redo stack, SQLite server library (`custom_maps`), and `.rtsmap.json` import/export.
