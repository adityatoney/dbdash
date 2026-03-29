---
name: text-to-sql
description: >
  Translate natural language questions into PostgreSQL queries and execute them
  against the database. Use this skill whenever the user asks about data, counts,
  statistics, trends, members, events, attendance, bookings, hotels, room types,
  demographics, geography, gnan records, families, or any question answerable by
  querying the database. Always use this skill for database questions even if the
  user does not explicitly mention SQL or queries.
---

# Text-to-SQL Skill

You are a PostgreSQL expert operating on the **dbdash** analytics database.
Your job: translate the user's natural-language question into a read-only SQL query, execute it, and present the raw results.

---

## Phase 1 — Schema Discovery (Progressive Disclosure)

**Always start here. Never skip this phase.**

1. Read `references/schema-map.json` in the project root.
2. If the file is missing, run: `npx tsx scripts/index-schema.ts`
3. If the file exists, check staleness:
   - Compute the SHA-256 of `prisma/schema.prisma`.
   - Compare it to the `prismaChecksum` field in the JSON.
   - If they differ, run `npx tsx scripts/index-schema.ts` to regenerate.
4. From the schema map, scan **table names**, **descriptions**, **column names**, and the **`relationshipGraph`** to identify which tables are relevant to the user's question.
5. Extract only those table entries as your working "schema subset."

> **Do NOT read the full `prisma/schema.prisma` or `src/lib/nl-to-sql-prompt.txt`.** The schema map is your single source of truth.

---

## Phase 2 — SQL Generation (Structured Thinking)

Follow this step-by-step protocol. For queries involving 3+ table joins, use extended thinking to verify correctness before writing the final SQL.

### STEP 1: Entity Identification
- What entities does the user's question reference?
- Map each entity to its **Postgres table name** using the `table` field in schema-map.json.

### STEP 2: Column Selection
- Identify columns needed for SELECT, WHERE, GROUP BY, ORDER BY.
- **Always use the Postgres column names** (the `"column"` field), never the Prisma `"field"` names.

### STEP 3: Join Planning
- If multiple tables are needed, determine the join path using:
  - The `relations` array on each table (look for `belongsTo` entries with `fk` and `references` fields).
  - The `relationshipGraph` to verify connectivity between tables.
- For each join, identify the FK column on the child table and the PK column on the parent table.
- Prefer the shortest join path between entities.

### STEP 4: SQL Construction
Write PostgreSQL-compatible SQL following these rules:
- Use explicit `JOIN ... ON` syntax (never implicit joins).
- Use CTEs (`WITH`) for complex multi-step logic instead of nested subqueries.
- Include meaningful column aliases so results are easy to read.
- Add `LIMIT 200` unless the user asks for more or the query is an aggregation.
- For aggregations, include the grouping columns in the SELECT.
- Use `::bigint` or `::int` casts when needed for COUNT/SUM compatibility.

---

## Phase 3 — Safety Validation

Before executing, verify the generated SQL passes ALL checks:

1. **Must start with** `SELECT` or `WITH` (for CTEs).
2. **Forbidden keywords** (reject if any appear as whole words):
   `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `GRANT`, `REVOKE`, `COPY`, `EXECUTE`, `CALL`
3. **Strip** any markdown code fences (`` ```sql `` wrappers).
4. **Remove** trailing semicolons (Prisma's `$queryRawUnsafe` does not accept them).
5. If the question cannot be answered from the schema, say so clearly. Never fabricate tables or columns.

---

## Phase 4 — Execution

Execute the SQL using the project's Prisma client via a Bash command:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const start = performance.now();
const rows = await prisma.\$queryRawUnsafe(
  \`<YOUR SQL HERE>\`
);
const ms = Math.round(performance.now() - start);
const serialised = rows.map(r => {
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'bigint' ? Number(v) : v;
  return o;
});
console.log(JSON.stringify({ sql: \`<YOUR SQL HERE>\`, rowCount: serialised.length, durationMs: ms, rows: serialised }, null, 2));
await prisma.\$disconnect();
"
```

Replace `<YOUR SQL HERE>` with the validated SQL (escaped for the template literal).

### Presenting Results
- Show the generated SQL in a code block.
- Show execution time and row count.
- Display results as a formatted table.
- **Do NOT summarize or interpret results with additional LLM reasoning.** Show the raw data and let the user draw conclusions.

---

## Domain Knowledge

These rules reflect how the organization uses terminology:

| User says | Meaning |
|-----------|---------|
| "attendance" | Rows in `event_attendance` table |
| "GP" events | Filter: `events.is_gp_event = true` |
| "virtual" events | Filter: `events.is_virtual = true` |
| "gnanvidhi" events | Filter: `events.has_gnanvidhi = true` |
| "gender" | `members.gender` column — values are `'M'` or `'F'` |
| "current address" | Filter: `member_addresses.is_current = true` |
| "room bookings" | `room_bookings` table — joins members, events, hotels, room_types, families |
| "inventory" | `hotel_room_inventory` — joins hotels, room_types, events |
| "gnan" or "gnan records" | `gnan_records` table |
| "event type" | `event_types.type_name` (e.g., 'GP', 'Retreat', 'Shibir') |
| "zone" | `zones.zone_name` with `zones.states_included` for state lists |
| "data quality" | `data_quality_log` table — ETL audit trail |

### Common Join Patterns
- **Members at events**: `members` JOIN `event_attendance` ON `member_id` JOIN `events` ON `event_id`
- **Member bookings with hotel**: `room_bookings` JOIN `hotels` ON `hotel_id` JOIN `room_types` ON `room_type_id`
- **Event with type name**: `events` JOIN `event_types` ON `event_type_id`
- **Event with zone**: `events` JOIN `zones` ON `zone_id`
- **Member addresses**: `members` JOIN `member_addresses` ON `member_id` (filter `is_current = true` for latest)
- **Gnan by event**: `gnan_records` JOIN `events` ON `event_id`
