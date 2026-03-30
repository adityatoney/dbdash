# Plan: Migrate Golden Queries & Fingerprint Cache to Postgres

## Context

The golden queries (`references/golden-queries.json`) and fingerprint cache (`references/golden-fingerprints.json`) are stored as local JSON files. This breaks in cloud deployments — container filesystems are ephemeral, auto-learned queries are lost on restart, and horizontal scaling means instances can't share learned queries. Moving both to Postgres (which the project already uses) makes caching persistent, shared across instances, and deployment-safe.

---

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/seed_golden_queries.py` | One-time migration: seeds Postgres tables from existing JSON |

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `GoldenQuery` and `GoldenQueryPattern` models |
| `scripts/query_matcher.py` | Replace JSON file I/O with `psycopg2` database queries |
| `scripts/requirements.txt` | Add `psycopg2-binary>=2.9` |
| `package.json` | Add `db:seed-golden` script |

## No Changes Needed

| File | Why |
|------|-----|
| `src/lib/nl-to-sql.ts` | Subprocess interface unchanged — still calls `python3 query_matcher.py match/learn` |
| `.claude/skills/text-to-sql/SKILL.md` | Matching behavior unchanged |

---

## Step 1: Add Prisma Models

Append to `prisma/schema.prisma`:

```prisma
model GoldenQuery {
  id          Int                  @id @default(autoincrement())
  sql         String               @db.Text
  description String               @default("")
  source      String               @default("curated")
  createdAt   DateTime             @default(now()) @map("created_at")

  patterns    GoldenQueryPattern[]

  @@map("golden_queries")
}

model GoldenQueryPattern {
  id             Int          @id @default(autoincrement())
  goldenQueryId  Int          @map("golden_query_id")
  pattern        String
  fingerprint    String[]     @default([])
  createdAt      DateTime     @default(now()) @map("created_at")

  goldenQuery    GoldenQuery  @relation(fields: [goldenQueryId], references: [id], onDelete: Cascade)

  @@index([goldenQueryId])
  @@map("golden_query_patterns")
}
```

- `fingerprint` as `String[]` → Postgres `TEXT[]` — stores pre-computed lemmatized tokens
- `source`: `"curated"` (hand-written) or `"learned"` (auto-learned)
- Cascade delete: removing a golden query removes all its patterns

---

## Step 2: Run Prisma Migration

```bash
npx prisma migrate dev --name add_golden_query_tables
```

---

## Step 3: Create `scripts/seed_golden_queries.py`

- Reads existing `references/golden-queries.json`
- Imports `fingerprint()` from `query_matcher.py` (reuses existing NLTK pipeline)
- For each entry: INSERT into `golden_queries`, then INSERT each pattern with computed fingerprint into `golden_query_patterns`
- Guard: exits if tables already have data (unless `--force` flag)
- Wraps in a single transaction

---

## Step 4: Update `scripts/requirements.txt`

```
nltk>=3.9
psycopg2-binary>=2.9
```

---

## Step 5: Rewrite `scripts/query_matcher.py`

### Remove
- `GOLDEN_QUERIES_PATH`, `FINGERPRINTS_CACHE_PATH` path constants
- `_is_cache_stale()`, `_build_fingerprints()` (file-based staleness)
- `load_fingerprints()` (file-based)
- `fcntl` import and file locking

### Add
- `get_conn()` — connects via `DATABASE_URL` env var (already in `.env`)

### Rewrite `load_fingerprints()`
```python
def load_fingerprints() -> list[dict]:
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT gqp.id, gqp.pattern, gqp.fingerprint, gq.sql, gq.description
            FROM golden_query_patterns gqp
            JOIN golden_queries gq ON gq.id = gqp.golden_query_id
        """)
        return [{"index": r[0], "pattern": r[1], "fingerprint": r[2],
                 "sql": r[3], "description": r[4]} for r in cur.fetchall()]
    conn.close()
```

### Rewrite `cmd_learn()`
- Use Postgres transactions instead of `fcntl` file locking
- Check if SQL exists: `SELECT id FROM golden_queries WHERE regexp_replace(sql, '\s+', ' ', 'g') = %s`
- If exists: append pattern to that query. If not: INSERT new golden query + pattern.
- Compute fingerprint at insert time (no cache invalidation needed)

### Rewrite `cmd_build_fingerprints()`
- SELECT all patterns, compute fingerprint for each, UPDATE the `fingerprint` column

### `cmd_match()` — minimal change
- Replace `GOLDEN_QUERIES_PATH.exists()` check with `load_fingerprints()` returning empty list
- All TF-IDF / cosine similarity logic unchanged

---

## Step 6: Update `package.json`

Add script:
```json
"db:seed-golden": "python3 scripts/seed_golden_queries.py"
```

---

## Step 7: Cleanup (post-verification)

- `references/golden-queries.json` — keep as archive/backup, remove from active use
- `references/golden-fingerprints.json` — delete (no longer generated)
- Remove `references/golden-fingerprints.json` from `.gitignore` (no longer relevant)

---

## Verification

1. **Migration**: `npx prisma migrate dev` → tables created successfully
2. **Seed**: `python3 scripts/seed_golden_queries.py` → all 13 entries with patterns and fingerprints in DB
3. **Match**: `python3 scripts/query_matcher.py match "How many members attended GP events each year?"` → `matched: true, confidence: 1.0`
4. **Fuzzy match**: `python3 scripts/query_matcher.py match "average family size per zone"` → `matched: true, confidence >= 0.85`
5. **No match**: `python3 scripts/query_matcher.py match "What is the capital of France?"` → `matched: false`
6. **Learn**: `python3 scripts/query_matcher.py learn "test question" "SELECT 1"` → row appears in `golden_query_patterns`
7. **Re-match after learn**: `python3 scripts/query_matcher.py match "test question"` → `matched: true, confidence: 1.0`
8. **Web UI end-to-end**: Ask a question in `/dashboard/nl-query` → green "Catalog" badge for known queries, amber "LLM Generated" for novel ones (which then auto-learn)
9. **Verify DB state**: `SELECT COUNT(*) FROM golden_queries; SELECT COUNT(*) FROM golden_query_patterns;`
