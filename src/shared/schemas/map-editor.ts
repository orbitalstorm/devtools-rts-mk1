import { z } from "zod";

export const FactionIdSchema = z.enum(["GDI", "NOD", "ORDOS"]);
export const SpawnFactionChoiceSchema = z.enum(["GDI", "NOD", "ORDOS", "ANY"]);
export const ProductionCategorySchema = z.enum(["BUILDING", "DEFENSE", "INFANTRY", "VEHICLE"]);

export const BuildingKindSchema = z.enum([
  "CONSTRUCTION_YARD",
  "POWER_PLANT",
  "REFINERY",
  "SILO",
  "BARRACKS",
  "WAR_FACTORY",
  "RADAR_DOME",
  "TECH_CENTER",
  "SILVER_MINE",
  "CONCRETE_SLAB",
  "SANDBAG_WALL",
  "CONCRETE_WALL",
  "GUARD_TOWER",
  "SAM_SITE",
  "OBELISK",
]);

export const TreeKindSchema = z.enum([
  "TREE_PINE",
  "TREE_OAK",
  "TREE_PALM",
  "TREE_CYPRESS",
]);

export const UnitKindSchema = z.enum([
  "RIFLE_INFANTRY",
  "ROCKET_SOLDIER",
  "ENGINEER",
  "CONSTRUCTOR_BOT",
  "HARVESTER",
  "FORESTRY_TRUCK",
  "BLOWER_TRUCK",
  "RECON_BUGGY",
  "MEDIUM_TANK",
  "ARTILLERY",
  "MAMMOTH_TANK",
  "MCV",
]);

export const MapSizePresetChoiceSchema = z.enum([
  "LEGACY_1X",
  "SKIRMISH_4X",
  "TACTICAL_5X",
  "STRATEGIC_7X",
  "COLOSSAL_9X",
  "CUSTOM",
]);

export const SymmetryModeSchema = z.enum([
  "NONE",
  "MIRROR_X",
  "MIRROR_Y",
  "ROTATIONAL_180",
  "QUADRANT_4WAY",
]);

export const BrushShapeSchema = z.enum([
  "CIRCLE",
  "SQUARE",
  "DIAMOND",
  "SPRAY",
]);

export const EditorToolCategorySchema = z.enum([
  "TERRAIN",
  "RESOURCES",
  "ENVIRONMENT",
  "SPAWNS",
  "ENTITIES",
  "MEASURE",
]);

export const EditorDrawModeSchema = z.enum([
  "BRUSH",
  "LINE",
  "RECT",
  "FILL",
  "STAMP",
  "ERASER",
  "EYEDROPPER",
  "RULER",
]);

export const OreStampPresetSchema = z.enum([
  "SMALL_VEIN",
  "NATURAL_VEIN",
  "CONTESTED_BASIN",
]);

export const SpawnPointSpecSchema = z.object({
  slotIndex: z.number().int().min(0).max(3), // 0 = Slot 1 (NW), 1 = Slot 2 (SE), 2 = Slot 3 (NE), 3 = Slot 4 (SW)
  label: z.string().min(1).max(40),
  x: z.number().int().min(0).max(511), // Top-left X of the 8x8 spawn pad
  y: z.number().int().min(0).max(511), // Top-left Y of the 8x8 spawn pad
  faction: SpawnFactionChoiceSchema.default("ANY"),
  startingCredits: z.number().int().min(500).max(50000).default(5000),
  includeConcretePad: z.boolean().default(true),
  includeStoneHalo: z.boolean().default(true),
  includeInitialBase: z.boolean().default(true),
});

export const EditorTreePlacementSchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511),
  y: z.number().int().min(0).max(511),
  kind: TreeKindSchema,
  scale: z.number().min(0.3).max(1.6).default(1.0),
});

