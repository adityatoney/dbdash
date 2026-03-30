#!/usr/bin/env python3
"""
One-time migration: seed Postgres golden_queries and golden_query_patterns
tables from the existing references/golden-queries.json file.

Usage:
  python3 scripts/seed_golden_queries.py          # skip if tables have data
  python3 scripts/seed_golden_queries.py --force   # truncate and re-seed
"""

import sys
import os
import json
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths & env
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
GOLDEN_QUERIES_PATH = PROJECT_ROOT / "references" / "golden-queries.json"

# Reuse NLTK setup from query_matcher
sys.path.insert(0, str(SCRIPT_DIR))
from query_matcher import fingerprint  # noqa: E402

import psycopg2  # noqa: E402


def get_conn():
    """Connect using DATABASE_URL from .env or environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        # Try loading from .env file
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


def main():
    force = "--force" in sys.argv

    if not GOLDEN_QUERIES_PATH.exists():
        print(f"ERROR: {GOLDEN_QUERIES_PATH} not found", file=sys.stderr)
        sys.exit(1)

    with open(GOLDEN_QUERIES_PATH, "r") as f:
        golden = json.load(f)

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Check existing data
            cur.execute("SELECT COUNT(*) FROM golden_queries")
            existing = cur.fetchone()[0]

            if existing > 0 and not force:
                print(
                    f"Tables already have {existing} entries. "
                    "Use --force to truncate and re-seed.",
                    file=sys.stderr,
                )
                sys.exit(0)

            if force and existing > 0:
                print(f"Truncating {existing} existing entries...", file=sys.stderr)
                cur.execute("TRUNCATE golden_query_patterns, golden_queries RESTART IDENTITY CASCADE")

            # Seed
            total_queries = 0
            total_patterns = 0

            for entry in golden:
                sql = entry["sql"]
                description = entry.get("description", "")
                source = entry.get("source", "curated")

                cur.execute(
                    """
                    INSERT INTO golden_queries (sql, description, source)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (sql, description, source),
                )
                query_id = cur.fetchone()[0]
                total_queries += 1

                for pattern_text in entry.get("patterns", []):
                    fp = fingerprint(pattern_text)
                    cur.execute(
                        """
                        INSERT INTO golden_query_patterns (golden_query_id, pattern, fingerprint)
                        VALUES (%s, %s, %s)
                        """,
                        (query_id, pattern_text, fp),
                    )
                    total_patterns += 1

            conn.commit()
            print(
                f"Seeded {total_queries} golden queries with {total_patterns} patterns.",
                file=sys.stderr,
            )

    finally:
        conn.close()


if __name__ == "__main__":
    main()
