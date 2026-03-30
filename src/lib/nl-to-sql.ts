import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./prisma";

/** Resolve the project root (directory containing package.json). */
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Path to the NLTK-powered query matcher script. */
const QUERY_MATCHER = resolve(PROJECT_ROOT, "scripts/query_matcher.py");

// ---------------------------------------------------------------------------
// NLTK-powered golden query matching (replaces JS Jaccard matching)
// ---------------------------------------------------------------------------

/**
 * Match a question against the golden query catalog using NLTK
 * (lemmatized TF-IDF cosine similarity, threshold >= 0.85).
 *
 * Shells out to `scripts/query_matcher.py match "<question>"`.
 * Gracefully returns null on any failure (Python not found, timeout, etc.)
 * so the pipeline falls through to cache/LLM.
 */
function matchGoldenQueryNLTK(
  question: string
): Promise<{ sql: string; confidence: number } | null> {
  return new Promise((resolve) => {
    const child = spawn("python3", [QUERY_MATCHER, "match", question], {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        if (result.matched) {
          resolve({ sql: result.sql, confidence: result.confidence });
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });

    child.on("error", () => resolve(null));
  });
}

/**
 * After LLM generates SQL, auto-learn it by appending the question+SQL pair
 * to golden-queries.json.  Fire-and-forget — does not block the response.
 */
function learnGoldenQuery(question: string, sql: string): void {
  const child = spawn("python3", [QUERY_MATCHER, "learn", question, sql], {
    cwd: PROJECT_ROOT,
    stdio: "ignore",
    timeout: 5_000,
  });
  // Silently ignore learn failures
  child.on("error", () => {});
}

// ---------------------------------------------------------------------------
// LLM-generated query cache — same question always returns the same SQL
// ---------------------------------------------------------------------------

const queryCache = new Map<string, string>();

/**
 * Minimal normalisation for cache-key purposes only.
 * (NLP-quality normalisation is handled by NLTK in the Python matcher.)
 */
function normaliseCacheKey(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

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
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
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
 * generation rules.  Loaded by Claude CLI via --append-system-prompt-file.
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
 *   1. NLTK golden query match  (lemmatized TF-IDF cosine >= 0.85)
 *   2. In-memory cache           (repeat questions return identical SQL)
 *   3. Claude CLI generation     (LLM fallback, result cached + auto-learned)
 */
export async function executeNLQuery(question: string): Promise<NLQueryResult> {
  const cacheKey = normaliseCacheKey(question);
  let sql: string;
  let source: NLQueryResult["source"];

  // ---- Layer 1: NLTK golden query matching ----
  const golden = await matchGoldenQueryNLTK(question);
  if (golden) {
    sql = golden.sql;
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

    // Auto-learn: append question+SQL to golden queries for future matching
    learnGoldenQuery(question, sql);

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
  let sql = raw.replace(/^```(?:sql)?\s*/i, "").replace(/\s*```$/i, "");
  sql = sql.trim();

  if (!sql) {
    throw new Error("Claude returned an empty response — could not generate SQL.");
  }

  if (!/^(SELECT|WITH)\s/i.test(sql)) {
    throw new Error(
      `Generated SQL does not start with SELECT or WITH. Got: "${sql.slice(0, 80)}..."`
    );
  }

  const upper = sql.toUpperCase();
  for (const kw of FORBIDDEN_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(upper)) {
      throw new Error(`Generated SQL contains forbidden keyword: ${kw}`);
    }
  }

  sql = sql.replace(/;\s*$/, "");
  return sql;
}

/**
 * Lightly format SQL for readable display.  If the SQL already contains
 * newlines (e.g. from golden queries) it is returned as-is.  Single-line
 * LLM output gets keyword-based line breaks inserted.
 */
function formatSQL(sql: string): string {
  if (sql.includes("\n")) return sql;

  const keywords = [
    "SELECT", "FROM", "JOIN", "LEFT JOIN", "RIGHT JOIN", "INNER JOIN",
    "OUTER JOIN", "CROSS JOIN", "FULL JOIN", "LEFT OUTER JOIN",
    "WHERE", "AND", "OR", "GROUP BY", "HAVING", "ORDER BY",
    "LIMIT", "OFFSET", "UNION", "UNION ALL", "EXCEPT", "INTERSECT",
  ];

  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  let result = sql;
  for (const kw of sorted) {
    const re = new RegExp(`\\s+(${kw.replace(/ /g, "\\s+")})\\b`, "gi");
    result = result.replace(re, `\n$1`);
  }

  return result.trim();
}
