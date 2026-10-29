"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Compass,
  ExternalLink,
  Layers,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  TERRAIN_KIND,
  type BuildingKind,
  type FactionId,
  type TreeKind,
  type UnitKind,
} from "../../shared/constants";
import {
  VECTOR_ASSET_ELEMENTS,
  createInitialVectorVariantsState,
  setActiveVectorVariantConfig,
  summarizeVectorVariantsState,
  type StyleArchetype,
  type VectorAssetCategory,
  type VectorAssetElementDescriptor,
  type VectorVariantProposal,
  type VectorVariantsState,
} from "../../shared/schemas/vector-variants";
import {
  drawLeonardoBuilding,
  drawLeonardoBuildingTurret,
  drawLeonardoTerrainTile,
  drawLeonardoTree,
  drawLeonardoUnitBody,
  drawLeonardoUnitTurret,
} from "../../renderer/generator/leonardo-vector-art";
import {
  FactionVectorEmblem,
  ProductionItemVectorIcon,
} from "../hud/leonardo-icons";
import { Badge, Button, Card, cn } from "../ui/primitives";

const CATEGORY_FILTERS: ReadonlyArray<{
  id: "ALL" | VectorAssetCategory;
  label: string;
  shortLabel: string;
}> = [
  { id: "ALL", label: "Tous les éléments (41)", shortLabel: "Tous (41)" },
  { id: "BUILDING", label: "Bâtiments (15)", shortLabel: "Bâtiments (15)" },
  { id: "UNIT", label: "Unités (12)", shortLabel: "Unités (12)" },
  { id: "TERRAIN", label: "Tuiles & Minerais (10)", shortLabel: "Tuiles (10)" },
  { id: "TREE", label: "Arbres & Flore (4)", shortLabel: "Flore (4)" },
];

const STYLE_ARCHETYPE_OPTIONS: ReadonlyArray<{
  id: "AUTO" | StyleArchetype;
  label: string;
}> = [
  { id: "AUTO", label: "Cycle Créatif Libre (Léonard)" },
  { id: "HEAVY_BASTION", label: "Bastion Blindé Lourd & Rivets" },
  { id: "APEX_PLASMA", label: "Prototype Apex Plasma & Bobines" },
  { id: "TACTICAL_VANGUARD", label: "Avant-Garde Tactique & Radar" },
  { id: "BRUTALIST_BUNKER", label: "Bunker Brutaliste Renforcé" },
  { id: "CYBER_STEALTH", label: "Furtif Cybernétique Angulaire" },
  { id: "DESERT_STORM", label: "Tempête du Désert & Camouflage" },
  { id: "MILITARY_MK1", label: "Standard Militaire Revu" },
];

const FACTION_CHOICES: ReadonlyArray<{
  id: FactionId;
  label: string;
}> = [
  { id: "GDI", label: "GDI (Or)" },
  { id: "NOD", label: "NOD (Écarlate)" },
  { id: "ORDOS", label: "ORDOS (Émeraude)" },
];

function hasTurretUnit(kind: UnitKind): boolean {
  return (
    kind === "RECON_BUGGY" ||
    kind === "MEDIUM_TANK" ||
    kind === "ARTILLERY" ||
    kind === "MAMMOTH_TANK"
  );
}

interface VariantPreviewCanvasProps {
  descriptor: VectorAssetElementDescriptor;
  proposal: VectorVariantProposal;
  faction: FactionId;
  rotationStep: number;
}

function VariantPreviewCanvas({
  descriptor,
  proposal,
  faction,
  rotationStep,
}: VariantPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle dark blueprint grid background
    ctx.fillStyle = "#090e17";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    for (let gx = 16; gx < w; gx += 16) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 16; gy < h; gy += 16) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    const angleIndex = rotationStep % 16;
    const angleRad = (angleIndex / 16) * Math.PI * 2;

    if (descriptor.category === "BUILDING") {
      const bKind = descriptor.elementCode as BuildingKind;
      const pad = 16;
      const availW = w - pad * 2;
      const availH = h - pad * 2;
      const tileScale = Math.min(
        availW / Math.max(1, descriptor.footprintW),
        availH / Math.max(1, descriptor.footprintH)
      );
      const drawW = Math.round(descriptor.footprintW * tileScale);
      const drawH = Math.round(descriptor.footprintH * tileScale);
      const ox = Math.round((w - drawW) / 2);
      const oy = Math.round((h - drawH) / 2);

      ctx.save();
      ctx.translate(ox, oy);
      drawLeonardoBuilding(ctx, faction, bKind, drawW, drawH, proposal);
      if (bKind === "GUARD_TOWER" || bKind === "SAM_SITE") {
        drawLeonardoBuildingTurret(
          ctx,
          faction,
          bKind,
          drawW,
          drawH,
          angleIndex,
          proposal
        );
      }
      ctx.restore();
      return;
    }

    if (descriptor.category === "UNIT") {
      const uKind = descriptor.elementCode as UnitKind;
      const cellSize = 96;

      // Subtle tactical ground ring
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2 + 8, 38, 22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angleRad);
      drawLeonardoUnitBody(
        ctx,
        faction,
        uKind,
        cellSize,
        angleIndex,
        proposal
      );
      ctx.restore();

      if (hasTurretUnit(uKind)) {
        const turretAngleIdx = (angleIndex + 1) % 16;
        const turretRad = (turretAngleIdx / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(turretRad);
        drawLeonardoUnitTurret(
          ctx,
          faction,
          uKind,
          cellSize,
          turretAngleIdx,
          proposal
        );
        ctx.restore();
      }
      return;
    }

    if (descriptor.category === "TERRAIN") {
      const tKind = descriptor.terrainNumericCode ?? TERRAIN_KIND.GRASS;
      const tileSize = 48;
      const gridCols = 3;
      const gridRows = 2;
      const totalW = tileSize * gridCols;
      const totalH = tileSize * gridRows;
      const startX = Math.round((w - totalW) / 2);
      const startY = Math.round((h - totalH) / 2);

      for (let gy = 0; gy < gridRows; gy += 1) {
        for (let gx = 0; gx < gridCols; gx += 1) {
          ctx.save();
          ctx.translate(startX + gx * tileSize, startY + gy * tileSize);
          drawLeonardoTerrainTile(ctx, tKind, tileSize, proposal);
          ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(0, 0, tileSize, tileSize);
          ctx.restore();
        }
      }
      return;
    }

    if (descriptor.category === "TREE") {
      const treeKind = descriptor.elementCode as TreeKind;
      ctx.fillStyle = "#1b2e1e";
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2 + 12, 68, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(74, 222, 128, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      drawLeonardoTree(ctx, treeKind, w / 2 - 54, h / 2 - 16, 36, 0.9, 0, proposal);
      drawLeonardoTree(ctx, treeKind, w / 2 + 18, h / 2 - 14, 36, 1.0, 0, proposal);
      drawLeonardoTree(ctx, treeKind, w / 2 - 18, h / 2 - 10, 36, 1.18, 0, proposal);
    }
  }, [descriptor, proposal, faction, rotationStep]);

  return (
    <canvas
      ref={canvasRef}
      width={216}
      height={144}
      className="h-36 w-full rounded border border-slate-800 bg-slate-950"
    />
  );
}

