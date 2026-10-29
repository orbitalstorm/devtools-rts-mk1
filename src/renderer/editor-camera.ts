import { TILE_PIXEL_SIZE } from "../shared/constants";

export const EDITOR_ZOOM_PRESETS: readonly number[] = [
  0.25,
  0.35,
  0.5,
  0.75,
  1.0,
  1.25,
  1.5,
  2.0,
  2.5,
];

export class EditorCamera {
  public x = 0;
  public y = 0;
  public zoom = 0.75;
  public viewportWidth = 1200;
  public viewportHeight = 800;
  public mapWidthTiles = 160;
  public mapHeightTiles = 160;

  public setMapDimensions(widthTiles: number, heightTiles: number): void {
    this.mapWidthTiles = Math.max(16, widthTiles);
    this.mapHeightTiles = Math.max(16, heightTiles);
    this.clamp();
  }

  public setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.clamp();
  }

  public pan(dxPixels: number, dyPixels: number): void {
    this.x += dxPixels / this.zoom;
    this.y += dyPixels / this.zoom;
    this.clamp();
  }

  public centerOnTile(tileX: number, tileY: number): void {
    const worldX = (tileX + 0.5) * TILE_PIXEL_SIZE;
    const worldY = (tileY + 0.5) * TILE_PIXEL_SIZE;
    this.x = worldX - this.viewportWidth / (2 * this.zoom);
    this.y = worldY - this.viewportHeight / (2 * this.zoom);
    this.clamp();
  }

  public fitToMap(paddingPx = 32): number {
    const worldW = this.mapWidthTiles * TILE_PIXEL_SIZE;
    const worldH = this.mapHeightTiles * TILE_PIXEL_SIZE;
    const availW = Math.max(120, this.viewportWidth - paddingPx * 2);
    const availH = Math.max(120, this.viewportHeight - paddingPx * 2);
    const fitZoom = Math.min(availW / worldW, availH / worldH);
    this.zoom = Math.max(0.2, Math.min(2.5, Number(fitZoom.toFixed(2))));
    this.centerOnTile(this.mapWidthTiles * 0.5, this.mapHeightTiles * 0.5);
    return this.zoom;
  }

  public setZoom(targetZoom: number, pivotScreenX?: number, pivotScreenY?: number): number {
    const px = pivotScreenX ?? this.viewportWidth * 0.5;
    const py = pivotScreenY ?? this.viewportHeight * 0.5;
    const worldBeforeX = this.x + px / this.zoom;
    const worldBeforeY = this.y + py / this.zoom;

    this.zoom = Math.max(0.2, Math.min(2.5, Number(targetZoom.toFixed(2))));
    this.x = worldBeforeX - px / this.zoom;
    this.y = worldBeforeY - py / this.zoom;
    this.clamp();
    return this.zoom;
  }

  public adjustZoom(delta: number, pivotScreenX?: number, pivotScreenY?: number): number {
    return this.setZoom(this.zoom + delta, pivotScreenX, pivotScreenY);
  }

  public clamp(): void {
    const maxWorldW = this.mapWidthTiles * TILE_PIXEL_SIZE;
    const maxWorldH = this.mapHeightTiles * TILE_PIXEL_SIZE;
    const viewWorldW = this.viewportWidth / this.zoom;
    const viewWorldH = this.viewportHeight / this.zoom;

    if (viewWorldW >= maxWorldW) {
      this.x = (maxWorldW - viewWorldW) * 0.5;
    } else {
      this.x = Math.max(-TILE_PIXEL_SIZE * 2, Math.min(maxWorldW - viewWorldW + TILE_PIXEL_SIZE * 2, this.x));
    }

    if (viewWorldH >= maxWorldH) {
      this.y = (maxWorldH - viewWorldH) * 0.5;
    } else {
      this.y = Math.max(-TILE_PIXEL_SIZE * 2, Math.min(maxWorldH - viewWorldH + TILE_PIXEL_SIZE * 2, this.y));
    }
  }

  public screenToTile(screenX: number, screenY: number): {
    tileX: number;
    tileY: number;
    inBounds: boolean;
  } {
    const worldX = this.x + screenX / this.zoom;
    const worldY = this.y + screenY / this.zoom;
    const rawX = Math.floor(worldX / TILE_PIXEL_SIZE);
    const rawY = Math.floor(worldY / TILE_PIXEL_SIZE);
    const inBounds =
      rawX >= 0 &&
      rawY >= 0 &&
      rawX < this.mapWidthTiles &&
      rawY < this.mapHeightTiles;

    return {
      tileX: Math.max(0, Math.min(this.mapWidthTiles - 1, rawX)),
      tileY: Math.max(0, Math.min(this.mapHeightTiles - 1, rawY)),
      inBounds,
    };
  }

  public getVisibleTileBounds(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const minX = Math.max(0, Math.floor(this.x / TILE_PIXEL_SIZE) - 1);
    const minY = Math.max(0, Math.floor(this.y / TILE_PIXEL_SIZE) - 1);
    const maxX = Math.min(
      this.mapWidthTiles - 1,
      Math.ceil((this.x + this.viewportWidth / this.zoom) / TILE_PIXEL_SIZE) + 1
    );
    const maxY = Math.min(
      this.mapHeightTiles - 1,
      Math.ceil((this.y + this.viewportHeight / this.zoom) / TILE_PIXEL_SIZE) + 1
    );
    return { minX, maxX, minY, maxY };
  }
}
