# Plan: NLTK-Powered Query Matcher

## Context

The current NL-to-SQL pipeline in `src/lib/nl-to-sql.ts` uses naive JavaScript-based matching (hardcoded stop words, Jaccard similarity on raw tokens, 0.55 threshold). This produces unreliable fuzzy matches and misses legitimate paraphrases. We're replacing it with an NLTK-powered Python matcher that uses proper NLP preprocessing (tokenization, stopword removal, lemmatization) and TF-IDF cosine similarity with a 0.85 confidence threshold. Additionally, when the LLM fallback generates SQL, the system auto-learns by appending the new question+SQL to the golden query catalog.

---

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/query_matcher.py` | NLTK matcher: `match` and `learn` commands |
| `scripts/requirements.txt` | Python dependency: `nltk` |

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/nl-to-sql.ts` | Replace JS matching with Python subprocess calls, add auto-learn after LLM |
| `.claude/skills/text-to-sql/SKILL.md` | Document auto-learning loop |
| `package.json` | Add `nltk:setup` script |
| `.gitignore` | Exclude `references/golden-fingerprints.json` and `scripts/.nltk_data/` |

## Generated Artifacts (not committed)

| File | Purpose |
|------|---------|
| `references/golden-fingerprints.json` | Pre-computed lemmatized fingerprints cache |
| `scripts/.nltk_data/` | Local NLTK data (punkt, stopwords, wordnet, tagger) |

---

## Step 1: Create `scripts/requirements.txt`

```
nltk>=3.9
```

Separate from `etl/requirements.txt` (which serves the ETL pipeline).

---

## Step 2: Create `scripts/query_matcher.py`

~200 lines. Three commands via CLI args: `match`, `learn`, `build-fingerprints`.

### NLTK Bootstrap
- On import, set `NLTK_DATA` env to `scripts/.nltk_data/` (project-local, not system)
- Auto-download `punkt_tab`, `stopwords`, `wordnet`, `averaged_perceptron_tagger_eng` if missing
- Silent downloads (no user-facing output unless error)

### `fingerprint(text) -> list[str]`
```python
tokens = word_tokenize(text.lower())
tokens = [t for t in tokens if t.isalnum()]          # strip punctuation
tokens = [t for t in tokens if t not in stop_words]   # NLTK stopwords
tagged = pos_tag(tokens)                               # POS for lemmatizer
lemmas = [lemmatizer.lemmatize(w, wordnet_pos(tag)) for w, tag in tagged]
return sorted(set(lemmas))
```

### Fingerprint Cache (`references/golden-fingerprints.json`)
- Staleness: compare `mtime` of `golden-queries.json` vs fingerprints cache
- If stale or missing: rebuild by fingerprinting every pattern in every golden query entry
- Flattened structure — each pattern gets its own entry with index back to parent:
```json
{
  "built_at": "ISO",
  "entries": [
    {"index": 0, "pattern": "...", "fingerprint": ["attend","event","gp"], "sql": "SELECT ..."}
  ]
}
```

### TF-IDF Cosine Similarity (no sklearn dependency)
- Build corpus from all cached fingerprints + the query fingerprint
- Compute TF (term freq per doc) and IDF (log(N/df)) manually using `collections.Counter`
- Cosine similarity between query vector and each pattern vector
- Return best match above **0.85 threshold**

Why TF-IDF over Jaccard: at 0.85, Jaccard is extremely strict (requires near-identical word sets). TF-IDF gives higher weight to domain terms like "gnan", "gp", "utilization" and lower weight to "count", "total" — much better discrimination.

### `match` Command
```bash
python3 scripts/query_matcher.py match "How many members went to GP events by year?"
```
Output (JSON to stdout):
```json
{"matched": true, "sql": "SELECT ...", "confidence": 0.92, "description": "...", "pattern": "..."}
```
or:
```json
{"matched": false, "confidence": 0.71, "best_pattern": "..."}
```

### `learn` Command
```bash
python3 scripts/query_matcher.py learn "question text" "SELECT ..."
```
- Load `references/golden-queries.json`
- If SQL already exists in an entry (normalized whitespace comparison): append question to that entry's `patterns[]`
- Otherwise: create new entry with `patterns: [question]`, `sql`, `description: "Auto-learned query"`, `source: "learned"`
- Write back pretty-printed JSON
- Delete `references/golden-fingerprints.json` to force rebuild on next match
- Use `fcntl.flock` for file locking (prevents races from concurrent learns)

