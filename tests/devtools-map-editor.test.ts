import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TERRAIN_KIND } from "../src/shared/constants";
import {
  applyTerrainBrush,
  applyTerrainFloodFill,
  applyTerrainLine,
  applyTerrainRect,
  applyTreeBrush,
  auditCustomMap,
  computeBrushFootprint,
  computeSymmetryCoords,
  createBlankCustomMap,
  createMapFromProceduralSeed,
  eraseAtCoord,
  inspectTileAt,
  measureTacticalDistance,
  placeOrUpdateSpawnPoint,
  placePrebuiltEntity,
  placeSilverDeposit,
  removeSpawnPoint,
  resizeCustomMap,
  stampOreVein,
} from "../src/shared/map-editor-engine";
import {
  deleteCustomMapById,
  getCustomMapById,
  getVectorVariantsState,
  listCustomMaps,
  mutateVectorVariantsState,
  upsertCustomMap,
} from "../src/server/db";
import {
  MORPHOLOGY_LABELS,
  VECTOR_ANIMATION_MODES,
  VECTOR_ASSET_ELEMENTS,
  getActiveBuildingVariant,
  getActiveTerrainVariantByNumericKind,
  getActiveTreeVariant,
  getActiveUnitVariant,
  getActiveVectorConfigSignature,
  resolveVariantMorphology,
} from "../src/shared/schemas/vector-variants";
import {
  GET as getVectorVariantsApi,
  POST as postVectorVariantsApi,
} from "../src/app/api/vector-variants/route";

