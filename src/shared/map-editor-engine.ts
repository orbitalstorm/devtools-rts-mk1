import {
  BUILDINGS,
  createSeededRng,
  DEFAULT_MAP_SIZE_PRESET,
  generateProceduralMap,
  generateRandomMapSeed,
  LEGACY_MAP_TOTAL_TILES,
  MAP_GENERATION_RULES,
  MAP_SIZE_PRESETS,
  normalizeMapSeed,
  TERRAIN_KIND,
  UNITS,
  type BuildingKind,
  type FactionId,
  type MapCoord,
  type MapGenerationRules,
  type MapSizePresetId,
  type TreeKind,
  type UnitKind,
} from "./constants";
import {
  CustomMapDocumentSchema,
  type BrushShape,
  type CustomMapDocument,
  type CustomMapSummary,
  type EditorPlacedEntity,
  type EditorSilverDeposit,
  type EditorTreePlacement,
  type MapSizePresetChoice,
  type OreStampPreset,
  type SpawnFactionChoice,
  type SpawnPointSpec,
  type SymmetryMode,
} from "./schemas/map-editor";

export const SPAWN_SLOT_DEFAULTS: ReadonlyArray<{
  slotIndex: number;
  label: string;
  defaultFaction: SpawnFactionChoice;
  badgeColor: string;
}> = [
  {
    slotIndex: 0,
    label: "Spawn 1 (Nord-Ouest)",
    defaultFaction: "GDI",
    badgeColor: "#f59e0b",
  },
  {
    slotIndex: 1,
    label: "Spawn 2 (Sud-Est)",
    defaultFaction: "NOD",
    badgeColor: "#ef4444",
  },
  {
    slotIndex: 2,
    label: "Spawn 3 (Nord-Est)",
    defaultFaction: "ORDOS",
    badgeColor: "#10b981",
  },
  {
    slotIndex: 3,
    label: "Spawn 4 (Sud-Ouest)",
    defaultFaction: "ANY",
    badgeColor: "#38bdf8",
  },
];

export function cloneCustomMapDocument(doc: CustomMapDocument): CustomMapDocument {
  return {
    ...doc,
    terrainGrid: [...doc.terrainGrid],
    oreGrid: [...doc.oreGrid],
    spawns: doc.spawns.map((s) => ({ ...s })),
    trees: doc.trees.map((t) => ({ ...t })),
    silverDeposits: doc.silverDeposits.map((d) => ({ ...d })),
    placedEntities: doc.placedEntities.map((e) => ({ ...e })),
    updatedAt: new Date().toISOString(),
  };
}

export function resolvePresetDimensions(
  preset: MapSizePresetChoice,
  customWidth?: number,
  customHeight?: number
): { width: number; height: number; sizePreset: MapSizePresetChoice } {
  if (preset !== "CUSTOM") {
    const spec = MAP_SIZE_PRESETS[preset as MapSizePresetId] ?? MAP_SIZE_PRESETS[DEFAULT_MAP_SIZE_PRESET];
    return {
      width: spec.widthTiles,
      height: spec.heightTiles,
      sizePreset: spec.id,
    };
  }
  const w = Math.max(32, Math.min(256, Math.round(customWidth ?? 160)));
  const h = Math.max(32, Math.min(256, Math.round(customHeight ?? 160)));
  return {
    width: w,
    height: h,
    sizePreset: "CUSTOM",
  };
}

/**
 * Computes all symmetric coordinates for `(x, y)` with a given `(footprintW, footprintH)`
 * according to the active `SymmetryMode`.
 */
