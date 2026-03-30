#!/usr/bin/env python3
"""
NLTK-powered query matcher for the NL-to-SQL pipeline.

Commands:
  match <question>         Match against golden queries (JSON to stdout)
  learn <question> <sql>   Append a new question+SQL to the database
  build-fingerprints       Recompute fingerprints for all patterns in the DB

Uses lemmatized TF-IDF cosine similarity with a 0.85 confidence threshold.
Golden queries and fingerprints are stored in Postgres (golden_queries and
golden_query_patterns tables).
"""

import sys
import os
import json
import math
from pathlib import Path
from collections import Counter

import psycopg2

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
NLTK_DATA_DIR = str(SCRIPT_DIR / ".nltk_data")

# ---------------------------------------------------------------------------
# NLTK bootstrap — project-local data, silent download
# ---------------------------------------------------------------------------
os.environ["NLTK_DATA"] = NLTK_DATA_DIR

import nltk  # noqa: E402

REQUIRED_PACKAGES = [
    "punkt_tab",
    "stopwords",
    "wordnet",
    "averaged_perceptron_tagger_eng",
]


def ensure_nltk_data():
    """Download required NLTK data if missing."""
    os.makedirs(NLTK_DATA_DIR, exist_ok=True)
    for pkg in REQUIRED_PACKAGES:
        try:
            nltk.data.find(f"tokenizers/{pkg}" if "punkt" in pkg else pkg)
        except LookupError:
            nltk.download(pkg, download_dir=NLTK_DATA_DIR, quiet=True)


ensure_nltk_data()

from nltk.tokenize import word_tokenize  # noqa: E402
from nltk.corpus import stopwords, wordnet  # noqa: E402
from nltk.stem import WordNetLemmatizer  # noqa: E402
from nltk import pos_tag  # noqa: E402

STOP_WORDS = set(stopwords.words("english"))
LEMMATIZER = WordNetLemmatizer()

CONFIDENCE_THRESHOLD = 0.85

# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------


