import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma";

/** Resolve the project root (directory containing package.json). */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ---------------------------------------------------------------------------
// Golden query catalog — deterministic SQL for known question patterns
// ---------------------------------------------------------------------------

interface GoldenQuery {
  patterns: string[];
  sql: string;
  description: string;
}

let goldenQueries: GoldenQuery[] | null = null;
let goldenQueriesLoadedAt = 0;

/** Cache TTL: reload golden queries every 30s in dev, never in prod. */
const GOLDEN_CACHE_TTL_MS =
  process.env.NODE_ENV === "production" ? Infinity : 30_000;

function loadGoldenQueries(): GoldenQuery[] {
  const now = Date.now();
  if (goldenQueries && now - goldenQueriesLoadedAt < GOLDEN_CACHE_TTL_MS) {
    return goldenQueries;
  }
  try {
    const raw = readFileSync(
      resolve(PROJECT_ROOT, "references/golden-queries.json"),
      "utf-8"
    );
    goldenQueries = JSON.parse(raw) as GoldenQuery[];
    goldenQueriesLoadedAt = now;
  } catch {
    goldenQueries = [];
    goldenQueriesLoadedAt = now;
  }
  return goldenQueries;
}

/** Stop words to strip before comparing questions. */
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "have", "has", "had", "will", "would", "shall",
  "should", "may", "might", "can", "could", "must", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "about",
  "and", "but", "or", "not", "no", "so", "if", "then", "than",
  "it", "its", "this", "that", "these", "those", "i", "me", "my",
  "we", "our", "you", "your", "he", "she", "they", "them", "their",
  "what", "which", "who", "whom", "how", "when", "where", "why",
  "show", "give", "list", "get", "find", "tell", "display", "see",
  "please", "just", "also", "very", "really", "quite",
]);

/**
 * Normalise a question for comparison: lowercase, strip punctuation,
 * collapse whitespace.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract keywords from normalised text (removes stop words).
 */
function keywords(text: string): Set<string> {
  return new Set(text.split(" ").filter((w) => w.length > 1 && !STOP_WORDS.has(w)));
}

/**
 * Compute word-overlap similarity (Jaccard index on keywords) between two
 * normalised strings.  Returns 0–1.
 */