export function computeSymmetryCoords(
  x: number,
  y: number,
  width: number,
  height: number,
  symmetry: SymmetryMode,
  footprintW = 1,
  footprintH = 1
): MapCoord[] {
  const mirrorX = width - footprintW - x;
  const mirrorY = height - footprintH - y;

  const raw: MapCoord[] = [{ x, y }];
  if (symmetry === "MIRROR_X") {
    raw.push({ x: mirrorX, y });
  } else if (symmetry === "MIRROR_Y") {
    raw.push({ x, y: mirrorY });
  } else if (symmetry === "ROTATIONAL_180") {
    raw.push({ x: mirrorX, y: mirrorY });
  } else if (symmetry === "QUADRANT_4WAY") {
    raw.push({ x: mirrorX, y });
    raw.push({ x, y: mirrorY });
    raw.push({ x: mirrorX, y: mirrorY });
  }

  const unique: MapCoord[] = [];
  const seen = new Set<string>();
  for (const pt of raw) {
    if (pt.x < 0 || pt.y < 0 || pt.x + footprintW > width || pt.y + footprintH > height) {
      continue;
    }
    const key = `${pt.x},${pt.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(pt);
    }
  }
  return unique;
}

/**
 * Computes the list of tile coordinates covered by a brush centered at `(centerX, centerY)`.
 */
export function computeBrushFootprint(
  centerX: number,
  centerY: number,
  brushSize: number,
  brushShape: BrushShape,
  width: number,
  height: number,
  spraySeed = 104729
): MapCoord[] {
  const clampedSize = Math.max(1, Math.min(15, Math.round(brushSize)));
  if (clampedSize === 1) {
    if (centerX >= 0 && centerX < width && centerY >= 0 && centerY < height) {
      return [{ x: centerX, y: centerY }];
    }
    return [];
  }

  const halfLow = Math.floor((clampedSize - 1) / 2);
  const halfHigh = Math.ceil((clampedSize - 1) / 2);
  const radius = clampedSize * 0.5;
  const coords: MapCoord[] = [];
  const rng = createSeededRng(spraySeed ^ (centerX * 73856093) ^ (centerY * 19349663));

  for (let dy = -halfLow; dy <= halfHigh; dy++) {
    for (let dx = -halfLow; dx <= halfHigh; dx++) {
      const tx = centerX + dx;
      const ty = centerY + dy;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;

      const cx = dx - (halfHigh - halfLow) * 0.5;
      const cy = dy - (halfHigh - halfLow) * 0.5;

      if (brushShape === "SQUARE") {
        coords.push({ x: tx, y: ty });
      } else if (brushShape === "DIAMOND") {
        if (Math.abs(cx) + Math.abs(cy) <= radius + 0.15) {
          coords.push({ x: tx, y: ty });
        }
      } else if (brushShape === "CIRCLE") {
        if (Math.hypot(cx, cy) <= radius + 0.12) {
          coords.push({ x: tx, y: ty });
        }
      } else if (brushShape === "SPRAY") {
        const dist = Math.hypot(cx, cy);
        if (dist <= radius + 0.15) {
          const prob = Math.max(0.25, 1 - (dist / (radius + 0.5)) * 0.65);
          if ((dx === 0 && dy === 0) || rng.next() <= prob) {
            coords.push({ x: tx, y: ty });
          }
        }
      }
    }
  }

  return coords;
}

/**
 * Stamps a Spawn Point's 8x8 Concrete Slab pad and optional Stone/Dirt halos onto terrainGrid.
 */
function stampSpawnPadTerrain(
  doc: CustomMapDocument,
  spawn: SpawnPointSpec,
  rules: MapGenerationRules = MAP_GENERATION_RULES
): void {
  const padSize = rules.spawnRules.spawnConcretePadSizeTiles;
  const centerX = spawn.x + (padSize - 1) * 0.5;
  const centerY = spawn.y + (padSize - 1) * 0.5;
  const haloR = spawn.includeStoneHalo
    ? Math.ceil(rules.spawnRules.spawnDirtTransitionRadiusTiles) + 1
    : padSize;

  const minX = Math.max(0, Math.floor(centerX - haloR));
  const maxX = Math.min(doc.width - 1, Math.ceil(centerX + haloR));
  const minY = Math.max(0, Math.floor(centerY - haloR));
  const maxY = Math.min(doc.height - 1, Math.ceil(centerY + haloR));

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const idx = ty * doc.width + tx;
      const inPad =
        tx >= spawn.x &&
        tx < spawn.x + padSize &&
        ty >= spawn.y &&
        ty < spawn.y + padSize;
      const dist = Math.hypot(tx - centerX, ty - centerY);

      if (inPad && spawn.includeConcretePad) {
        doc.terrainGrid[idx] = TERRAIN_KIND.CONCRETE_SLAB;
        doc.oreGrid[idx] = 0;
      } else if (spawn.includeStoneHalo) {
        if (dist <= rules.spawnRules.spawnStoneHaloRadiusTiles) {
          if (doc.terrainGrid[idx] !== TERRAIN_KIND.CONCRETE_SLAB) {
            doc.terrainGrid[idx] = TERRAIN_KIND.STONE;
            doc.oreGrid[idx] = 0;
          }
        } else if (dist <= rules.spawnRules.spawnDirtTransitionRadiusTiles) {
          if (
            doc.terrainGrid[idx] === TERRAIN_KIND.GRASS ||
            doc.terrainGrid[idx] === TERRAIN_KIND.CLIFF
          ) {
            doc.terrainGrid[idx] = TERRAIN_KIND.DIRT;
          }
        }
      }
    }
  }

  // Clear trees & silver deposits inside spawn obstacle clearance radius
  const clearance = rules.spawnRules.minSpawnObstacleClearanceRadiusTiles;
  doc.trees = doc.trees.filter(
    (t) => Math.hypot(t.x - centerX, t.y - centerY) >= clearance
  );
  doc.silverDeposits = doc.silverDeposits.filter(
    (s) => Math.hypot(s.x + 0.5 - centerX, s.y + 0.5 - centerY) >= clearance
  );
}

/**
 * Creates a clean blank custom map of the requested dimensions and base terrain.
 */
export function createBlankCustomMap(options?: {
  id?: string;
  name?: string;
  author?: string;
  description?: string;
  sizePreset?: MapSizePresetChoice;
  width?: number;
  height?: number;
  baseTerrainKind?: number;
  withDefaultSpawns?: boolean;
  seed?: number | string;
}): CustomMapDocument {
  const resolved = resolvePresetDimensions(
    options?.sizePreset ?? DEFAULT_MAP_SIZE_PRESET,
    options?.width,
    options?.height
  );
  const width = resolved.width;
  const height = resolved.height;
  const total = width * height;
  const baseTerrain = options?.baseTerrainKind ?? TERRAIN_KIND.GRASS;
  const seed =
    options?.seed !== undefined ? normalizeMapSeed(options.seed) : generateRandomMapSeed();
  const now = new Date().toISOString();

  const doc: CustomMapDocument = {
    id: options?.id ?? `map_${seed}`,
    name: options?.name ?? `Secteur Tactique #${seed.toString().slice(-4)}`,
    author: options?.author ?? "Architecte RTS-MK1",
    description:
      options?.description ??
      `Carte tactique personnalisée (${width}×${height}) créée dans DevTools RTS-MK1.`,
    version: "1.0.0",
    seed,
    sizePreset: resolved.sizePreset,
    width,
    height,
    terrainGrid: new Array<number>(total).fill(baseTerrain),
    oreGrid: new Array<number>(total).fill(0),
    spawns: [],
    trees: [],
    silverDeposits: [],
    placedEntities: [],
    createdAt: now,
    updatedAt: now,
  };

  if (options?.withDefaultSpawns ?? true) {
    const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
    const margin = Math.max(6, Math.min(12, Math.floor(Math.min(width, height) * 0.06)));
    const cornerCoords: MapCoord[] = [
      { x: margin, y: margin },
      { x: width - padSize - margin, y: height - padSize - margin },
      { x: width - padSize - margin, y: margin },
      { x: margin, y: height - padSize - margin },
    ];
    cornerCoords.forEach((pt, idx) => {
      const slotMeta = SPAWN_SLOT_DEFAULTS[idx]!;
      const sp: SpawnPointSpec = {
        slotIndex: idx,
        label: slotMeta.label,
        x: pt.x,
        y: pt.y,
        faction: slotMeta.defaultFaction,
        startingCredits: 5000,
        includeConcretePad: true,
        includeStoneHalo: true,
        includeInitialBase: true,
      };
      doc.spawns.push(sp);
      stampSpawnPadTerrain(doc, sp);
    });
  }

  return CustomMapDocumentSchema.parse(doc);
}

/**
 * Generates a full procedural battlefield from a `seed` and converts it into an editable `CustomMapDocument`.
 */
export function createMapFromProceduralSeed(options?: {
  id?: string;
  name?: string;
  author?: string;
  seed?: number | string;
  sizePreset?: MapSizePresetChoice;
  width?: number;
  height?: number;
}): CustomMapDocument {
  const resolved = resolvePresetDimensions(
    options?.sizePreset ?? DEFAULT_MAP_SIZE_PRESET,
    options?.width,
    options?.height
  );
  const seed =
    options?.seed !== undefined ? normalizeMapSeed(options.seed) : generateRandomMapSeed();
  const proc = generateProceduralMap({
    seed,
    width: resolved.width,
    height: resolved.height,
  });

  const now = new Date().toISOString();
  const spawns: SpawnPointSpec[] = proc.spawnPads.slice(0, 4).map((pad, idx) => {
    const meta = SPAWN_SLOT_DEFAULTS[idx]!;
    return {
      slotIndex: idx,
      label: meta.label,
      x: pad.x,
      y: pad.y,
      faction: meta.defaultFaction,
      startingCredits: 5000,
      includeConcretePad: true,
      includeStoneHalo: true,
      includeInitialBase: true,
    };
  });

  const trees: EditorTreePlacement[] = proc.trees.map((t, idx) => ({
    id: `tree_${idx + 1}_${t.x}_${t.y}`,
    x: t.x,
    y: t.y,
    kind: t.kind,
    scale: t.scale,
  }));

  const silverDeposits: EditorSilverDeposit[] = proc.silverDeposits.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    kind: s.kind,
    includeStoneApron: true,
  }));

  const doc: CustomMapDocument = {
    id: options?.id ?? `map_seed_${proc.seed}`,
    name: options?.name ?? `Théâtre Procédural #${proc.seed}`,
    author: options?.author ?? "Générateur Procédural RTS-MK1",
    description: `Carte générée par seed #${proc.seed} (${proc.width}×${proc.height} tuiles) conforme aux règles MAP_GENERATION_RULES.`,
    version: "1.0.0",
    seed: proc.seed,
    sizePreset: resolved.sizePreset,
    width: proc.width,
    height: proc.height,
    terrainGrid: [...proc.terrainGrid],
    oreGrid: [...proc.oreGrid],
    spawns,
    trees,
    silverDeposits,
    placedEntities: [],
    createdAt: now,
    updatedAt: now,
  };

  return CustomMapDocumentSchema.parse(doc);
}