export const EditorSilverDepositSchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511), // Top-left tile X of the 2x2 SILVER_ORE boulder
  y: z.number().int().min(0).max(511), // Top-left tile Y of the 2x2 SILVER_ORE boulder
  kind: z.enum(["REGIONAL", "CONTESTED_CENTRAL"]).default("REGIONAL"),
  includeStoneApron: z.boolean().default(true),
});

export const EditorPlacedEntitySchema = z.object({
  id: z.string().min(1),
  x: z.number().int().min(0).max(511),
  y: z.number().int().min(0).max(511),
  ownerSlot: z.union([z.number().int().min(0).max(3), z.literal("NEUTRAL")]).default(0),
  faction: FactionIdSchema.default("GDI"),
  entityType: z.enum(["BUILDING", "UNIT"]),
  kind: z.union([BuildingKindSchema, UnitKindSchema]),
  angleIndex: z.number().int().min(0).max(15).default(4),
  hpRatio: z.number().min(0.1).max(1.0).default(1.0),
});

export const CustomMapDocumentSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(80),
    author: z.string().min(1).max(48).default("Architecte RTS-MK1"),
    description: z.string().max(400).default(""),
    version: z.string().min(1).max(24).default("1.0.0"),
    seed: z.number().int().positive(),
    sizePreset: MapSizePresetChoiceSchema.default("TACTICAL_5X"),
    width: z.number().int().min(32).max(256),
    height: z.number().int().min(32).max(256),
    terrainGrid: z.array(z.number().int().min(0).max(9)),
    oreGrid: z.array(z.number().int().min(0).max(5000)),
    spawns: z.array(SpawnPointSpecSchema).max(4),
    trees: z.array(EditorTreePlacementSchema),
    silverDeposits: z.array(EditorSilverDepositSchema),
    placedEntities: z.array(EditorPlacedEntitySchema).default([]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .superRefine((doc, ctx) => {
    const expectedTotal = doc.width * doc.height;
    if (doc.terrainGrid.length !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `terrainGrid (${doc.terrainGrid.length}) ne correspond pas à width*height (${expectedTotal}).`,
        path: ["terrainGrid"],
      });
    }
    if (doc.oreGrid.length !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `oreGrid (${doc.oreGrid.length}) ne correspond pas à width*height (${expectedTotal}).`,
        path: ["oreGrid"],
      });
    }
  });

export const CustomMapSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  author: z.string().min(1),
  description: z.string(),
  version: z.string(),
  seed: z.number().int().positive(),
  sizePreset: MapSizePresetChoiceSchema,
  width: z.number().int().min(32).max(256),
  height: z.number().int().min(32).max(256),
  spawnCount: z.number().int().min(0).max(4),
  oreTotalCredits: z.number().int().min(0),
  silverDepositCount: z.number().int().min(0),
  treeCount: z.number().int().min(0),
  entityCount: z.number().int().min(0),
  rulesValid: z.boolean(),
  updatedAt: z.string().min(1),
});

export type SpawnFactionChoice = z.infer<typeof SpawnFactionChoiceSchema>;
export type MapSizePresetChoice = z.infer<typeof MapSizePresetChoiceSchema>;
export type SymmetryMode = z.infer<typeof SymmetryModeSchema>;
export type BrushShape = z.infer<typeof BrushShapeSchema>;
export type EditorToolCategory = z.infer<typeof EditorToolCategorySchema>;
export type EditorDrawMode = z.infer<typeof EditorDrawModeSchema>;
export type OreStampPreset = z.infer<typeof OreStampPresetSchema>;
export type SpawnPointSpec = z.infer<typeof SpawnPointSpecSchema>;
export type EditorTreePlacement = z.infer<typeof EditorTreePlacementSchema>;
export type EditorSilverDeposit = z.infer<typeof EditorSilverDepositSchema>;
export type EditorPlacedEntity = z.infer<typeof EditorPlacedEntitySchema>;
export type CustomMapDocument = z.infer<typeof CustomMapDocumentSchema>;
export type CustomMapSummary = z.infer<typeof CustomMapSummarySchema>;