function similarity(a: string, b: string): number {
  const setA = keywords(a);
  const setB = keywords(b);
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Similarity threshold for fuzzy matching against golden queries. */
const FUZZY_THRESHOLD = 0.55;

/**
 * Try to match a question against the golden query catalog.
 * Returns the SQL string if matched, or null to fall through to the LLM.
 */
function matchGoldenQuery(question: string): string | null {
  const catalog = loadGoldenQueries();
  const norm = normalise(question);

  // Pass 1: exact match (after normalisation)
  for (const entry of catalog) {
    for (const pattern of entry.patterns) {
      if (normalise(pattern) === norm) {
        return entry.sql;
      }
    }
  }

  // Pass 2: fuzzy match — pick the best scoring entry above threshold
  let bestScore = 0;
  let bestSQL: string | null = null;

  for (const entry of catalog) {
    for (const pattern of entry.patterns) {
      const score = similarity(norm, normalise(pattern));
      if (score > bestScore) {
        bestScore = score;
        bestSQL = entry.sql;
      }
    }
  }

  return bestScore >= FUZZY_THRESHOLD ? bestSQL : null;
}

// ---------------------------------------------------------------------------
// LLM-generated query cache — same question always returns the same SQL
// ---------------------------------------------------------------------------

const queryCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Claude CLI runner
// ---------------------------------------------------------------------------

/**
 * Run `claude` CLI and return its stdout.  We use spawn (not execFile) so we
 * can explicitly close stdin — preventing the "no stdin data received" warning.
 */
function runClaude(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: PROJECT_ROOT,                    // run in project root
      stdio: ["ignore", "pipe", "pipe"],   // close stdin, capture stdout/stderr
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 60_000,
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      if (code === 0) {
        resolve(stdout);
      } else {
        const stderr = Buffer.concat(errChunks).toString("utf-8");
        reject(new Error(stderr || stdout || `claude exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Path to the system prompt file containing the full DDL schema and SQL
 * generation rules.  Loaded by Claude CLI via --append-system-prompt-file
 * so we never pass the large prompt as a CLI argument.
 */
const PROMPT_FILE = resolve(process.cwd(), "src/lib/nl-to-sql-prompt.txt");

/** Minimal type for the structured result we return */
export interface NLQueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  source: "golden" | "cache" | "llm";
}

/**
 * Translate a natural-language question into SQL, execute it against the
 * database, and return the raw rows.
 *
 * Resolution order (most → least deterministic):
 *   1. Golden query catalog  (exact or fuzzy match — zero LLM variance)
 *   2. In-memory cache        (repeat questions return identical SQL)
 *   3. Claude CLI generation  (LLM fallback, result cached for future)
 */
export async function executeNLQuery(question: string): Promise<NLQueryResult> {
  const cacheKey = normalise(question);
  let sql: string;
  let source: NLQueryResult["source"];

  // ---- Layer 1: Golden query catalog ----
  const golden = matchGoldenQuery(question);
  if (golden) {
    sql = golden;
    source = "golden";
  }
  // ---- Layer 2: In-memory cache ----
  else if (queryCache.has(cacheKey)) {
    sql = queryCache.get(cacheKey)!;
    source = "cache";
  }
  // ---- Layer 3: LLM generation via Claude CLI ----
  else {
    const stdout = await runClaude([
      "-p", question,
      "--append-system-prompt-file", PROMPT_FILE,
      "--output-format", "json",
      "--model", "sonnet",
      "--max-turns", "1",
      "--tools", "",
    ]);

    const envelope = JSON.parse(stdout) as { result?: string };
    const rawSQL = (envelope.result ?? "").trim();
    sql = sanitiseSQL(rawSQL);

    // Cache for future identical questions
    queryCache.set(cacheKey, sql);
    source = "llm";
  }

  // ---- Format SQL for display ----
  sql = formatSQL(sql);

  // ---- Execute against Postgres ----
  const start = performance.now();
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql);
  const durationMs = Math.round(performance.now() - start);

  // Serialise BigInt values → number (Prisma returns bigint for COUNT etc.)
  const serialised = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "bigint" ? Number(v) : v;
    }
    return out;
  });

  return { sql, rows: serialised, rowCount: serialised.length, durationMs, source };
}

// ---------------------------------------------------------------------------
// Safety helpers
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYWORDS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "ALTER",
  "TRUNCATE",
  "CREATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "EXECUTE",
  "CALL",
];

/**
 * Strip markdown fences if present, then reject anything that isn't a
 * read-only SELECT / WITH ... SELECT.
 */
function sanitiseSQL(raw: string): string {
  // Strip ```sql ... ``` wrappers the model might add despite instructions
  let sql = raw.replace(/^```(?:sql)?\s*/i, "").replace(/\s*```$/i, "");
  sql = sql.trim();

  if (!sql) {
    throw new Error("Claude returned an empty response — could not generate SQL.");
  }

  // Must start with SELECT or WITH (for CTEs)
  if (!/^(SELECT|WITH)\s/i.test(sql)) {
    throw new Error(
      `Generated SQL does not start with SELECT or WITH. Got: "${sql.slice(0, 80)}..."`
    );
  }

  // Reject forbidden keywords (word-boundary match to avoid false positives)
  const upper = sql.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      throw new Error(`Generated SQL contains forbidden keyword: ${kw}`);
    }
  }

  // Strip trailing semicolon (Prisma's $queryRawUnsafe doesn't want it)
  sql = sql.replace(/;\s*$/, "");

  return sql;
}

/**
 * Lightly format SQL for readable display.  If the SQL already contains
 * newlines (e.g. from golden queries) it is returned as-is.  Single-line
 * LLM output gets keyword-based line breaks inserted.
 */
function formatSQL(sql: string): string {
  // Already formatted — leave it alone
  if (sql.includes("\n")) return sql;

  // Insert newlines before major SQL keywords (case-insensitive, word-boundary)
  const keywords = [
    "SELECT", "FROM", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
    "OUTER JOIN", "CROSS JOIN", "FULL JOIN", "LEFT OUTER JOIN",
    "WHERE", "AND", "OR", "GROUP BY", "HAVING", "ORDER BY",
    "LIMIT", "OFFSET", "UNION", "UNION ALL", "EXCEPT", "INTERSECT",
  ];

  // Sort longest-first so "LEFT JOIN" matches before "JOIN"
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  let result = sql;
  for (const kw of sorted) {
    // Match the keyword preceded by a space (not at start-of-string for SELECT)
    const re = new RegExp(`\\s+(${kw.replace(/ /g, "\\s+")})\\b`, "gi");
    result = result.replace(re, `\n$1`);
  }

  return result.trim();
}