/**
 * Resizes an existing `CustomMapDocument` to new dimensions (`newWidth × newHeight`)
 * while preserving painted terrain, ore, spawns, trees, silver deposits, and entities.
 */
export function resizeCustomMap(
  doc: CustomMapDocument,
  options: {
    sizePreset: MapSizePresetChoice;
    width?: number;
    height?: number;
    anchor?: "CENTER" | "TOP_LEFT";
    fillTerrainKind?: number;
  }
): CustomMapDocument {
  const resolved = resolvePresetDimensions(options.sizePreset, options.width, options.height);
  const newW = resolved.width;
  const newH = resolved.height;
  if (newW === doc.width && newH === doc.height) {
    return {
      ...cloneCustomMapDocument(doc),
      sizePreset: resolved.sizePreset,
    };
  }

  const fillKind = options.fillTerrainKind ?? TERRAIN_KIND.GRASS;
  const anchor = options.anchor ?? "CENTER";
  const offsetX = anchor === "CENTER" ? Math.floor((newW - doc.width) / 2) : 0;
  const offsetY = anchor === "CENTER" ? Math.floor((newH - doc.height) / 2) : 0;

  const newTotal = newW * newH;
  const newTerrainGrid = new Array<number>(newTotal).fill(fillKind);
  const newOreGrid = new Array<number>(newTotal).fill(0);

  for (let y = 0; y < doc.height; y++) {
    const dstY = y + offsetY;
    if (dstY < 0 || dstY >= newH) continue;
    for (let x = 0; x < doc.width; x++) {
      const dstX = x + offsetX;
      if (dstX < 0 || dstX >= newW) continue;
      const srcIdx = y * doc.width + x;
      const dstIdx = dstY * newW + dstX;
      newTerrainGrid[dstIdx] = doc.terrainGrid[srcIdx] ?? fillKind;
      newOreGrid[dstIdx] = doc.oreGrid[srcIdx] ?? 0;
    }
  }

  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  const newSpawns = doc.spawns
    .map((s) => ({
      ...s,
      x: Math.max(2, Math.min(newW - padSize - 2, s.x + offsetX)),
      y: Math.max(2, Math.min(newH - padSize - 2, s.y + offsetY)),
    }));

  const newTrees = doc.trees
    .map((t) => ({
      ...t,
      x: t.x + offsetX,
      y: t.y + offsetY,
    }))
    .filter((t) => t.x >= 1 && t.y >= 1 && t.x < newW - 1 && t.y < newH - 1);

  const newSilver = doc.silverDeposits
    .map((s) => ({
      ...s,
      x: s.x + offsetX,
      y: s.y + offsetY,
    }))
    .filter((s) => s.x >= 2 && s.y >= 2 && s.x < newW - 3 && s.y < newH - 3);

  const newEntities = doc.placedEntities
    .map((e) => ({
      ...e,
      x: e.x + offsetX,
      y: e.y + offsetY,
    }))
    .filter((e) => e.x >= 1 && e.y >= 1 && e.x < newW - 2 && e.y < newH - 2);

  return CustomMapDocumentSchema.parse({
    ...doc,
    sizePreset: resolved.sizePreset,
    width: newW,
    height: newH,
    terrainGrid: newTerrainGrid,
    oreGrid: newOreGrid,
    spawns: newSpawns,
    trees: newTrees,
    silverDeposits: newSilver,
    placedEntities: newEntities,
    updatedAt: new Date().toISOString(),
  });
}

function setSingleTerrainTile(
  doc: CustomMapDocument,
  tx: number,
  ty: number,
  terrainKind: number,
  oreAmount = 0
): void {
  if (tx < 0 || ty < 0 || tx >= doc.width || ty >= doc.height) return;
  const idx = ty * doc.width + tx;

  // If replacing a SILVER_ORE tile, clean up any silverDeposit overlapping (tx, ty)
  if (doc.terrainGrid[idx] === TERRAIN_KIND.SILVER_ORE && terrainKind !== TERRAIN_KIND.SILVER_ORE) {
    doc.silverDeposits = doc.silverDeposits.filter(
      (dep) => !(tx >= dep.x && tx <= dep.x + 1 && ty >= dep.y && ty <= dep.y + 1)
    );
  }

  doc.terrainGrid[idx] = terrainKind;
  if (terrainKind === TERRAIN_KIND.ORE) {
    doc.oreGrid[idx] = Math.max(100, Math.min(2500, Math.round(oreAmount / 25) * 25));
  } else {
    doc.oreGrid[idx] = 0;
  }

  // Cliffs, Concrete Slabs, Ore, and Silver Ore remove trees on that tile
  if (
    terrainKind === TERRAIN_KIND.CLIFF ||
    terrainKind === TERRAIN_KIND.CONCRETE_SLAB ||
    terrainKind === TERRAIN_KIND.ORE ||
    terrainKind === TERRAIN_KIND.SILVER_ORE
  ) {
    doc.trees = doc.trees.filter((t) => !(t.x === tx && t.y === ty));
  }
}

/**
 * Paints ground terrain (`GRASS`, `DIRT`, `STONE`, `CLIFF`, `CONCRETE_SLAB`) with brush & symmetry.
 */
export function applyTerrainBrush(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    terrainKind: number;
    brushSize?: number;
    brushShape?: BrushShape;
    symmetry?: SymmetryMode;
    oreAmount?: number;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const brushSize = options.brushSize ?? 1;
  const brushShape = options.brushShape ?? "CIRCLE";
  const symmetry = options.symmetry ?? "NONE";
  const oreAmount = options.oreAmount ?? 750;

  const symCenters = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    1,
    1
  );

  for (const center of symCenters) {
    const tiles = computeBrushFootprint(
      center.x,
      center.y,
      brushSize,
      brushShape,
      next.width,
      next.height,
      next.seed
    );
    for (const pt of tiles) {
      setSingleTerrainTile(next, pt.x, pt.y, options.terrainKind, oreAmount);
    }
  }

  return next;
}