interface LiveDioramaCanvasProps {
  selectedDescriptor: VectorAssetElementDescriptor;
  catalog: Record<string, VectorVariantProposal[]>;
  stagedSelections: Record<string, string>;
  faction: FactionId;
  rotationStep: number;
}

function LiveDioramaCanvas({
  selectedDescriptor,
  catalog,
  stagedSelections,
  faction,
  rotationStep,
}: LiveDioramaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const getVariantFor = (assetKey: string): VectorVariantProposal | undefined => {
      const list = catalog[assetKey] ?? [];
      const activeId = stagedSelections[assetKey];
      return list.find((p) => p.variantId === activeId) ?? list[0];
    };

    const tileSize = 32;
    const cols = Math.ceil(w / tileSize);
    const rows = Math.ceil(h / tileSize);

    const grassVariant = getVariantFor("TERRAIN:GRASS");
    const dirtVariant = getVariantFor("TERRAIN:DIRT");
    const stoneVariant = getVariantFor("TERRAIN:STONE");
    const slabVariant = getVariantFor("TERRAIN:CONCRETE_SLAB");
    const waterVariant = getVariantFor("TERRAIN:WATER");
    const sandVariant = getVariantFor("TERRAIN:SAND");
    const oreVariant = getVariantFor("TERRAIN:ORE");

    // 1. Render background tactical terrain tiles using active/staged variants
    for (let gy = 0; gy < rows; gy += 1) {
      for (let gx = 0; gx < cols; gx += 1) {
        let tKind: number = TERRAIN_KIND.GRASS;
        let tVariant: VectorVariantProposal | undefined = grassVariant;

        if (selectedDescriptor.category === "TERRAIN") {
          if (gx >= 2 && gx <= cols - 3 && gy >= 1 && gy <= rows - 2) {
            tKind = selectedDescriptor.terrainNumericCode ?? TERRAIN_KIND.GRASS;
            tVariant = getVariantFor(selectedDescriptor.assetKey);
          }
        } else if (gx >= 3 && gx <= 6 && gy >= 2 && gy <= 4) {
          tKind =
            selectedDescriptor.category === "BUILDING"
              ? TERRAIN_KIND.CONCRETE_SLAB
              : TERRAIN_KIND.STONE;
          tVariant =
            selectedDescriptor.category === "BUILDING"
              ? slabVariant
              : stoneVariant;
        } else if (gx <= 1 && gy >= rows - 2) {
          tKind = TERRAIN_KIND.WATER;
          tVariant = waterVariant;
        } else if (gx >= cols - 2 && gy <= 1) {
          tKind = TERRAIN_KIND.SAND;
          tVariant = sandVariant;
        } else if (gx === cols - 2 && gy === rows - 2) {
          tKind = TERRAIN_KIND.ORE;
          tVariant = oreVariant;
        } else if ((gx + gy) % 5 === 0) {
          tKind = TERRAIN_KIND.DIRT;
          tVariant = dirtVariant;
        }

        ctx.save();
        ctx.translate(gx * tileSize, gy * tileSize);
        drawLeonardoTerrainTile(ctx, tKind, tileSize, tVariant);
        ctx.restore();
      }
    }

    // 2. Render surrounding trees using active/staged tree variants
    const pineVariant = getVariantFor("TREE:TREE_PINE");
    const palmVariant = getVariantFor("TREE:TREE_PALM");
    const oakVariant = getVariantFor("TREE:TREE_OAK");
    drawLeonardoTree(ctx, "TREE_PINE", 8, 8, 32, 0.95, 0, pineVariant);
    drawLeonardoTree(ctx, "TREE_PALM", w - 42, 8, 32, 0.95, 0, palmVariant);
    drawLeonardoTree(ctx, "TREE_OAK", 10, h - 44, 32, 0.95, 0, oakVariant);

    // 3. Render focal element in the center of the diorama
    const activeProposal = getVariantFor(selectedDescriptor.assetKey);
    const angleIndex = rotationStep % 16;
    const angleRad = (angleIndex / 16) * Math.PI * 2;

    if (selectedDescriptor.category === "BUILDING") {
      const bKind = selectedDescriptor.elementCode as BuildingKind;
      const scale = 36;
      const bw = selectedDescriptor.footprintW * scale;
      const bh = selectedDescriptor.footprintH * scale;
      const ox = Math.round((w - bw) / 2);
      const oy = Math.round((h - bh) / 2);
      ctx.save();
      ctx.translate(ox, oy);
      drawLeonardoBuilding(ctx, faction, bKind, bw, bh, activeProposal);
      if (bKind === "GUARD_TOWER" || bKind === "SAM_SITE") {
        drawLeonardoBuildingTurret(
          ctx,
          faction,
          bKind,
          bw,
          bh,
          angleIndex,
          activeProposal
        );
      }
      ctx.restore();
    } else if (selectedDescriptor.category === "UNIT") {
      const uKind = selectedDescriptor.elementCode as UnitKind;
      const cellSize = 88;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angleRad);
      drawLeonardoUnitBody(
        ctx,
        faction,
        uKind,
        cellSize,
        angleIndex,
        activeProposal
      );
      ctx.restore();
      if (hasTurretUnit(uKind)) {
        const tIdx = (angleIndex + 1) % 16;
        const tRad = (tIdx / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(tRad);
        drawLeonardoUnitTurret(
          ctx,
          faction,
          uKind,
          cellSize,
          tIdx,
          activeProposal
        );
        ctx.restore();
      }
    } else if (selectedDescriptor.category === "TREE") {
      const treeKind = selectedDescriptor.elementCode as TreeKind;
      drawLeonardoTree(ctx, treeKind, w / 2 - 52, h / 2 - 18, 36, 1.0, 0, activeProposal);
      drawLeonardoTree(ctx, treeKind, w / 2 + 16, h / 2 - 16, 36, 1.05, 0, activeProposal);
      drawLeonardoTree(ctx, treeKind, w / 2 - 18, h / 2 - 10, 36, 1.2, 0, activeProposal);
    }
  }, [selectedDescriptor, catalog, stagedSelections, faction, rotationStep]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="live-diorama-preview"
      width={320}
      height={208}
      className="h-52 w-full rounded border border-slate-700 bg-slate-950 shadow-inner"
    />
  );
}

