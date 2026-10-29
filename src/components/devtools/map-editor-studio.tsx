"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Compass,
  Copy,
  Download,
  Eraser,
  Eye,
  Flag,
  FolderOpen,
  Grid,
  Layers,
  MapPin,
  Maximize2,
  Mountain,
  Paintbrush,
  Pipette,
  Plus,
  Redo2,
  RefreshCw,
  Ruler,
  Save,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Trees,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  BUILDING_LIST,
  BUILDINGS,
  MAP_GENERATION_RULES,
  MAP_SIZE_PRESETS,
  TERRAIN_KIND,
  TREES as TREES_CONST,
  UNIT_LIST,
  UNITS,
  type BuildingKind,
  type FactionId,
  type MapCoord,
  type MapSizePresetId,
  type TreeKind,
  type UnitKind,
} from "../../shared/constants";
import {
  applyTerrainBrush,
  applyTerrainFloodFill,
  applyTerrainLine,
  applyTerrainRect,
  applyTreeBrush,
  auditCustomMap,
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
  SPAWN_SLOT_DEFAULTS,
  stampOreVein,
} from "../../shared/map-editor-engine";
import {
  CustomMapDocumentSchema,
  type BrushShape,
  type CustomMapDocument,
  type CustomMapSummary,
  type EditorDrawMode,
  type EditorToolCategory,
  type MapSizePresetChoice,
  type OreStampPreset,
  type SpawnFactionChoice,
  type SymmetryMode,
} from "../../shared/schemas/map-editor";
import {
  renderMapEditorCanvas,
  type EditorOverlayToggles,
} from "../../renderer/editor-canvas-renderer";
import { EditorCamera } from "../../renderer/editor-camera";
import {
  minimapScreenToTile,
  renderEditorMinimap,
} from "../../renderer/editor-minimap-renderer";
import {
  generateProceduralSpriteAtlasAsync,
  type ProceduralSpriteAtlas,
} from "../../renderer/generator/atlas-generator";
import {
  FactionVectorEmblem,
  ProductionItemVectorIcon,
} from "../hud/leonardo-icons";
import { Badge, Button, Card, cn, DiscretizedProgressBar } from "../ui/primitives";

const TERRAIN_PALETTE_ITEMS: ReadonlyArray<{
  kind: number;
  label: string;
  shortDesc: string;
  swatchClass: string;
}> = [
  {
    kind: TERRAIN_KIND.GRASS,
    label: "Herbe (Plaine)",
    shortDesc: "Surface organique verdoyante, franchissable, idéale pour la végétation.",
    swatchClass: "bg-[#2f4f2d] border-emerald-500/50",
  },
  {
    kind: TERRAIN_KIND.DIRT,
    label: "Terre (Vallée)",
    shortDesc: "Sol aride de vallée avec cailloux épars, franchissable.",
    swatchClass: "bg-[#463525] border-amber-600/50",
  },
  {
    kind: TERRAIN_KIND.STONE,
    label: "Pierre (Socle)",
    shortDesc: "Socle rocheux minéral entourant les bases et mines.",
    swatchClass: "bg-[#333c48] border-slate-400/50",
  },
  {
    kind: TERRAIN_KIND.CLIFF,
    label: "Falaise (Bloquée)",
    shortDesc: "Crête rocheuse infranchissable pour créer des cols et couloirs tactiques.",
    swatchClass: "bg-[#1a212b] border-red-500/60",
  },
  {
    kind: TERRAIN_KIND.CONCRETE_SLAB,
    label: "Dalle de Béton Armé",
    shortDesc: "Fondation industrielle obligatoire pour construire les bâtiments RTS.",
    swatchClass: "bg-[#525e6e] border-sky-400/60",
  },
];

const BRUSH_SIZES: readonly number[] = [1, 2, 3, 5, 7, 9, 13];

const BRUSH_SHAPES: ReadonlyArray<{ id: BrushShape; label: string }> = [
  { id: "CIRCLE", label: "Cercle" },
  { id: "SQUARE", label: "Carré" },
  { id: "DIAMOND", label: "Losange" },
  { id: "SPRAY", label: "Spray" },
];

const SYMMETRY_OPTIONS: ReadonlyArray<{
  id: SymmetryMode;
  label: string;
  shortLabel: string;
}> = [
  { id: "NONE", label: "Aucune (Libre)", shortLabel: "Libre" },
  { id: "MIRROR_X", label: "Miroir Horizontal (E ↔ O)", shortLabel: "Miroir X" },
  { id: "MIRROR_Y", label: "Miroir Vertical (N ↔ S)", shortLabel: "Miroir Y" },
  { id: "ROTATIONAL_180", label: "Rotation Centrale 180° (2J)", shortLabel: "Rot. 180°" },
  { id: "QUADRANT_4WAY", label: "Quadrants 4 Joueurs (4J)", shortLabel: "4 Quadrants" },
];

const SIZE_PRESET_CHOICES: ReadonlyArray<{
  id: MapSizePresetChoice;
  label: string;
  dims: string;
}> = [
  { id: "LEGACY_1X", label: "Compacte (1×)", dims: "72×72" },
  { id: "SKIRMISH_4X", label: "Escarmouche (4×)", dims: "144×144" },
  { id: "TACTICAL_5X", label: "Tactique (~5× Défaut)", dims: "160×160" },
  { id: "STRATEGIC_7X", label: "Stratégique (7.1×)", dims: "192×192" },
  { id: "COLOSSAL_9X", label: "Continentale (9×)", dims: "216×216" },
  { id: "CUSTOM", label: "Dimensions Libres", dims: "W×H" },
];