describe("DevTools RTS-MK1 v1.0.0 — Tactical Map Editor Engine & Persistence", () => {
  it("1. Creates blank & procedural maps across all size presets and custom dimensions", () => {
    const blank = createBlankCustomMap({
      id: "test_blank_160",
      name: "Blank 160",
      sizePreset: "TACTICAL_5X",
      baseTerrainKind: TERRAIN_KIND.GRASS,
      withDefaultSpawns: true,
    });
    expect(blank.width).toBe(160);
    expect(blank.height).toBe(160);
    expect(blank.terrainGrid.length).toBe(25600);
    expect(blank.spawns.length).toBe(4);

    // Resize to custom 96x112
    const resized = resizeCustomMap(blank, {
      sizePreset: "CUSTOM",
      width: 96,
      height: 112,
      anchor: "CENTER",
    });
    expect(resized.width).toBe(96);
    expect(resized.height).toBe(112);
    expect(resized.terrainGrid.length).toBe(96 * 112);
    expect(resized.sizePreset).toBe("CUSTOM");

    // Procedural seed map
    const proc = createMapFromProceduralSeed({
      seed: 123456789,
      sizePreset: "SKIRMISH_4X",
    });
    expect(proc.width).toBe(144);
    expect(proc.height).toBe(144);
    expect(proc.spawns.length).toBe(4);
    expect(proc.silverDeposits.length).toBeGreaterThanOrEqual(4);
    expect(proc.trees.length).toBeGreaterThan(10);
  });

  it("2. Paints terrain with brushes, lines, rectangles, flood fill, and 4-way symmetry", () => {
    let doc = createBlankCustomMap({
      sizePreset: "LEGACY_1X",
      withDefaultSpawns: false,
    });

    // 4-way quadrant symmetry brush
    doc = applyTerrainBrush(doc, {
      x: 10,
      y: 12,
      terrainKind: TERRAIN_KIND.CONCRETE_SLAB,
      brushSize: 3,
      brushShape: "SQUARE",
      symmetry: "QUADRANT_4WAY",
    });

    const symPts = computeSymmetryCoords(10, 12, 72, 72, "QUADRANT_4WAY", 1, 1);
    expect(symPts.length).toBe(4);
    for (const pt of symPts) {
      expect(doc.terrainGrid[pt.y * doc.width + pt.x]).toBe(TERRAIN_KIND.CONCRETE_SLAB);
    }

    // Line tool (cliff ridge)
    doc = applyTerrainLine(doc, {
      fromX: 20,
      fromY: 20,
      toX: 30,
      toY: 20,
      terrainKind: TERRAIN_KIND.CLIFF,
      brushSize: 1,
    });
    expect(doc.terrainGrid[20 * doc.width + 25]).toBe(TERRAIN_KIND.CLIFF);

    // Rectangle tool (stone plateau)
    doc = applyTerrainRect(doc, {
      x0: 32,
      y0: 32,
      x1: 36,
      y1: 36,
      terrainKind: TERRAIN_KIND.STONE,
    });
    expect(doc.terrainGrid[34 * doc.width + 34]).toBe(TERRAIN_KIND.STONE);

    // Flood fill inside the 5x5 stone plateau -> convert to DIRT
    doc = applyTerrainFloodFill(doc, {
      startX: 34,
      startY: 34,
      terrainKind: TERRAIN_KIND.DIRT,
    });
    expect(doc.terrainGrid[32 * doc.width + 32]).toBe(TERRAIN_KIND.DIRT);
    expect(doc.terrainGrid[36 * doc.width + 36]).toBe(TERRAIN_KIND.DIRT);
  });

  it("3. Places Ore veins, 2x2 Silver Ore boulders, Destructible Trees, Faction Spawns & Entities", () => {
    let doc = createBlankCustomMap({
      sizePreset: "TACTICAL_5X",
      withDefaultSpawns: false,
    });

    // Place GDI Spawn #1 at (10, 10) and NOD Spawn #2 at (140, 140)
    doc = placeOrUpdateSpawnPoint(doc, {
      slotIndex: 0,
      x: 10,
      y: 10,
      faction: "GDI",
      startingCredits: 7500,
    });
    doc = placeOrUpdateSpawnPoint(doc, {
      slotIndex: 1,
      x: 140,
      y: 140,
      faction: "NOD",
      startingCredits: 7500,
    });
    expect(doc.spawns.length).toBe(2);
    expect(doc.terrainGrid[12 * doc.width + 12]).toBe(TERRAIN_KIND.CONCRETE_SLAB);

    // Stamp Natural Ore Vein at (36, 20) with Rotational 180 symmetry
    doc = stampOreVein(doc, {
      x: 36,
      y: 20,
      preset: "NATURAL_VEIN",
      baseAmount: 850,
      symmetry: "ROTATIONAL_180",
    });
    const inspectedOre = inspectTileAt(doc, 36, 20);
    expect(inspectedOre.terrainKind).toBe(TERRAIN_KIND.ORE);
    expect(inspectedOre.oreAmount).toBeGreaterThanOrEqual(750);

    // Place 2x2 Silver Ore boulder at (48, 48) with Stone apron
    doc = placeSilverDeposit(doc, {
      x: 48,
      y: 48,
      includeStoneApron: true,
      symmetry: "ROTATIONAL_180",
    });
    expect(doc.silverDeposits.length).toBe(2);
    expect(doc.terrainGrid[48 * doc.width + 48]).toBe(TERRAIN_KIND.SILVER_ORE);
    expect(doc.terrainGrid[49 * doc.width + 49]).toBe(TERRAIN_KIND.SILVER_ORE);
    expect(doc.terrainGrid[47 * doc.width + 47]).toBe(TERRAIN_KIND.STONE);

    // Paint trees
    doc = applyTreeBrush(doc, {
      x: 70,
      y: 70,
      treeKind: "TREE_PINE",
      scale: 1.15,
      brushSize: 3,
      brushShape: "CIRCLE",
    });
    expect(doc.trees.length).toBeGreaterThan(0);

    // Place a pre-built Obelisk defense
    doc = placePrebuiltEntity(doc, {
      x: 80,
      y: 80,
      ownerSlot: 1,
      faction: "NOD",
      entityType: "BUILDING",
      kind: "OBELISK",
    });
    expect(doc.placedEntities.length).toBe(1);

    // Audit map & measure distance
    const audit = auditCustomMap(doc);
    expect(audit.valid).toBe(true);
    expect(audit.oreTotalCredits).toBeGreaterThan(5000);
    expect(audit.silverDepositCount).toBe(2);

    const ruler = measureTacticalDistance(14, 14, 144, 144);
    expect(ruler.meetsEnemyBaseDistance).toBe(true);

    // Erase entity at (80, 80) and remove Spawn #2
    doc = eraseAtCoord(doc, { x: 80, y: 80, brushSize: 1 });
    expect(doc.placedEntities.length).toBe(0);
    doc = removeSpawnPoint(doc, 1);
    expect(doc.spawns.length).toBe(1);
  });

  it("4. Persists and retrieves custom maps in SQLite database", () => {
    const map = createMapFromProceduralSeed({
      id: "unit_test_map_sqlite",
      name: "Carte Test SQLite",
      seed: 555666777,
      sizePreset: "SKIRMISH_4X",
    });
    const saved = upsertCustomMap(map);
    expect(saved.summary.id).toBe("unit_test_map_sqlite");

    const loaded = getCustomMapById("unit_test_map_sqlite");
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("Carte Test SQLite");
    expect(loaded?.width).toBe(144);

    const all = listCustomMaps(20);
    expect(all.some((m) => m.id === "unit_test_map_sqlite")).toBe(true);

    const deleted = deleteCustomMapById("unit_test_map_sqlite");
    expect(deleted).toBe(true);
  });

  it("5. Enforces strict engineering rules (zero inline style, single globals.css, brush footprint shapes)", () => {
    const circlePts = computeBrushFootprint(10, 10, 5, "CIRCLE", 50, 50);
    const diamondPts = computeBrushFootprint(10, 10, 5, "DIAMOND", 50, 50);
    expect(circlePts.length).toBeGreaterThan(diamondPts.length);

    const srcRoot = path.join(process.cwd(), "src");
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else files.push(full);
      }
      return files;
    };

    const allFiles = walk(srcRoot);
    const cssFiles = allFiles.filter((f) => f.endsWith(".css"));
    expect(cssFiles.length).toBe(1);
    expect(cssFiles[0]?.endsWith(path.join("src", "app", "globals.css"))).toBe(true);

    for (const file of allFiles) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/\bstyle=\{\{/);
    }
  });

  it("6. Supports WATER (impassable), SAND (x0.8 speed), SWAMP (x0.8 speed, dryable), TREE_CYPRESS, FORESTRY_TRUCK, and BLOWER_TRUCK", () => {
    let doc = createBlankCustomMap({
      sizePreset: "LEGACY_1X",
      withDefaultSpawns: false,
    });

    // Paint WATER at (20, 20), SAND at (25, 20), SWAMP at (30, 20)
    doc = applyTerrainBrush(doc, {
      x: 20,
      y: 20,
      terrainKind: TERRAIN_KIND.WATER,
      brushSize: 3,
      brushShape: "CIRCLE",
    });
    doc = applyTerrainBrush(doc, {
      x: 25,
      y: 20,
      terrainKind: TERRAIN_KIND.SAND,
      brushSize: 3,
      brushShape: "CIRCLE",
    });
    doc = applyTerrainBrush(doc, {
      x: 30,
      y: 20,
      terrainKind: TERRAIN_KIND.SWAMP,
      brushSize: 3,
      brushShape: "CIRCLE",
    });

    const waterInsp = inspectTileAt(doc, 20, 20);
    expect(waterInsp.terrainKind).toBe(TERRAIN_KIND.WATER);
    expect(waterInsp.passable).toBe(false);
    expect(waterInsp.speedMultiplier).toBe(0);

    const sandInsp = inspectTileAt(doc, 25, 20);
    expect(sandInsp.terrainKind).toBe(TERRAIN_KIND.SAND);
    expect(sandInsp.passable).toBe(true);
    expect(sandInsp.speedMultiplier).toBe(0.8);

    const swampInsp = inspectTileAt(doc, 30, 20);
    expect(swampInsp.terrainKind).toBe(TERRAIN_KIND.SWAMP);
    expect(swampInsp.passable).toBe(true);
    expect(swampInsp.speedMultiplier).toBe(0.8);

    // Plant TREE_CYPRESS on SWAMP and TREE_PALM on SAND
    doc = applyTreeBrush(doc, {
      x: 30,
      y: 20,
      treeKind: "TREE_CYPRESS",
      scale: 0.95,
      brushSize: 1,
    });
    doc = applyTreeBrush(doc, {
      x: 25,
      y: 20,
      treeKind: "TREE_PALM",
      scale: 1.0,
      brushSize: 1,
    });
    expect(doc.trees.some((t) => t.x === 30 && t.y === 20 && t.kind === "TREE_CYPRESS")).toBe(true);
    expect(doc.trees.some((t) => t.x === 25 && t.y === 20 && t.kind === "TREE_PALM")).toBe(true);

    // Place FORESTRY_TRUCK and BLOWER_TRUCK pre-built units
    doc = placePrebuiltEntity(doc, {
      x: 40,
      y: 40,
      ownerSlot: 0,
      faction: "GDI",
      entityType: "UNIT",
      kind: "FORESTRY_TRUCK",
    });
    doc = placePrebuiltEntity(doc, {
      x: 42,
      y: 40,
      ownerSlot: 0,
      faction: "GDI",
      entityType: "UNIT",
      kind: "BLOWER_TRUCK",
    });
    expect(doc.placedEntities.some((e) => e.kind === "FORESTRY_TRUCK")).toBe(true);
    expect(doc.placedEntities.some((e) => e.kind === "BLOWER_TRUCK")).toBe(true);

    const audit = auditCustomMap(doc);
    expect(audit.terrainBreakdownPct.water).toBeGreaterThan(0);
    expect(audit.terrainBreakdownPct.sand).toBeGreaterThan(0);
    expect(audit.terrainBreakdownPct.swamp).toBeGreaterThan(0);
  });

  it("7. v1.2.0 (ORB-23) — Leonardo Vector Graphics Evolution Studio (/vector-lab): covers all 41 game elements, saves selections, and generates unlimited new versions (V5, V6, V7...)", async () => {
    // 1. Verify catalog completeness: 15 buildings + 12 units + 10 terrain tiles + 4 trees = 41 elements
    expect(VECTOR_ASSET_ELEMENTS.length).toBe(41);
    expect(VECTOR_ASSET_ELEMENTS.filter((e) => e.category === "BUILDING").length).toBe(15);
    expect(VECTOR_ASSET_ELEMENTS.filter((e) => e.category === "UNIT").length).toBe(12);
    expect(VECTOR_ASSET_ELEMENTS.filter((e) => e.category === "TERRAIN").length).toBe(10);
    expect(VECTOR_ASSET_ELEMENTS.filter((e) => e.category === "TREE").length).toBe(4);

    // 2. Verify initial state has 4 proposals (V1..V4) per element = 164 proposals
    const resetRes = mutateVectorVariantsState({
      action: "RESET_TO_DEFAULT",
      targetScope: "ALL",
    });
    expect(resetRes.summary.totalVariants).toBeGreaterThanOrEqual(164);
    expect(resetRes.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      "v1_classic_mk1"
    );

    // 3. Select a variant directly for BUILDING:CONSTRUCTION_YARD, UNIT:MAMMOTH_TANK, TERRAIN:GRASS, and TREE:TREE_PINE
    const sigBefore = getActiveVectorConfigSignature();
    const saveRes = mutateVectorVariantsState({
      action: "SAVE_SELECTIONS",
      activeVariants: {
        "BUILDING:CONSTRUCTION_YARD": "v3_experimental_apex",
        "UNIT:MAMMOTH_TANK": "v2_heavy_bastion",
        "TERRAIN:GRASS": "v4_tactical_vanguard",
        "TREE:TREE_PINE": "v3_experimental_apex",
      },
    });
    expect(saveRes.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      "v3_experimental_apex"
    );
    expect(saveRes.state.activeVariants["UNIT:MAMMOTH_TANK"]).toBe(
      "v2_heavy_bastion"
    );
    expect(saveRes.state.activeVariants["TERRAIN:GRASS"]).toBe(
      "v4_tactical_vanguard"
    );
    expect(saveRes.state.activeVariants["TREE:TREE_PINE"]).toBe(
      "v3_experimental_apex"
    );
    expect(saveRes.summary.modifiedAssetsCount).toBe(4);

    // Active runtime registry reflects the chosen variants and updates signature
    expect(getActiveBuildingVariant("CONSTRUCTION_YARD").versionNumber).toBe(3);
    expect(getActiveUnitVariant("MAMMOTH_TANK").versionNumber).toBe(2);
    expect(
      getActiveTerrainVariantByNumericKind(TERRAIN_KIND.GRASS).versionNumber
    ).toBe(4);
    expect(getActiveTreeVariant("TREE_PINE").versionNumber).toBe(3);
    expect(getActiveVectorConfigSignature()).not.toBe(sigBefore);

    // 4. Ask Leonardo to propose new versions repeatedly (V5, V6, then V7, V8...) without reusing version numbers
    const baseMaxVer = Math.max(
      0,
      ...(saveRes.state.catalog["BUILDING:CONSTRUCTION_YARD"] ?? []).map(
        (v) => v.versionNumber
      )
    );
    const firstGen = mutateVectorVariantsState({
      action: "PROPOSE_NEW_VARIANTS",
      targetScope: "ASSET",
      assetKey: "BUILDING:CONSTRUCTION_YARD",
      count: 2,
      directivePrompt: "Blindage orbital renforcé et grues jumelées",
      styleArchetype: "CYBER_STEALTH",
      autoSelectNewest: true,
    });
    expect(firstGen.newlyCreated.length).toBe(2);
    expect(firstGen.newlyCreated[0]?.versionNumber).toBe(baseMaxVer + 1);
    expect(firstGen.newlyCreated[1]?.versionNumber).toBe(baseMaxVer + 2);
    expect(firstGen.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      firstGen.newlyCreated[1]?.variantId
    );

    const secondGen = mutateVectorVariantsState({
      action: "PROPOSE_NEW_VARIANTS",
      targetScope: "ASSET",
      assetKey: "BUILDING:CONSTRUCTION_YARD",
      count: 2,
      directivePrompt: "Casemate de siège ultralourde",
      styleArchetype: "BRUTALIST_BUNKER",
      autoSelectNewest: true,
    });
    expect(secondGen.newlyCreated.length).toBe(2);
    expect(secondGen.newlyCreated[0]?.versionNumber).toBe(baseMaxVer + 3);
    expect(secondGen.newlyCreated[1]?.versionNumber).toBe(baseMaxVer + 4);
    const v8Id = secondGen.newlyCreated[1]!.variantId;
    expect(secondGen.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      v8Id
    );

    // 5. Verify GET and POST /api/vector-variants routes
    const apiGetRes = await getVectorVariantsApi();
    expect(apiGetRes.status).toBe(200);
    const apiGetData = (await apiGetRes.json()) as {
      ok: boolean;
      state: { activeVariants: Record<string, string> };
    };
    expect(apiGetData.ok).toBe(true);
    expect(apiGetData.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      v8Id
    );

    const v7Id = secondGen.newlyCreated[0]!.variantId;
    const apiPostRes = await postVectorVariantsApi(
      new Request("http://localhost:4310/api/vector-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SELECT_SINGLE_VARIANT",
          assetKey: "BUILDING:CONSTRUCTION_YARD",
          variantId: v7Id,
        }),
      })
    );
    expect(apiPostRes.status).toBe(200);
    const apiPostData = (await apiPostRes.json()) as {
      ok: boolean;
      state: { activeVariants: Record<string, string> };
    };
    expect(apiPostData.ok).toBe(true);
    expect(apiPostData.state.activeVariants["BUILDING:CONSTRUCTION_YARD"]).toBe(
      v7Id
    );
    expect(
      getVectorVariantsState().activeVariants["BUILDING:CONSTRUCTION_YARD"]
    ).toBe(v7Id);

    // 6. Verify DevTools UI exposes the link & tab to /vector-lab and LeonardoVectorStudio
    const studioSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        "../src/components/devtools/map-editor-studio.tsx"
      ),
      "utf8"
    );
    expect(studioSrc).toContain('data-testid="tab-vector-lab"');
    expect(studioSrc).toContain('data-testid="link-vector-lab"');
    expect(studioSrc).toContain('href="/vector-lab"');

    const vectorStudioSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        "../src/components/devtools/leonardo-vector-studio.tsx"
      ),
      "utf8"
    );
    expect(vectorStudioSrc).toContain('data-testid="leonardo-vector-studio"');
    expect(vectorStudioSrc).toContain(
      'data-testid="save-vector-choices-button"'
    );
    expect(vectorStudioSrc).toContain('data-testid="ask-leonardo-panel"');
    expect(vectorStudioSrc).toContain(
      'data-testid="ask-leonardo-generate-button"'
    );

    // Clean up test state back to V1 defaults for deterministic state
    mutateVectorVariantsState({
      action: "RESET_TO_DEFAULT",
      targetScope: "ALL",
    });
  });

  it("8. v1.3.0 (ORB-23) — Distinct structural morphologies (V1..V6+) and 60 FPS live animation preview (IDLE, MOVE, ATTACK, SPECIAL)", () => {
    const state = getVectorVariantsState();

    // 1. Verify that every element's V1, V2, V3, V4 variants resolve to 4 genuinely distinct structural morphologies
    for (const el of VECTOR_ASSET_ELEMENTS) {
      const variants = state.catalog[el.assetKey] ?? [];
      expect(variants.length).toBeGreaterThanOrEqual(4);
      const m1 = resolveVariantMorphology(variants[0]!);
      const m2 = resolveVariantMorphology(variants[1]!);
      const m3 = resolveVariantMorphology(variants[2]!);
      const m4 = resolveVariantMorphology(variants[3]!);

      expect(m1).toBe("CLASSIC_MK1");
      expect(m2).toBe("BASTION_CATAPHRACT");
      expect(m3).toBe("TOKAMAK_MAGLEV");
      expect(m4).toBe("STEALTH_DELTA_DRONE");

      // All 4 built-in variants have distinct morphologies and human-readable labels
      const uniqueMorphs = new Set([m1, m2, m3, m4]);
      expect(uniqueMorphs.size).toBe(4);
      for (const m of uniqueMorphs) {
        expect(MORPHOLOGY_LABELS[m].length).toBeGreaterThan(8);
      }
    }

    // 2. Verify all 4 animation modes (IDLE, MOVE, ATTACK, SPECIAL) are registered
    expect(VECTOR_ANIMATION_MODES.map((m) => m.id)).toEqual([
      "IDLE",
      "MOVE",
      "ATTACK",
      "SPECIAL",
    ]);

    // 3. Verify LeonardoVectorStudio UI exposes animation preview controls & live comparator canvas
    const vectorStudioSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        "../src/components/devtools/leonardo-vector-studio.tsx"
      ),
      "utf8"
    );
    expect(vectorStudioSrc).toContain('data-testid="animation-preview-controls"');
    expect(vectorStudioSrc).toContain('data-testid="anim-play-pause-button"');
    expect(vectorStudioSrc).toContain('data-testid={`anim-mode-${m.id}`}');
    expect(vectorStudioSrc).toContain('data-testid="anim-phase-slider"');
    expect(vectorStudioSrc).toContain('data-testid="anim-speed-select"');
    expect(vectorStudioSrc).toContain('data-testid="toggle-animate-all-cards"');
    expect(vectorStudioSrc).toContain(
      'data-testid="live-animation-stage-canvas"'
    );
    expect(vectorStudioSrc).toContain(
      'data-testid={`morphology-badge-${proposal.variantId}`}'
    );
  });
});