def get_conn():
    """Connect to Postgres using DATABASE_URL from environment or .env file."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        env_path = PROJECT_ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    if not url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url)


# ---------------------------------------------------------------------------
# NLP helpers
# ---------------------------------------------------------------------------


def _wordnet_pos(treebank_tag: str) -> str:
    """Convert Penn Treebank POS tag to WordNet POS."""
    if treebank_tag.startswith("J"):
        return wordnet.ADJ
    elif treebank_tag.startswith("V"):
        return wordnet.VERB
    elif treebank_tag.startswith("R"):
        return wordnet.ADV
    return wordnet.NOUN


def fingerprint(text: str) -> list[str]:
    """
    Compute a lemmatized token fingerprint for a piece of text.
    Returns a sorted list of unique lemmas (deterministic for caching).
    """
    tokens = word_tokenize(text.lower())
    tokens = [t for t in tokens if t.isalnum()]
    tokens = [t for t in tokens if t not in STOP_WORDS]
    if not tokens:
        return []
    tagged = pos_tag(tokens)
    lemmas = [LEMMATIZER.lemmatize(w, _wordnet_pos(tag)) for w, tag in tagged]
    return sorted(set(lemmas))


# ---------------------------------------------------------------------------
# Load fingerprints from Postgres
# ---------------------------------------------------------------------------


def load_fingerprints() -> list[dict]:
    """Load all pattern fingerprints from the database."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT gqp.id, gqp.pattern, gqp.fingerprint, gq.sql, gq.description
                FROM golden_query_patterns gqp
                JOIN golden_queries gq ON gq.id = gqp.golden_query_id
            """)
            return [
                {
                    "index": r[0],
                    "pattern": r[1],
                    "fingerprint": r[2],
                    "sql": r[3],
                    "description": r[4],
                }
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# TF-IDF cosine similarity (no sklearn dependency)
# ---------------------------------------------------------------------------


def _cosine_similarity(vec_a: dict[str, float], vec_b: dict[str, float]) -> float:
    """Cosine similarity between two sparse vectors (dicts)."""
    common_keys = set(vec_a.keys()) & set(vec_b.keys())
    if not common_keys:
        return 0.0

    dot = sum(vec_a[k] * vec_b[k] for k in common_keys)
    mag_a = math.sqrt(sum(v * v for v in vec_a.values()))
    mag_b = math.sqrt(sum(v * v for v in vec_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def compute_similarities(
    query_fp: list[str], entries: list[dict]
) -> list[tuple[int, float]]:
    """
    Compute TF-IDF cosine similarity between a query fingerprint and all
    cached pattern fingerprints.  Returns list of (entry_index, score)
    sorted by score descending.
    """
    if not entries or not query_fp:
        return []

    # Build corpus: all pattern fingerprints + the query
    docs = [e["fingerprint"] for e in entries] + [query_fp]
    n_docs = len(docs)

    # Document frequency for each term
    df: Counter = Counter()
    for doc in docs:
        for term in set(doc):
            df[term] += 1

    # IDF: log(N / df)
    idf = {term: math.log(n_docs / count) for term, count in df.items()}

    # Build TF-IDF vectors
    def tfidf_vec(doc: list[str]) -> dict[str, float]:
        tf = Counter(doc)
        total = len(doc) if doc else 1
        return {term: (count / total) * idf.get(term, 0) for term, count in tf.items()}

    query_vec = tfidf_vec(query_fp)
    results = []
    for i, entry in enumerate(entries):
        entry_vec = tfidf_vec(entry["fingerprint"])
        score = _cosine_similarity(query_vec, entry_vec)
        results.append((i, score))

    results.sort(key=lambda x: x[1], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_match(question: str) -> None:
    """Match a question against golden queries. Output JSON to stdout."""
    entries = load_fingerprints()
    if not entries:
        json.dump({"matched": False, "confidence": 0.0, "best_pattern": ""}, sys.stdout)
        return

    query_fp = fingerprint(question)
    if not query_fp:
        json.dump({"matched": False, "confidence": 0.0, "best_pattern": ""}, sys.stdout)
        return

    similarities = compute_similarities(query_fp, entries)
    if not similarities:
        json.dump({"matched": False, "confidence": 0.0, "best_pattern": ""}, sys.stdout)
        return

    best_idx, best_score = similarities[0]
    best_entry = entries[best_idx]

    if best_score >= CONFIDENCE_THRESHOLD:
        json.dump(
            {
                "matched": True,
                "sql": best_entry["sql"],
                "confidence": round(best_score, 4),
                "description": best_entry.get("description", ""),
                "pattern": best_entry["pattern"],
            },
            sys.stdout,
        )
    else:
        json.dump(
            {
                "matched": False,
                "confidence": round(best_score, 4),
                "best_pattern": best_entry["pattern"],
            },
            sys.stdout,
        )


def cmd_learn(question: str, sql: str) -> None:
    """Append a question+SQL pair to the database."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Normalise SQL whitespace for comparison
            norm_sql = " ".join(sql.split())

            # Check if this SQL already exists
            cur.execute(
                """
                SELECT id FROM golden_queries
                WHERE regexp_replace(sql, '\\s+', ' ', 'g') = %s
                LIMIT 1
                """,
                (norm_sql,),
            )
            row = cur.fetchone()

            if row:
                query_id = row[0]
                # Avoid duplicate patterns
                cur.execute(
                    """
                    SELECT 1 FROM golden_query_patterns
                    WHERE golden_query_id = %s AND pattern = %s
                    """,
                    (query_id, question),
                )
                if not cur.fetchone():
                    fp = fingerprint(question)
                    cur.execute(
                        """
                        INSERT INTO golden_query_patterns (golden_query_id, pattern, fingerprint)
                        VALUES (%s, %s, %s)
                        """,
                        (query_id, question, fp),
                    )
            else:
                # Insert new golden query
                cur.execute(
                    """
                    INSERT INTO golden_queries (sql, description, source)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (sql, "Auto-learned query", "learned"),
                )
                query_id = cur.fetchone()[0]

                fp = fingerprint(question)
                cur.execute(
                    """
                    INSERT INTO golden_query_patterns (golden_query_id, pattern, fingerprint)
                    VALUES (%s, %s, %s)
                    """,
                    (query_id, question, fp),
                )

            conn.commit()
    finally:
        conn.close()


def cmd_build_fingerprints() -> None:
    """Recompute fingerprints for all patterns in the database."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, pattern FROM golden_query_patterns")
            rows = cur.fetchall()

            updated = 0
            for pattern_id, pattern_text in rows:
                fp = fingerprint(pattern_text)
                cur.execute(
                    "UPDATE golden_query_patterns SET fingerprint = %s WHERE id = %s",
                    (fp, pattern_id),
                )
                updated += 1

            conn.commit()
            print(f"Updated fingerprints for {updated} patterns.", file=sys.stderr)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: query_matcher.py <match|learn|build-fingerprints> [args...]",
            file=sys.stderr,
        )
        sys.exit(1)

    command = sys.argv[1]

    if command == "match":
        if len(sys.argv) < 3:
            print("Usage: query_matcher.py match <question>", file=sys.stderr)
            sys.exit(1)
        cmd_match(sys.argv[2])

    elif command == "learn":
        if len(sys.argv) < 4:
            print(
                "Usage: query_matcher.py learn <question> <sql>", file=sys.stderr
            )
            sys.exit(1)
        cmd_learn(sys.argv[2], sys.argv[3])

    elif command == "build-fingerprints":
        cmd_build_fingerprints()

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
