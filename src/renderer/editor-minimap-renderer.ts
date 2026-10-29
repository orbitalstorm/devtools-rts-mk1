import {
  BUILDINGS,
  FACTIONS,
  MAP_GENERATION_RULES,
  TERRAIN_KIND,
  TILE_PIXEL_SIZE,
  type BuildingKind,
} from "../shared/constants";
import type { CustomMapDocument, SymmetryMode } from "../shared/schemas/map-editor";
import type { EditorCamera } from "./editor-camera";

export interface EditorMinimapRenderInput {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  doc: CustomMapDocument;
  camera: EditorCamera;
  symmetryMode: SymmetryMode;
}

const SPAWN_FACTION_COLORS: Record<string, string> = {
  GDI: "#f59e0b",
  NOD: "#ef4444",
  ORDOS: "#10b981",
  ANY: "#38bdf8",
};

export function renderEditorMinimap(input: EditorMinimapRenderInput): void {
  const { ctx, canvasWidth, canvasHeight, doc, camera, symmetryMode } = input;
  if (canvasWidth <= 0 || canvasHeight <= 0) return;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = "#080c14";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Preserve map aspect ratio inside the minimap box
  const scale = Math.min(canvasWidth / doc.width, canvasHeight / doc.height);
  const drawW = doc.width * scale;
  const drawH = doc.height * scale;
  const offsetX = (canvasWidth - drawW) * 0.5;
  const offsetY = (canvasHeight - drawH) * 0.5;

  const cellW = Math.ceil(scale);
  const cellH = Math.ceil(scale);

  // 1. Base terrain & ore tiles
  for (let y = 0; y < doc.height; y++) {
    const rowOffset = y * doc.width;
    const py = offsetY + y * scale;
    for (let x = 0; x < doc.width; x++) {
      const idx = rowOffset + x;
      const tk = doc.terrainGrid[idx] ?? TERRAIN_KIND.GRASS;
      const ore = doc.oreGrid[idx] ?? 0;

      if (ore > 0 || tk === TERRAIN_KIND.ORE) {
        ctx.fillStyle = ore >= 900 ? "#34d399" : "#16a34a";
      } else if (tk === TERRAIN_KIND.SILVER_ORE) {
        ctx.fillStyle = "#f8fafc";
      } else if (tk === TERRAIN_KIND.CONCRETE_SLAB) {
        ctx.fillStyle = "#64748b";
      } else if (tk === TERRAIN_KIND.CLIFF) {
        ctx.fillStyle = "#1e293b";
      } else if (tk === TERRAIN_KIND.STONE) {
        ctx.fillStyle = "#475569";
      } else if (tk === TERRAIN_KIND.DIRT) {
        ctx.fillStyle = "#463525";
      } else {
        ctx.fillStyle = "#274225";
      }
      ctx.fillRect(offsetX + x * scale, py, cellW, cellH);
    }
  }

  // 2. Trees
  ctx.fillStyle = "#15803d";
  for (const t of doc.trees) {
    ctx.fillRect(
      offsetX + t.x * scale,
      offsetY + t.y * scale,
      Math.max(1.5, scale),
      Math.max(1.5, scale)
    );
  }

  // 3. Silver deposits highlight
  ctx.fillStyle = "#e2e8f0";
  for (const s of doc.silverDeposits) {
    ctx.fillRect(
      offsetX + s.x * scale,
      offsetY + s.y * scale,
      Math.max(3, scale * 2),
      Math.max(3, scale * 2)
    );
  }

  // 4. Placed entities
  for (const e of doc.placedEntities) {
    const color = FACTIONS[e.faction]?.primaryColor ?? "#94a3b8";
    const bSpec = e.entityType === "BUILDING" ? BUILDINGS[e.kind as BuildingKind] : undefined;
    const fw = bSpec?.footprintW ?? 1;
    const fh = bSpec?.footprintH ?? 1;
    ctx.fillStyle = color;
    ctx.fillRect(
      offsetX + e.x * scale,
      offsetY + e.y * scale,
      Math.max(2, fw * scale),
      Math.max(2, fh * scale)
    );
  }

  // 5. Symmetry axes
  if (symmetryMode !== "NONE") {
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    if (symmetryMode === "MIRROR_X" || symmetryMode === "QUADRANT_4WAY") {
      ctx.beginPath();
      ctx.moveTo(offsetX + drawW * 0.5, offsetY);
      ctx.lineTo(offsetX + drawW * 0.5, offsetY + drawH);
      ctx.stroke();
    }
    if (symmetryMode === "MIRROR_Y" || symmetryMode === "QUADRANT_4WAY") {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + drawH * 0.5);
      ctx.lineTo(offsetX + drawW, offsetY + drawH * 0.5);
      ctx.stroke();
    }
    if (symmetryMode === "ROTATIONAL_180") {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + drawH);
      ctx.lineTo(offsetX + drawW, offsetY);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Faction Spawn Pads (S1..S4)
  const padSize = MAP_GENERATION_RULES.spawnRules.spawnConcretePadSizeTiles;
  for (const sp of doc.spawns) {
    const px = offsetX + sp.x * scale;
    const py = offsetY + sp.y * scale;
    const pw = Math.max(8, padSize * scale);
    const ph = Math.max(8, padSize * scale);
    const color = SPAWN_FACTION_COLORS[sp.faction] ?? "#f59e0b";

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.strokeRect(px, py, pw, ph);

    ctx.fillStyle = "rgba(10, 14, 22, 0.85)";
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);

    ctx.fillStyle = color;
    ctx.font = "bold 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`S${sp.slotIndex + 1}`, px + pw * 0.5, py + ph * 0.5);
  }

  // 7. Camera viewport rectangle
  const camTileX = camera.x / TILE_PIXEL_SIZE;
  const camTileY = camera.y / TILE_PIXEL_SIZE;
  const camTileW = camera.viewportWidth / (camera.zoom * TILE_PIXEL_SIZE);
  const camTileH = camera.viewportHeight / (camera.zoom * TILE_PIXEL_SIZE);

  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    offsetX + camTileX * scale,
    offsetY + camTileY * scale,
    Math.min(drawW, camTileW * scale),
    Math.min(drawH, camTileH * scale)
  );
}

export function minimapScreenToTile(
  screenX: number,
  screenY: number,
  canvasWidth: number,
  canvasHeight: number,
  mapWidth: number,
  mapHeight: number
): { tileX: number; tileY: number } {
  const scale = Math.min(canvasWidth / mapWidth, canvasHeight / mapHeight);
  const drawW = mapWidth * scale;
  const drawH = mapHeight * scale;
  const offsetX = (canvasWidth - drawW) * 0.5;
  const offsetY = (canvasHeight - drawH) * 0.5;

  const tx = Math.floor((screenX - offsetX) / scale);
  const ty = Math.floor((screenY - offsetY) / scale);
  return {
    tileX: Math.max(0, Math.min(mapWidth - 1, tx)),
    tileY: Math.max(0, Math.min(mapHeight - 1, ty)),
  };
}