---

## Step 3: Modify `src/lib/nl-to-sql.ts`

### Remove (JS matching logic, ~100 lines):
- `goldenQueries`, `goldenQueriesLoadedAt`, `GOLDEN_CACHE_TTL_MS`
- `loadGoldenQueries()`
- `STOP_WORDS` set
- `normalise()` (keep a minimal version for cache key only)
- `keywords()`, `similarity()`, `FUZZY_THRESHOLD`
- `matchGoldenQuery()`

### Add: `matchGoldenQueryNLTK(question: string): Promise<{sql: string; confidence: number} | null>`
- Spawns `python3 scripts/query_matcher.py match "<question>"`
- Timeout: 10s
- Graceful degradation: if Python fails, resolve `null` (falls through to cache/LLM)
- Parses JSON stdout for `matched`, `sql`, `confidence`

### Add: `learnGoldenQuery(question: string, sql: string): void`
- Fire-and-forget (non-blocking, no await)
- Spawns `python3 scripts/query_matcher.py learn "<question>" "<sql>"`
- Silently ignores errors

### Modify `executeNLQuery()` orchestration:
```
Layer 1: const golden = await matchGoldenQueryNLTK(question)  → source: "golden"
Layer 2: queryCache.has(cacheKey)                               → source: "cache"
Layer 3: runClaude(...)                                         → source: "llm"
         + learnGoldenQuery(question, sql)  ← NEW: auto-learn after LLM success
```

### Keep unchanged:
- `runClaude()`, `sanitiseSQL()`, `formatSQL()` — all reused as-is
- `NLQueryResult` interface (same shape)
- `queryCache` in-memory Map

---

## Step 4: Update `package.json`

Add to `scripts`:
```json
"nltk:setup": "pip install -r scripts/requirements.txt && python3 -c \"import nltk; import os; d='scripts/.nltk_data'; os.makedirs(d,exist_ok=True); [nltk.download(p,download_dir=d) for p in ['punkt_tab','stopwords','wordnet','averaged_perceptron_tagger_eng']]\""
```

---

## Step 5: Update `.gitignore`

Add:
```
references/golden-fingerprints.json
scripts/.nltk_data/
```

---

## Step 6: Update `.claude/skills/text-to-sql/SKILL.md`

Append an **Auto-Learning** section documenting:
- After LLM generates SQL, the question+SQL pair is auto-appended to golden-queries.json
- Future similar questions are matched via NLTK (lemmatized TF-IDF cosine, threshold ≥ 0.85)
- Learned entries have `"source": "learned"` for easy identification/pruning

---

## Existing Code to Reuse

| What | Where | Reuse |
|------|-------|-------|
| `runClaude()` | `src/lib/nl-to-sql.ts` | Unchanged — LLM fallback subprocess |
| `sanitiseSQL()` | `src/lib/nl-to-sql.ts` | Unchanged — safety validation |
| `formatSQL()` | `src/lib/nl-to-sql.ts` | Unchanged — display formatting |
| `queryCache` | `src/lib/nl-to-sql.ts` | Unchanged — in-memory LLM cache |
| Golden queries | `references/golden-queries.json` | Same format, now auto-grows |
| Python patterns | `etl/seed.py` | Reference for project's Python conventions |

---

## Verification

1. **NLTK setup**: `npm run nltk:setup` → downloads NLTK data to `scripts/.nltk_data/`
2. **Exact match**: `python3 scripts/query_matcher.py match "How many members attended GP events each year?"` → confidence ~1.0, matched: true
3. **Fuzzy match**: `python3 scripts/query_matcher.py match "members who went to GP events by year"` → confidence ≥ 0.85, matched: true, returns same SQL
4. **No match**: `python3 scripts/query_matcher.py match "What is the capital of France?"` → matched: false
5. **Learn**: `python3 scripts/query_matcher.py learn "test question" "SELECT 1"` → appended to golden-queries.json, fingerprints cache deleted
6. **End-to-end via UI**: Ask a novel question → see "LLM Generated" badge → ask the same question again → see "Catalog" badge (auto-learned)
7. **Graceful degradation**: Rename `query_matcher.py` temporarily → queries still work via LLM fallback (Python failure doesn't crash the app)
