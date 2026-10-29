import {
  BASE_BUILD_RADIUS_TILES,
  BUILDINGS,
  FACTIONS,
  MAP_GENERATION_RULES,
  normalizeBaseTerrainKind,
  TERRAIN_KIND,
  TILE_PIXEL_SIZE,
  UNITS,
  type BuildingKind,
  type FactionId,
  type MapCoord,
  type TreeKind,
  type UnitKind,
} from "../shared/constants";
import {
  computeBrushFootprint,
  computeSymmetryCoords,
  measureTacticalDistance,
} from "../shared/map-editor-engine";
import type {
  BrushShape,
  CustomMapDocument,
  EditorDrawMode,
  EditorToolCategory,
  OreStampPreset,
  SpawnFactionChoice,
  SymmetryMode,
} from "../shared/schemas/map-editor";
import type { EditorCamera } from "./editor-camera";
import type { ProceduralSpriteAtlas } from "./generator/atlas-generator";

function drawSilverOreDeposit2x2(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number
): void {
  const spanW = s * 2;
  const spanH = s * 2;
  const cx = px + spanW * 0.5;
  const cy = py + spanH * 0.5;

  ctx.save();
  ctx.fillStyle = "rgba(6, 9, 15, 0.55)";
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + 3, spanW * 0.45, spanH * 0.43, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px + spanW * 0.16, py + spanH * 0.82);
  ctx.lineTo(px + spanW * 0.08, py + spanH * 0.42);
  ctx.lineTo(px + spanW * 0.28, py + spanH * 0.12);
  ctx.lineTo(px + spanW * 0.72, py + spanH * 0.1);
  ctx.lineTo(px + spanW * 0.92, py + spanH * 0.44);
  ctx.lineTo(px + spanW * 0.82, py + spanH * 0.86);
  ctx.closePath();
  const rockGrad = ctx.createLinearGradient(px, py, px + spanW, py + spanH);
  rockGrad.addColorStop(0, "#64748b");
  rockGrad.addColorStop(0.55, "#475569");
  rockGrad.addColorStop(1, "#1e293b");
  ctx.fillStyle = rockGrad;
  ctx.fill();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const nuggets: ReadonlyArray<[number, number, number]> = [
    [0.32, 0.34, 4.5],
    [0.64, 0.28, 5.2],
    [0.48, 0.52, 6.0],
    [0.28, 0.66, 4.2],
    [0.7, 0.64, 4.8],
  ];
  for (const [nxRatio, nyRatio, rad] of nuggets) {
    const nx = px + spanW * nxRatio;
    const ny = py + spanH * nyRatio;
    ctx.beginPath();
    ctx.arc(nx, ny, rad, 0, Math.PI * 2);
    ctx.fillStyle = "#cbd5e1";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(nx - rad * 0.28, ny - rad * 0.28, rad * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  ctx.restore();
}

function drawBattlefieldTree(
  ctx: CanvasRenderingContext2D,
  kind: TreeKind,
  cx: number,
  cy: number,
  _s: number,
  scale: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(8, 14, 10, 0.45)";
  ctx.beginPath();
  ctx.ellipse(cx + 3 * scale, cy + 4 * scale, 10 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = kind === "TREE_CYPRESS" ? "#4a3728" : "#5c4028";
  ctx.fillRect(cx - 2.2 * scale, cy - 2 * scale, 4.4 * scale, 8 * scale);

  if (kind === "TREE_PINE") {
    const tiers = [
      { yOff: 3, w: 12, h: 11, color: "#14532d" },
      { yOff: -2, w: 9.5, h: 10, color: "#166534" },
      { yOff: -7, w: 6.5, h: 8.5, color: "#22c55e" },
    ];
    for (const tier of tiers) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + (tier.yOff - tier.h) * scale);
      ctx.lineTo(cx + tier.w * scale, cy + tier.yOff * scale);
      ctx.lineTo(cx - tier.w * scale, cy + tier.yOff * scale);
      ctx.closePath();
      ctx.fillStyle = tier.color;
      ctx.fill();
      ctx.strokeStyle = "#052e16";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (kind === "TREE_PALM") {
    const crownX = cx;
    const crownY = cy - 4 * scale;
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 2.6 * scale;
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.3;
      const tipX = crownX + Math.cos(ang) * 11.5 * scale;
      const tipY = crownY + Math.sin(ang) * 9.5 * scale;
      ctx.beginPath();
      ctx.moveTo(crownX, crownY);
      ctx.quadraticCurveTo(
        crownX + Math.cos(ang) * 6 * scale,
        crownY + Math.sin(ang) * 4 * scale - 2 * scale,
        tipX,
        tipY
      );
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(crownX, crownY, 3 * scale, 0, Math.PI * 2);
    ctx.fillStyle = "#4ade80";
    ctx.fill();
  } else if (kind === "TREE_CYPRESS") {
    const tiers: ReadonlyArray<[number, number, number, string]> = [
      [0, -1, 8.5, "#1e3f2b"],
      [-4, 1, 6.2, "#285438"],
      [4, 1, 6.2, "#285438"],
      [0, -6.5, 6.5, "#346b47"],
      [0, -10.5, 4.2, "#4ade80"],
    ];
    for (const [lx, ly, lr, col] of tiers) {
      ctx.beginPath();
      ctx.ellipse(
        cx + lx * scale,
        cy + ly * scale,
        lr * scale,
        lr * 1.15 * scale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = col;
      ctx.fill();
    }
  } else {
    const lobes: ReadonlyArray<[number, number, number, string]> = [
      [-5, 1, 7.5, "#14532d"],
      [5, 1, 7.5, "#166534"],
      [0, -4, 8.5, "#15803d"],
      [-2.5, -2, 5.5, "#22c55e"],
    ];
    for (const [lx, ly, lr, col] of lobes) {
      ctx.beginPath();
      ctx.arc(cx + lx * scale, cy + ly * scale, lr * scale, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  ctx.restore();
}

export interface EditorOverlayToggles {
  showGrid: boolean;
  showSpawnRings: boolean;
  showPassability: boolean;
  showSymmetryAxes: boolean;
  showOreRichnessLabels: boolean;
}

export interface EditorCursorPreviewState {
  hoverTile: MapCoord | null;
  dragStartTile: MapCoord | null;
  activeCategory: EditorToolCategory;
  drawMode: EditorDrawMode;
  brushSize: number;
  brushShape: BrushShape;
  symmetryMode: SymmetryMode;
  selectedTerrainKind: number;
  selectedOreStamp: OreStampPreset;
  selectedSpawnSlot: number;
  selectedSpawnFaction: SpawnFactionChoice;
  selectedEntityType: "BUILDING" | "UNIT";
  selectedEntityKind: BuildingKind | UnitKind;
  selectedEntityFaction: FactionId;
}

export interface EditorRulerState {
  startTile: MapCoord | null;
  endTile: MapCoord | null;
}

export interface EditorCanvasRenderInput {
  ctx: CanvasRenderingContext2D;
  camera: EditorCamera;
  atlas: ProceduralSpriteAtlas | null;
  doc: CustomMapDocument;
  overlays: EditorOverlayToggles;
  cursorPreview: EditorCursorPreviewState;
  ruler: EditorRulerState;
}

type CacheSurface = OffscreenCanvas | HTMLCanvasElement;
type CacheContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

let cachedSurface: CacheSurface | null = null;
let cachedCtx: CacheContext | null = null;
let cachedMapW = 0;
let cachedMapH = 0;
let cachedGridSnapshot: Int8Array | null = null;

interface StratumPalette {
  fill: string;
  lipShadow: string;
  lipHighlight: string;
  cornerRadiusRatio: number;
  thicknessPx: number;
}

const STRATUM_PALETTES: Record<number, StratumPalette> = {
  [TERRAIN_KIND.DIRT]: {
    fill: "#463525",
    lipShadow: "#281c12",
    lipHighlight: "#614a35",
    cornerRadiusRatio: 0.5,
    thicknessPx: 2.4,
  },
  [TERRAIN_KIND.STONE]: {
    fill: "#333c48",
    lipShadow: "#1d232b",
    lipHighlight: "#4b5869",
    cornerRadiusRatio: 0.5,
    thicknessPx: 1.8,
  },
  [TERRAIN_KIND.CLIFF]: {
    fill: "#1a212b",
    lipShadow: "#090c12",
    lipHighlight: "#64748b",
    cornerRadiusRatio: 0.48,
    thicknessPx: 3.5,
  },
  [TERRAIN_KIND.GRASS]: {
    fill: "#2f4f2d",
    lipShadow: "#1b301a",
    lipHighlight: "#467342",
    cornerRadiusRatio: 0.5,
    thicknessPx: 3.0,
  },
  [TERRAIN_KIND.CONCRETE_SLAB]: {
    fill: "#525e6e",
    lipShadow: "#28303d",
    lipHighlight: "#8292a8",
    cornerRadiusRatio: 0.34,
    thicknessPx: 2.2,
  },
  [TERRAIN_KIND.SAND]: {
    fill: "#8a6d3b",
    lipShadow: "#5c4520",
    lipHighlight: "#b59257",
    cornerRadiusRatio: 0.5,
    thicknessPx: 2.2,
  },
  [TERRAIN_KIND.SWAMP]: {
    fill: "#273b2c",
    lipShadow: "#142117",
    lipHighlight: "#3b5942",
    cornerRadiusRatio: 0.5,
    thicknessPx: 2.0,
  },
  [TERRAIN_KIND.WATER]: {
    fill: "#0f3a5d",
    lipShadow: "#082038",
    lipHighlight: "#286899",
    cornerRadiusRatio: 0.5,
    thicknessPx: 2.2,
  },
};

function getTerrainVisualPriority(kind: number): number {
  const norm = normalizeBaseTerrainKind(kind);
  if (norm === TERRAIN_KIND.CLIFF) return 8;
  if (norm === TERRAIN_KIND.CONCRETE_SLAB) return 7;
  if (norm === TERRAIN_KIND.GRASS) return 6;
  if (norm === TERRAIN_KIND.SAND) return 5;
  if (norm === TERRAIN_KIND.SWAMP) return 4;
  if (norm === TERRAIN_KIND.DIRT) return 3;
  if (norm === TERRAIN_KIND.WATER) return 2;
  return 1; // STONE
}

function getStratumPalette(kind: number): StratumPalette {
  const norm = normalizeBaseTerrainKind(kind);
  return STRATUM_PALETTES[norm] ?? STRATUM_PALETTES[TERRAIN_KIND.DIRT]!;
}

function hashTileCoord(tx: number, ty: number, salt: number): number {
  let h =
    Math.imul(tx + 374761393, 668265263) ^
    Math.imul(ty + 1274126177, 2246822519) ^
    salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function drawSparseOrganicTerrainDetail(
  ctx: CacheContext,
  centerKind: number,
  tx: number,
  ty: number,
  px: number,
  py: number,
  s: number
): void {
  const h0 = hashTileCoord(tx, ty, 0x9e3779b9);

  if (centerKind === TERRAIN_KIND.GRASS) {
    if ((h0 & 255) > 108) return;
    const tuftCount = (h0 & 255) < 34 ? 2 : 1;
    for (let i = 0; i < tuftCount; i++) {
      const hi = hashTileCoord(tx, ty, 0x517cc1b7 + i * 7919);
      const gx = px + 7 + ((hi & 0xff) / 255) * (s - 14);
      const gy = py + 8 + (((hi >>> 8) & 0xff) / 255) * (s - 15);
      const scale = 0.85 + (((hi >>> 16) & 0x3f) / 63) * 0.4;

      ctx.fillStyle = "rgba(18, 34, 17, 0.55)";
      ctx.beginPath();
      ctx.ellipse(gx, gy + 0.8, 2.4 * scale, 1.0 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = (hi & 1) === 0 ? "#1b331a" : "#213c1f";
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(gx - 0.8 * scale, gy + 0.5);
      ctx.lineTo(gx - 2.3 * scale, gy - 2.8 * scale);
      ctx.moveTo(gx, gy + 0.6);
      ctx.lineTo(gx + 0.2 * scale, gy - 3.6 * scale);
      ctx.moveTo(gx + 0.8 * scale, gy + 0.5);
      ctx.lineTo(gx + 2.4 * scale, gy - 2.5 * scale);
      ctx.stroke();
    }
    return;
  }

  if (centerKind === TERRAIN_KIND.DIRT) {
    if ((h0 & 255) > 122) return;
    const pebbleCount = (h0 & 255) < 28 ? 3 : (h0 & 255) < 76 ? 2 : 1;
    for (let i = 0; i < pebbleCount; i++) {
      const hi = hashTileCoord(tx, ty, 0x85ebca6b + i * 6151);
      const rx = px + 6.5 + ((hi & 0xff) / 255) * (s - 13);
      const ry = py + 6.5 + (((hi >>> 8) & 0xff) / 255) * (s - 13);
      const radX = 1.2 + (((hi >>> 16) & 0x1f) / 31) * 1.15;
      const radY = radX * (0.68 + (((hi >>> 21) & 0x0f) / 15) * 0.24);
      const rot = (((hi >>> 25) & 0x1f) / 31) * Math.PI;

      ctx.fillStyle = "rgba(22, 15, 9, 0.48)";
      ctx.beginPath();
      ctx.ellipse(rx + 0.7, ry + 0.8, radX, radY, rot, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = (hi & 1) === 0 ? "#6e563e" : "#785f46";
      ctx.beginPath();
      ctx.ellipse(rx, ry, radX, radY, rot, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#96795b";
      ctx.beginPath();
      ctx.arc(
        rx - radX * 0.28,
        ry - radY * 0.28,
        Math.max(0.55, radX * 0.45),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }
}

function traceRoundedTilePath(
  ctx: CacheContext,
  x: number,
  y: number,
  s: number,
  rTL: number,
  rTR: number,
  rBR: number,
  rBL: number
): void {
  const k = 0.22;
  ctx.beginPath();
  ctx.moveTo(x + rTL, y);
  ctx.lineTo(x + s - rTR, y);
  if (rTR > 0) {
    ctx.quadraticCurveTo(x + s - rTR * k, y + rTR * k, x + s, y + rTR);
  }
  ctx.lineTo(x + s, y + s - rBR);
  if (rBR > 0) {
    ctx.quadraticCurveTo(x + s - rBR * k, y + s - rBR * k, x + s - rBR, y + s);
  }
  ctx.lineTo(x + rBL, y + s);
  if (rBL > 0) {
    ctx.quadraticCurveTo(x + rBL * k, y + s - rBL * k, x, y + s - rBL);
  }
  ctx.lineTo(x, y + rTL);
  if (rTL > 0) {
    ctx.quadraticCurveTo(x + rTL * k, y + rTL * k, x + rTL, y);
  }
  ctx.closePath();
}

function drawUnifiedOrganicTerrainCell(
  ctx: CacheContext,
  grid: readonly number[],
  tx: number,
  ty: number,
  mapW: number,
  mapH: number
): void {
  const s = TILE_PIXEL_SIZE;
  const px = tx * s;
  const py = ty * s;
  const idx = ty * mapW + tx;

  const centerKind = normalizeBaseTerrainKind(grid[idx] ?? 0);
  const centerPriority = getTerrainVisualPriority(centerKind);
  const centerPal = getStratumPalette(centerKind);

  const getNeighborKind = (nx: number, ny: number): number => {
    const cx = Math.max(0, Math.min(mapW - 1, nx));
    const cy = Math.max(0, Math.min(mapH - 1, ny));
    return normalizeBaseTerrainKind(grid[cy * mapW + cx] ?? centerKind);
  };

  const kN = getNeighborKind(tx, ty - 1);
  const kE = getNeighborKind(tx + 1, ty);
  const kS = getNeighborKind(tx, ty + 1);
  const kW = getNeighborKind(tx - 1, ty);

  const pN = getTerrainVisualPriority(kN);
  const pE = getTerrainVisualPriority(kE);
  const pS = getTerrainVisualPriority(kS);
  const pW = getTerrainVisualPriority(kW);

  const lowerNeighbors: number[] = [];
  if (pN < centerPriority) lowerNeighbors.push(kN);
  if (pE < centerPriority) lowerNeighbors.push(kE);
  if (pS < centerPriority) lowerNeighbors.push(kS);
  if (pW < centerPriority) lowerNeighbors.push(kW);

  const underKind =
    lowerNeighbors.length > 0
      ? lowerNeighbors[0]!
      : centerKind === TERRAIN_KIND.GRASS
        ? TERRAIN_KIND.DIRT
        : TERRAIN_KIND.STONE;

  ctx.fillStyle = getStratumPalette(underKind).fill;
  ctx.fillRect(px, py, s, s);

  const maxR = s * centerPal.cornerRadiusRatio;
  const rTL = pN < centerPriority && pW < centerPriority ? maxR : 0;
  const rTR = pN < centerPriority && pE < centerPriority ? maxR : 0;
  const rBR = pS < centerPriority && pE < centerPriority ? maxR : 0;
  const rBL = pS < centerPriority && pW < centerPriority ? maxR : 0;

  ctx.fillStyle = centerPal.fill;
  traceRoundedTilePath(ctx, px, py, s, rTL, rTR, rBR, rBL);
  ctx.fill();

  drawSparseOrganicTerrainDetail(ctx, centerKind, tx, ty, px, py, s);

  if (centerKind === TERRAIN_KIND.CONCRETE_SLAB) {
    ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  }
}

function getOrBuildEditorTerrainCache(doc: CustomMapDocument): CacheSurface | null {
  const mapW = doc.width;
  const mapH = doc.height;
  const total = mapW * mapH;
  const worldW = mapW * TILE_PIXEL_SIZE;
  const worldH = mapH * TILE_PIXEL_SIZE;

  const needsFullRebuild =
    !cachedSurface ||
    !cachedCtx ||
    !cachedGridSnapshot ||
    cachedMapW !== mapW ||
    cachedMapH !== mapH ||
    cachedGridSnapshot.length !== total;

  if (needsFullRebuild) {
    if (typeof OffscreenCanvas !== "undefined") {
      cachedSurface = new OffscreenCanvas(worldW, worldH);
      cachedCtx = cachedSurface.getContext("2d");
    } else if (typeof document !== "undefined") {
      const c = document.createElement("canvas");
      c.width = worldW;
      c.height = worldH;
      cachedSurface = c;
      cachedCtx = c.getContext("2d");
    }
    if (!cachedSurface || !cachedCtx) return null;

    cachedMapW = mapW;
    cachedMapH = mapH;
    cachedGridSnapshot = new Int8Array(total);

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const idx = y * mapW + x;
        cachedGridSnapshot[idx] = normalizeBaseTerrainKind(doc.terrainGrid[idx] ?? 0);
        drawUnifiedOrganicTerrainCell(cachedCtx, doc.terrainGrid, x, y, mapW, mapH);
      }
    }
    return cachedSurface;
  }

  // Incremental 3x3 neighborhood update for any changed tiles
  const dirtyCoords: MapCoord[] = [];
  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = y * mapW + x;
      const norm = normalizeBaseTerrainKind(doc.terrainGrid[idx] ?? 0);
      if (cachedGridSnapshot![idx] !== norm) {
        cachedGridSnapshot![idx] = norm;
        dirtyCoords.push({ x, y });
      }
    }
  }

  if (dirtyCoords.length > 0 && cachedCtx) {
    const redrawn = new Set<number>();
    for (const pt of dirtyCoords) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = pt.x + dx;
          const ny = pt.y + dy;
          if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue;
          const nIdx = ny * mapW + nx;
          if (!redrawn.has(nIdx)) {
            redrawn.add(nIdx);
            drawUnifiedOrganicTerrainCell(cachedCtx, doc.terrainGrid, nx, ny, mapW, mapH);
          }
        }
      }
    }
  }

  return cachedSurface;
}

const SPAWN_FACTION_COLORS: Record<string, string> = {
  GDI: "#f59e0b",
  NOD: "#ef4444",
  ORDOS: "#10b981",
  ANY: "#38bdf8",
};

function drawEditorOreFormation(
  ctx: CanvasRenderingContext2D,
  tx: number,
  ty: number,
  oreAmount: number,
  showLabel: boolean,
  zoom: number
): void {
  const s = TILE_PIXEL_SIZE;
  const cx = (tx + 0.5) * s;
  const cy = (ty + 0.5) * s;
  const density = Math.min(1, Math.max(0.25, oreAmount / 1000));
  const h = hashTileCoord(tx, ty, 0x6c8e9cf5);

  ctx.save();
  ctx.fillStyle = "rgba(16, 185, 129, 0.22)";
  ctx.beginPath();
  ctx.arc(cx, cy, (7 + density * 6), 0, Math.PI * 2);
  ctx.fill();

  const crystalCount = 3 + (h % 3);
  for (let i = 0; i < crystalCount; i++) {
    const angle = ((h >>> (i * 4)) & 15) * (Math.PI / 8);
    const dist = 2 + (i % 2) * 3.5 * density;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const r = (2.6 + (i % 2) * 1.4) * (0.75 + density * 0.35);

    ctx.fillStyle = oreAmount >= 900 ? "#34d399" : "#10b981";
    ctx.beginPath();
    ctx.moveTo(px, py - r * 1.4);
    ctx.lineTo(px + r, py);
    ctx.lineTo(px, py + r * 0.9);
    ctx.lineTo(px - r, py);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#a7f3d0";
    ctx.beginPath();
    ctx.arc(px - r * 0.25, py - r * 0.35, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  if (showLabel && zoom >= 0.85) {
    ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
    ctx.fillRect(cx - 13, cy + 5, 26, 10);
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "bold 9px JetBrains Mono, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${oreAmount}`, cx, cy + 10);
  }
  ctx.restore();
}

export function renderMapEditorCanvas(input: EditorCanvasRenderInput): void {
  const { ctx, camera, atlas, doc, overlays, cursorPreview, ruler } = input;
  const viewW = camera.viewportWidth;
  const viewH = camera.viewportHeight;
  const s = TILE_PIXEL_SIZE;

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#06090f";
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // 1. Cached unified organic base terrain
  const terrainCache = getOrBuildEditorTerrainCache(doc);
  if (terrainCache) {
    ctx.drawImage(
      terrainCache,
      0,
      0,
      doc.width * s,
      doc.height * s
    );
  }

  const bounds = camera.getVisibleTileBounds();

  // 2. Passability & Buildable Foundation Heatmap Overlay
  if (overlays.showPassability) {
    for (let y = bounds.minY; y <= bounds.maxY; y++) {
      for (let x = bounds.minX; x <= bounds.maxX; x++) {
        const idx = y * doc.width + x;
        const tk = doc.terrainGrid[idx] ?? TERRAIN_KIND.GRASS;
        if (
          tk === TERRAIN_KIND.CLIFF ||
          tk === TERRAIN_KIND.WATER ||
          tk === TERRAIN_KIND.SILVER_ORE
        ) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.34)";
          ctx.fillRect(x * s, y * s, s, s);
        } else if (tk === TERRAIN_KIND.SAND || tk === TERRAIN_KIND.SWAMP) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.24)";
          ctx.fillRect(x * s, y * s, s, s);
        } else if (tk === TERRAIN_KIND.CONCRETE_SLAB) {
          ctx.fillStyle = "rgba(56, 189, 248, 0.22)";
          ctx.fillRect(x * s, y * s, s, s);
        }
      }
    }
  }

  // 3. Tactical Grid Overlay (1x1 tiles + 16x16 sector boundaries)
  if (overlays.showGrid) {
    ctx.save();
    if (camera.zoom >= 0.45) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.14)";
      ctx.lineWidth = 1 / camera.zoom;
      ctx.beginPath();
      for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
        ctx.moveTo(x * s, bounds.minY * s);
        ctx.lineTo(x * s, (bounds.maxY + 1) * s);
      }
      for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
        ctx.moveTo(bounds.minX * s, y * s);
        ctx.lineTo((bounds.maxX + 1) * s, y * s);
      }
      ctx.stroke();
    }

    // Major 16x16 tactical sector grid
    ctx.strokeStyle = "rgba(245, 158, 11, 0.28)";
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.beginPath();
    for (let x = 0; x <= doc.width; x += 16) {
      ctx.moveTo(x * s, 0);
      ctx.lineTo(x * s, doc.height * s);
    }
    for (let y = 0; y <= doc.height; y += 16) {
      ctx.moveTo(0, y * s);
      ctx.lineTo(doc.width * s, y * s);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 4. Active Ore Formations (TERRAIN_KIND.ORE)
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const idx = y * doc.width + x;
      const ore = doc.oreGrid[idx] ?? 0;
      if (ore > 0 || doc.terrainGrid[idx] === TERRAIN_KIND.ORE) {
        drawEditorOreFormation(
          ctx,
          x,
          y,
          ore > 0 ? ore : 750,
          overlays.showOreRichnessLabels,
          camera.zoom
        );
      }
    }
  }

  // 5. 2x2 Silver Ore Boulders (TERRAIN_KIND.SILVER_ORE)
  for (const sDep of doc.silverDeposits) {
    if (
      sDep.x + 2 < bounds.minX ||
      sDep.x > bounds.maxX ||
      sDep.y + 2 < bounds.minY ||
      sDep.y > bounds.maxY
    ) {
      continue;
    }
    drawSilverOreDeposit2x2(ctx, sDep.x * s, sDep.y * s, s);
  }

  // 6. Destructible Battlefield Trees
  for (const tree of doc.trees) {
    if (
      tree.x < bounds.minX - 1 ||
      tree.x > bounds.maxX + 1 ||
      tree.y < bounds.minY - 1 ||
      tree.y > bounds.maxY + 1
    ) {
      continue;
    }
    drawBattlefieldTree(
      ctx,
      tree.kind as TreeKind,
      (tree.x + 0.5) * s,
      (tree.y + 0.5) * s,
      s,
      tree.scale
    );
  }

  // 7. Pre-placed Buildings, Defenses & Units
  for (const ent of doc.placedEntities) {
    const fColor = FACTIONS[ent.faction]?.primaryColor ?? "#f59e0b";
    if (ent.entityType === "BUILDING") {
      const bSpec = BUILDINGS[ent.kind as BuildingKind];
      const fw = bSpec?.footprintW ?? 1;
      const fh = bSpec?.footprintH ?? 1;
      const px = ent.x * s;
      const py = ent.y * s;
      const pw = fw * s;
      const ph = fh * s;

      const bmp = atlas?.buildings.get(`${ent.faction}:${ent.kind}`);
      if (bmp) {
        ctx.drawImage(bmp, px, py, pw, ph);
        const turretBmp = atlas?.buildingTurrets.get(
          `${ent.faction}:${ent.kind}:${ent.angleIndex}`
        );
        if (turretBmp) {
          ctx.drawImage(turretBmp, px, py, pw, ph);
        }
      } else {
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      }

      ctx.strokeStyle = fColor;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    } else {
      const uSpec = UNITS[ent.kind as UnitKind];
      const cx = (ent.x + 0.5) * s;
      const cy = (ent.y + 0.5) * s;
      const bodyBmp = atlas?.unitBodies.get(
        `${ent.faction}:${ent.kind}:${ent.angleIndex}`
      );
      if (bodyBmp) {
        ctx.drawImage(bodyBmp, cx - s * 0.75, cy - s * 0.75, s * 1.5, s * 1.5);
        const turretBmp = atlas?.unitTurrets.get(
          `${ent.faction}:${ent.kind}:${ent.angleIndex}`
        );
        if (turretBmp) {
          ctx.drawImage(turretBmp, cx - s * 0.75, cy - s * 0.75, s * 1.5, s * 1.5);
        }
      } else {
        ctx.fillStyle = fColor;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      if (uSpec && camera.zoom >= 0.75) {
        ctx.fillStyle = fColor;
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(uSpec.name.slice(0, 10), cx, cy + s * 0.55);
      }
    }
  }

  // 8. Faction Spawn Points & Safety Rings
  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  const rules = MAP_GENERATION_RULES;

  for (const sp of doc.spawns) {
    const color = SPAWN_FACTION_COLORS[sp.faction] ?? "#f59e0b";
    const px = sp.x * s;
    const py = sp.y * s;
    const pw = padSize * s;
    const ph = padSize * s;
    const centerPx = (sp.x + padSize * 0.5) * s;
    const centerPy = (sp.y + padSize * 0.5) * s;

    // Optional safety & build radius rings
    if (overlays.showSpawnRings) {
      const rings: ReadonlyArray<{ r: number; stroke: string; label: string }> = [
        {
          r: rules.spawnRules.minSpawnObstacleClearanceRadiusTiles,
          stroke: "rgba(34, 197, 94, 0.55)",
          label: "15t Dégagement Arbres",
        },
        {
          r: rules.oreRules.minDistanceFromSpawnTiles,
          stroke: "rgba(245, 158, 11, 0.65)",
          label: "20t Exclusion Minerai",
        },
        {
          r: BASE_BUILD_RADIUS_TILES,
          stroke: "rgba(56, 189, 248, 0.65)",
          label: "24t Rayon Construction Base",
        },
        {
          r: rules.silverMineRules.minDistanceFromSpawnTiles,
          stroke: "rgba(226, 232, 240, 0.65)",
          label: "28t Exclusion Argent 2×2 / Falaise",
        },
        {
          r: rules.oreRules.maxNaturalOreDistanceFromSpawnTiles,
          stroke: "rgba(16, 185, 129, 0.55)",
          label: "34t Max 1er Filon Naturel",
        },
      ];

      for (const ring of rings) {
        ctx.save();
        ctx.strokeStyle = ring.stroke;
        ctx.lineWidth = 1.5 / camera.zoom;
        ctx.setLineDash([6 / camera.zoom, 4 / camera.zoom]);
        ctx.beginPath();
        ctx.arc(centerPx, centerPy, ring.r * s, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = ring.stroke;
        ctx.font = `bold ${Math.max(10, Math.round(11 / camera.zoom))}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(ring.label, centerPx, centerPy - ring.r * s - 4 / camera.zoom);
        ctx.restore();
      }
    }

    // 8x8 Spawn Pad Perimeter & Corner Brackets
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / camera.zoom;
    ctx.strokeRect(px, py, pw, ph);

    ctx.fillStyle = `${color}18`;
    ctx.fillRect(px, py, pw, ph);

    // Ghost preview of starting Construction Yard (3x3 at +2,+2), Harvester & Constructor Bot
    if (sp.includeInitialBase) {
      const renderFaction: FactionId =
        sp.faction === "ANY" ? "GDI" : (sp.faction as FactionId);
      const cyBmp = atlas?.buildings.get(`${renderFaction}:CONSTRUCTION_YARD`);
      ctx.globalAlpha = 0.78;
      if (cyBmp) {
        ctx.drawImage(cyBmp, (sp.x + 2) * s, (sp.y + 2) * s, 3 * s, 3 * s);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect((sp.x + 2) * s + 4, (sp.y + 2) * s + 4, 3 * s - 8, 3 * s - 8);
      }

      const harvBmp = atlas?.unitBodies.get(`${renderFaction}:HARVESTER:4`);
      if (harvBmp) {
        ctx.drawImage(harvBmp, (sp.x + 5.5) * s, (sp.y + 3.5) * s, s * 1.4, s * 1.4);
      }
      const botBmp = atlas?.unitBodies.get(`${renderFaction}:CONSTRUCTOR_BOT:4`);
      if (botBmp) {
        ctx.drawImage(botBmp, (sp.x + 1.0) * s, (sp.y + 5.2) * s, s * 1.2, s * 1.2);
      }
      ctx.globalAlpha = 1;
    }

    // High-contrast Faction Spawn Header Badge
    const badgeW = 210;
    const badgeH = 24;
    ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
    ctx.fillRect(centerPx - badgeW * 0.5, py - badgeH - 4, badgeW, badgeH);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(centerPx - badgeW * 0.5, py - badgeH - 4, badgeW, badgeH);

    ctx.fillStyle = color;
    ctx.font = "bold 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const factionText = sp.faction === "ANY" ? "FACTION LIBRE" : sp.faction;
    ctx.fillText(
      `SPAWN #${sp.slotIndex + 1} • ${factionText} • ${sp.startingCredits} CR`,
      centerPx,
      py - badgeH * 0.5 - 4
    );
    ctx.restore();
  }

  // 9. Symmetry Axes Overlay
  if (overlays.showSymmetryAxes && cursorPreview.symmetryMode !== "NONE") {
    const worldW = doc.width * s;
    const worldH = doc.height * s;
    const sym = cursorPreview.symmetryMode;

    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.72)";
    ctx.lineWidth = 2 / camera.zoom;
    ctx.setLineDash([10 / camera.zoom, 6 / camera.zoom]);

    if (sym === "MIRROR_X" || sym === "QUADRANT_4WAY") {
      ctx.beginPath();
      ctx.moveTo(worldW * 0.5, 0);
      ctx.lineTo(worldW * 0.5, worldH);
      ctx.stroke();
    }
    if (sym === "MIRROR_Y" || sym === "QUADRANT_4WAY") {
      ctx.beginPath();
      ctx.moveTo(0, worldH * 0.5);
      ctx.lineTo(worldW, worldH * 0.5);
      ctx.stroke();
    }
    if (sym === "ROTATIONAL_180") {
      ctx.beginPath();
      ctx.moveTo(0, worldH);
      ctx.lineTo(worldW, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(worldW * 0.5, worldH * 0.5, 16 / camera.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 10. Interactive Cursor / Brush / Stamp / Symmetry Ghost Preview
  if (cursorPreview.hoverTile) {
    const ht = cursorPreview.hoverTile;
    ctx.save();

    if (cursorPreview.activeCategory === "SPAWNS") {
      const spColor =
        SPAWN_FACTION_COLORS[cursorPreview.selectedSpawnFaction] ?? "#f59e0b";
      ctx.strokeStyle = spColor;
      ctx.fillStyle = `${spColor}28`;
      ctx.lineWidth = 2.5 / camera.zoom;
      ctx.fillRect(ht.x * s, ht.y * s, padSize * s, padSize * s);
      ctx.strokeRect(ht.x * s, ht.y * s, padSize * s, padSize * s);
    } else if (
      cursorPreview.activeCategory === "RESOURCES" &&
      cursorPreview.selectedTerrainKind === TERRAIN_KIND.SILVER_ORE
    ) {
      const symPts = computeSymmetryCoords(
        ht.x,
        ht.y,
        doc.width,
        doc.height,
        cursorPreview.symmetryMode,
        2,
        2
      );
      for (const pt of symPts) {
        ctx.strokeStyle = "#f8fafc";
        ctx.fillStyle = "rgba(226, 232, 240, 0.35)";
        ctx.lineWidth = 2 / camera.zoom;
        ctx.fillRect(pt.x * s, pt.y * s, 2 * s, 2 * s);
        ctx.strokeRect(pt.x * s, pt.y * s, 2 * s, 2 * s);
      }
    } else if (cursorPreview.activeCategory === "ENTITIES") {
      const bSpec =
        cursorPreview.selectedEntityType === "BUILDING"
          ? BUILDINGS[cursorPreview.selectedEntityKind as BuildingKind]
          : undefined;
      const fw = bSpec?.footprintW ?? 1;
      const fh = bSpec?.footprintH ?? 1;
      const symPts = computeSymmetryCoords(
        ht.x,
        ht.y,
        doc.width,
        doc.height,
        cursorPreview.symmetryMode,
        fw,
        fh
      );
      for (const pt of symPts) {
        ctx.strokeStyle = "#22c55e";
        ctx.fillStyle = "rgba(34, 197, 94, 0.28)";
        ctx.lineWidth = 2 / camera.zoom;
        ctx.fillRect(pt.x * s, pt.y * s, fw * s, fh * s);
        ctx.strokeRect(pt.x * s, pt.y * s, fw * s, fh * s);
      }
    } else if (
      cursorPreview.drawMode === "RECT" &&
      cursorPreview.dragStartTile
    ) {
      const x0 = Math.min(cursorPreview.dragStartTile.x, ht.x);
      const x1 = Math.max(cursorPreview.dragStartTile.x, ht.x);
      const y0 = Math.min(cursorPreview.dragStartTile.y, ht.y);
      const y1 = Math.max(cursorPreview.dragStartTile.y, ht.y);
      ctx.strokeStyle = "#f59e0b";
      ctx.fillStyle = "rgba(245, 158, 11, 0.22)";
      ctx.lineWidth = 2 / camera.zoom;
      ctx.fillRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
      ctx.strokeRect(x0 * s, y0 * s, (x1 - x0 + 1) * s, (y1 - y0 + 1) * s);
    } else if (
      cursorPreview.drawMode === "LINE" &&
      cursorPreview.dragStartTile
    ) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = Math.max(2, cursorPreview.brushSize * s * 0.4);
      ctx.beginPath();
      ctx.moveTo(
        (cursorPreview.dragStartTile.x + 0.5) * s,
        (cursorPreview.dragStartTile.y + 0.5) * s
      );
      ctx.lineTo((ht.x + 0.5) * s, (ht.y + 0.5) * s);
      ctx.stroke();
    } else {
      // Standard Brush / Eraser / Tree / Ore preview with Symmetry Ghosts
      const symCenters = computeSymmetryCoords(
        ht.x,
        ht.y,
        doc.width,
        doc.height,
        cursorPreview.symmetryMode,
        1,
        1
      );
      symCenters.forEach((center, idx) => {
        const footprint = computeBrushFootprint(
          center.x,
          center.y,
          cursorPreview.brushSize,
          cursorPreview.brushShape,
          doc.width,
          doc.height
        );
        ctx.fillStyle =
          idx === 0 ? "rgba(245, 158, 11, 0.28)" : "rgba(56, 189, 248, 0.24)";
        ctx.strokeStyle =
          idx === 0 ? "rgba(251, 191, 36, 0.9)" : "rgba(56, 189, 248, 0.85)";
        ctx.lineWidth = 1.5 / camera.zoom;

        for (const pt of footprint) {
          ctx.fillRect(pt.x * s, pt.y * s, s, s);
          ctx.strokeRect(pt.x * s, pt.y * s, s, s);
        }
      });
    }
    ctx.restore();
  }

  // 11. Tactical Distance Ruler Overlay
  if (ruler.startTile && ruler.endTile) {
    const m = measureTacticalDistance(
      ruler.startTile.x,
      ruler.startTile.y,
      ruler.endTile.x,
      ruler.endTile.y
    );
    const sx = (m.fromX + 0.5) * s;
    const sy = (m.fromY + 0.5) * s;
    const ex = (m.toX + 0.5) * s;
    const ey = (m.toY + 0.5) * s;
    const mx = (sx + ex) * 0.5;
    const my = (sy + ey) * 0.5;

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2.5 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(sx, sy, 5 / camera.zoom, 0, Math.PI * 2);
    ctx.arc(ex, ey, 5 / camera.zoom, 0, Math.PI * 2);
    ctx.fill();

    const label = `${m.euclideanTiles} blocs (ΔX:${Math.abs(m.dx)} ΔY:${Math.abs(m.dy)})`;
    const boxW = 190 / camera.zoom;
    const boxH = 26 / camera.zoom;
    ctx.fillStyle = "rgba(2, 6, 23, 0.92)";
    ctx.fillRect(mx - boxW * 0.5, my - boxH - 6 / camera.zoom, boxW, boxH);
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.strokeRect(mx - boxW * 0.5, my - boxH - 6 / camera.zoom, boxW, boxH);

    ctx.fillStyle = "#e0f2fe";
    ctx.font = `bold ${Math.max(10, Math.round(12 / camera.zoom))}px JetBrains Mono, Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, mx, my - boxH * 0.5 - 6 / camera.zoom);
    ctx.restore();
  }

  // 12. Outer Map Border Frame
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 2.5 / camera.zoom;
  ctx.strokeRect(0, 0, doc.width * s, doc.height * s);

  ctx.restore();
}