export function MapEditorStudio() {
  // Active DevTools module view
  const [activePortalTab, setActivePortalTab] = useState<
    "STUDIO" | "LIBRARY" | "RULES_AUDIT"
  >("STUDIO");

  // Main CustomMapDocument state + Undo/Redo stacks
  const [mapDoc, setMapDoc] = useState<CustomMapDocument>(() =>
    createMapFromProceduralSeed({
      id: "official_tactical_160",
      name: "Bassin d'Héliopolis (160×160)",
      seed: 408291735,
      sizePreset: "TACTICAL_5X",
    })
  );
  const [undoStack, setUndoStack] = useState<CustomMapDocument[]>([]);
  const [redoStack, setRedoStack] = useState<CustomMapDocument[]>([]);

  // Map size / procedural seed controls
  const [selectedPreset, setSelectedPreset] =
    useState<MapSizePresetChoice>("TACTICAL_5X");
  const [customWidthInput, setCustomWidthInput] = useState<number>(160);
  const [customHeightInput, setCustomHeightInput] = useState<number>(160);
  const [seedInput, setSeedInput] = useState<string>("408291735");
  const [blankBaseTerrain, setBlankBaseTerrain] = useState<number>(TERRAIN_KIND.GRASS);

  // Active Editor Tool state
  const [activeCategory, setActiveCategory] =
    useState<EditorToolCategory>("TERRAIN");
  const [drawMode, setDrawMode] = useState<EditorDrawMode>("BRUSH");
  const [brushSize, setBrushSize] = useState<number>(3);
  const [brushShape, setBrushShape] = useState<BrushShape>("CIRCLE");
  const [symmetryMode, setSymmetryMode] = useState<SymmetryMode>("NONE");

  // Terrain & Resource tool parameters
  const [selectedTerrainKind, setSelectedTerrainKind] = useState<number>(
    TERRAIN_KIND.DIRT
  );
  const [resourceSubMode, setResourceSubMode] = useState<
    "ORE_BRUSH" | "ORE_STAMP" | "SILVER_BOULDER"
  >("ORE_STAMP");
  const [oreRichness, setOreRichness] = useState<number>(800);
  const [oreStampPreset, setOreStampPreset] =
    useState<OreStampPreset>("NATURAL_VEIN");
  const [silverStoneApron, setSilverStoneApron] = useState<boolean>(true);

  // Environment / Tree parameters
  const [selectedTreeKind, setSelectedTreeKind] = useState<TreeKind | "MIXED">(
    "MIXED"
  );
  const [treeScale, setTreeScale] = useState<number>(1.05);

  // Spawn tool parameters
  const [selectedSpawnSlot, setSelectedSpawnSlot] = useState<number>(0);
  const [selectedSpawnFaction, setSelectedSpawnFaction] =
    useState<SpawnFactionChoice>("GDI");
  const [spawnCredits, setSpawnCredits] = useState<number>(5000);
  const [spawnConcretePad, setSpawnConcretePad] = useState<boolean>(true);
  const [spawnStoneHalo, setSpawnStoneHalo] = useState<boolean>(true);
  const [spawnInitialBase, setSpawnInitialBase] = useState<boolean>(true);

  // Pre-placed Entity tool parameters
  const [selectedEntityType, setSelectedEntityType] = useState<"BUILDING" | "UNIT">(
    "BUILDING"
  );
  const [selectedEntityKind, setSelectedEntityKind] = useState<
    BuildingKind | UnitKind
  >("GUARD_TOWER");
  const [selectedEntityFaction, setSelectedEntityFaction] =
    useState<FactionId>("GDI");
  const [selectedEntityOwnerSlot, setSelectedEntityOwnerSlot] = useState<
    number | "NEUTRAL"
  >(0);

  // Overlays & Camera
  const [overlays, setOverlays] = useState<EditorOverlayToggles>({
    showGrid: true,
    showSpawnRings: true,
    showPassability: false,
    showSymmetryAxes: true,
    showOreRichnessLabels: false,
  });
  const [zoomPercent, setZoomPercent] = useState<number>(75);

  // Hover & Drag interaction state
  const [hoverTile, setHoverTile] = useState<MapCoord | null>(null);
  const [dragStartTile, setDragStartTile] = useState<MapCoord | null>(null);
  const [rulerStartTile, setRulerStartTile] = useState<MapCoord | null>(null);
  const [rulerEndTile, setRulerEndTile] = useState<MapCoord | null>(null);

  // Server Library & Status notifications
  const [serverMaps, setServerMaps] = useState<CustomMapSummary[]>([]);
  const [statusBanner, setStatusBanner] = useState<{
    tone: "emerald" | "amber" | "red";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [atlas, setAtlas] = useState<ProceduralSpriteAtlas | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<EditorCamera>(new EditorCamera());

  const isPaintingRef = useRef<boolean>(false);
  const isPanningRef = useRef<boolean>(false);
  const panLastScreenRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const preStrokeDocRef = useRef<CustomMapDocument | null>(null);
  const lastPaintedTileKeyRef = useRef<string>("");

  const notifyStatus = useCallback(
    (text: string, tone: "emerald" | "amber" | "red" = "emerald") => {
      setStatusBanner({ text, tone });
    },
    []
  );

  // Commit a single atomic change to mapDoc with Undo history
  const commitMapChange = useCallback(
    (updater: (prev: CustomMapDocument) => CustomMapDocument) => {
      setMapDoc((prev) => {
        const next = updater(prev);
        setUndoStack((u) => [...u.slice(-39), prev]);
        setRedoStack([]);
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prevUndo) => {
      if (prevUndo.length === 0) return prevUndo;
      const previousDoc = prevUndo[prevUndo.length - 1]!;
      setRedoStack((r) => [...r.slice(-39), mapDoc]);
      setMapDoc(previousDoc);
      return prevUndo.slice(0, -1);
    });
  }, [mapDoc]);

  const handleRedo = useCallback(() => {
    setRedoStack((prevRedo) => {
      if (prevRedo.length === 0) return prevRedo;
      const nextDoc = prevRedo[prevRedo.length - 1]!;
      setUndoStack((u) => [...u.slice(-39), mapDoc]);
      setMapDoc(nextDoc);
      return prevRedo.slice(0, -1);
    });
  }, [mapDoc]);

  // Generate Procedural Sprite Atlas on mount
  useEffect(() => {
    let cancelled = false;
    let instance: ProceduralSpriteAtlas | null = null;
    generateProceduralSpriteAtlasAsync(() => {})
      .then((built: ProceduralSpriteAtlas) => {
        if (cancelled) {
          built.dispose();
          return;
        }
        instance = built;
        setAtlas(built);
      })
      .catch(() => {
        // Fallback canvas shapes used if OffscreenCanvas unavailable
      });

    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, []);

  // Fetch saved maps from SQLite API
  const refreshServerMaps = useCallback(async () => {
    try {
      const res = await fetch("/api/maps");
      if (!res.ok) return;
      const data = (await res.json()) as { maps?: CustomMapSummary[] };
      if (Array.isArray(data.maps)) {
        setServerMaps(data.maps);
      }
    } catch {
      // Ignore network errors during initial load
    }
  }, []);

  useEffect(() => {
    void refreshServerMaps();
  }, [refreshServerMaps]);

  // Keep camera map dimensions synced with mapDoc
  useEffect(() => {
    cameraRef.current.setMapDimensions(mapDoc.width, mapDoc.height);
  }, [mapDoc.width, mapDoc.height]);

  // ResizeObserver for main tactical canvas
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let initialFitted = false;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(320, Math.floor(entry.contentRect.width));
        const h = Math.max(240, Math.floor(entry.contentRect.height));
        canvas.width = w;
        canvas.height = h;
        cameraRef.current.setViewport(w, h);
        if (!initialFitted) {
          initialFitted = true;
          const z = cameraRef.current.fitToMap(28);
          setZoomPercent(Math.round(z * 100));
        }
      }
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts (Ctrl+Z, Ctrl+Y, [, ], Arrows/WASD)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === "[") {
        setBrushSize((s) => Math.max(1, s - 1));
      } else if (e.key === "]") {
        setBrushSize((s) => Math.min(13, s + 1));
      } else if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") {
        cameraRef.current.pan(0, -96);
      } else if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") {
        cameraRef.current.pan(0, 96);
      } else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") {
        cameraRef.current.pan(-96, 0);
      } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") {
        cameraRef.current.pan(96, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  // 60 FPS Canvas & Minimap Render Loop
  useEffect(() => {
    let rafId = 0;
    const renderFrame = () => {
      const mainCanvas = mainCanvasRef.current;
      if (mainCanvas) {
        const ctx = mainCanvas.getContext("2d");
        if (ctx) {
          renderMapEditorCanvas({
            ctx,
            camera: cameraRef.current,
            atlas,
            doc: mapDoc,
            overlays,
            cursorPreview: {
              hoverTile,
              dragStartTile,
              activeCategory,
              drawMode,
              brushSize,
              brushShape,
              symmetryMode,
              selectedTerrainKind:
                activeCategory === "RESOURCES" &&
                resourceSubMode === "SILVER_BOULDER"
                  ? TERRAIN_KIND.SILVER_ORE
                  : selectedTerrainKind,
              selectedOreStamp: oreStampPreset,
              selectedSpawnSlot,
              selectedSpawnFaction,
              selectedEntityType,
              selectedEntityKind,
              selectedEntityFaction,
            },
            ruler: {
              startTile: rulerStartTile,
              endTile: rulerEndTile,
            },
          });
        }
      }

      const miniCanvas = minimapCanvasRef.current;
      if (miniCanvas) {
        const mCtx = miniCanvas.getContext("2d");
        if (mCtx) {
          renderEditorMinimap({
            ctx: mCtx,
            canvasWidth: miniCanvas.width,
            canvasHeight: miniCanvas.height,
            doc: mapDoc,
            camera: cameraRef.current,
            symmetryMode,
          });
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [
    activeCategory,
    atlas,
    brushShape,
    brushSize,
    dragStartTile,
    drawMode,
    hoverTile,
    mapDoc,
    oreStampPreset,
    overlays,
    resourceSubMode,
    rulerEndTile,
    rulerStartTile,
    selectedEntityFaction,
    selectedEntityKind,
    selectedEntityType,
    selectedSpawnFaction,
    selectedSpawnSlot,
    selectedTerrainKind,
    symmetryMode,
  ]);

  // Live audit report & tile inspection
  const auditReport = useMemo(() => auditCustomMap(mapDoc), [mapDoc]);
  const hoveredInspection = useMemo(() => {
    if (!hoverTile) return null;
    return inspectTileAt(mapDoc, hoverTile.x, hoverTile.y);
  }, [hoverTile, mapDoc]);

  const activeRulerMeasurement = useMemo(() => {
    if (!rulerStartTile || !rulerEndTile) return null;
    return measureTacticalDistance(
      rulerStartTile.x,
      rulerStartTile.y,
      rulerEndTile.x,
      rulerEndTile.y
    );
  }, [rulerEndTile, rulerStartTile]);

  // Apply continuous brush action at `(tileX, tileY)` during pointer down/move
  const applyContinuousToolAtTile = useCallback(
    (tileX: number, tileY: number) => {
      setMapDoc((prev) => {
        if (drawMode === "ERASER") {
          return eraseAtCoord(prev, {
            x: tileX,
            y: tileY,
            brushSize,
            symmetry: symmetryMode,
            resetTerrainToGrass: true,
          });
        }

        if (activeCategory === "TERRAIN") {
          if (drawMode === "BRUSH") {
            return applyTerrainBrush(prev, {
              x: tileX,
              y: tileY,
              terrainKind: selectedTerrainKind,
              brushSize,
              brushShape,
              symmetry: symmetryMode,
            });
          }
          return prev;
        }

        if (activeCategory === "RESOURCES") {
          if (resourceSubMode === "ORE_BRUSH") {
            return applyTerrainBrush(prev, {
              x: tileX,
              y: tileY,
              terrainKind: TERRAIN_KIND.ORE,
              brushSize,
              brushShape,
              symmetry: symmetryMode,
              oreAmount: oreRichness,
            });
          }
          if (resourceSubMode === "ORE_STAMP") {
            return stampOreVein(prev, {
              x: tileX,
              y: tileY,
              preset: oreStampPreset,
              baseAmount: oreRichness,
              symmetry: symmetryMode,
            });
          }
          if (resourceSubMode === "SILVER_BOULDER") {
            return placeSilverDeposit(prev, {
              x: tileX,
              y: tileY,
              includeStoneApron: silverStoneApron,
              symmetry: symmetryMode,
            });
          }
        }

        if (activeCategory === "ENVIRONMENT") {
          return applyTreeBrush(prev, {
            x: tileX,
            y: tileY,
            treeKind: selectedTreeKind,
            scale: treeScale,
            brushSize,
            brushShape: brushSize > 1 ? "SPRAY" : "CIRCLE",
            symmetry: symmetryMode,
          });
        }

        return prev;
      });
    },
    [
      activeCategory,
      brushShape,
      brushSize,
      drawMode,
      oreRichness,
      oreStampPreset,
      resourceSubMode,
      selectedTerrainKind,
      selectedTreeKind,
      silverStoneApron,
      symmetryMode,
      treeScale,
    ]
  );

  // Canvas pointer handlers
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Right click or middle click pans camera
    if (e.button === 2 || e.button === 1) {
      isPanningRef.current = true;
      panLastScreenRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { tileX, tileY } = cameraRef.current.screenToTile(sx, sy);
    setHoverTile({ x: tileX, y: tileY });

    // Eyedropper tool
    if (drawMode === "EYEDROPPER") {
      const info = inspectTileAt(mapDoc, tileX, tileY);
      if (info.spawn) {
        setActiveCategory("SPAWNS");
        setSelectedSpawnSlot(info.spawn.slotIndex);
        setSelectedSpawnFaction(info.spawn.faction);
        notifyStatus(`Pipette : Spawn #${info.spawn.slotIndex + 1} (${info.spawn.faction}) sélectionné.`);
      } else if (info.tree) {
        setActiveCategory("ENVIRONMENT");
        setSelectedTreeKind(info.tree.kind);
        setDrawMode("BRUSH");
        notifyStatus(`Pipette : Arbre ${info.tree.kind} sélectionné.`);
      } else if (info.terrainKind === TERRAIN_KIND.ORE) {
        setActiveCategory("RESOURCES");
        setResourceSubMode("ORE_BRUSH");
        setOreRichness(info.oreAmount || 750);
        setDrawMode("BRUSH");
        notifyStatus(`Pipette : Minerai (${info.oreAmount} CR) sélectionné.`);
      } else if (info.terrainKind === TERRAIN_KIND.SILVER_ORE) {
        setActiveCategory("RESOURCES");
        setResourceSubMode("SILVER_BOULDER");
        setDrawMode("STAMP");
        notifyStatus("Pipette : Rocher d'Argent 2×2 sélectionné.");
      } else {
        setActiveCategory("TERRAIN");
        setSelectedTerrainKind(info.terrainKind);
        setDrawMode("BRUSH");
        notifyStatus(`Pipette : Sol '${info.terrainLabel}' sélectionné.`);
      }
      return;
    }

    // Ruler tool
    if (activeCategory === "MEASURE" || drawMode === "RULER") {
      setRulerStartTile({ x: tileX, y: tileY });
      setRulerEndTile({ x: tileX, y: tileY });
      isPaintingRef.current = true;
      return;
    }

    // Flood Fill tool
    if (activeCategory === "TERRAIN" && drawMode === "FILL") {
      commitMapChange((prev) =>
        applyTerrainFloodFill(prev, {
          startX: tileX,
          startY: tileY,
          terrainKind: selectedTerrainKind,
          oreAmount: oreRichness,
        })
      );
      notifyStatus("Zone remplie avec succès.");
      return;
    }

    // Line or Rectangle drag start
    if (
      activeCategory === "TERRAIN" &&
      (drawMode === "LINE" || drawMode === "RECT")
    ) {
      setDragStartTile({ x: tileX, y: tileY });
      isPaintingRef.current = true;
      return;
    }

    // Spawn Point placement (single click)
    if (activeCategory === "SPAWNS") {
      commitMapChange((prev) =>
        placeOrUpdateSpawnPoint(prev, {
          slotIndex: selectedSpawnSlot,
          x: tileX,
          y: tileY,
          faction: selectedSpawnFaction,
          startingCredits: spawnCredits,
          includeConcretePad: spawnConcretePad,
          includeStoneHalo: spawnStoneHalo,
          includeInitialBase: spawnInitialBase,
        })
      );
      notifyStatus(
        `Spawn #${selectedSpawnSlot + 1} (${selectedSpawnFaction}) placé en (${tileX}, ${tileY}).`
      );
      // Auto-advance slot index (0 -> 1 -> 2 -> 3) for rapid base placement
      setSelectedSpawnSlot((s) => (s + 1) % 4);
      return;
    }

    // Pre-placed Entity placement (single click)
    if (activeCategory === "ENTITIES") {
      commitMapChange((prev) =>
        placePrebuiltEntity(prev, {
          x: tileX,
          y: tileY,
          ownerSlot: selectedEntityOwnerSlot,
          faction: selectedEntityFaction,
          entityType: selectedEntityType,
          kind: selectedEntityKind,
          symmetry: symmetryMode,
        })
      );
      notifyStatus(
        `${selectedEntityKind} (${selectedEntityFaction}) placé en (${tileX}, ${tileY}).`
      );
      return;
    }

    // Continuous brush / stamp / eraser stroke
    preStrokeDocRef.current = mapDoc;
    isPaintingRef.current = true;
    lastPaintedTileKeyRef.current = `${tileX},${tileY}`;
    applyContinuousToolAtTile(tileX, tileY);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    if (isPanningRef.current) {
      const dx = panLastScreenRef.current.x - e.clientX;
      const dy = panLastScreenRef.current.y - e.clientY;
      panLastScreenRef.current = { x: e.clientX, y: e.clientY };
      cameraRef.current.pan(dx, dy);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { tileX, tileY } = cameraRef.current.screenToTile(sx, sy);
    setHoverTile({ x: tileX, y: tileY });

    if (!isPaintingRef.current) return;

    if (activeCategory === "MEASURE" || drawMode === "RULER") {
      setRulerEndTile({ x: tileX, y: tileY });
      return;
    }

    if (
      activeCategory === "TERRAIN" &&
      (drawMode === "LINE" || drawMode === "RECT")
    ) {
      return;
    }

    // For stamps (Ore Vein Stamp / Silver Boulder), only trigger once per click unless dragging brush
    if (
      activeCategory === "RESOURCES" &&
      (resourceSubMode === "ORE_STAMP" || resourceSubMode === "SILVER_BOULDER")
    ) {
      return;
    }

    const key = `${tileX},${tileY}`;
    if (key === lastPaintedTileKeyRef.current) return;
    lastPaintedTileKeyRef.current = key;
    applyContinuousToolAtTile(tileX, tileY);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = mainCanvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }

    if (isPanningRef.current) {
      isPanningRef.current = false;
      return;
    }

    if (!isPaintingRef.current) return;
    isPaintingRef.current = false;

    if (
      activeCategory === "TERRAIN" &&
      dragStartTile &&
      hoverTile &&
      (drawMode === "LINE" || drawMode === "RECT")
    ) {
      const startPt = dragStartTile;
      const endPt = hoverTile;
      setDragStartTile(null);
      if (drawMode === "LINE") {
        commitMapChange((prev) =>
          applyTerrainLine(prev, {
            fromX: startPt.x,
            fromY: startPt.y,
            toX: endPt.x,
            toY: endPt.y,
            terrainKind: selectedTerrainKind,
            brushSize,
            brushShape,
            symmetry: symmetryMode,
          })
        );
      } else {
        commitMapChange((prev) =>
          applyTerrainRect(prev, {
            x0: startPt.x,
            y0: startPt.y,
            x1: endPt.x,
            y1: endPt.y,
            terrainKind: selectedTerrainKind,
            symmetry: symmetryMode,
          })
        );
      }
      return;
    }

    if (preStrokeDocRef.current) {
      const snap = preStrokeDocRef.current;
      preStrokeDocRef.current = null;
      setUndoStack((u) => [...u.slice(-39), snap]);
      setRedoStack([]);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const z = cameraRef.current.adjustZoom(delta, sx, sy);
    setZoomPercent(Math.round(z * 100));
  };

  const handleMinimapPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type !== "pointerdown") return;
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { tileX, tileY } = minimapScreenToTile(
      e.clientX - rect.left,
      e.clientY - rect.top,
      canvas.width,
      canvas.height,
      mapDoc.width,
      mapDoc.height
    );
    cameraRef.current.centerOnTile(tileX, tileY);
  };

  // Map Size & Procedural Seed actions
  const handleApplyResize = () => {
    commitMapChange((prev) =>
      resizeCustomMap(prev, {
        sizePreset: selectedPreset,
        width: customWidthInput,
        height: customHeightInput,
        anchor: "CENTER",
        fillTerrainKind: blankBaseTerrain,
      })
    );
    setTimeout(() => {
      const z = cameraRef.current.fitToMap(28);
      setZoomPercent(Math.round(z * 100));
    }, 20);
    notifyStatus("Dimensions de la carte mises à jour.");
  };

  const handleGenerateFromSeed = (useRandomSeed = false) => {
    const targetSeed = useRandomSeed
      ? Math.floor(100_000_000 + Math.random() * 900_000_000)
      : seedInput;
    setSeedInput(String(targetSeed));

    commitMapChange((prev) =>
      createMapFromProceduralSeed({
        id: prev.id,
        name: prev.name,
        author: prev.author,
        seed: targetSeed,
        sizePreset: selectedPreset,
        width: customWidthInput,
        height: customHeightInput,
      })
    );
    setTimeout(() => {
      const z = cameraRef.current.fitToMap(28);
      setZoomPercent(Math.round(z * 100));
    }, 20);
    notifyStatus(`Carte procédurale générée (Seed #${targetSeed}).`);
  };

  const handleClearToBlankMap = () => {
    commitMapChange((prev) =>
      createBlankCustomMap({
        id: prev.id,
        name: prev.name,
        author: prev.author,
        sizePreset: selectedPreset,
        width: customWidthInput,
        height: customHeightInput,
        baseTerrainKind: blankBaseTerrain,
        withDefaultSpawns: true,
      })
    );
    notifyStatus("Carte réinitialisée avec 4 spawns aux coins.");
  };

  // Save to Server SQLite Database
  const handleSaveToServer = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapDoc),
      });
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        notifyStatus(
          errData.error ?? "Échec de la sauvegarde serveur.",
          "red"
        );
        return;
      }
      await refreshServerMaps();
      notifyStatus(
        `Carte '${mapDoc.name}' (${mapDoc.width}×${mapDoc.height}) sauvegardée sur le serveur.`
      );
    } catch {
      notifyStatus("Erreur réseau lors de la sauvegarde.", "red");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadServerMap = async (mapId: string) => {
    try {
      const res = await fetch(`/api/maps?id=${encodeURIComponent(mapId)}`);
      if (!res.ok) {
        notifyStatus("Impossible de charger cette carte.", "red");
        return;
      }
      const data = (await res.json()) as { map?: CustomMapDocument };
      if (data.map) {
        const parsed = CustomMapDocumentSchema.parse(data.map);
        setUndoStack((u) => [...u.slice(-39), mapDoc]);
        setRedoStack([]);
        setMapDoc(parsed);
        setSelectedPreset(parsed.sizePreset);
        setCustomWidthInput(parsed.width);
        setCustomHeightInput(parsed.height);
        setSeedInput(String(parsed.seed));
        setActivePortalTab("STUDIO");
        setTimeout(() => {
          const z = cameraRef.current.fitToMap(28);
          setZoomPercent(Math.round(z * 100));
        }, 20);
        notifyStatus(`Carte '${parsed.name}' chargée dans l'éditeur.`);
      }
    } catch {
      notifyStatus("Erreur lors du chargement de la carte.", "red");
    }
  };

  const handleDeleteServerMap = async (mapId: string) => {
    try {
      await fetch(`/api/maps?id=${encodeURIComponent(mapId)}`, {
        method: "DELETE",
      });
      await refreshServerMaps();
      notifyStatus(`Carte '${mapId}' supprimée de la bibliothèque.`);
    } catch {
      notifyStatus("Erreur lors de la suppression.", "red");
    }
  };

  // Export & Import JSON
  const handleExportJson = () => {
    const jsonStr = JSON.stringify(mapDoc, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = mapDoc.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "");
    a.href = url;
    a.download = `${safeName || mapDoc.id}.rtsmap.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifyStatus(`Fichier '${a.download}' exporté.`);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result)) as unknown;
        const parsed = CustomMapDocumentSchema.parse(raw);
        setUndoStack((u) => [...u.slice(-39), mapDoc]);
        setRedoStack([]);
        setMapDoc(parsed);
        setSelectedPreset(parsed.sizePreset);
        setCustomWidthInput(parsed.width);
        setCustomHeightInput(parsed.height);
        setSeedInput(String(parsed.seed));
        notifyStatus(`Carte '${parsed.name}' (${parsed.width}×${parsed.height}) importée.`);
      } catch (err) {
        notifyStatus(
          err instanceof Error
            ? `Import JSON invalide : ${err.message}`
            : "Fichier JSON invalide.",
          "red"
        );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div
      data-testid="devtools-portal-root"
      className="flex h-screen w-screen flex-col overflow-hidden bg-obsidian text-slate-100 select-none"
    >
      {/* =================================================================== */}
      {/* TOP DEVTOOLS HEADER BAR                                             */}
      {/* =================================================================== */}
      <header
        data-testid="devtools-header"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded border border-amber-500/50 bg-amber-500/10 px-2.5 py-1">
            <Compass className="h-5 w-5 text-amber-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-wider text-amber-300">
                  DEVTOOLS RTS-MK1
                </span>
                <Badge className="border-emerald-500/50 bg-emerald-500/20 text-emerald-300">
                  v1.0.0
                </Badge>
              </div>
              <div className="text-xs text-slate-400">
                devtools-rts-mk1.orbital8.cloud • Outil Dev Isolé
              </div>
            </div>
          </div>

          {/* DevTools Module Tabs */}
          <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/90 p-1">
            <button
              type="button"
              data-testid="tab-studio"
              onClick={() => setActivePortalTab("STUDIO")}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-colors",
                activePortalTab === "STUDIO"
                  ? "bg-amber-500/25 text-amber-200 border border-amber-500/50"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <Paintbrush className="h-4 w-4" />
              Éditeur de Map (Studio)
            </button>
            <button
              type="button"
              data-testid="tab-library"
              onClick={() => {
                setActivePortalTab("LIBRARY");
                void refreshServerMaps();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-colors",
                activePortalTab === "LIBRARY"
                  ? "bg-amber-500/25 text-amber-200 border border-amber-500/50"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Bibliothèque Serveur ({serverMaps.length})
            </button>
            <button
              type="button"
              data-testid="tab-audit"
              onClick={() => setActivePortalTab("RULES_AUDIT")}
              className={cn(
                "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-colors",
                activePortalTab === "RULES_AUDIT"
                  ? "bg-amber-500/25 text-amber-200 border border-amber-500/50"
                  : "text-slate-300 hover:bg-slate-800"
              )}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Audit & Règles ({auditReport.score}/100)
            </button>
          </div>
        </div>

        {/* Map Name + Size Controls + Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 py-1">
            <span className="text-xs font-semibold text-slate-400">Carte :</span>
            <input
              type="text"
              data-testid="map-name-input"
              value={mapDoc.name}
              onChange={(e) =>
                setMapDoc((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-44 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Size Preset & Custom WxH */}
          <div className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 py-1">
            <span className="text-xs font-semibold text-slate-400">Taille :</span>
            <select
              data-testid="map-size-preset-select"
              value={selectedPreset}
              onChange={(e) => {
                const val = e.target.value as MapSizePresetChoice;
                setSelectedPreset(val);
                if (val !== "CUSTOM") {
                  const spec = MAP_SIZE_PRESETS[val as MapSizePresetId];
                  if (spec) {
                    setCustomWidthInput(spec.widthTiles);
                    setCustomHeightInput(spec.heightTiles);
                  }
                }
              }}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-amber-200 focus:border-amber-400 focus:outline-none"
            >
              {SIZE_PRESET_CHOICES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.dims})
                </option>
              ))}
            </select>

            {selectedPreset === "CUSTOM" && (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  data-testid="custom-width-input"
                  min={32}
                  max={256}
                  step={8}
                  value={customWidthInput}
                  onChange={(e) => setCustomWidthInput(Number(e.target.value))}
                  className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-center text-xs font-bold text-slate-100"
                />
                <span className="text-xs text-slate-400">×</span>
                <input
                  type="number"
                  data-testid="custom-height-input"
                  min={32}
                  max={256}
                  step={8}
                  value={customHeightInput}
                  onChange={(e) => setCustomHeightInput(Number(e.target.value))}
                  className="w-16 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-center text-xs font-bold text-slate-100"
                />
              </div>
            )}

            <Button
              size="sm"
              variant="default"
              data-testid="btn-resize-map"
              onClick={handleApplyResize}
            >
              Appliquer ({mapDoc.width}×{mapDoc.height})
            </Button>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              data-testid="btn-undo"
              disabled={undoStack.length === 0}
              onClick={handleUndo}
              title="Annuler (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">{undoStack.length}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="btn-redo"
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              title="Rétablir (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>

          {/* Save / Export / Import */}
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="tactical"
              data-testid="btn-save-server"
              disabled={isSaving}
              onClick={() => void handleSaveToServer()}
            >
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="btn-export-json"
              onClick={handleExportJson}
            >
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="btn-import-json"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJsonFile}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* Optional Status Toast Banner */}
      {statusBanner && (
        <div
          data-testid="editor-status-banner"
          className={cn(
            "flex items-center justify-between border-b px-4 py-1.5 text-xs font-bold",
            statusBanner.tone === "red"
              ? "border-red-500/50 bg-red-950/90 text-red-200"
              : statusBanner.tone === "amber"
                ? "border-amber-500/50 bg-amber-950/90 text-amber-200"
                : "border-emerald-500/50 bg-emerald-950/90 text-emerald-200"
          )}
        >
          <span>{statusBanner.text}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs underline opacity-80 hover:opacity-100"
          >
            Fermer
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: SERVER MAP LIBRARY                                           */}
      {/* =================================================================== */}
      {activePortalTab === "LIBRARY" && (
        <main
          data-testid="devtools-library-view"
          className="flex-1 overflow-y-auto p-6"
        >
          <div className="mx-auto max-w-6xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-extrabold text-amber-300">
                  Bibliothèque de Cartes Tactiques (SQLite & JSON)
                </h1>
                <p className="text-xs text-slate-400">
                  Cartes stockées dans /app/data/rts-mk1.sqlite et /app/data/custom-maps/*.rtsmap.json
                </p>
              </div>
              <Button
                variant="tactical"
                onClick={() => setActivePortalTab("STUDIO")}
              >
                Retour au Studio d&apos;Édition
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {serverMaps.map((m) => (
                <Card
                  key={m.id}
                  data-testid={`library-map-card-${m.id}`}
                  className="flex flex-col justify-between border-slate-800 bg-slate-900/90 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-extrabold text-slate-100">
                        {m.name}
                      </h2>
                      <Badge
                        className={
                          m.rulesValid
                            ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                            : "border-amber-500/50 bg-amber-500/20 text-amber-300"
                        }
                      >
                        {m.width}×{m.height}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400">{m.description}</p>
                    <div className="grid grid-cols-2 gap-1.5 rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                      <div>
                        <span className="text-slate-400">Seed : </span>
                        <span className="font-mono font-bold text-amber-300">
                          #{m.seed}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Spawns : </span>
                        <span className="font-bold text-slate-200">
                          {m.spawnCount} bases
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Minerai : </span>
                        <span className="font-bold text-emerald-400">
                          {m.oreTotalCredits.toLocaleString("fr-FR")} CR
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Argent 2×2 : </span>
                        <span className="font-bold text-sky-300">
                          {m.silverDepositCount} mines
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <Button
                      size="sm"
                      variant="default"
                      data-testid={`btn-load-map-${m.id}`}
                      onClick={() => void handleLoadServerMap(m.id)}
                    >
                      Ouvrir dans l&apos;Éditeur
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => void handleDeleteServerMap(m.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* =================================================================== */}
      {/* TAB 3: RULES & BALANCE AUDITOR                                      */}
      {/* =================================================================== */}
      {activePortalTab === "RULES_AUDIT" && (
        <main
          data-testid="devtools-audit-view"
          className="flex-1 overflow-y-auto p-6"
        >
          <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-extrabold text-amber-300">
                  Auditeur d&apos;Équilibrage & Règles MAP_GENERATION_RULES (v{MAP_GENERATION_RULES.rulesVersion})
                </h1>
                <p className="text-xs text-slate-400">
                  Analyse temps réel de la carte « {mapDoc.name} » ({mapDoc.width}×{mapDoc.height} = {auditReport.totalTiles.toLocaleString("fr-FR")} tuiles)
                </p>
              </div>
              <Button
                variant="tactical"
                onClick={() => setActivePortalTab("STUDIO")}
              >
                Retour au Studio d&apos;Édition
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {auditReport.checks.map((chk) => (
                <Card
                  key={chk.id}
                  className={cn(
                    "border p-4",
                    chk.status === "PASS"
                      ? "border-emerald-500/40 bg-emerald-950/20"
                      : chk.status === "WARN"
                        ? "border-amber-500/40 bg-amber-950/20"
                        : "border-red-500/40 bg-red-950/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-100">
                      {chk.label}
                    </span>
                    <Badge
                      className={
                        chk.status === "PASS"
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                          : chk.status === "WARN"
                            ? "border-amber-500 bg-amber-500/20 text-amber-300"
                            : "border-red-500 bg-red-500/20 text-red-300"
                      }
                    >
                      {chk.status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-300">{chk.detail}</p>
                </Card>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* =================================================================== */}
      {/* TAB 1: MAIN MAP EDITOR STUDIO WORKSPACE                             */}
      {/* =================================================================== */}
      {activePortalTab === "STUDIO" && (
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT DOCK: TOOL CATEGORIES & PALETTES */}
          <aside
            data-testid="editor-tool-dock"
            className="flex w-80 lg:w-96 flex-col border-r border-slate-800 bg-slate-950 overflow-y-auto"
          >
            {/* 6 Tool Category Buttons */}
            <div className="grid grid-cols-3 gap-1 border-b border-slate-800 bg-slate-900/70 p-2">
              <button
                type="button"
                data-testid="cat-terrain"
                onClick={() => {
                  setActiveCategory("TERRAIN");
                  if (drawMode === "RULER" || drawMode === "STAMP") {
                    setDrawMode("BRUSH");
                  }
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "TERRAIN"
                    ? "border-amber-500 bg-amber-500/20 text-amber-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Paintbrush className="h-4 w-4" />
                <span>1. Sols</span>
              </button>

              <button
                type="button"
                data-testid="cat-resources"
                onClick={() => {
                  setActiveCategory("RESOURCES");
                  setDrawMode("BRUSH");
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "RESOURCES"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Sparkles className="h-4 w-4" />
                <span>2. Ressources</span>
              </button>

              <button
                type="button"
                data-testid="cat-environment"
                onClick={() => {
                  setActiveCategory("ENVIRONMENT");
                  setDrawMode("BRUSH");
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "ENVIRONMENT"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Trees className="h-4 w-4" />
                <span>3. Végétation</span>
              </button>

              <button
                type="button"
                data-testid="cat-spawns"
                onClick={() => {
                  setActiveCategory("SPAWNS");
                  setDrawMode("STAMP");
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "SPAWNS"
                    ? "border-amber-500 bg-amber-500/20 text-amber-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Flag className="h-4 w-4" />
                <span>4. Spawns</span>
              </button>

              <button
                type="button"
                data-testid="cat-entities"
                onClick={() => {
                  setActiveCategory("ENTITIES");
                  setDrawMode("STAMP");
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "ENTITIES"
                    ? "border-sky-500 bg-sky-500/20 text-sky-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Layers className="h-4 w-4" />
                <span>5. Entités</span>
              </button>

              <button
                type="button"
                data-testid="cat-measure"
                onClick={() => {
                  setActiveCategory("MEASURE");
                  setDrawMode("RULER");
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded border p-2 text-xs font-bold transition-colors",
                  activeCategory === "MEASURE"
                    ? "border-sky-500 bg-sky-500/20 text-sky-200"
                    : "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-900"
                )}
              >
                <Ruler className="h-4 w-4" />
                <span>6. Symétrie</span>
              </button>
            </div>

            {/* Common Draw Mode & Brush Size Bar */}
            <div className="space-y-2.5 border-b border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Mode d&apos;Outil
                </span>
                <span className="text-xs font-mono text-amber-300">
                  {drawMode} • {brushSize}×{brushSize}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  data-testid="mode-brush"
                  onClick={() => setDrawMode("BRUSH")}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "BRUSH"
                      ? "border-amber-500 bg-amber-500/25 text-amber-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  <Paintbrush className="h-3.5 w-3.5" />
                  Pinceau
                </button>
                <button
                  type="button"
                  data-testid="mode-line"
                  onClick={() => {
                    setActiveCategory("TERRAIN");
                    setDrawMode("LINE");
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "LINE"
                      ? "border-amber-500 bg-amber-500/25 text-amber-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  Ligne
                </button>
                <button
                  type="button"
                  data-testid="mode-rect"
                  onClick={() => {
                    setActiveCategory("TERRAIN");
                    setDrawMode("RECT");
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "RECT"
                      ? "border-amber-500 bg-amber-500/25 text-amber-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  <Square className="h-3.5 w-3.5" />
                  Rect.
                </button>
                <button
                  type="button"
                  data-testid="mode-fill"
                  onClick={() => {
                    setActiveCategory("TERRAIN");
                    setDrawMode("FILL");
                  }}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "FILL"
                      ? "border-amber-500 bg-amber-500/25 text-amber-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  Pot (Fill)
                </button>
                <button
                  type="button"
                  data-testid="mode-eraser"
                  onClick={() => setDrawMode("ERASER")}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "ERASER"
                      ? "border-red-500 bg-red-500/25 text-red-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Gomme
                </button>
                <button
                  type="button"
                  data-testid="mode-eyedropper"
                  onClick={() => setDrawMode("EYEDROPPER")}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded border py-1.5 text-xs font-bold",
                    drawMode === "EYEDROPPER"
                      ? "border-sky-500 bg-sky-500/25 text-sky-200"
                      : "border-slate-800 bg-slate-900 text-slate-300"
                  )}
                >
                  <Pipette className="h-3.5 w-3.5" />
                  Pipette
                </button>
              </div>

              {/* Brush Size & Shape */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Taille du Pinceau (Touches [ / ])</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {BRUSH_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      data-testid={`brush-size-${sz}`}
                      onClick={() => setBrushSize(sz)}
                      className={cn(
                        "rounded border py-1 text-xs font-mono font-bold",
                        brushSize === sz
                          ? "border-amber-400 bg-amber-500/30 text-amber-200"
                          : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-1 pt-1">
                  {BRUSH_SHAPES.map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      data-testid={`brush-shape-${sh.id}`}
                      onClick={() => setBrushShape(sh.id)}
                      className={cn(
                        "rounded border py-1 text-xs font-bold",
                        brushShape === sh.id
                          ? "border-amber-400 bg-amber-500/25 text-amber-200"
                          : "border-slate-800 bg-slate-900 text-slate-400"
                      )}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Symmetry Selector */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-400">
                    Symétrie Temps Réel :
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {SYMMETRY_OPTIONS.map((sym) => (
                    <button
                      key={sym.id}
                      type="button"
                      data-testid={`sym-btn-${sym.id}`}
                      onClick={() => setSymmetryMode(sym.id)}
                      className={cn(
                        "rounded border px-1 py-1 text-xs font-bold truncate",
                        symmetryMode === sym.id
                          ? "border-sky-400 bg-sky-500/25 text-sky-200"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800"
                      )}
                      title={sym.label}
                    >
                      {sym.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* =============================================================== */}
            {/* CATEGORY 1: TERRAIN & GROUND PAINTING                           */}
            {/* =============================================================== */}
            {activeCategory === "TERRAIN" && (
              <div
                data-testid="panel-terrain"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Peinture de Sols & Strates Géologiques
                </div>
                <div className="space-y-2">
                  {TERRAIN_PALETTE_ITEMS.map((item) => (
                    <button
                      key={item.kind}
                      type="button"
                      data-testid={`terrain-btn-${item.kind}`}
                      onClick={() => {
                        setSelectedTerrainKind(item.kind);
                        if (drawMode === "ERASER" || drawMode === "EYEDROPPER") {
                          setDrawMode("BRUSH");
                        }
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded border p-2.5 text-left transition-colors",
                        selectedTerrainKind === item.kind && drawMode !== "ERASER"
                          ? "border-amber-400 bg-amber-500/15"
                          : "border-slate-800 bg-slate-900/80 hover:bg-slate-900"
                      )}
                    >
                      <div
                        className={cn(
                          "h-9 w-9 shrink-0 rounded border-2",
                          item.swatchClass
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold text-slate-100">
                          {item.label}
                        </div>
                        <div className="text-xs text-slate-400 line-clamp-2">
                          {item.shortDesc}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Procedural Generation & Blank Reset Section */}
                <div className="mt-4 space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Amorce Procédurale ou Carte Vierge
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      data-testid="seed-input"
                      value={seedInput}
                      onChange={(e) => setSeedInput(e.target.value)}
                      placeholder="Seed numérique..."
                      className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs font-bold text-amber-300"
                    />
                    <Button
                      size="sm"
                      variant="default"
                      data-testid="btn-generate-seed"
                      onClick={() => handleGenerateFromSeed(false)}
                    >
                      Générer Seed
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="btn-random-seed"
                      onClick={() => handleGenerateFromSeed(true)}
                      title="Nouveau Seed Aléatoire"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={blankBaseTerrain}
                      onChange={(e) => setBlankBaseTerrain(Number(e.target.value))}
                      className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-slate-200"
                    >
                      <option value={TERRAIN_KIND.GRASS}>Fond : Herbe (Plaine)</option>
                      <option value={TERRAIN_KIND.DIRT}>Fond : Terre (Aride)</option>
                      <option value={TERRAIN_KIND.STONE}>Fond : Pierre (Socle)</option>
                      <option value={TERRAIN_KIND.CONCRETE_SLAB}>Fond : Dalle Béton</option>
                    </select>
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid="btn-clear-map"
                      onClick={handleClearToBlankMap}
                    >
                      Vider la Carte
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* CATEGORY 2: RESOURCES (ORE & 2x2 SILVER MINES)                  */}
            {/* =============================================================== */}
            {activeCategory === "RESOURCES" && (
              <div
                data-testid="panel-resources"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Placement des Ressources & Gisements
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    data-testid="res-mode-stamp"
                    onClick={() => {
                      setResourceSubMode("ORE_STAMP");
                      setDrawMode("STAMP");
                    }}
                    className={cn(
                      "rounded border p-2.5 text-left",
                      resourceSubMode === "ORE_STAMP"
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                        : "border-slate-800 bg-slate-900 text-slate-300"
                    )}
                  >
                    <div className="text-xs font-extrabold">
                      Tampon Filon de Minerai Multi-Lobes (1 Clic)
                    </div>
                    <div className="text-xs text-slate-400">
                      Génère une nappe organique de minerai avec cœur riche et halo de terre.
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="res-mode-brush"
                    onClick={() => {
                      setResourceSubMode("ORE_BRUSH");
                      setDrawMode("BRUSH");
                    }}
                    className={cn(
                      "rounded border p-2.5 text-left",
                      resourceSubMode === "ORE_BRUSH"
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                        : "border-slate-800 bg-slate-900 text-slate-300"
                    )}
                  >
                    <div className="text-xs font-extrabold">
                      Pinceau de Minerai Classique (TERRAIN_KIND.ORE)
                    </div>
                    <div className="text-xs text-slate-400">
                      Peinture libre tuile par tuile avec richesse personnalisée.
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="res-mode-silver"
                    onClick={() => {
                      setResourceSubMode("SILVER_BOULDER");
                      setDrawMode("STAMP");
                    }}
                    className={cn(
                      "rounded border p-2.5 text-left",
                      resourceSubMode === "SILVER_BOULDER"
                        ? "border-sky-400 bg-sky-500/20 text-sky-100"
                        : "border-slate-800 bg-slate-900 text-slate-300"
                    )}
                  >
                    <div className="text-xs font-extrabold">
                      Rocher de Minerai d&apos;Argent 2×2 (SILVER_ORE)
                    </div>
                    <div className="text-xs text-slate-400">
                      Gisement rare 2×2 requis pour déployer une Mine d&apos;Argent (SILVER_MINE).
                    </div>
                  </button>
                </div>

                {resourceSubMode === "ORE_STAMP" && (
                  <div className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-2.5">
                    <div className="text-xs font-bold text-slate-300">
                      Calibre du Filon Organique :
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: "SMALL_VEIN", label: "Petit (~12t)" },
                          { id: "NATURAL_VEIN", label: "Naturel (~25t)" },
                          { id: "CONTESTED_BASIN", label: "Bassin (~45t)" },
                        ] as const
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          data-testid={`ore-stamp-${st.id}`}
                          onClick={() => setOreStampPreset(st.id)}
                          className={cn(
                            "rounded border py-1.5 text-xs font-bold",
                            oreStampPreset === st.id
                              ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                              : "border-slate-800 bg-slate-950 text-slate-400"
                          )}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {resourceSubMode !== "SILVER_BOULDER" && (
                  <div className="space-y-2 rounded border border-slate-800 bg-slate-900/70 p-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">
                        Richesse par tuile :
                      </span>
                      <span className="font-mono font-extrabold text-emerald-400">
                        {oreRichness} CR / tuile
                      </span>
                    </div>
                    <input
                      type="range"
                      data-testid="ore-richness-slider"
                      min={100}
                      max={1500}
                      step={25}
                      value={oreRichness}
                      onChange={(e) => setOreRichness(Number(e.target.value))}
                      className="w-full accent-emerald-400"
                    />
                    <div className="grid grid-cols-4 gap-1">
                      {[400, 750, 1000, 1250].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setOreRichness(val)}
                          className={cn(
                            "rounded border py-1 font-mono text-xs font-bold",
                            oreRichness === val
                              ? "border-emerald-400 bg-emerald-500/25 text-emerald-200"
                              : "border-slate-800 bg-slate-950 text-slate-400"
                          )}
                        >
                          {val} CR
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {resourceSubMode === "SILVER_BOULDER" && (
                  <label className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900/70 p-2.5 text-xs font-bold text-slate-200">
                    <input
                      type="checkbox"
                      checked={silverStoneApron}
                      onChange={(e) => setSilverStoneApron(e.target.checked)}
                      className="h-4 w-4 accent-sky-400"
                    />
                    <span>
                      Entourer d&apos;un tablier rocheux (STONE) d&apos;arrimage pour Robot Constructeur
                    </span>
                  </label>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* CATEGORY 3: ENVIRONMENT & DESTRUCTIBLE TREES                    */}
            {/* =============================================================== */}
            {activeCategory === "ENVIRONMENT" && (
              <div
                data-testid="panel-environment"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Végétation & Arbres Destructibles
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: "MIXED",
                        label: "Forêt Mixte (Auto)",
                        desc: "Mélange organique selon la strate de sol.",
                      },
                      {
                        id: "TREE_PINE",
                        label: TREES_CONST.TREE_PINE.name,
                        desc: `${TREES_CONST.TREE_PINE.baseHp} PV de base`,
                      },
                      {
                        id: "TREE_OAK",
                        label: TREES_CONST.TREE_OAK.name,
                        desc: `${TREES_CONST.TREE_OAK.baseHp} PV de base`,
                      },
                      {
                        id: "TREE_PALM",
                        label: TREES_CONST.TREE_PALM.name,
                        desc: `${TREES_CONST.TREE_PALM.baseHp} PV de base`,
                      },
                    ] as const
                  ).map((tr) => (
                    <button
                      key={tr.id}
                      type="button"
                      data-testid={`tree-kind-${tr.id}`}
                      onClick={() => setSelectedTreeKind(tr.id)}
                      className={cn(
                        "rounded border p-2.5 text-left",
                        selectedTreeKind === tr.id
                          ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                          : "border-slate-800 bg-slate-900 text-slate-300"
                      )}
                    >
                      <div className="text-xs font-extrabold">{tr.label}</div>
                      <div className="text-xs text-slate-400">{tr.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="space-y-1.5 rounded border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">
                      Échelle botanique :
                    </span>
                    <span className="font-mono font-bold text-emerald-300">
                      {treeScale.toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.75}
                    max={1.35}
                    step={0.05}
                    value={treeScale}
                    onChange={(e) => setTreeScale(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* CATEGORY 4: FACTION SPAWN POINTS                                */}
            {/* =============================================================== */}
            {activeCategory === "SPAWNS" && (
              <div
                data-testid="panel-spawns"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Points de Spawn des Factions (Slots 1 à 4)
                </div>

                {/* Slot Selector */}
                <div className="grid grid-cols-2 gap-1.5">
                  {SPAWN_SLOT_DEFAULTS.map((slot) => {
                    const existing = mapDoc.spawns.find(
                      (s) => s.slotIndex === slot.slotIndex
                    );
                    return (
                      <button
                        key={slot.slotIndex}
                        type="button"
                        data-testid={`spawn-slot-${slot.slotIndex}`}
                        onClick={() => {
                          setSelectedSpawnSlot(slot.slotIndex);
                          if (existing) {
                            setSelectedSpawnFaction(existing.faction);
                            setSpawnCredits(existing.startingCredits);
                          } else {
                            setSelectedSpawnFaction(slot.defaultFaction);
                          }
                        }}
                        className={cn(
                          "rounded border p-2 text-left",
                          selectedSpawnSlot === slot.slotIndex
                            ? "border-amber-400 bg-amber-500/20 text-amber-100"
                            : "border-slate-800 bg-slate-900 text-slate-300"
                        )}
                      >
                        <div className="text-xs font-extrabold">
                          Spawn #{slot.slotIndex + 1}
                        </div>
                        <div className="text-xs text-slate-400">
                          {existing
                            ? `(${existing.x}, ${existing.y}) • ${existing.faction}`
                            : "Non placé"}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Faction assignment for this spawn */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-300">
                    Faction assignée au Spawn #{selectedSpawnSlot + 1} :
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["GDI", "NOD", "ORDOS", "ANY"] as const).map((fac) => (
                      <button
                        key={fac}
                        type="button"
                        data-testid={`spawn-faction-${fac}`}
                        onClick={() => setSelectedSpawnFaction(fac)}
                        className={cn(
                          "flex items-center gap-2 rounded border p-2 text-left text-xs font-extrabold",
                          selectedSpawnFaction === fac
                            ? "border-amber-400 bg-amber-500/25 text-amber-100"
                            : "border-slate-800 bg-slate-900 text-slate-300"
                        )}
                      >
                        {fac !== "ANY" ? (
                          <FactionVectorEmblem
                            faction={fac}
                            className="h-6 w-6 shrink-0"
                          />
                        ) : (
                          <MapPin className="h-5 w-5 text-sky-400" />
                        )}
                        <span>{fac === "ANY" ? "LIBRE (Salon)" : fac}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Starting Credits */}
                <div className="space-y-1.5 rounded border border-slate-800 bg-slate-900/70 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-300">
                      Crédits de départ :
                    </span>
                    <span className="font-mono font-extrabold text-amber-300">
                      {spawnCredits.toLocaleString("fr-FR")} CR
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[2500, 5000, 7500, 10000].map((cr) => (
                      <button
                        key={cr}
                        type="button"
                        onClick={() => setSpawnCredits(cr)}
                        className={cn(
                          "rounded border py-1 font-mono text-xs font-bold",
                          spawnCredits === cr
                            ? "border-amber-400 bg-amber-500/25 text-amber-200"
                            : "border-slate-800 bg-slate-950 text-slate-400"
                        )}
                      >
                        {cr}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spawn Pad Options */}
                <div className="space-y-1.5 rounded border border-slate-800 bg-slate-900/70 p-2.5 text-xs">
                  <label className="flex items-center gap-2 font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={spawnConcretePad}
                      onChange={(e) => setSpawnConcretePad(e.target.checked)}
                      className="h-4 w-4 accent-amber-400"
                    />
                    <span>Imprimer la dalle de béton 8×8 de départ</span>
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={spawnStoneHalo}
                      onChange={(e) => setSpawnStoneHalo(e.target.checked)}
                      className="h-4 w-4 accent-amber-400"
                    />
                    <span>Ajouter le halo rocheux (STONE) & transition (DIRT)</span>
                  </label>
                  <label className="flex items-center gap-2 font-semibold text-slate-200">
                    <input
                      type="checkbox"
                      checked={spawnInitialBase}
                      onChange={(e) => setSpawnInitialBase(e.target.checked)}
                      className="h-4 w-4 accent-amber-400"
                    />
                    <span>Déployer Chantier + Moissonneuse + Robot au départ</span>
                  </label>
                </div>

                <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                  Cliquez sur la carte pour positionner le <strong>Spawn #{selectedSpawnSlot + 1}</strong> ({selectedSpawnFaction}).
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* CATEGORY 5: PRE-PLACED STRUCTURES, DEFENSES & UNITS             */}
            {/* =============================================================== */}
            {activeCategory === "ENTITIES" && (
              <div
                data-testid="panel-entities"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                  Structures, Défenses & Unités Pré-placées
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(["GDI", "NOD", "ORDOS"] as const).map((fac) => (
                    <button
                      key={fac}
                      type="button"
                      onClick={() => setSelectedEntityFaction(fac)}
                      className={cn(
                        "rounded border py-1.5 text-xs font-extrabold",
                        selectedEntityFaction === fac
                          ? "border-amber-400 bg-amber-500/25 text-amber-200"
                          : "border-slate-800 bg-slate-900 text-slate-400"
                      )}
                    >
                      {fac}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntityType("BUILDING");
                      setSelectedEntityKind("GUARD_TOWER");
                    }}
                    className={cn(
                      "rounded border py-1.5 text-xs font-bold",
                      selectedEntityType === "BUILDING"
                        ? "border-sky-400 bg-sky-500/25 text-sky-200"
                        : "border-slate-800 bg-slate-900 text-slate-400"
                    )}
                  >
                    Bâtiments & Défenses
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEntityType("UNIT");
                      setSelectedEntityKind("MEDIUM_TANK");
                    }}
                    className={cn(
                      "rounded border py-1.5 text-xs font-bold",
                      selectedEntityType === "UNIT"
                        ? "border-sky-400 bg-sky-500/25 text-sky-200"
                        : "border-slate-800 bg-slate-900 text-slate-400"
                    )}
                  >
                    Unités & Blindés
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 max-h-80 overflow-y-auto pr-1">
                  {selectedEntityType === "BUILDING"
                    ? BUILDING_LIST.map((b) => (
                        <button
                          key={b.kind}
                          type="button"
                          data-testid={`entity-item-${b.kind}`}
                          onClick={() => setSelectedEntityKind(b.kind)}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded border bg-slate-900",
                            selectedEntityKind === b.kind
                              ? "border-amber-400 ring-2 ring-amber-400/40"
                              : "border-slate-800 hover:border-slate-600"
                          )}
                        >
                          <div className="absolute inset-0">
                            <ProductionItemVectorIcon
                              itemKind={b.kind}
                              faction={selectedEntityFaction}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 px-1 py-0.5 text-center text-xs font-bold text-slate-100 truncate">
                            {b.name}
                          </div>
                        </button>
                      ))
                    : UNIT_LIST.map((u) => (
                        <button
                          key={u.kind}
                          type="button"
                          data-testid={`entity-item-${u.kind}`}
                          onClick={() => setSelectedEntityKind(u.kind)}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded border bg-slate-900",
                            selectedEntityKind === u.kind
                              ? "border-amber-400 ring-2 ring-amber-400/40"
                              : "border-slate-800 hover:border-slate-600"
                          )}
                        >
                          <div className="absolute inset-0">
                            <ProductionItemVectorIcon
                              itemKind={u.kind}
                              faction={selectedEntityFaction}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/90 px-1 py-0.5 text-center text-xs font-bold text-slate-100 truncate">
                            {u.name}
                          </div>
                        </button>
                      ))}
                </div>
              </div>
            )}

            {/* =============================================================== */}
            {/* CATEGORY 6: SYMMETRY & TACTICAL DISTANCE RULER                  */}
            {/* =============================================================== */}
            {activeCategory === "MEASURE" && (
              <div
                data-testid="panel-measure"
                className="space-y-3 p-3"
              >
                <div className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                  Règle de Mesure Tactique & Symétrie
                </div>
                <p className="text-xs text-slate-300">
                  Cliquez et glissez sur la carte pour mesurer la distance exacte en blocs entre deux points (spawns, minerais, cols de falaises).
                </p>

                {activeRulerMeasurement && (
                  <Card
                    data-testid="ruler-readout-card"
                    className="space-y-2 border-sky-500/40 bg-slate-900 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-300">
                        Distance Euclidienne :
                      </span>
                      <span className="font-mono text-sm font-extrabold text-sky-300">
                        {activeRulerMeasurement.euclideanTiles} blocs
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Vecteur :</span>
                      <span className="font-mono text-slate-200">
                        ({activeRulerMeasurement.fromX},{activeRulerMeasurement.fromY}) → ({activeRulerMeasurement.toX},{activeRulerMeasurement.toY})
                      </span>
                    </div>
                    <div className="space-y-1 border-t border-slate-800 pt-2">
                      <div className="flex items-center justify-between">
                        <span>Seuil Minerai (&gt;= 20t) :</span>
                        <span
                          className={
                            activeRulerMeasurement.meetsOreDistance
                              ? "font-bold text-emerald-400"
                              : "font-bold text-amber-400"
                          }
                        >
                          {activeRulerMeasurement.meetsOreDistance ? "CONFORME" : "TROP PROCHE"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Seuil Argent/Falaise (&gt;= 28t) :</span>
                        <span
                          className={
                            activeRulerMeasurement.meetsSilverDistance
                              ? "font-bold text-emerald-400"
                              : "font-bold text-amber-400"
                          }
                        >
                          {activeRulerMeasurement.meetsSilverDistance ? "CONFORME" : "TROP PROCHE"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Seuil Bases Ennemies (&gt;= 96t) :</span>
                        <span
                          className={
                            activeRulerMeasurement.meetsEnemyBaseDistance
                              ? "font-bold text-emerald-400"
                              : "font-bold text-amber-400"
                          }
                        >
                          {activeRulerMeasurement.meetsEnemyBaseDistance ? "CONFORME" : "INFÉRIEUR"}
                        </span>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </aside>

          {/* ================================================================= */}
          {/* CENTER VIEWPORT: TACTICAL MAP CANVAS + OVERLAY BAR                */}
          {/* ================================================================= */}
          <main className="relative flex flex-1 flex-col overflow-hidden bg-slate-950">
            {/* Top Floating Overlay & Zoom Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/90 px-3 py-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="toggle-grid"
                  onClick={() =>
                    setOverlays((o) => ({ ...o, showGrid: !o.showGrid }))
                  }
                  className={cn(
                    "flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold",
                    overlays.showGrid
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-200"
                      : "border-slate-800 bg-slate-950 text-slate-400"
                  )}
                >
                  <Grid className="h-3.5 w-3.5" />
                  Grille
                </button>

                <button
                  type="button"
                  data-testid="toggle-spawn-rings"
                  onClick={() =>
                    setOverlays((o) => ({
                      ...o,
                      showSpawnRings: !o.showSpawnRings,
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold",
                    overlays.showSpawnRings
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-200"
                      : "border-slate-800 bg-slate-950 text-slate-400"
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Rayons Spawns
                </button>

                <button
                  type="button"
                  data-testid="toggle-passability"
                  onClick={() =>
                    setOverlays((o) => ({
                      ...o,
                      showPassability: !o.showPassability,
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold",
                    overlays.showPassability
                      ? "border-red-500/60 bg-red-500/20 text-red-200"
                      : "border-slate-800 bg-slate-950 text-slate-400"
                  )}
                >
                  <Mountain className="h-3.5 w-3.5" />
                  Collisions A*
                </button>

                <button
                  type="button"
                  data-testid="toggle-ore-labels"
                  onClick={() =>
                    setOverlays((o) => ({
                      ...o,
                      showOreRichnessLabels: !o.showOreRichnessLabels,
                    }))
                  }
                  className={cn(
                    "flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-bold",
                    overlays.showOreRichnessLabels
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                      : "border-slate-800 bg-slate-950 text-slate-400"
                  )}
                >
                  CR Minerai
                </button>
              </div>

              {/* Camera Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid="btn-zoom-out"
                  onClick={() => {
                    const z = cameraRef.current.adjustZoom(-0.2);
                    setZoomPercent(Math.round(z * 100));
                  }}
                  className="rounded border border-slate-800 bg-slate-950 p-1 text-slate-300 hover:bg-slate-800"
                  title="Dézoomer"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span
                  data-testid="zoom-readout"
                  className="w-14 text-center font-mono text-xs font-bold text-amber-300"
                >
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  data-testid="btn-zoom-in"
                  onClick={() => {
                    const z = cameraRef.current.adjustZoom(0.2);
                    setZoomPercent(Math.round(z * 100));
                  }}
                  className="rounded border border-slate-800 bg-slate-950 p-1 text-slate-300 hover:bg-slate-800"
                  title="Zoomer"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  data-testid="btn-fit-map"
                  onClick={() => {
                    const z = cameraRef.current.fitToMap(28);
                    setZoomPercent(Math.round(z * 100));
                  }}
                  className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-300 hover:bg-slate-800"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Vue Globale
                </button>
              </div>
            </div>

            {/* Interactive 2D Tactical Canvas */}
            <div className="relative flex-1 overflow-hidden">
              <canvas
                ref={mainCanvasRef}
                data-testid="map-editor-canvas"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onWheel={handleCanvasWheel}
                className="block h-full w-full cursor-crosshair"
              />
            </div>

            {/* Bottom Live Telemetry Status Bar */}
            <footer
              data-testid="editor-telemetry-footer"
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 bg-slate-950 px-3 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-slate-400">Curseur : </span>
                  <span
                    data-testid="cursor-coords"
                    className="font-mono font-bold text-amber-300"
                  >
                    {hoverTile ? `(${hoverTile.x}, ${hoverTile.y})` : "(—, —)"}
                  </span>
                </div>
                {hoveredInspection && (
                  <>
                    <div>
                      <span className="text-slate-400">Strate : </span>
                      <span className="font-bold text-slate-100">
                        {hoveredInspection.terrainLabel}
                      </span>
                    </div>
                    {hoveredInspection.oreAmount > 0 && (
                      <div>
                        <span className="text-slate-400">Richesse : </span>
                        <span className="font-mono font-bold text-emerald-400">
                          {hoveredInspection.oreAmount} CR
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Navigation A* : </span>
                      <span
                        className={
                          hoveredInspection.passable
                            ? "font-bold text-emerald-400"
                            : "font-bold text-red-400"
                        }
                      >
                        {hoveredInspection.passable ? "FRANCHISSABLE" : "BLOQUÉ"}
                      </span>
                    </div>
                    {hoveredInspection.nearestSpawnDistance !== null && (
                      <div>
                        <span className="text-slate-400">Dist. Spawn : </span>
                        <span className="font-mono font-bold text-sky-300">
                          {hoveredInspection.nearestSpawnDistance} blocs
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="text-xs text-slate-400">
                Clic Gauche : Peindre/Placer • Clic Droit Glissé / ZQSD : Caméra • Molette : Zoom
              </div>
            </footer>
          </main>

          {/* ================================================================= */}
          {/* RIGHT SIDEBAR: RADAR MINIMAP, SPAWN MANAGER & LIVE BALANCE AUDIT  */}
          {/* ================================================================= */}
          <aside
            data-testid="editor-inspector-sidebar"
            className="flex w-80 lg:w-96 flex-col border-l border-slate-800 bg-slate-950 overflow-y-auto p-3 space-y-3"
          >
            {/* Interactive Radar Minimap */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-amber-300">
                <span>Radar Tactique ({mapDoc.width}×{mapDoc.height})</span>
                <span className="font-mono text-slate-400">Seed #{mapDoc.seed}</span>
              </div>
              <div className="overflow-hidden rounded border border-slate-800 bg-slate-900 p-1">
                <canvas
                  ref={minimapCanvasRef}
                  data-testid="map-editor-minimap"
                  width={320}
                  height={220}
                  onPointerDown={handleMinimapPointer}
                  onPointerMove={handleMinimapPointer}
                  className="mx-auto block h-44 w-full cursor-pointer rounded"
                />
              </div>
            </div>

            {/* Active Faction Spawns List */}
            <div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                  Points de Spawn ({mapDoc.spawns.length}/4)
                </span>
                <button
                  type="button"
                  onClick={() => setActiveCategory("SPAWNS")}
                  className="text-xs font-bold text-amber-300 hover:underline"
                >
                  + Configurer
                </button>
              </div>

              <div className="space-y-1.5">
                {mapDoc.spawns.map((sp) => (
                  <div
                    key={sp.slotIndex}
                    data-testid={`inspector-spawn-${sp.slotIndex}`}
                    className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-slate-100">
                        Spawn #{sp.slotIndex + 1} •{" "}
                        <span className="text-amber-300">{sp.faction}</span>
                      </div>
                      <div className="font-mono text-xs text-slate-400">
                        Pad 8×8 en ({sp.x}, {sp.y}) • {sp.startingCredits} CR
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          cameraRef.current.centerOnTile(sp.x + 4, sp.y + 4)
                        }
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
                      >
                        Cibler
                      </button>
                      <button
                        type="button"
                        data-testid={`remove-spawn-${sp.slotIndex}`}
                        onClick={() =>
                          commitMapChange((prev) =>
                            removeSpawnPoint(prev, sp.slotIndex)
                          )
                        }
                        className="rounded border border-red-500/40 bg-red-500/10 p-1 text-red-300 hover:bg-red-500/20"
                        title="Supprimer ce spawn"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Resource & Terrain Telemetry */}
            <div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-2.5 text-xs">
              <div className="font-extrabold uppercase tracking-wider text-slate-200">
                Bilan Ressources & Environnement
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-slate-800 bg-slate-950 p-2">
                  <div className="text-slate-400">Crédits Minerai</div>
                  <div
                    data-testid="audit-total-ore-credits"
                    className="font-mono text-sm font-extrabold text-emerald-400"
                  >
                    {auditReport.oreTotalCredits.toLocaleString("fr-FR")} CR
                  </div>
                  <div className="text-slate-400">
                    {auditReport.oreTileCount} tuiles
                  </div>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-2">
                  <div className="text-slate-400">Mines d&apos;Argent 2×2</div>
                  <div
                    data-testid="audit-silver-count"
                    className="font-mono text-sm font-extrabold text-sky-300"
                  >
                    {auditReport.silverDepositCount} gisements
                  </div>
                  <div className="text-slate-400">
                    {auditReport.treeCount} arbres • {auditReport.entityCount} entités
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Herbe / Terre / Pierre</span>
                  <span className="font-mono font-bold text-slate-200">
                    {auditReport.terrainBreakdownPct.grass}% / {auditReport.terrainBreakdownPct.dirt}% / {auditReport.terrainBreakdownPct.stone}%
                  </span>
                </div>
                <DiscretizedProgressBar
                  ratio={auditReport.terrainBreakdownPct.grass / 100}
                  tone="emerald"
                />
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Falaises / Dalles Béton</span>
                  <span className="font-mono font-bold text-slate-200">
                    {auditReport.terrainBreakdownPct.cliff}% / {auditReport.terrainBreakdownPct.concrete}%
                  </span>
                </div>
              </div>
            </div>

            {/* Live MAP_GENERATION_RULES Validation Summary */}
            <div
              data-testid="live-rules-audit-panel"
              className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-2.5 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold uppercase tracking-wider text-slate-200">
                  Validation Règles RTS
                </span>
                <Badge
                  className={
                    auditReport.valid
                      ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                      : "border-red-500/60 bg-red-500/20 text-red-300"
                  }
                >
                  Score {auditReport.score}/100
                </Badge>
              </div>

              <div className="space-y-1.5">
                {auditReport.checks.map((chk) => (
                  <div
                    key={chk.id}
                    className="rounded border border-slate-800 bg-slate-950 p-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">{chk.label}</span>
                      <span
                        className={
                          chk.status === "PASS"
                            ? "font-extrabold text-emerald-400"
                            : chk.status === "WARN"
                              ? "font-extrabold text-amber-400"
                              : "font-extrabold text-red-400"
                        }
                      >
                        {chk.status}
                      </span>
                    </div>
                    <div className="mt-0.5 text-slate-400">{chk.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
