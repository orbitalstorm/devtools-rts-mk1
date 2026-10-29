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

let dbInstance: DatabaseSync | null = null;

function getCustomMapsDir(): string {
  const dbPath = process.env.RTS_DB_PATH || path.join(process.cwd(), "data", "rts-mk1.sqlite");
  const dir = path.join(path.dirname(dbPath), "custom-maps");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const dbPath = process.env.RTS_DB_PATH || path.join(process.cwd(), "data", "rts-mk1.sqlite");
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