/**
 * Draws a Bresenham line of terrain tiles between `(fromX, fromY)` and `(toX, toY)`.
 */
export function applyTerrainLine(
  doc: CustomMapDocument,
  options: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    terrainKind: number;
    brushSize?: number;
    brushShape?: BrushShape;
    symmetry?: SymmetryMode;
    oreAmount?: number;
  }
): CustomMapDocument {
  let curr = cloneCustomMapDocument(doc);
  let x0 = Math.round(options.fromX);
  let y0 = Math.round(options.fromY);
  const x1 = Math.round(options.toX);
  const y1 = Math.round(options.toY);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let safety = 0;

  while (safety++ < 1024) {
    curr = applyTerrainBrush(curr, {
      x: x0,
      y: y0,
      terrainKind: options.terrainKind,
      brushSize: options.brushSize ?? 1,
      brushShape: options.brushShape ?? "CIRCLE",
      symmetry: options.symmetry ?? "NONE",
      oreAmount: options.oreAmount,
    });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return curr;
}

/**
 * Fills or outlines a rectangle between `(x0, y0)` and `(x1, y1)` with symmetry.
 */
export function applyTerrainRect(
  doc: CustomMapDocument,
  options: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    terrainKind: number;
    hollow?: boolean;
    symmetry?: SymmetryMode;
    oreAmount?: number;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const minX = Math.max(0, Math.min(options.x0, options.x1));
  const maxX = Math.min(next.width - 1, Math.max(options.x0, options.x1));
  const minY = Math.max(0, Math.min(options.y0, options.y1));
  const maxY = Math.min(next.height - 1, Math.max(options.y0, options.y1));
  const symmetry = options.symmetry ?? "NONE";
  const oreAmount = options.oreAmount ?? 750;

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      if (
        options.hollow &&
        tx > minX &&
        tx < maxX &&
        ty > minY &&
        ty < maxY
      ) {
        continue;
      }
      const symPts = computeSymmetryCoords(tx, ty, next.width, next.height, symmetry, 1, 1);
      for (const pt of symPts) {
        setSingleTerrainTile(next, pt.x, pt.y, options.terrainKind, oreAmount);
      }
    }
  }

  return next;
}

/**
 * Flood-fills a contiguous region of identical terrain starting at `(startX, startY)`.
 */
export function applyTerrainFloodFill(
  doc: CustomMapDocument,
  options: {
    startX: number;
    startY: number;
    terrainKind: number;
    oreAmount?: number;
    maxTiles?: number;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const sx = Math.round(options.startX);
  const sy = Math.round(options.startY);
  if (sx < 0 || sy < 0 || sx >= next.width || sy >= next.height) return next;

  const startIdx = sy * next.width + sx;
  const targetKind = next.terrainGrid[startIdx];
  if (targetKind === undefined || targetKind === options.terrainKind) {
    return next;
  }

  const maxTiles = options.maxTiles ?? 12000;
  const visited = new Uint8Array(next.width * next.height);
  const queueX: number[] = [sx];
  const queueY: number[] = [sy];
  visited[startIdx] = 1;
  let head = 0;
  let filled = 0;

  while (head < queueX.length && filled < maxTiles) {
    const cx = queueX[head]!;
    const cy = queueY[head]!;
    head++;
    filled++;

    setSingleTerrainTile(next, cx, cy, options.terrainKind, options.oreAmount ?? 750);

    const neighbors: ReadonlyArray<MapCoord> = [
      { x: cx + 1, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx, y: cy - 1 },
    ];
    for (const n of neighbors) {
      if (n.x < 0 || n.y < 0 || n.x >= next.width || n.y >= next.height) continue;
      const nIdx = n.y * next.width + n.x;
      if (visited[nIdx] === 1) continue;
      if (next.terrainGrid[nIdx] === targetKind) {
        visited[nIdx] = 1;
        queueX.push(n.x);
        queueY.push(n.y);
      }
    }
  }

  return next;
}

/**
 * Stamps an organic multi-lobed Ore Vein (`SMALL_VEIN`, `NATURAL_VEIN`, `CONTESTED_BASIN`) at `(x, y)` with symmetry.
 */
export function stampOreVein(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    preset: OreStampPreset;
    baseAmount?: number;
    symmetry?: SymmetryMode;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const symmetry = options.symmetry ?? "NONE";
  const spec =
    options.preset === "SMALL_VEIN"
      ? { rx: 2.3, ry: 1.7, lobeR: 1.4, defaultAmount: 650 }
      : options.preset === "CONTESTED_BASIN"
        ? { rx: 4.8, ry: 3.4, lobeR: 2.6, defaultAmount: 1050 }
        : { rx: 3.6, ry: 2.5, lobeR: 2.1, defaultAmount: 800 };

  const baseAmount = options.baseAmount ?? spec.defaultAmount;
  const symCenters = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    1,
    1
  );

  for (const center of symCenters) {
    const rng = createSeededRng(next.seed ^ (center.x * 2654435761) ^ (center.y * 2246822519));
    const angle = rng.range(-0.85, 0.85);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const lobeDx = rng.next() < 0.5 ? -1.5 : 1.5;
    const lobeDy = rng.next() < 0.5 ? -1.2 : 1.2;
    const bound = Math.ceil(Math.max(spec.rx, spec.ry, spec.lobeR + 2)) + 2;

    for (let dy = -bound; dy <= bound; dy++) {
      for (let dx = -bound; dx <= bound; dx++) {
        const tx = center.x + dx;
        const ty = center.y + dy;
        if (tx < 2 || ty < 2 || tx >= next.width - 2 || ty >= next.height - 2) continue;

        const idx = ty * next.width + tx;
        if (next.terrainGrid[idx] === TERRAIN_KIND.CONCRETE_SLAB) continue;

        const rotX = dx * cosA - dy * sinA;
        const rotY = dx * sinA + dy * cosA;
        const eDist = Math.hypot(rotX / spec.rx, rotY / spec.ry);
        const lobeDist = Math.hypot(dx - lobeDx, dy - lobeDy) / spec.lobeR;
        const shapeMetric = Math.min(eDist, lobeDist);

        if (shapeMetric <= 1.0) {
          const richness = Math.max(0.6, 1.15 - shapeMetric * 0.45);
          const tileAmount = Math.max(100, Math.round((baseAmount * richness) / 25) * 25);
          setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.ORE, tileAmount);
        } else if (shapeMetric <= 1.38 && next.terrainGrid[idx] === TERRAIN_KIND.GRASS) {
          setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.DIRT, 0);
        }
      }
    }
  }

  return next;
}

/**
 * Places a 2x2 Silver Ore Boulder (`TERRAIN_KIND.SILVER_ORE`) + optional 1-tile Stone docking apron.
 */
