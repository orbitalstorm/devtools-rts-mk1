import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  createMapFromProceduralSeed,
  summarizeCustomMap,
} from "../../shared/map-editor-engine";
import {
  CustomMapDocumentSchema,
  CustomMapSummarySchema,
  type CustomMapDocument,
  type CustomMapSummary,
} from "../../shared/schemas/map-editor";
import {
  VECTOR_ASSET_ELEMENTS,
  VectorVariantsMutationRequestSchema,
  VectorVariantsStateSchema,
  createInitialVectorVariantsState,
  setActiveVectorVariantConfig,
  summarizeVectorVariantsState,
  synthesizeNewLeonardoVariantProposal,
  type VectorVariantProposal,
  type VectorVariantsMutationRequest,
  type VectorVariantsState,
} from "../../shared/schemas/vector-variants";

let dbInstance: DatabaseSync | null = null;
let activeDbPath: string | null = null;

function resolveDbPath(): string {
  return process.env.RTS_DB_PATH || path.join(process.cwd(), "data", "rts-mk1.sqlite");
}

function getCustomMapsDir(): string {
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), "custom-maps");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getVectorVariantsFilePath(): string {
  const dbPath = resolveDbPath();
  const dir = path.join(path.dirname(dbPath), "vector-variants");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "state.json");
}

