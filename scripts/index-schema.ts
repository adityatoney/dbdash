/**
 * index-schema.ts
 *
 * Parses prisma/schema.prisma and generates references/schema-map.json —
 * a lightweight index of tables, columns, relations, and indexes used by
 * the text-to-sql Claude Code skill for progressive schema disclosure.
 *
 * Usage:  npx tsx scripts/index-schema.ts
 *
 * Sync logic: compares SHA-256 of schema.prisma against the checksum stored
 * in the existing schema-map.json.  Skips regeneration when they match.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SCHEMA_PATH = resolve(ROOT, "prisma/schema.prisma");
const OUTPUT_PATH = resolve(ROOT, "references/schema-map.json");

// ---------------------------------------------------------------------------
// Static model descriptions (human-written for table-selection heuristics)
// ---------------------------------------------------------------------------
const MODEL_DESCRIPTIONS: Record<string, string> = {
  Member:
    "Core member records with demographics, contact info, MMS status, and birth details",
  Family: "Family groupings with member count tracking",
  Event:
    "Events with type, zone, date range, GP/virtual flags, Gnanvidhi, demographics, and year",
  EventType: "Event categories such as GP, Retreat, Shibir, etc.",
  Zone: "Geographic zones with associated US state abbreviations",
  Hotel: "Accommodation venues with city, state, and country",
  RoomType: "Canonical room categories with descriptions",
  RoomTypeAlias: "Alias mappings from raw room names to canonical room types",
  EventAttendance:
    "Junction table linking members to events with registration, check-in, age, and gnan tracking",
  RoomBooking:
    "Room bookings linking members, events, hotels, room types, and families with occupancy data",
  GnanRecord: "Gnan ceremony records with member, date, and event linkage",
  MemberAddress:
    "Versioned member addresses with validity dates and current-address flag",
  HotelRoomInventory:
    "Room availability tracking per hotel, room type, event, and date",
  DataQualityLog:
    "ETL audit trail tracking data issues, imputations, and resolutions",
};

// ---------------------------------------------------------------------------
// Types for the output schema map
// ---------------------------------------------------------------------------
interface Column {
  field: string;
  column: string;
  type: string;
  pk: boolean;
  nullable: boolean;
}

interface Relation {
  field: string;
  model: string;
  fk: string;
  references: string;
  type: "belongsTo" | "hasMany";
}

interface Table {
  model: string;
  table: string;
  description: string;
  columns: Column[];
  relations: Relation[];
  indexes: string[][];
}

interface SchemaMap {
  generatedAt: string;
  prismaChecksum: string;
  tables: Table[];
  relationshipGraph: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Checksum helper
// ---------------------------------------------------------------------------
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

// ---------------------------------------------------------------------------
// Staleness check
// ---------------------------------------------------------------------------
function isUpToDate(schemaContent: string): boolean {
  if (!existsSync(OUTPUT_PATH)) return false;
  try {
    const existing: SchemaMap = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
    return existing.prismaChecksum === sha256(schemaContent);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prisma DSL parser
// ---------------------------------------------------------------------------
function parseSchema(content: string): Table[] {
  const lines = content.split("\n");
  const tables: Table[] = [];

  let currentModel: string | null = null;
  let currentColumns: Column[] = [];
  let currentRelations: Relation[] = [];
  let currentIndexes: string[][] = [];
  let currentTableMap: string | null = null;

  // Collect raw relation fields to resolve FKs after the model block
  interface RawRelation {
    fieldName: string;
    targetModel: string;
    fkFields: string[];
    refFields: string[];
    isArray: boolean;
  }
  let rawRelations: RawRelation[] = [];

  // Map from Prisma field name → column info (to look up FK column names)
  let fieldToColumn: Map<string, string> = new Map();

  function flushModel() {
    if (!currentModel) return;

    // Derive table name: @@map value, or lowercase model name + 's' fallback
    const tableName =
      currentTableMap ?? currentModel.charAt(0).toLowerCase() + currentModel.slice(1) + "s";

    // Resolve relations using collected field→column mappings
    for (const raw of rawRelations) {
      if (raw.fkFields.length > 0) {
        // belongsTo: this model holds the FK
        const fkColumn = fieldToColumn.get(raw.fkFields[0]) ?? raw.fkFields[0];
        // The reference field column name needs to be looked up from the target model,
        // but we don't have it yet. Use the Prisma field name as a reasonable default
        // since in this schema FK names typically match.
        currentRelations.push({
          field: raw.fieldName,
          model: raw.targetModel,
          fk: fkColumn,
          references: raw.refFields[0],
          type: "belongsTo",
        });
      } else if (raw.isArray) {
        // hasMany: the other model holds the FK
        currentRelations.push({
          field: raw.fieldName,
          model: raw.targetModel,
          fk: "",
          references: "",
          type: "hasMany",
        });
      }
    }

    tables.push({
      model: currentModel,
      table: tableName,
      description: MODEL_DESCRIPTIONS[currentModel] ?? "",
      columns: currentColumns,
      relations: currentRelations,
      indexes: currentIndexes,
    });

    // Reset
    currentModel = null;
    currentColumns = [];
    currentRelations = [];
    currentIndexes = [];
    currentTableMap = null;
    rawRelations = [];
    fieldToColumn = new Map();
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // --- Model start ---
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      flushModel();
      currentModel = modelMatch[1];
      continue;
    }

    // --- Model end ---
    if (trimmed === "}" && currentModel) {
      flushModel();
      continue;
    }

    if (!currentModel) continue;

    // --- @@map("table_name") ---
    const tableMapMatch = trimmed.match(/@@map\("([^"]+)"\)/);
    if (tableMapMatch) {
      currentTableMap = tableMapMatch[1];
      // Don't continue — this line might also have @@index etc. (unlikely but safe)
    }

    // --- @@index([field1, field2]) ---
    const indexMatch = trimmed.match(/@@index\(\[([^\]]+)\]\)/);
    if (indexMatch) {
      const fields = indexMatch[1].split(",").map((f) => f.trim());
      // Convert Prisma field names to column names
      const cols = fields.map((f) => fieldToColumn.get(f) ?? f);
      currentIndexes.push(cols);
      continue;
    }

    // --- @@unique([field1, field2]) ---
    const uniqueMatch = trimmed.match(/@@unique\(\[([^\]]+)\]\)/);
    if (uniqueMatch) {
      const fields = uniqueMatch[1].split(",").map((f) => f.trim());
      const cols = fields.map((f) => fieldToColumn.get(f) ?? f);
      currentIndexes.push(cols);
      continue;
    }

    // --- Field line ---
    // e.g.:  memberId  Int  @id @map("member_id")
    // e.g.:  family    Family  @relation(fields: [familyId], references: [familyId])
    // e.g.:  bookings  RoomBooking[]
    const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
    if (!fieldMatch) continue;

    const fieldName = fieldMatch[1];
    let fieldType = fieldMatch[2];

    // Skip Prisma directives that aren't fields
    if (fieldName.startsWith("@@")) continue;

    const isArray = fieldType.endsWith("[]");
    const isOptional = fieldType.endsWith("?");
    const baseType = fieldType.replace(/[\[\]?]/g, "");

    // Check if this is a relation field (type is another model — starts with uppercase
    // and is not a Prisma scalar like String, Int, Boolean, DateTime, BigInt, Float, Decimal, Json, Bytes)
    const SCALARS = new Set([
      "String",
      "Int",
      "Boolean",
      "DateTime",
      "BigInt",
      "Float",
      "Decimal",
      "Json",
      "Bytes",
    ]);

    if (!SCALARS.has(baseType) && /^[A-Z]/.test(baseType)) {
      // Relation field
      const relMatch = trimmed.match(
        /@relation\(fields:\s*\[([^\]]+)\],\s*references:\s*\[([^\]]+)\]\)/
      );
      const fkFields = relMatch
        ? relMatch[1].split(",").map((f) => f.trim())
        : [];
      const refFields = relMatch
        ? relMatch[2].split(",").map((f) => f.trim())
        : [];

      rawRelations.push({
        fieldName,
        targetModel: baseType,
        fkFields,
        refFields,
        isArray,
      });
      continue;
    }

    // Scalar field — extract column details
    const isPk = /@id\b/.test(trimmed);
    const mapMatch = trimmed.match(/@map\("([^"]+)"\)/);
    const columnName = mapMatch ? mapMatch[1] : fieldName;

    fieldToColumn.set(fieldName, columnName);

    currentColumns.push({
      field: fieldName,
      column: columnName,
      type: baseType,
      pk: isPk,
      nullable: isOptional,
    });
  }

  // Flush any remaining model
  flushModel();

  return tables;
}

// ---------------------------------------------------------------------------
// Build relationship graph (adjacency list of table names)
// ---------------------------------------------------------------------------
function buildRelationshipGraph(tables: Table[]): Record<string, string[]> {
  // Map model name → table name for lookups
  const modelToTable = new Map<string, string>();
  for (const t of tables) {
    modelToTable.set(t.model, t.table);
  }

  const graph: Record<string, Set<string>> = {};

  for (const t of tables) {
    if (!graph[t.table]) graph[t.table] = new Set();

    for (const rel of t.relations) {
      const targetTable = modelToTable.get(rel.model);
      if (!targetTable) continue;

      graph[t.table].add(targetTable);

      // Bidirectional: add reverse edge too
      if (!graph[targetTable]) graph[targetTable] = new Set();
      graph[targetTable].add(t.table);
    }
  }

  // Convert Sets to sorted arrays
  const result: Record<string, string[]> = {};
  for (const [table, neighbors] of Object.entries(graph)) {
    result[table] = [...neighbors].sort();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const schemaContent = readFileSync(SCHEMA_PATH, "utf-8");

  if (isUpToDate(schemaContent)) {
    console.log("Schema map is up to date.");
    return;
  }

  console.log("Parsing prisma/schema.prisma...");
  const tables = parseSchema(schemaContent);
  const relationshipGraph = buildRelationshipGraph(tables);
  const checksum = sha256(schemaContent);

  const schemaMap: SchemaMap = {
    generatedAt: new Date().toISOString(),
    prismaChecksum: checksum,
    tables,
    relationshipGraph,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(schemaMap, null, 2) + "\n", "utf-8");
  console.log(
    `Generated references/schema-map.json (${tables.length} tables, checksum: ${checksum.slice(0, 12)}...)`
  );
}

main();