export function placeSilverDeposit(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    includeStoneApron?: boolean;
    symmetry?: SymmetryMode;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const includeStoneApron = options.includeStoneApron ?? true;
  const symmetry = options.symmetry ?? "NONE";

  const symCoords = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    2,
    2
  );

  for (const pt of symCoords) {
    if (pt.x < 1 || pt.y < 1 || pt.x + 2 >= next.width || pt.y + 2 >= next.height) {
      continue;
    }

    // Remove any overlapping previous silverDeposits
    next.silverDeposits = next.silverDeposits.filter(
      (dep) => Math.abs(dep.x - pt.x) > 1 || Math.abs(dep.y - pt.y) > 1
    );

    const midX = next.width * 0.5;
    const midY = next.height * 0.5;
    const isCentral = Math.hypot(pt.x - midX, pt.y - midY) < Math.min(next.width, next.height) * 0.25;

    next.silverDeposits.push({
      id: `silver_${pt.x}_${pt.y}`,
      x: pt.x,
      y: pt.y,
      kind: isCentral ? "CONTESTED_CENTRAL" : "REGIONAL",
      includeStoneApron,
    });

    const minDelta = includeStoneApron ? -1 : 0;
    const maxDelta = includeStoneApron ? 2 : 1;
    for (let dy = minDelta; dy <= maxDelta; dy++) {
      for (let dx = minDelta; dx <= maxDelta; dx++) {
        const tx = pt.x + dx;
        const ty = pt.y + dy;
        if (tx < 0 || ty < 0 || tx >= next.width || ty >= next.height) continue;
        if (dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1) {
          setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.SILVER_ORE, 0);
        } else if (includeStoneApron) {
          const idx = ty * next.width + tx;
          if (
            next.terrainGrid[idx] !== TERRAIN_KIND.CONCRETE_SLAB &&
            next.terrainGrid[idx] !== TERRAIN_KIND.SILVER_ORE
          ) {
            setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.STONE, 0);
          }
        }
      }
    }
  }

  return next;
}

/**
 * Places destructible trees (`TREE_PINE`, `TREE_OAK`, `TREE_PALM`, or `"MIXED"`) at `(x, y)` with brush & symmetry.
 */
export function applyTreeBrush(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    treeKind: TreeKind | "MIXED";
    scale?: number;
    brushSize?: number;
    brushShape?: BrushShape;
    symmetry?: SymmetryMode;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const brushSize = options.brushSize ?? 1;
  const brushShape = options.brushShape ?? (brushSize > 1 ? "SPRAY" : "CIRCLE");
  const symmetry = options.symmetry ?? "NONE";
  const baseScale = options.scale ?? 1.05;

  const symCenters = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    1,
    1
  );

  const speciesList: ReadonlyArray<TreeKind> = ["TREE_PINE", "TREE_OAK", "TREE_PALM"];

  for (const center of symCenters) {
    const footprint = computeBrushFootprint(
      center.x,
      center.y,
      brushSize,
      brushShape,
      next.width,
      next.height,
      next.seed
    );
    for (const pt of footprint) {
      if (pt.x < 1 || pt.y < 1 || pt.x >= next.width - 1 || pt.y >= next.height - 1) continue;
      const idx = pt.y * next.width + pt.x;
      const tk = next.terrainGrid[idx];
      // Trees can only grow on Grass or Dirt without Ore
      if (tk !== TERRAIN_KIND.GRASS && tk !== TERRAIN_KIND.DIRT) continue;
      if ((next.oreGrid[idx] ?? 0) > 0) continue;

      const rng = createSeededRng(next.seed ^ (pt.x * 83492791) ^ (pt.y * 2971215073));
      const chosenKind: TreeKind =
        options.treeKind === "MIXED"
          ? tk === TERRAIN_KIND.DIRT
            ? "TREE_PALM"
            : speciesList[rng.int(0, 1)]!
          : options.treeKind;

      const scaleJitter = brushSize > 1 ? rng.range(-0.14, 0.16) : 0;
      const finalScale = Number(
        Math.max(0.75, Math.min(1.4, baseScale + scaleJitter)).toFixed(2)
      );

      // Replace existing tree at (pt.x, pt.y)
      next.trees = next.trees.filter((t) => !(t.x === pt.x && t.y === pt.y));
      next.trees.push({
        id: `tree_${pt.x}_${pt.y}`,
        x: pt.x,
        y: pt.y,
        kind: chosenKind,
        scale: finalScale,
      });
    }
  }

  return next;
}

/**
 * Places or updates a Faction Spawn Point (`slotIndex 0..3`) and stamps its 8x8 Concrete Pad + Stone Halo.
 */
export function placeOrUpdateSpawnPoint(
  doc: CustomMapDocument,
  options: {
    slotIndex: number;
    x: number;
    y: number;
    faction?: SpawnFactionChoice;
    startingCredits?: number;
    includeConcretePad?: boolean;
    includeStoneHalo?: boolean;
    includeInitialBase?: boolean;
    label?: string;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  const clampedSlot = Math.max(0, Math.min(3, Math.round(options.slotIndex)));
  const clampedX = Math.max(2, Math.min(next.width - padSize - 2, Math.round(options.x)));
  const clampedY = Math.max(2, Math.min(next.height - padSize - 2, Math.round(options.y)));

  const slotMeta = SPAWN_SLOT_DEFAULTS[clampedSlot]!;
  const existing = next.spawns.find((s) => s.slotIndex === clampedSlot);

  const spawnSpec: SpawnPointSpec = {
    slotIndex: clampedSlot,
    label: options.label ?? existing?.label ?? slotMeta.label,
    x: clampedX,
    y: clampedY,
    faction: options.faction ?? existing?.faction ?? slotMeta.defaultFaction,
    startingCredits: options.startingCredits ?? existing?.startingCredits ?? 5000,
    includeConcretePad: options.includeConcretePad ?? existing?.includeConcretePad ?? true,
    includeStoneHalo: options.includeStoneHalo ?? existing?.includeStoneHalo ?? true,
    includeInitialBase: options.includeInitialBase ?? existing?.includeInitialBase ?? true,
  };

  next.spawns = next.spawns
    .filter((s) => s.slotIndex !== clampedSlot)
    .concat(spawnSpec)
    .sort((a, b) => a.slotIndex - b.slotIndex);

  stampSpawnPadTerrain(next, spawnSpec);
  return next;
}

export function removeSpawnPoint(doc: CustomMapDocument, slotIndex: number): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  next.spawns = next.spawns.filter((s) => s.slotIndex !== slotIndex);
  return next;
}

/**
 * Places a pre-built structure, defense, or unit on the map at `(x, y)` with optional symmetry.
 */
