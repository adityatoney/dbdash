# Plan: Text-to-SQL Claude Code Skill

## Context

The project currently uses a subprocess approach (`claude -p`) in `src/lib/nl-to-sql.ts` to generate SQL from natural language. This inlines the entire 165-line DDL schema into every call. We're building a Claude Code **custom skill** that replaces this with progressive schema disclosure, structured thinking, and direct execution — eliminating subprocess overhead when using Claude Code interactively.

The existing `nl-to-sql.ts` + API route remain untouched (they serve the web UI). The skill is a parallel pathway for Claude Code terminal/editor sessions.

---

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/index-schema.ts` | Parses `prisma/schema.prisma` → `references/schema-map.json` |
| `references/schema-map.json` | Generated artifact — lightweight schema index |
| `.claude/skills/text-to-sql/SKILL.md` | Skill definition with progressive disclosure workflow |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `"schema:index": "npx tsx scripts/index-schema.ts"` script |

---

## Step 1: Create `scripts/index-schema.ts`

Parse `prisma/schema.prisma` using regex-based line processing (no new dependencies — only `fs`, `path`, `crypto` from Node builtins, run via `npx tsx`).

**Extraction targets per model:**
- Model name (`model Foo`) + table name (`@@map("foos")`)
- Fields: name, `@map` column name, type, `@id`, nullable (`?`), defaults
- Relations: `@relation(fields: [...], references: [...])` → FK field, target model, ref field, classify as `belongsTo` vs `hasMany`
- Indexes: `@@index([...])`, `@@unique([...])`

**Output structure** (`references/schema-map.json`):
```json
{
  "generatedAt": "ISO timestamp",
  "prismaChecksum": "sha256 of schema.prisma",
  "tables": [
    {
      "model": "Member",
      "table": "members",
      "description": "Core member records with demographics and contact info",
      "columns": [
        { "field": "memberId", "column": "member_id", "type": "Int", "pk": true, "nullable": false }
      ],
      "relations": [
        { "field": "family", "model": "Family", "fk": "family_id", "references": "family_id", "type": "belongsTo" }
      ],
      "indexes": [["family_id"]]
    }
  ],
  "relationshipGraph": {
    "members": ["families", "event_attendance", "room_bookings", "gnan_records", "member_addresses"],
    "events": ["event_types", "zones", "event_attendance", "room_bookings", "gnan_records", "hotel_room_inventory"]
  }
}
```

- Include a static `description` map for all 14 models (human-written one-liners for table-selection heuristics)
- `relationshipGraph`: adjacency list derived from relations — helps Claude find join paths

**Sync logic:** Compare SHA-256 of current `schema.prisma` against stored `prismaChecksum`. Skip regeneration if match. Exit early with "Schema map is up to date".

---

## Step 2: Create `.claude/skills/text-to-sql/SKILL.md`

### Frontmatter
```yaml
---
name: text-to-sql
description: >
  Translate natural language questions into PostgreSQL queries and execute them.
  Use this skill whenever the user asks about data, counts, statistics, trends,
  members, events, attendance, bookings, hotels, demographics, or any question
  answerable by querying the database. Always use this skill for database questions
  even if the user doesn't explicitly mention SQL.
---
```

### Body Sections

**1. Progressive Schema Discovery**
- FIRST read `references/schema-map.json` (never the full schema or prompt file)
- If file missing or `prismaChecksum` stale vs `prisma/schema.prisma`, run `npx tsx scripts/index-schema.ts`
- From the user's question, identify relevant tables by scanning table names, descriptions, column names, and the `relationshipGraph`
- Extract only the relevant table entries as the "schema subset"

**2. SQL Generation Thinking Protocol**
```
STEP 1 - Entity Identification:
  Map user entities to table names via schema-map.json

STEP 2 - Column Selection:
  Use POSTGRES column names (the "column" field), not Prisma field names

STEP 3 - Join Planning:
  Use relationshipGraph to find join paths
  For 3+ table joins: use extended thinking to verify the chain

STEP 4 - SQL Construction:
  PostgreSQL-compatible, CTEs for complex logic, LIMIT 200 default,
  explicit JOIN...ON syntax, meaningful aliases
```

**3. Execution**
- Write a small inline script that imports `prisma` from `src/lib/prisma.ts` and runs `$queryRawUnsafe(sql)`
- Convert BigInt → Number for display
- Present: generated SQL + raw result table + row count + duration
- Do NOT summarize results with LLM — show raw data

**4. Safety Rules** (ported from existing `sanitiseSQL` in `src/lib/nl-to-sql.ts`)
- Only SELECT or WITH...SELECT
- Forbidden: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, EXECUTE, CALL
- Strip markdown fences, trailing semicolons

**5. Domain Rules** (ported from `src/lib/nl-to-sql-prompt.txt` lines 167-175)
- "attendance" → `event_attendance` table
- "GP" events → `events.is_gp_event = true`
- Gender: `'M'` or `'F'`
- Current addresses: `member_addresses.is_current = true`
- Key junction tables: `room_bookings`, `event_attendance`, `hotel_room_inventory`

---

## Step 3: Update `package.json`

Add to `scripts`:
```json
"schema:index": "npx tsx scripts/index-schema.ts"
```

---

## Existing Code to Reuse

| What | Where | How |
|------|-------|-----|
| Prisma singleton | `src/lib/prisma.ts` | Import in execution scripts |
| `sanitiseSQL()` logic | `src/lib/nl-to-sql.ts` (lines 124-153) | Port safety rules into SKILL.md |
| Domain rules | `src/lib/nl-to-sql-prompt.txt` (lines 167-175) | Port into SKILL.md domain section |
| `NLQueryResult` type | `src/lib/nl-to-sql.ts` (lines 53-58) | Reference for output shape |

---

## Verification

1. **Run indexer**: `npx tsx scripts/index-schema.ts` → verify `references/schema-map.json` contains all 14 models with correct table names, columns, relations, indexes
2. **Idempotency**: Run indexer again → should print "up to date" and exit without rewriting
3. **Staleness detection**: Edit `schema.prisma` trivially (add a comment) → re-run indexer → should regenerate
4. **Skill trigger**: Open Claude Code in project root, ask "How many members attended GP events in 2024?" → verify skill triggers, reads schema-map, generates SQL, executes, shows raw results
5. **Progressive disclosure**: Confirm Claude reads schema-map.json first (not full schema.prisma), identifies only relevant tables (members, event_attendance, events), then generates SQL using only those
6. **Safety**: Ask "Delete all members" → verify refusal / forbidden keyword detection