export interface LeonardoVectorStudioProps {
  embedded?: boolean;
  onSwitchToMapEditor?: () => void;
  onVariantsUpdated?: (state: VectorVariantsState) => void;
}

export function LeonardoVectorStudio({
  embedded = false,
  onSwitchToMapEditor,
  onVariantsUpdated,
}: LeonardoVectorStudioProps) {
  const [serverState, setServerState] = useState<VectorVariantsState>(() =>
    createInitialVectorVariantsState()
  );
  const [stagedSelections, setStagedSelections] = useState<Record<string, string>>(
    () => ({ ...createInitialVectorVariantsState().activeVariants })
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Filter & Selection UI state
  const [selectedCategory, setSelectedCategory] = useState<
    "ALL" | VectorAssetCategory
  >("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>(
    "BUILDING:CONSTRUCTION_YARD"
  );
  const [previewFaction, setPreviewFaction] = useState<FactionId>("GDI");
  const [rotationStep, setRotationStep] = useState<number>(6);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [sortNewestFirst, setSortNewestFirst] = useState<boolean>(false);

  // Ask Leonardo form state
  const [commissionScope, setCommissionScope] = useState<
    "ASSET" | "CATEGORY" | "ALL"
  >("ASSET");
  const [commissionCount, setCommissionCount] = useState<number>(2);
  const [commissionStyle, setCommissionStyle] = useState<
    "AUTO" | StyleArchetype
  >("AUTO");
  const [commissionDirective, setCommissionDirective] = useState<string>("");
  const [autoSelectFirstNew, setAutoSelectFirstNew] = useState<boolean>(true);

  // Status banner
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    tone: "emerald" | "amber" | "red";
  }>({
    text: "Atelier Vectoriel de Léonard prêt. Choisissez une variante ou demandez de nouvelles propositions.",
    tone: "emerald",
  });

  const notify = useCallback(
    (text: string, tone: "emerald" | "amber" | "red" = "emerald") => {
      setStatusMessage({ text, tone });
    },
    []
  );

  const applyNewServerState = useCallback(
    (nextState: VectorVariantsState, syncStaged = true) => {
      setServerState(nextState);
      setActiveVectorVariantConfig(nextState);
      if (syncStaged) {
        setStagedSelections({ ...nextState.activeVariants });
      }
      onVariantsUpdated?.(nextState);
    },
    [onVariantsUpdated]
  );

  // Load current state from API on mount
  const fetchVectorState = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/vector-variants", { cache: "no-store" });
      if (!res.ok) {
        notify("Impossible de charger le registre des variantes.", "red");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        state?: VectorVariantsState;
      };
      if (data.state) {
        applyNewServerState(data.state, true);
      }
    } catch {
      notify("Mode hors-ligne : état initial chargé.", "amber");
    } finally {
      setIsLoading(false);
    }
  }, [applyNewServerState, notify]);

  useEffect(() => {
    void fetchVectorState();
  }, [fetchVectorState]);

  // Optional turntable rotation timer
  useEffect(() => {
    if (!autoRotate) return;
    const id = window.setInterval(() => {
      setRotationStep((prev) => (prev + 1) % 16);
    }, 320);
    return () => window.clearInterval(id);
  }, [autoRotate]);

  const filteredElements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return VECTOR_ASSET_ELEMENTS.filter((el) => {
      if (selectedCategory !== "ALL" && el.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        el.name.toLowerCase().includes(q) ||
        el.assetKey.toLowerCase().includes(q) ||
        el.subtitle.toLowerCase().includes(q)
      );
    });
  }, [selectedCategory, searchQuery]);

  const selectedDescriptor = useMemo<VectorAssetElementDescriptor>(() => {
    return (
      VECTOR_ASSET_ELEMENTS.find((el) => el.assetKey === selectedAssetKey) ??
      VECTOR_ASSET_ELEMENTS[0]!
    );
  }, [selectedAssetKey]);

  const proposalsForSelectedElement = useMemo(() => {
    const list = [
      ...(serverState.catalog[selectedDescriptor.assetKey] ?? []),
    ];
    return list.sort((a, b) =>
      sortNewestFirst
        ? b.versionNumber - a.versionNumber
        : a.versionNumber - b.versionNumber
    );
  }, [serverState.catalog, selectedDescriptor.assetKey, sortNewestFirst]);

  // Count unsaved staged changes vs serverState
  const unsavedDiffCount = useMemo(() => {
    let diff = 0;
    for (const el of VECTOR_ASSET_ELEMENTS) {
      const savedId =
        serverState.activeVariants[el.assetKey] ?? "v1_classic_mk1";
      const stagedId = stagedSelections[el.assetKey] ?? savedId;
      if (savedId !== stagedId) {
        diff += 1;
      }
    }
    return diff;
  }, [serverState.activeVariants, stagedSelections]);

  const summary = useMemo(
    () => summarizeVectorVariantsState(serverState),
    [serverState]
  );

  // Stage a selection locally and update live runtime preview
  const handleStageSelectVariant = (assetKey: string, variantId: string) => {
    const nextStaged = {
      ...stagedSelections,
      [assetKey]: variantId,
    };
    setStagedSelections(nextStaged);
    setActiveVectorVariantConfig({
      ...serverState,
      activeVariants: nextStaged,
    });
    const prop = (serverState.catalog[assetKey] ?? []).find(
      (p) => p.variantId === variantId
    );
    notify(
      `Variante V${prop?.versionNumber ?? "?"} (${prop?.title ?? variantId}) sélectionnée pour ${assetKey}. Cliquez sur « Sauvegarder ce choix » pour l'appliquer en jeu.`,
      "amber"
    );
  };

  // Directly select & persist a single variant on the server
  const handleApplySingleVariantNow = async (
    assetKey: string,
    variantId: string
  ) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vector-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SELECT_SINGLE_VARIANT",
          assetKey,
          variantId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        state?: VectorVariantsState;
        error?: string;
      };
      if (!res.ok || !data.state) {
        notify(
          data.error ?? "Échec de la validation de cette variante.",
          "red"
        );
        return;
      }
      const mergedStaged = {
        ...stagedSelections,
        [assetKey]: variantId,
      };
      applyNewServerState(data.state, false);
      setStagedSelections(mergedStaged);
      const prop = (data.state.catalog[assetKey] ?? []).find(
        (p) => p.variantId === variantId
      );
      notify(
        `Choix validé et sauvegardé pour le jeu : ${assetKey} utilise désormais V${prop?.versionNumber ?? "?"} (${prop?.title ?? variantId}) !`,
        "emerald"
      );
    } catch {
      notify("Erreur réseau lors de la sauvegarde du choix.", "red");
    } finally {
      setIsSaving(false);
    }
  };

  // Persist all staged selections to the server
  const handleSaveAllChoices = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vector-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SAVE_SELECTIONS",
          activeVariants: stagedSelections,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        state?: VectorVariantsState;
        error?: string;
      };
      if (!res.ok || !data.state) {
        notify(data.error ?? "Échec de la sauvegarde des choix.", "red");
        return;
      }
      applyNewServerState(data.state, true);
      notify(
        `Tous les choix graphiques (Révision #${data.state.revision}) ont été sauvegardés et sont actifs dans le jeu RTS-MK1 !`,
        "emerald"
      );
    } catch {
      notify("Erreur réseau lors de la sauvegarde.", "red");
    } finally {
      setIsSaving(false);
    }
  };

  // Ask Leonardo to propose new variants
  const handleAskLeonardoForNewVariants = async () => {
    setIsGenerating(true);
    try {
      const targetCategory: VectorAssetCategory =
        selectedCategory === "ALL"
          ? selectedDescriptor.category
          : selectedCategory;

      const payload: Record<string, unknown> = {
        action: "PROPOSE_NEW_VARIANTS",
        targetScope: commissionScope,
        assetKey: selectedDescriptor.assetKey,
        category: targetCategory,
        count: commissionCount,
        autoSelectNewest: autoSelectFirstNew,
      };
      if (commissionDirective.trim().length > 0) {
        payload.directivePrompt = commissionDirective.trim();
      }
      if (commissionStyle !== "AUTO") {
        payload.styleArchetype = commissionStyle;
      }

      const res = await fetch("/api/vector-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        state?: VectorVariantsState;
        newlyCreated?: VectorVariantProposal[];
        error?: string;
      };
      if (!res.ok || !data.state) {
        notify(
          data.error ?? "Erreur lors de la génération par Léonard.",
          "red"
        );
        return;
      }

      applyNewServerState(data.state, true);
      setSortNewestFirst(true);
      const countCreated = data.newlyCreated?.length ?? 0;
      const firstNew = data.newlyCreated?.[0];
      notify(
        `Léonard a conçu ${countCreated} nouvelle(s) variante(s) vectorielle(s) (${firstNew ? `à partir de V${firstNew.versionNumber}` : "nouvelles versions"}) !`,
        "emerald"
      );
    } catch {
      notify("Erreur réseau lors de la demande à Léonard.", "red");
    } finally {
      setIsGenerating(false);
    }
  };

  // Reset current element or all elements to V1
  const handleResetAssetToDefault = async (assetKey?: string) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/vector-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_TO_DEFAULT",
          targetScope: assetKey ? "ASSET" : "ALL",
          ...(assetKey ? { assetKey } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        state?: VectorVariantsState;
        error?: string;
      };
      if (res.ok && data.state) {
        applyNewServerState(data.state, true);
        notify(
          assetKey
            ? `Élément ${assetKey} rétabli sur la version classique V1.`
            : "Tous les éléments ont été rétablis sur la version classique V1.",
          "emerald"
        );
      }
    } catch {
      notify("Impossible de réinitialiser le choix.", "red");
    } finally {
      setIsSaving(false);
    }
  };

  const activeSavedVariantId =
    serverState.activeVariants[selectedDescriptor.assetKey] ?? "v1_classic_mk1";
  const activeStagedVariantId =
    stagedSelections[selectedDescriptor.assetKey] ?? activeSavedVariantId;
  const activeSavedProposal = (
    serverState.catalog[selectedDescriptor.assetKey] ?? []
  ).find((p) => p.variantId === activeSavedVariantId);
  const activeStagedProposal =
    (serverState.catalog[selectedDescriptor.assetKey] ?? []).find(
      (p) => p.variantId === activeStagedVariantId
    ) ?? proposalsForSelectedElement[0];

  return (
    <div
      data-testid="leonardo-vector-studio"
      className={cn(
        "flex flex-col bg-obsidian text-slate-100 select-none",
        embedded
          ? "h-full flex-1 overflow-hidden"
          : "h-screen w-screen overflow-hidden"
      )}
    >
      {/* =================================================================== */}
      {/* TOP BAR : ATELIER VECTORIEL DE LÉONARD                              */}
      {/* =================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/95 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {embedded && onSwitchToMapEditor ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="back-to-map-editor-button"
              onClick={onSwitchToMapEditor}
            >
              <ArrowLeft className="h-4 w-4" />
              Retour Éditeur de Map
            </Button>
          ) : (
            <Link
              href="/"
              data-testid="link-back-devtools-home"
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-amber-500/50 hover:text-amber-200"
            >
              <ArrowLeft className="h-4 w-4 text-amber-400" />
              Studio DevTools (Cartes)
            </Link>
          )}

          <div className="flex items-center gap-2.5 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1">
            <Palette className="h-5 w-5 text-amber-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-wide text-amber-300">
                  ATELIER VECTORIEL DE LÉONARD
                </span>
                <Badge className="border-sky-500/50 bg-sky-500/20 text-sky-300">
                  Révision #{serverState.revision}
                </Badge>
                <Badge className="border-emerald-500/50 bg-emerald-500/20 text-emerald-300">
                  {summary.modifiedAssetsCount}/{summary.totalAssets} personnalisés
                </Badge>
                <Badge className="border-purple-500/50 bg-purple-500/20 text-purple-300">
                  {summary.totalVariants} variantes
                </Badge>
              </div>
              <div className="text-xs text-slate-400">
                Évolution des graphismes vectoriels 2D • Bâtiments, Unités, Tuiles & Flore • Synchronisé avec RTS-MK1
              </div>
            </div>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {unsavedDiffCount > 0 && (
            <Badge className="border-amber-400 bg-amber-500/20 text-amber-200">
              {unsavedDiffCount} choix en attente de sauvegarde
            </Badge>
          )}

          <Button
            size="sm"
            variant="tactical"
            data-testid="save-vector-choices-button"
            disabled={isSaving || isLoading}
            onClick={() => void handleSaveAllChoices()}
          >
            <Save className="h-4 w-4" />
            {isSaving
              ? "Sauvegarde..."
              : unsavedDiffCount > 0
                ? `Sauvegarder ce choix (${unsavedDiffCount})`
                : "Sauvegarder ce choix pour le jeu"}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            data-testid="refresh-vector-state-button"
            onClick={() => void fetchVectorState()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </Button>

          {embedded && (
            <Link
              href="/vector-lab"
              data-testid="open-standalone-vector-lab-link"
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-amber-400 hover:text-amber-200"
            >
              <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
              Plein écran (/vector-lab)
            </Link>
          )}

          <a
            href="https://rts-mk1.orbital8.cloud"
            target="_blank"
            rel="noreferrer"
            data-testid="open-live-game-link"
            className="inline-flex items-center gap-1.5 rounded border border-sky-500/50 bg-sky-500/15 px-2.5 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
          >
            <Compass className="h-3.5 w-3.5 text-sky-400" />
            Ouvrir le Jeu RTS-MK1
          </a>
        </div>
      </div>

      {/* STATUS BANNER */}
      <div
        data-testid="vector-lab-status-banner"
        className={cn(
          "flex items-center justify-between border-b px-4 py-1.5 text-xs font-semibold",
          statusMessage.tone === "emerald" &&
            "border-emerald-500/30 bg-emerald-950/40 text-emerald-200",
          statusMessage.tone === "amber" &&
            "border-amber-500/30 bg-amber-950/40 text-amber-200",
          statusMessage.tone === "red" &&
            "border-red-500/40 bg-red-950/50 text-red-200"
        )}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Agent artiste : <strong className="text-slate-200">Léonard</strong> • Persistance SQLite & Volume Partagé
        </div>
      </div>

      {/* =================================================================== */}
      {/* MAIN 3-COLUMN WORKSPACE                                             */}
      {/* =================================================================== */}
      <div className="grid flex-1 grid-cols-12 overflow-hidden">
        {/* ----------------------------------------------------------------- */}
        {/* LEFT COLUMN (3 cols): CATALOG OF ALL 41 GAME ELEMENTS             */}
        {/* ----------------------------------------------------------------- */}
        <aside
          data-testid="vector-asset-catalog"
          className="col-span-3 flex flex-col overflow-hidden border-r border-slate-800 bg-slate-950/80"
        >
          {/* Category Filter Pills */}
          <div className="border-b border-slate-800 p-2.5">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Catégories d&apos;Éléments
            </div>
            <div className="grid grid-cols-2 gap-1">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  data-testid={`vector-category-${cat.id}`}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    const firstInCat = VECTOR_ASSET_ELEMENTS.find((el) =>
                      cat.id === "ALL" ? true : el.category === cat.id
                    );
                    if (
                      firstInCat &&
                      cat.id !== "ALL" &&
                      selectedDescriptor.category !== cat.id
                    ) {
                      setSelectedAssetKey(firstInCat.assetKey);
                    }
                  }}
                  className={cn(
                    "rounded border px-2 py-1.5 text-left text-xs font-bold transition-colors",
                    selectedCategory === cat.id
                      ? "border-amber-500/60 bg-amber-500/20 text-amber-200"
                      : "border-slate-800 bg-slate-900/70 text-slate-300 hover:bg-slate-800"
                  )}
                >
                  {cat.shortLabel}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                data-testid="vector-asset-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher bâtiment, unité, tuile..."
                className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Scrollable Element List */}
          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {filteredElements.map((el) => {
              const isSelected = el.assetKey === selectedDescriptor.assetKey;
              const savedVarId =
                serverState.activeVariants[el.assetKey] ?? "v1_classic_mk1";
              const stagedVarId = stagedSelections[el.assetKey] ?? savedVarId;
              const list = serverState.catalog[el.assetKey] ?? [];
              const stagedProp = list.find((p) => p.variantId === stagedVarId);
              const isPendingUnsaved = savedVarId !== stagedVarId;
              const isCustomized = stagedVarId !== "v1_classic_mk1";

              return (
                <button
                  key={el.assetKey}
                  type="button"
                  data-testid={`vector-asset-item-${el.assetKey}`}
                  onClick={() => setSelectedAssetKey(el.assetKey)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded border px-2.5 py-2 text-left transition-all",
                    isSelected
                      ? "border-amber-400 bg-amber-500/15 shadow-sm"
                      : "border-slate-800/80 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-bold text-slate-100">
                        {el.name}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span>
                        {el.footprintW}×{el.footprintH}
                      </span>
                      <span>•</span>
                      <span>{list.length} versions</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-extrabold",
                        isPendingUnsaved
                          ? "border-amber-400 bg-amber-500/30 text-amber-200"
                          : isCustomized
                            ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                            : "border-slate-700 bg-slate-800 text-slate-300"
                      )}
                    >
                      V{stagedProp?.versionNumber ?? 1}
                    </span>
                    {isPendingUnsaved && (
                      <span className="text-[10px] font-bold text-amber-300">
                        Non sauvé
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ----------------------------------------------------------------- */}
        {/* CENTER COLUMN (6 cols): VARIANT GALLERY & LEONARDO GENERATOR      */}
        {/* ----------------------------------------------------------------- */}
        <main className="col-span-6 flex flex-col overflow-y-auto bg-slate-950/40 p-4">
          {/* Selected Element Header & Preview Controls */}
          <Card className="mb-4 border-slate-800 bg-slate-900/80 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="border-amber-500/50 bg-amber-500/20 text-amber-300">
                    {selectedDescriptor.category}
                  </Badge>
                  <h2
                    data-testid="selected-asset-title"
                    className="text-base font-extrabold text-slate-100"
                  >
                    {selectedDescriptor.name}
                  </h2>
                  <span className="text-xs font-semibold text-slate-400">
                    ({selectedDescriptor.footprintW}×{selectedDescriptor.footprintH})
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {selectedDescriptor.subtitle}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Version active en jeu :</span>
                  <Badge
                    data-testid="active-saved-variant-badge"
                    className="border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                  >
                    V{activeSavedProposal?.versionNumber ?? 1} —{" "}
                    {activeSavedProposal?.title ?? "Standard"}
                  </Badge>
                  {activeStagedVariantId !== activeSavedVariantId && (
                    <Badge className="border-amber-400 bg-amber-500/25 text-amber-200">
                      Sélectionné : V{activeStagedProposal?.versionNumber ?? 1} (à sauvegarder)
                    </Badge>
                  )}
                </div>
              </div>

              {/* Faction & Turntable Controls */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950 p-1">
                  {FACTION_CHOICES.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      data-testid={`preview-faction-${f.id}`}
                      onClick={() => setPreviewFaction(f.id)}
                      className={cn(
                        "flex items-center gap-1 rounded px-2 py-1 text-xs font-bold transition-colors",
                        previewFaction === f.id
                          ? "bg-amber-500/25 text-amber-200 border border-amber-500/50"
                          : "text-slate-400 hover:bg-slate-800"
                      )}
                    >
                      <FactionVectorEmblem faction={f.id} className="h-3.5 w-3.5" />
                      {f.id}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="rotate-step-button"
                    onClick={() => setRotationStep((s) => (s + 2) % 16)}
                  >
                    Angle {Math.round(((rotationStep % 16) / 16) * 360)}°
                  </Button>
                  <Button
                    size="sm"
                    variant={autoRotate ? "default" : "ghost"}
                    data-testid="toggle-auto-rotate"
                    onClick={() => setAutoRotate((v) => !v)}
                  >
                    {autoRotate ? "Rotation Auto : ON" : "Rotation Auto"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="reset-asset-default-button"
                    onClick={() =>
                      void handleResetAssetToDefault(selectedDescriptor.assetKey)
                    }
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Rétablir V1
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* =============================================================== */}
          {/* COMMISSION PANEL: ASK LEONARDO FOR NEW VERSIONS                 */}
          {/* =============================================================== */}
          <Card
            data-testid="ask-leonardo-panel"
            className="mb-4 border-amber-500/40 bg-slate-900/90 p-3.5"
          >
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-amber-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Redemander à Léonard de proposer de nouvelles versions
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Génération illimitée (V5, V6, V7...) sans jamais écraser les versions précédentes
              </span>
            </div>

            <div className="grid grid-cols-12 gap-2.5">
              {/* Scope */}
              <div className="col-span-4">
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                  Portée de la demande
                </label>
                <select
                  data-testid="leonardo-scope-select"
                  value={commissionScope}
                  onChange={(e) =>
                    setCommissionScope(
                      e.target.value as "ASSET" | "CATEGORY" | "ALL"
                    )
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  <option value="ASSET">
                    Cet élément ({selectedDescriptor.name})
                  </option>
                  <option value="CATEGORY">
                    Toute la catégorie ({selectedDescriptor.category})
                  </option>
                  <option value="ALL">
                    Tous les 41 éléments du jeu
                  </option>
                </select>
              </div>

              {/* Count per asset */}
              <div className="col-span-3">
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                  Nouvelles versions / élément
                </label>
                <select
                  data-testid="leonardo-count-select"
                  value={commissionCount}
                  onChange={(e) => setCommissionCount(Number(e.target.value))}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-amber-200 focus:border-amber-400 focus:outline-none"
                >
                  <option value={1}>+1 nouvelle version</option>
                  <option value={2}>+2 nouvelles versions</option>
                  <option value={3}>+3 nouvelles versions</option>
                  <option value={4}>+4 nouvelles versions</option>
                </select>
              </div>

              {/* Style Archetype */}
              <div className="col-span-5">
                <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                  Direction artistique (Archétype)
                </label>
                <select
                  data-testid="leonardo-style-select"
                  value={commissionStyle}
                  onChange={(e) =>
                    setCommissionStyle(
                      e.target.value as "AUTO" | StyleArchetype
                    )
                  }
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-slate-100 focus:border-amber-400 focus:outline-none"
                >
                  {STYLE_ARCHETYPE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Creative Directive */}
              <div className="col-span-8">
                <input
                  type="text"
                  data-testid="leonardo-directive-input"
                  value={commissionDirective}
                  onChange={(e) => setCommissionDirective(e.target.value)}
                  placeholder="Directive libre pour Léonard (ex: blindage réactif lourd, dômes plasma, camouflage désert...)"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Action Button */}
              <div className="col-span-4 flex items-center justify-end gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    data-testid="leonardo-autoselect-checkbox"
                    checked={autoSelectFirstNew}
                    onChange={(e) => setAutoSelectFirstNew(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                  Pré-choisir
                </label>
                <Button
                  size="sm"
                  variant="default"
                  data-testid="ask-leonardo-generate-button"
                  disabled={isGenerating}
                  onClick={() => void handleAskLeonardoForNewVariants()}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGenerating ? "Création..." : "Demander à Léonard"}
                </Button>
              </div>
            </div>
          </Card>

          {/* =============================================================== */}
          {/* VARIANT CARDS GALLERY                                           */}
          {/* =============================================================== */}
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Propositions de Léonard pour {selectedDescriptor.name} (
                {proposalsForSelectedElement.length} versions)
              </span>
            </div>
            <button
              type="button"
              data-testid="toggle-sort-variants"
              onClick={() => setSortNewestFirst((v) => !v)}
              className="rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:border-slate-700"
            >
              {sortNewestFirst
                ? "Tri : Plus récentes (VN → V1)"
                : "Tri : Chronologique (V1 → VN)"}
            </button>
          </div>

          <div
            data-testid="variant-cards-grid"
            className="grid grid-cols-2 gap-3 pb-6"
          >
            {proposalsForSelectedElement.map((proposal) => {
              const isSavedInGame =
                activeSavedVariantId === proposal.variantId;
              const isStagedSelected =
                activeStagedVariantId === proposal.variantId;

              return (
                <Card
                  key={proposal.variantId}
                  data-testid={`variant-card-${proposal.variantId}`}
                  className={cn(
                    "flex flex-col justify-between border p-3 transition-all",
                    isStagedSelected
                      ? "border-amber-400 bg-slate-900 shadow-lg"
                      : isSavedInGame
                        ? "border-emerald-500/60 bg-slate-900/90"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                  )}
                >
                  <div>
                    {/* Card Header */}
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded border border-amber-500/50 bg-amber-500/20 px-1.5 py-0.5 text-xs font-extrabold text-amber-300">
                            V{proposal.versionNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-100">
                            {proposal.title}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {proposal.styleArchetype} • {proposal.author}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {isSavedInGame && (
                          <Badge
                            data-testid={`badge-active-ingame-${proposal.variantId}`}
                            className="border-emerald-500/60 bg-emerald-500/20 text-emerald-200"
                          >
                            ACTIF EN JEU
                          </Badge>
                        )}
                        {isStagedSelected && !isSavedInGame && (
                          <Badge className="border-amber-400 bg-amber-500/25 text-amber-200">
                            CHOISI (À SAUVER)
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Vector Canvas Preview + Cameo overlay */}
                    <div className="relative mb-2.5">
                      <VariantPreviewCanvas
                        descriptor={selectedDescriptor}
                        proposal={proposal}
                        faction={previewFaction}
                        rotationStep={rotationStep}
                      />
                      {(selectedDescriptor.category === "BUILDING" ||
                        selectedDescriptor.category === "UNIT") && (
                        <div className="absolute bottom-2 right-2 rounded border border-slate-700/80 bg-slate-950/90 p-1 shadow">
                          <ProductionItemVectorIcon
                            itemKind={
                              selectedDescriptor.elementCode as
                                | BuildingKind
                                | UnitKind
                            }
                            faction={previewFaction}
                            className="h-9 w-9"
                            variantOverride={proposal}
                          />
                        </div>
                      )}
                    </div>

                    {/* Leonardo Note */}
                    <p className="mb-2 text-[11px] leading-relaxed text-slate-300">
                      « {proposal.leonardoNote} »
                    </p>

                    {/* DNA Parameters Strip */}
                    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="rounded bg-slate-950 px-1.5 py-0.5 font-semibold text-slate-300">
                        Profil {proposal.dna.silhouetteProfile}
                      </span>
                      <span className="rounded bg-slate-950 px-1.5 py-0.5 font-semibold text-slate-300">
                        Noyau {proposal.dna.energyCoreHue}
                      </span>
                      <span className="rounded bg-slate-950 px-1.5 py-0.5 font-semibold text-slate-300">
                        Canon ×{proposal.dna.barrelLengthScale.toFixed(2)}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded bg-slate-950 px-1.5 py-0.5 font-semibold text-slate-300">
                        <svg className="h-2.5 w-2.5" viewBox="0 0 10 10">
                          <rect
                            width="10"
                            height="10"
                            rx="2"
                            fill={proposal.dna.terrainFillHex}
                          />
                        </svg>
                        <svg className="h-2.5 w-2.5" viewBox="0 0 10 10">
                          <rect
                            width="10"
                            height="10"
                            rx="2"
                            fill={proposal.dna.terrainLipHighlightHex}
                          />
                        </svg>
                        Seed #{proposal.dna.customSeed}
                      </span>
                    </div>
                  </div>

                  {/* Selection & Direct Validation Buttons */}
                  <div className="flex items-center gap-2 border-t border-slate-800/80 pt-2.5">
                    <Button
                      size="sm"
                      variant={isStagedSelected ? "default" : "ghost"}
                      data-testid={`select-variant-button-${proposal.variantId}`}
                      className="flex-1"
                      onClick={() =>
                        handleStageSelectVariant(
                          selectedDescriptor.assetKey,
                          proposal.variantId
                        )
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      {isStagedSelected ? "Sélectionné" : "Choisir"}
                    </Button>

                    <Button
                      size="sm"
                      variant="tactical"
                      data-testid={`apply-now-variant-button-${proposal.variantId}`}
                      className="flex-1"
                      disabled={isSaving}
                      onClick={() =>
                        void handleApplySingleVariantNow(
                          selectedDescriptor.assetKey,
                          proposal.variantId
                        )
                      }
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {isSavedInGame && isStagedSelected
                        ? "Actif dans le jeu"
                        : "Utiliser en jeu"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </main>

        {/* ----------------------------------------------------------------- */}
        {/* RIGHT COLUMN (3 cols): LIVE IN-GAME DIORAMA & DNA INSPECTOR       */}
        {/* ----------------------------------------------------------------- */}
        <aside className="col-span-3 flex flex-col overflow-y-auto border-l border-slate-800 bg-slate-950/90 p-3.5">
          {/* Live Diorama Preview */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Aperçu In-Game (Mise en Situation)
              </span>
              <Badge className="border-sky-500/40 bg-sky-500/15 text-sky-300">
                Temps Réel
              </Badge>
            </div>
            <LiveDioramaCanvas
              selectedDescriptor={selectedDescriptor}
              catalog={serverState.catalog}
              stagedSelections={stagedSelections}
              faction={previewFaction}
              rotationStep={rotationStep}
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              Combine la variante sélectionnée pour{" "}
              <strong className="text-slate-200">{selectedDescriptor.name}</strong>{" "}
              avec vos tuiles de terrain et arbres actifs.
            </p>
          </div>

          {/* Active Variant DNA Inspector */}
          {activeStagedProposal && (
            <Card className="mb-4 border-slate-800 bg-slate-900/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                  ADN Vectoriel (V{activeStagedProposal.versionNumber})
                </span>
                <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">
                  {activeStagedProposal.styleArchetype}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Terrain / Feuillage :</span>
                  <div className="flex items-center gap-1.5">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14">
                      <rect
                        width="14"
                        height="14"
                        rx="3"
                        fill={activeStagedProposal.dna.terrainFillHex}
                      />
                    </svg>
                    <code className="text-[11px] text-slate-200">
                      {activeStagedProposal.dna.terrainFillHex}
                    </code>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 14 14">
                      <rect
                        width="14"
                        height="14"
                        rx="3"
                        fill={activeStagedProposal.dna.treePrimaryFoliageHex}
                      />
                    </svg>
                    <code className="text-[11px] text-slate-200">
                      {activeStagedProposal.dna.treePrimaryFoliageHex}
                    </code>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Superstructure & Tourelle :</span>
                  <span className="font-semibold text-slate-200">
                    {activeStagedProposal.dna.superstructureStyle} •{" "}
                    {activeStagedProposal.dna.turretProfile}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Châssis & Rivets :</span>
                  <span className="font-semibold text-slate-200">
                    ×{activeStagedProposal.dna.hullWidthScale}×
                    {activeStagedProposal.dna.hullLengthScale} •{" "}
                    {activeStagedProposal.dna.rivetDensity}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Géométrie Sol / Canopée :</span>
                  <span className="font-semibold text-slate-200">
                    {activeStagedProposal.dna.terrainGeometryStyle} •{" "}
                    {activeStagedProposal.dna.treeCanopyStyle}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Summary of Customized Elements Across All 41 Assets */}
          <Card className="flex-1 border-slate-800 bg-slate-900/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Éléments Évolués Actifs
              </span>
              <button
                type="button"
                data-testid="reset-all-defaults-button"
                onClick={() => void handleResetAssetToDefault(undefined)}
                className="text-[11px] font-semibold text-slate-400 hover:text-amber-300"
              >
                Tout rétablir V1
              </button>
            </div>

            <div className="space-y-1.5">
              {VECTOR_ASSET_ELEMENTS.filter((el) => {
                const vId =
                  stagedSelections[el.assetKey] ?? "v1_classic_mk1";
                return vId !== "v1_classic_mk1";
              }).map((el) => {
                const vId =
                  stagedSelections[el.assetKey] ?? "v1_classic_mk1";
                const prop = (serverState.catalog[el.assetKey] ?? []).find(
                  (p) => p.variantId === vId
                );
                return (
                  <button
                    key={el.assetKey}
                    type="button"
                    onClick={() => setSelectedAssetKey(el.assetKey)}
                    className="flex w-full items-center justify-between rounded border border-slate-800 bg-slate-950/80 px-2 py-1.5 text-left text-xs hover:border-amber-500/40"
                  >
                    <span className="truncate font-semibold text-slate-200">
                      {el.name}
                    </span>
                    <span className="ml-2 shrink-0 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                      V{prop?.versionNumber ?? "?"}
                    </span>
                  </button>
                );
              })}

              {VECTOR_ASSET_ELEMENTS.every(
                (el) =>
                  (stagedSelections[el.assetKey] ?? "v1_classic_mk1") ===
                  "v1_classic_mk1"
              ) && (
                <div className="rounded border border-dashed border-slate-800 p-3 text-center text-xs text-slate-400">
                  Tous les éléments utilisent actuellement leur version initiale V1.
                  Sélectionnez V2, V3, V4 ou demandez à Léonard de nouvelles versions !
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