export function placePrebuiltEntity(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    ownerSlot: number | "NEUTRAL";
    faction: FactionId;
    entityType: "BUILDING" | "UNIT";
    kind: BuildingKind | UnitKind;
    angleIndex?: number;
    hpRatio?: number;
    autoFoundation?: boolean;
    symmetry?: SymmetryMode;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const bSpec =
    options.entityType === "BUILDING"
      ? BUILDINGS[options.kind as BuildingKind]
      : undefined;
  const footW = bSpec?.footprintW ?? 1;
  const footH = bSpec?.footprintH ?? 1;
  const symmetry = options.symmetry ?? "NONE";

  const symCoords = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    footW,
    footH
  );

  symCoords.forEach((pt, symIdx) => {
    if (pt.x < 1 || pt.y < 1 || pt.x + footW >= next.width || pt.y + footH >= next.height) {
      return;
    }

    // Remove overlapping placedEntities
    next.placedEntities = next.placedEntities.filter((e) => {
      const eb = e.entityType === "BUILDING" ? BUILDINGS[e.kind as BuildingKind] : undefined;
      const ew = eb?.footprintW ?? 1;
      const eh = eb?.footprintH ?? 1;
      const overlapX = pt.x < e.x + ew && pt.x + footW > e.x;
      const overlapY = pt.y < e.y + eh && pt.y + footH > e.y;
      return !(overlapX && overlapY);
    });

    // Clear trees under building footprint
    next.trees = next.trees.filter(
      (t) => !(t.x >= pt.x && t.x < pt.x + footW && t.y >= pt.y && t.y < pt.y + footH)
    );

    if (options.entityType === "BUILDING" && (options.autoFoundation ?? true)) {
      for (let dy = 0; dy < footH; dy++) {
        for (let dx = 0; dx < footW; dx++) {
          const tx = pt.x + dx;
          const ty = pt.y + dy;
          if (options.kind === "SILVER_MINE") {
            setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.SILVER_ORE, 0);
          } else {
            setSingleTerrainTile(next, tx, ty, TERRAIN_KIND.CONCRETE_SLAB, 0);
          }
        }
      }
    }

    const slotOwner: number | "NEUTRAL" =
      options.ownerSlot === "NEUTRAL"
        ? "NEUTRAL"
        : ((options.ownerSlot + symIdx) % 4);

    const ent: EditorPlacedEntity = {
      id: `ent_${options.kind.toLowerCase()}_${pt.x}_${pt.y}`,
      x: pt.x,
      y: pt.y,
      ownerSlot: slotOwner,
      faction: options.faction,
      entityType: options.entityType,
      kind: options.kind,
      angleIndex: options.angleIndex ?? 4,
      hpRatio: options.hpRatio ?? 1.0,
    };
    next.placedEntities.push(ent);
  });

  return next;
}

/**
 * Erases trees, placed entities, resources, spawns, or resets terrain to `GRASS` within brush footprint.
 */
export function eraseAtCoord(
  doc: CustomMapDocument,
  options: {
    x: number;
    y: number;
    brushSize?: number;
    symmetry?: SymmetryMode;
    resetTerrainToGrass?: boolean;
  }
): CustomMapDocument {
  const next = cloneCustomMapDocument(doc);
  const brushSize = options.brushSize ?? 1;
  const symmetry = options.symmetry ?? "NONE";
  const resetTerrain = options.resetTerrainToGrass ?? true;

  const symCenters = computeSymmetryCoords(
    options.x,
    options.y,
    next.width,
    next.height,
    symmetry,
    1,
    1
  );

  for (const center of symCenters) {
    const tiles = computeBrushFootprint(
      center.x,
      center.y,
      brushSize,
      "CIRCLE",
      next.width,
      next.height,
      next.seed
    );
    for (const pt of tiles) {
      next.trees = next.trees.filter((t) => !(t.x === pt.x && t.y === pt.y));
      next.placedEntities = next.placedEntities.filter((e) => {
        const eb = e.entityType === "BUILDING" ? BUILDINGS[e.kind as BuildingKind] : undefined;
        const ew = eb?.footprintW ?? 1;
        const eh = eb?.footprintH ?? 1;
        return !(pt.x >= e.x && pt.x < e.x + ew && pt.y >= e.y && pt.y < e.y + eh);
      });
      next.silverDeposits = next.silverDeposits.filter(
        (s) => !(pt.x >= s.x && pt.x <= s.x + 1 && pt.y >= s.y && pt.y <= s.y + 1)
      );
      if (resetTerrain) {
        setSingleTerrainTile(next, pt.x, pt.y, TERRAIN_KIND.GRASS, 0);
      } else {
        const idx = pt.y * next.width + pt.x;
        if (
          next.terrainGrid[idx] === TERRAIN_KIND.ORE ||
          next.terrainGrid[idx] === TERRAIN_KIND.SILVER_ORE
        ) {
          setSingleTerrainTile(next, pt.x, pt.y, TERRAIN_KIND.DIRT, 0);
        }
      }
    }
  }

  return next;
}

export interface TileInspectionResult {
  x: number;
  y: number;
  terrainKind: number;
  terrainLabel: string;
  oreAmount: number;
  passable: boolean;
  buildableFoundation: boolean;
  tree: EditorTreePlacement | null;
  silverDeposit: EditorSilverDeposit | null;
  spawn: SpawnPointSpec | null;
  placedEntity: EditorPlacedEntity | null;
  nearestSpawnDistance: number | null;
}

export const TERRAIN_LABELS_FR: Record<number, string> = {
  [TERRAIN_KIND.GRASS]: "Herbe (Plaine)",
  [TERRAIN_KIND.DIRT]: "Terre (Vallée)",
  [TERRAIN_KIND.STONE]: "Pierre (Socle)",
  [TERRAIN_KIND.CLIFF]: "Falaise (Bloquée)",
  [TERRAIN_KIND.ORE]: "Minerai Classique",
  [TERRAIN_KIND.CONCRETE_SLAB]: "Dalle de Béton Armé",
  [TERRAIN_KIND.SILVER_ORE]: "Rocher d'Argent 2×2",
};