function getDb(): DatabaseSync {
  const dbPath = resolveDbPath();
  if (dbInstance && activeDbPath === dbPath) return dbInstance;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS custom_maps (
      map_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT NOT NULL,
      seed INTEGER NOT NULL,
      size_preset TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      spawn_count INTEGER NOT NULL,
      ore_total_credits INTEGER NOT NULL,
      silver_deposit_count INTEGER NOT NULL,
      tree_count INTEGER NOT NULL,
      entity_count INTEGER NOT NULL,
      rules_valid INTEGER NOT NULL DEFAULT 1,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vector_variants_state (
      config_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const countRow = db
    .prepare("SELECT COUNT(*) as cnt FROM custom_maps")
    .get() as { cnt: number } | undefined;

  if (!countRow || countRow.cnt === 0) {
    const starterMaps: CustomMapDocument[] = [
      createMapFromProceduralSeed({
        id: "official_tactical_160",
        name: "Bassin d'Héliopolis (160×160 — 4 Spawns)",
        author: "Lead System Architect",
        seed: 408291735,
        sizePreset: "TACTICAL_5X",
      }),
      createMapFromProceduralSeed({
        id: "official_skirmish_144",
        name: "Vallée du Tiberium (144×144 — Escarmouche)",
        author: "Lead System Architect",
        seed: 719384625,
        sizePreset: "SKIRMISH_4X",
      }),
      createMapFromProceduralSeed({
        id: "official_strategic_192",
        name: "Crêtes d'Arrakis Nord (192×192 — Stratégique)",
        author: "Lead System Architect",
        seed: 912847361,
        sizePreset: "STRATEGIC_7X",
      }),
    ];

    for (const m of starterMaps) {
      saveCustomMapToStatement(db, m);
    }
  }

  dbInstance = db;
  activeDbPath = dbPath;
  return db;
}

function saveCustomMapToStatement(db: DatabaseSync, doc: CustomMapDocument): CustomMapSummary {
  const validated = CustomMapDocumentSchema.parse({
    ...doc,
    updatedAt: new Date().toISOString(),
  });
  const summary = summarizeCustomMap(validated);

  db.prepare(`
    INSERT INTO custom_maps (
      map_id, name, author, description, version, seed, size_preset,
      width, height, spawn_count, ore_total_credits, silver_deposit_count,
      tree_count, entity_count, rules_valid, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(map_id) DO UPDATE SET
      name = excluded.name,
      author = excluded.author,
      description = excluded.description,
      version = excluded.version,
      seed = excluded.seed,
      size_preset = excluded.size_preset,
      width = excluded.width,
      height = excluded.height,
      spawn_count = excluded.spawn_count,
      ore_total_credits = excluded.ore_total_credits,
      silver_deposit_count = excluded.silver_deposit_count,
      tree_count = excluded.tree_count,
      entity_count = excluded.entity_count,
      rules_valid = excluded.rules_valid,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(
    summary.id,
    summary.name,
    summary.author,
    summary.description,
    summary.version,
    summary.seed,
    summary.sizePreset,
    summary.width,
    summary.height,
    summary.spawnCount,
    summary.oreTotalCredits,
    summary.silverDepositCount,
    summary.treeCount,
    summary.entityCount,
    summary.rulesValid ? 1 : 0,
    JSON.stringify(validated),
    summary.updatedAt
  );

  try {
    const safeFile = `${summary.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.rtsmap.json`;
    fs.writeFileSync(
      path.join(getCustomMapsDir(), safeFile),
      JSON.stringify(validated, null, 2),
      "utf8"
    );
  } catch {
    // Ignore file write errors if read-only fs in test environments
  }

  return summary;
}

export function upsertCustomMap(doc: CustomMapDocument): {
  map: CustomMapDocument;
  summary: CustomMapSummary;
} {
  const db = getDb();
  const validated = CustomMapDocumentSchema.parse({
    ...doc,
    updatedAt: new Date().toISOString(),
  });
  const summary = saveCustomMapToStatement(db, validated);
  return { map: validated, summary };
}

export function listCustomMaps(limit = 50): CustomMapSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT map_id, name, author, description, version, seed, size_preset,
              width, height, spawn_count, ore_total_credits, silver_deposit_count,
              tree_count, entity_count, rules_valid, updated_at
       FROM custom_maps
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    map_id: string;
    name: string;
    author: string;
    description: string;
    version: string;
    seed: number;
    size_preset: string;
    width: number;
    height: number;
    spawn_count: number;
    ore_total_credits: number;
    silver_deposit_count: number;
    tree_count: number;
    entity_count: number;
    rules_valid: number;
    updated_at: string;
  }>;

  return rows.map((r) =>
    CustomMapSummarySchema.parse({
      id: r.map_id,
      name: r.name,
      author: r.author,
      description: r.description,
      version: r.version,
      seed: r.seed,
      sizePreset: r.size_preset,
      width: r.width,
      height: r.height,
      spawnCount: r.spawn_count,
      oreTotalCredits: r.ore_total_credits,
      silverDepositCount: r.silver_deposit_count,
      treeCount: r.tree_count,
      entityCount: r.entity_count,
      rulesValid: r.rules_valid === 1,
      updatedAt: r.updated_at,
    })
  );
}

export function getCustomMapById(mapId: string): CustomMapDocument | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM custom_maps WHERE map_id = ?")
    .get(mapId) as { payload_json: string } | undefined;

  if (!row) return null;
  const parsed = JSON.parse(row.payload_json) as unknown;
  return CustomMapDocumentSchema.parse(parsed);
}

export function deleteCustomMapById(mapId: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM custom_maps WHERE map_id = ?").run(mapId);
  try {
    const safeFile = `${mapId.replace(/[^a-zA-Z0-9_-]/g, "_")}.rtsmap.json`;
    const filePath = path.join(getCustomMapsDir(), safeFile);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore file cleanup errors
  }
  return res.changes > 0;
}

function normalizeVectorVariantsStateCompleteness(state: VectorVariantsState): VectorVariantsState {
  const initial = createInitialVectorVariantsState();
  const mergedCatalog: Record<string, VectorVariantProposal[]> = { ...state.catalog };
  const mergedActive: Record<string, string> = {
    ...initial.activeVariants,
    ...state.activeVariants,
  };

  for (const descriptor of VECTOR_ASSET_ELEMENTS) {
    const key = descriptor.assetKey;
    const baseList = initial.catalog[key] ?? [];
    const baseById = new Map(baseList.map((bp) => [bp.variantId, bp]));
    const currentList = mergedCatalog[key] ?? [];
    const existingIds = new Set(currentList.map((p) => p.variantId));
    const combined = currentList.map((p) => baseById.get(p.variantId) ?? p);
    for (const bp of baseList) {
      if (!existingIds.has(bp.variantId)) {
        combined.push(bp);
      }
    }
    combined.sort((a, b) => a.versionNumber - b.versionNumber);
    mergedCatalog[key] = combined;
    if (
      !mergedActive[key] ||
      !combined.some((p) => p.variantId === mergedActive[key])
    ) {
      mergedActive[key] = combined[0]?.variantId ?? "v1_classic_mk1";
    }
  }

  return VectorVariantsStateSchema.parse({
    ...state,
    activeVariants: mergedActive,
    catalog: mergedCatalog,
  });
}

function readVectorVariantsStateFromDisk(): VectorVariantsState | null {
  try {
    const filePath = getVectorVariantsFilePath();
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = VectorVariantsStateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return normalizeVectorVariantsStateCompleteness(parsed.data);
  } catch {
    return null;
  }
}

export function saveVectorVariantsState(state: VectorVariantsState): VectorVariantsState {
  const db = getDb();
  const validated = normalizeVectorVariantsStateCompleteness(state);

  db.prepare(`
    INSERT INTO vector_variants_state (config_id, revision, payload_json, updated_at)
    VALUES ('global', ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET
      revision = excluded.revision,
      payload_json = excluded.payload_json,
      updated_at = excluded.updated_at
  `).run(validated.revision, JSON.stringify(validated), validated.updatedAt);

  try {
    fs.writeFileSync(
      getVectorVariantsFilePath(),
      JSON.stringify(validated, null, 2),
      "utf8"
    );
  } catch {
    // Ignore disk write failure in read-only test environments
  }

  setActiveVectorVariantConfig(validated);
  return validated;
}

export function getVectorVariantsState(): VectorVariantsState {
  const db = getDb();
  const row = db
    .prepare("SELECT payload_json FROM vector_variants_state WHERE config_id = 'global'")
    .get() as { payload_json: string } | undefined;

  let dbState: VectorVariantsState | null = null;
  if (row) {
    try {
      const parsed = VectorVariantsStateSchema.safeParse(JSON.parse(row.payload_json));
      if (parsed.success) {
        dbState = normalizeVectorVariantsStateCompleteness(parsed.data);
      }
    } catch {
      dbState = null;
    }
  }

  const diskState = readVectorVariantsStateFromDisk();

  if (dbState && diskState) {
    if (
      diskState.revision > dbState.revision ||
      (diskState.revision === dbState.revision && diskState.updatedAt > dbState.updatedAt)
    ) {
      return saveVectorVariantsState(diskState);
    }
    if (dbState.revision > diskState.revision) {
      return saveVectorVariantsState(dbState);
    }
    setActiveVectorVariantConfig(dbState);
    return dbState;
  }

  if (diskState) {
    return saveVectorVariantsState(diskState);
  }

  if (dbState) {
    return saveVectorVariantsState(dbState);
  }

  const initial = createInitialVectorVariantsState();
  return saveVectorVariantsState(initial);
}

export function mutateVectorVariantsState(rawRequest: VectorVariantsMutationRequest): {
  state: VectorVariantsState;
  newlyCreated: VectorVariantProposal[];
  summary: ReturnType<typeof summarizeVectorVariantsState>;
} {
  const req = VectorVariantsMutationRequestSchema.parse(rawRequest);
  const current = getVectorVariantsState();
  const now = new Date().toISOString();
  const newlyCreated: VectorVariantProposal[] = [];

  if (req.action === "SAVE_SELECTIONS") {
    const nextActive: Record<string, string> = { ...current.activeVariants };
    for (const [assetKey, variantId] of Object.entries(req.activeVariants)) {
      const list = current.catalog[assetKey] ?? [];
      if (list.some((p) => p.variantId === variantId)) {
        nextActive[assetKey] = variantId;
      }
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: nextActive,
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  if (req.action === "SELECT_SINGLE_VARIANT") {
    const list = current.catalog[req.assetKey] ?? [];
    const exists = list.some((p) => p.variantId === req.variantId);
    if (!exists) {
      throw new Error(`Variante '${req.variantId}' introuvable pour '${req.assetKey}'.`);
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: {
        ...current.activeVariants,
        [req.assetKey]: req.variantId,
      },
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  if (req.action === "RESET_TO_DEFAULT") {
    const nextActive: Record<string, string> = { ...current.activeVariants };
    const targets = VECTOR_ASSET_ELEMENTS.filter((el) => {
      if (req.targetScope === "ASSET") return el.assetKey === req.assetKey;
      if (req.targetScope === "CATEGORY") return el.category === req.category;
      return true;
    });
    for (const el of targets) {
      const firstId = current.catalog[el.assetKey]?.[0]?.variantId ?? "v1_classic_mk1";
      nextActive[el.assetKey] = firstId;
    }
    const nextState = saveVectorVariantsState({
      ...current,
      revision: current.revision + 1,
      updatedAt: now,
      activeVariants: nextActive,
    });
    return {
      state: nextState,
      newlyCreated,
      summary: summarizeVectorVariantsState(nextState),
    };
  }

  // PROPOSE_NEW_VARIANTS
  const targets = VECTOR_ASSET_ELEMENTS.filter((el) => {
    if (req.targetScope === "ASSET") {
      return el.assetKey === (req.assetKey ?? "BUILDING:CONSTRUCTION_YARD");
    }
    if (req.targetScope === "CATEGORY") {
      return el.category === (req.category ?? "BUILDING");
    }
    return true;
  });

  const nextCatalog: Record<string, VectorVariantProposal[]> = { ...current.catalog };
  const nextActive: Record<string, string> = { ...current.activeVariants };

  for (const descriptor of targets) {
    const existingForAsset = [...(nextCatalog[descriptor.assetKey] ?? [])];
    const maxVersion = existingForAsset.reduce(
      (max, p) => (p.versionNumber > max ? p.versionNumber : max),
      4
    );

    const createdForDescriptor: VectorVariantProposal[] = [];
    for (let i = 0; i < req.count; i += 1) {
      const nextVersionNumber = maxVersion + 1 + i;
      const proposal = synthesizeNewLeonardoVariantProposal({
        descriptor,
        nextVersionNumber,
        styleArchetype: req.styleArchetype,
        directivePrompt: req.directivePrompt,
      });
      existingForAsset.push(proposal);
      createdForDescriptor.push(proposal);
      newlyCreated.push(proposal);
    }

    nextCatalog[descriptor.assetKey] = existingForAsset;

    if (req.autoSelectNewest && createdForDescriptor.length > 0) {
      nextActive[descriptor.assetKey] =
        createdForDescriptor[createdForDescriptor.length - 1]!.variantId;
    }
  }

  const nextState = saveVectorVariantsState({
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    activeVariants: nextActive,
    catalog: nextCatalog,
  });

  return {
    state: nextState,
    newlyCreated,
    summary: summarizeVectorVariantsState(nextState),
  };
}
