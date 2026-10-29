# Changelog — DevTools RTS-MK1

All notable changes to **DevTools RTS-MK1** (`https://devtools-rts-mk1.orbital8.cloud`) follow strict non-reusable `v1.x.y` versioning.

## [v1.3.0] — 2026-10-29

### Added & Changed
- **Prévisualisation d'Animations 60 FPS & Morphologies Structurelles Distinctes dans l'Atelier Vectoriel (`/vector-lab`, `src/components/devtools/leonardo-vector-studio.tsx`, `src/renderer/generator/leonardo-morphologies.ts`, `src/shared/schemas/vector-variants.ts`) — ORB-23**:
  - **Live 60 FPS Animation Preview (`data-testid="animation-preview-controls"`)**:
    - Added Play/Pause toggle (`data-testid="anim-play-pause-button"`, active by default), 4 animation modes (`IDLE` Veille/Réacteur, `MOVE` Marche/Chenilles/Vol, `ATTACK` Tir/Laser/Flammes, `SPECIAL` Surcharge/Récolte), speed selector (`0.5×`, `1.0×`, `2.0×`), interactive timeline phase scrubber (`0%..100%`), and simultaneous multi-card animation toggle (`data-testid="toggle-animate-all-cards"`).
    - Added the **Comparateur d'Animation (V1 vs Choix)** (`data-testid="live-animation-stage-canvas"`) in the right column comparing `V1` and the selected variant side-by-side in real time at 60 FPS.
  - **Radically Distinct Structural Morphologies (`resolveVariantMorphology`)**:
    - Replaced minor overlays with 6 complete architectural silhouettes (`CLASSIC_MK1`, `BASTION_CATAPHRACT`, `TOKAMAK_MAGLEV`, `STEALTH_DELTA_DRONE`, `MECH_CATAMARAN`, `ZIGGURAT_HEX_SWARM`) across all 41 buildings, units, terrain tiles, and trees.

## [v1.2.0] — 2026-10-29

### Added
- **Atelier d'Évolution des Graphismes Vectoriels de Léonard (`/vector-lab`, `src/components/devtools/leonardo-vector-studio.tsx`) — ORB-23**:
  - Added prominent navigation link (`/vector-lab`) and integrated module tab (`Atelier Vectoriel (Léonard)`) in the DevTools portal header.
  - Added complete catalog of all **41 game elements** (`15 BUILDING`, `12 UNIT`, `10 TERRAIN`, `4 TREE`) with 4 built-in vector variants (`V1` to `V4`) per element (`164` initial proposals).
  - Added interactive multi-variant comparison cards with live HTML5 Canvas vector rendering, 3/4 isometric HUD cameo previews, faction switcher (`GDI`, `NOD`, `ORDOS`), 16-angle turntable, and live 60 FPS in-game diorama preview.
  - Added direct variant selection and persistence (`GET/POST /api/vector-variants`, SQLite table `vector_variants_state` + shared disk state `/app/data/vector-variants/state.json`) shared with the live game (`https://rts-mk1.orbital8.cloud`).
  - Added unlimited on-demand variant generation (**"Redemander à Léonard de proposer de nouvelles versions"**) supporting single element, category, or all 41 elements (`V5`, `V6`, `V7`... without ever reusing or overwriting previous versions).

## [v1.0.0] — 2026-10-29

### Added
- **Initial Release of the Isolated DevTools Portal & Tactical Map Editor (`https://devtools-rts-mk1.orbital8.cloud`)**:
  - Created standalone repository `orbitalstorm/devtools-rts-mk1` and production container `devtools-rts-mk1-web:v1.0.0` (port `4310`), strictly isolated from the player game (`rts-mk1.orbital8.cloud`).
  - **Map Size Configuration & Live Resizing (`src/shared/map-editor-engine.ts`)**: Support for all 5 official presets (`72×72`, `144×144`, `160×160`, `192×192`, `216×216`) plus custom `W×H` dimensions (`48×48` to `256×256`) and procedural seed initialization (`generateProceduralMap`).
  - **Terrain & Environment Painting Tools (`src/shared/map-editor-engine.ts`, `src/renderer/editor-canvas-renderer.ts`)**: Continuous brush (`1×1` to `13×13`, Circle/Square/Diamond/Spray), Line tool, Rectangle fill, Flood Fill bucket, selective Eraser, Eyedropper, and 5 real-time Symmetry modes (`NONE`, `MIRROR_X`, `MIRROR_Y`, `ROTATIONAL_180`, `QUADRANT_4WAY`) across all 5 ground strata (`GRASS`, `DIRT`, `STONE`, `CLIFF`, `CONCRETE_SLAB`).
  - **Resource & Vegetation Placement**: Ore brush with adjustable richness (`100..1500 CR/tile`), organic multi-lobed Ore Vein Stamp (`SMALL_VEIN`, `NATURAL_VEIN`, `CONTESTED_BASIN`), `2×2` Silver Ore boulder stamp (`SILVER_ORE`) with optional Stone docking apron, and destructible tree brush (`TREE_PINE`, `TREE_OAK`, `TREE_PALM`, `MIXED`).
  - **Faction Spawn Points & Pre-Placed Entities**: Configurable `Slot 1..4` spawns (`GDI`, `NOD`, `ORDOS`, `ANY`) with automatic `8×8` `CONCRETE_SLAB` pad, `STONE`/`DIRT` halos, starting credits, initial base preview, and pre-placed buildings/defenses/units.
  - **Tactical Overlays, Distance Ruler, Live Rules Auditor & SQLite/JSON Persistence (`src/server/db/index.ts`, `src/app/api/maps/route.ts`)**: Real-time `MAP_GENERATION_RULES` balance auditor, interactive radar minimap, spawn safety radius rings (`15t`, `20t`, `24t`, `28t`, `34t`), A* passability overlay, tactical distance ruler, 40-step Undo/Redo stack, SQLite server library (`custom_maps`), and `.rtsmap.json` import/export.