export function inspectTileAt(doc: CustomMapDocument, x: number, y: number): TileInspectionResult {
  const tx = Math.max(0, Math.min(doc.width - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(doc.height - 1, Math.floor(y)));
  const idx = ty * doc.width + tx;
  const tk = doc.terrainGrid[idx] ?? TERRAIN_KIND.GRASS;
  const ore = doc.oreGrid[idx] ?? 0;

  const tree = doc.trees.find((t) => t.x === tx && t.y === ty) ?? null;
  const silverDeposit =
    doc.silverDeposits.find(
      (s) => tx >= s.x && tx <= s.x + 1 && ty >= s.y && ty <= s.y + 1
    ) ?? null;

  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  const spawn =
    doc.spawns.find(
      (s) => tx >= s.x && tx < s.x + padSize && ty >= s.y && ty < s.y + padSize
    ) ?? null;

  const placedEntity =
    doc.placedEntities.find((e) => {
      const eb = e.entityType === "BUILDING" ? BUILDINGS[e.kind as BuildingKind] : undefined;
      const ew = eb?.footprintW ?? 1;
      const eh = eb?.footprintH ?? 1;
      return tx >= e.x && tx < e.x + ew && ty >= e.y && ty < e.y + eh;
    }) ?? null;

  let nearestSpawnDistance: number | null = null;
  for (const s of doc.spawns) {
    const cx = s.x + (padSize - 1) * 0.5;
    const cy = s.y + (padSize - 1) * 0.5;
    const d = Number(Math.hypot(tx - cx, ty - cy).toFixed(1));
    if (nearestSpawnDistance === null || d < nearestSpawnDistance) {
      nearestSpawnDistance = d;
    }
  }

  const passable =
    tk !== TERRAIN_KIND.CLIFF &&
    tk !== TERRAIN_KIND.SILVER_ORE &&
    tree === null &&
    (placedEntity === null || placedEntity.kind === "CONCRETE_SLAB");

  const buildableFoundation = tk === TERRAIN_KIND.CONCRETE_SLAB && placedEntity === null;

  return {
    x: tx,
    y: ty,
    terrainKind: tk,
    terrainLabel: TERRAIN_LABELS_FR[tk] ?? "Terrain",
    oreAmount: ore,
    passable,
    buildableFoundation,
    tree,
    silverDeposit,
    spawn,
    placedEntity,
    nearestSpawnDistance,
  };
}

export interface TacticalDistanceMeasurement {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  dx: number;
  dy: number;
  euclideanTiles: number;
  manhattanTiles: number;
  angleDegrees: number;
  meetsEnemyBaseDistance: boolean;
  meetsSilverDistance: boolean;
  meetsOreDistance: boolean;
}

export function measureTacticalDistance(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  rules: MapGenerationRules = MAP_GENERATION_RULES
): TacticalDistanceMeasurement {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const euclideanTiles = Number(Math.hypot(dx, dy).toFixed(1));
  const manhattanTiles = Math.abs(dx) + Math.abs(dy);
  const angleDegrees = Number(((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1));

  return {
    fromX,
    fromY,
    toX,
    toY,
    dx,
    dy,
    euclideanTiles,
    manhattanTiles,
    angleDegrees,
    meetsEnemyBaseDistance: euclideanTiles >= rules.spawnRules.minEnemyBaseDistanceTiles,
    meetsSilverDistance: euclideanTiles >= rules.silverMineRules.minDistanceFromSpawnTiles,
    meetsOreDistance: euclideanTiles >= rules.oreRules.minDistanceFromSpawnTiles,
  };
}

export interface MapAuditCheckItem {
  id: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}

export interface CustomMapAuditReport {
  valid: boolean;
  score: number;
  totalTiles: number;
  areaMultiplierVsLegacy: number;
  oreTileCount: number;
  oreTotalCredits: number;
  silverDepositCount: number;
  treeCount: number;
  entityCount: number;
  spawnCount: number;
  minEnemyBaseDistance: number | null;
  minOreDistanceFromSpawn: number | null;
  maxNaturalOreDistanceFromSpawn: number | null;
  minSilverDistanceFromSpawn: number | null;
  terrainBreakdownPct: {
    grass: number;
    dirt: number;
    stone: number;
    cliff: number;
    concrete: number;
    ore: number;
    silver: number;
  };
  checks: MapAuditCheckItem[];
}

/**
 * Comprehensive balance & rule validator for custom maps in the Map Editor.
 */
export function auditCustomMap(
  doc: CustomMapDocument,
  rules: MapGenerationRules = MAP_GENERATION_RULES
): CustomMapAuditReport {
  const totalTiles = doc.width * doc.height;
  const areaMultiplierVsLegacy = Number((totalTiles / LEGACY_MAP_TOTAL_TILES).toFixed(2));
  const padSize = rules.spawnRules.spawnConcretePadSizeTiles;
  const spawnCenters = doc.spawns.map((s) => ({
    slotIndex: s.slotIndex,
    x: s.x + (padSize - 1) * 0.5,
    y: s.y + (padSize - 1) * 0.5,
  }));

  let grassCnt = 0;
  let dirtCnt = 0;
  let stoneCnt = 0;
  let cliffCnt = 0;
  let concreteCnt = 0;
  let oreTileCount = 0;
  let silverTileCount = 0;
  let oreTotalCredits = 0;

  let minOreDistanceFromSpawn = Infinity;
  let minSilverDistanceFromSpawn = Infinity;
  const minOreDistPerSpawn = new Array<number>(spawnCenters.length).fill(Infinity);

  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      const idx = y * doc.width + x;
      const tk = doc.terrainGrid[idx] ?? TERRAIN_KIND.GRASS;
      const ore = doc.oreGrid[idx] ?? 0;

      if (tk === TERRAIN_KIND.GRASS) grassCnt++;
      else if (tk === TERRAIN_KIND.DIRT) dirtCnt++;
      else if (tk === TERRAIN_KIND.STONE) stoneCnt++;
      else if (tk === TERRAIN_KIND.CLIFF) cliffCnt++;
      else if (tk === TERRAIN_KIND.CONCRETE_SLAB) concreteCnt++;
      else if (tk === TERRAIN_KIND.ORE) oreTileCount++;
      else if (tk === TERRAIN_KIND.SILVER_ORE) silverTileCount++;

      if (ore > 0 || tk === TERRAIN_KIND.ORE) {
        oreTotalCredits += ore;
        for (let s = 0; s < spawnCenters.length; s++) {
          const d = Math.hypot(x - spawnCenters[s]!.x, y - spawnCenters[s]!.y);
          if (d < minOreDistanceFromSpawn) minOreDistanceFromSpawn = d;
          if (d < minOreDistPerSpawn[s]!) minOreDistPerSpawn[s] = d;
        }
      }

      if (tk === TERRAIN_KIND.SILVER_ORE) {
        for (const sc of spawnCenters) {
          const d = Math.hypot(x - sc.x, y - sc.y);
          if (d < minSilverDistanceFromSpawn) minSilverDistanceFromSpawn = d;
        }
      }
    }
  }

  let minEnemyBaseDistance = Infinity;
  for (let i = 0; i < spawnCenters.length; i++) {
    for (let j = i + 1; j < spawnCenters.length; j++) {
      const d = Math.hypot(
        spawnCenters[i]!.x - spawnCenters[j]!.x,
        spawnCenters[i]!.y - spawnCenters[j]!.y
      );
      if (d < minEnemyBaseDistance) minEnemyBaseDistance = d;
    }
  }

  const maxNaturalOreDistanceFromSpawn =
    minOreDistPerSpawn.length > 0 ? Math.max(...minOreDistPerSpawn) : Infinity;

  // Scale distance threshold proportionally if the user edits a smaller map (e.g. 72x72)
  const scaleFactor = Math.min(1, Math.min(doc.width, doc.height) / 160);
  const reqBaseDist = Math.round(rules.spawnRules.minEnemyBaseDistanceTiles * scaleFactor);
  const reqOreMinDist = Math.round(rules.oreRules.minDistanceFromSpawnTiles * scaleFactor);
  const reqOreMaxNatDist = Math.round(
    rules.oreRules.maxNaturalOreDistanceFromSpawnTiles * Math.max(0.75, scaleFactor)
  );
  const reqSilverMinDist = Math.round(
    rules.silverMineRules.minDistanceFromSpawnTiles * scaleFactor
  );

  const checks: MapAuditCheckItem[] = [];

  // Check 1: Spawn points count (at least 2)
  if (doc.spawns.length >= 2) {
    checks.push({
      id: "spawns_count",
      label: "Points de Spawn des Factions",
      status: "PASS",
      detail: `${doc.spawns.length} bases configurées (${doc.spawns.map((s) => s.faction).join(" vs ")}).`,
    });
  } else {
    checks.push({
      id: "spawns_count",
      label: "Points de Spawn des Factions",
      status: "FAIL",
      detail: `Seulement ${doc.spawns.length} spawn défini (minimum 2 requis pour une partie).`,
    });
  }

  // Check 2: Enemy base separation
  if (spawnCenters.length >= 2 && Number.isFinite(minEnemyBaseDistance)) {
    if (minEnemyBaseDistance >= reqBaseDist) {
      checks.push({
        id: "spawn_separation",
        label: "Séparation des Bases Ennemies",
        status: "PASS",
        detail: `Min observé : ${minEnemyBaseDistance.toFixed(1)} blocs (seuil >= ${reqBaseDist} blocs).`,
      });
    } else {
      checks.push({
        id: "spawn_separation",
        label: "Séparation des Bases Ennemies",
        status: "WARN",
        detail: `Bases proches : ${minEnemyBaseDistance.toFixed(1)} blocs (recommandé >= ${reqBaseDist} blocs).`,
      });
    }
  }

  // Check 3: Ore availability & distance from spawns
  if (oreTileCount === 0) {
    checks.push({
      id: "ore_economy",
      label: "Économie Minerai Classique",
      status: "WARN",
      detail: "Aucun gisement de minerai placé sur la carte.",
    });
  } else if (spawnCenters.length > 0 && minOreDistanceFromSpawn < reqOreMinDist) {
    checks.push({
      id: "ore_economy",
      label: "Distance Spawn ↔ Minerai",
      status: "WARN",
      detail: `Minerai à ${minOreDistanceFromSpawn.toFixed(1)} blocs d'un spawn (règle >= ${reqOreMinDist} blocs).`,
    });
  } else if (
    spawnCenters.length > 0 &&
    maxNaturalOreDistanceFromSpawn > reqOreMaxNatDist &&
    Number.isFinite(maxNaturalOreDistanceFromSpawn)
  ) {
    checks.push({
      id: "ore_economy",
      label: "Accès au 1er Filon Naturel",
      status: "WARN",
      detail: `1er filon à ${maxNaturalOreDistanceFromSpawn.toFixed(1)} blocs d'un spawn (recommandé <= ${reqOreMaxNatDist} blocs).`,
    });
  } else {
    checks.push({
      id: "ore_economy",
      label: "Économie Minerai Classique",
      status: "PASS",
      detail: `${oreTileCount} tuiles (${oreTotalCredits.toLocaleString("fr-FR")} CR), min ${Number.isFinite(minOreDistanceFromSpawn) ? minOreDistanceFromSpawn.toFixed(1) : "—"}t du spawn.`,
    });
  }

  // Check 4: Silver deposits
  const silverDepositCount = doc.silverDeposits.length || Math.floor(silverTileCount / 4);
  if (silverDepositCount === 0) {
    checks.push({
      id: "silver_deposits",
      label: "Mines d'Argent 2×2 (SILVER_ORE)",
      status: "WARN",
      detail: "Aucun rocher d'argent 2×2 placé.",
    });
  } else if (spawnCenters.length > 0 && minSilverDistanceFromSpawn < reqSilverMinDist) {
    checks.push({
      id: "silver_deposits",
      label: "Distance Spawn ↔ Mine d'Argent",
      status: "WARN",
      detail: `Rocher 2×2 à ${minSilverDistanceFromSpawn.toFixed(1)} blocs d'un spawn (règle >= ${reqSilverMinDist} blocs).`,
    });
  } else {
    checks.push({
      id: "silver_deposits",
      label: "Mines d'Argent 2×2 (SILVER_ORE)",
      status: "PASS",
      detail: `${silverDepositCount} gisements 2×2 conformes (min ${Number.isFinite(minSilverDistanceFromSpawn) ? minSilverDistanceFromSpawn.toFixed(1) : "—"}t du spawn).`,
    });
  }

  const failCount = checks.filter((c) => c.status === "FAIL").length;
  const warnCount = checks.filter((c) => c.status === "WARN").length;
  const score = Math.max(0, 100 - failCount * 35 - warnCount * 12);

  const pct = (n: number): number => Number(((n / Math.max(1, totalTiles)) * 100).toFixed(1));

  return {
    valid: failCount === 0,
    score,
    totalTiles,
    areaMultiplierVsLegacy,
    oreTileCount,
    oreTotalCredits,
    silverDepositCount,
    treeCount: doc.trees.length,
    entityCount: doc.placedEntities.length,
    spawnCount: doc.spawns.length,
    minEnemyBaseDistance: Number.isFinite(minEnemyBaseDistance)
      ? Number(minEnemyBaseDistance.toFixed(1))
      : null,
    minOreDistanceFromSpawn: Number.isFinite(minOreDistanceFromSpawn)
      ? Number(minOreDistanceFromSpawn.toFixed(1))
      : null,
    maxNaturalOreDistanceFromSpawn: Number.isFinite(maxNaturalOreDistanceFromSpawn)
      ? Number(maxNaturalOreDistanceFromSpawn.toFixed(1))
      : null,
    minSilverDistanceFromSpawn: Number.isFinite(minSilverDistanceFromSpawn)
      ? Number(minSilverDistanceFromSpawn.toFixed(1))
      : null,
    terrainBreakdownPct: {
      grass: pct(grassCnt),
      dirt: pct(dirtCnt),
      stone: pct(stoneCnt),
      cliff: pct(cliffCnt),
      concrete: pct(concreteCnt),
      ore: pct(oreTileCount),
      silver: pct(silverTileCount),
    },
    checks,
  };
}

export function summarizeCustomMap(doc: CustomMapDocument): CustomMapSummary {
  const audit = auditCustomMap(doc);
  return {
    id: doc.id,
    name: doc.name,
    author: doc.author,
    description: doc.description,
    version: doc.version,
    seed: doc.seed,
    sizePreset: doc.sizePreset,
    width: doc.width,
    height: doc.height,
    spawnCount: doc.spawns.length,
    oreTotalCredits: audit.oreTotalCredits,
    silverDepositCount: audit.silverDepositCount,
    treeCount: doc.trees.length,
    entityCount: doc.placedEntities.length,
    rulesValid: audit.valid,
    updatedAt: doc.updatedAt,
  };
}
