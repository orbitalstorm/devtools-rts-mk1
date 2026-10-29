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
  listCustomMaps,
  upsertCustomMap,
} from "../src/server/db";

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
});
