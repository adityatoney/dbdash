#!/usr/bin/env python3
"""
Generate golden queries from the database schema using Claude CLI.

Reads the DDL schema from src/lib/nl-to-sql-prompt.txt, asks Claude to
produce a comprehensive set of question->SQL pairs in batches, validates
each query with EXPLAIN against the real database, and merges the results
into references/golden-queries.json.

Usage:
  python3 scripts/generate_golden_queries.py                # generate & merge
  python3 scripts/generate_golden_queries.py --dry-run      # generate only, don't write
  python3 scripts/generate_golden_queries.py --count 80     # target ~80 queries (default 60)
  python3 scripts/generate_golden_queries.py --batch-size 15 # queries per batch (default 15)
  python3 scripts/generate_golden_queries.py --replace      # replace file instead of merge
"""

from __future__ import annotations

import sys
import os
import json
import subprocess
import argparse
import math
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SCHEMA_FILE = PROJECT_ROOT / "src" / "lib" / "nl-to-sql-prompt.txt"
GOLDEN_QUERIES_PATH = PROJECT_ROOT / "references" / "golden-queries.json"

# Table groups to distribute across batches for coverage
TABLE_FOCUS_GROUPS = [
    ["members", "families", "member_addresses"],
    ["events", "event_types", "zones", "event_attendance"],
    ["room_bookings", "hotels", "room_types", "hotel_room_inventory"],
    ["gnan_records", "event_attendance", "members"],
    # Cross-cutting: complex joins, trends, CTEs
    None,  # means "cover anything missed, complex multi-table queries"
]


def get_db_url() -> str:
    """Get DATABASE_URL from environment or .env file."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        env_path = PROJECT_ROOT / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    return url or ""


def load_existing() -> list[dict]:
    """Load existing golden queries from JSON file."""
    if GOLDEN_QUERIES_PATH.exists():
        with open(GOLDEN_QUERIES_PATH) as f:
            return json.load(f)
    return []


def build_batch_prompt(
    schema_text: str,
    all_existing_descriptions: list[str],
    batch_count: int,
    focus_tables: list[str] | None,
    batch_num: int,
    total_batches: int,
) -> str:
    """Build the prompt for one batch of golden query generation."""
    existing_section = ""
    if all_existing_descriptions:
        existing_section = (
            "\n\nThe following queries ALREADY EXIST — do NOT duplicate them:\n"
            + "\n".join(f"- {d}" for d in all_existing_descriptions)
        )

    focus_section = ""
    if focus_tables:
        focus_section = (
            f"\n\nFOCUS: This batch should primarily use these tables: "
            f"{', '.join(focus_tables)}. Include joins to other tables as needed."
        )
    else:
        focus_section = (
            "\n\nFOCUS: This batch should cover complex cross-table queries, "
            "trend analysis, CTEs, and any tables/relationships not well covered yet."
        )

    query_types = [
        "Simple counts and aggregations",
        "Multi-table joins",
        "Time-based analysis (by year, by month)",
        "Rankings (top N, bottom N)",
        "Percentage and ratio calculations",
        "Filtering queries (specific zones, event types, demographics)",
        "Existence checks (members who did/didn't do X)",
        "Growth/trend queries",
        "CTE-based complex queries",
    ]
    # Distribute query types across batches
    start = (batch_num * len(query_types)) // total_batches
    end = ((batch_num + 1) * len(query_types)) // total_batches
    batch_types = query_types[start:end] if start < end else query_types

    return f"""You are a SQL expert and data analyst. Given the PostgreSQL schema below,
generate exactly {batch_count} diverse, realistic natural-language questions that users
might ask about this data, along with the correct SQL query for each.

This is batch {batch_num + 1} of {total_batches}.
{existing_section}
{focus_section}

{schema_text}

REQUIREMENTS:
1. Generate exactly {batch_count} question-SQL pairs.
2. For EACH query, provide 3-5 pattern variations (different ways a user might ask the same question).
3. SQL must be read-only SELECT statements.
4. Use explicit JOIN ... ON syntax, meaningful aliases, and ::int casts on COUNT/SUM.
5. Limit results to 200 rows unless the question implies a specific limit.
6. Use CTEs for complex multi-step logic.
7. Emphasize these query types: {', '.join(batch_types)}.
8. Make questions sound natural — the way a real user would ask.
9. Do NOT duplicate any of the existing queries listed above.

10. SQL must be multi-line and properly indented. Each clause (SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY, LIMIT, HAVING) starts on its own line. Column lists and conditions are indented with two spaces. Example:
    SELECT
      e.year,
      COUNT(DISTINCT ea.member_id)::int AS members_attended
    FROM event_attendance ea
    JOIN events e ON ea.event_id = e.event_id
    WHERE e.is_gp_event = true
      AND ea.checked_in = true
    GROUP BY e.year
    ORDER BY e.year

OUTPUT FORMAT — respond with ONLY a valid JSON array. No markdown fences, no explanation, no text before or after.
Use \\n for newlines inside the SQL strings:
[
  {{
    "patterns": ["question variant 1", "question variant 2", "question variant 3"],
    "sql": "SELECT\\n  col1,\\n  col2\\nFROM table\\nWHERE ...",
    "description": "Short description of what the query returns"
  }}
]"""


import re

# SQL keywords that should start on their own line (top-level clauses)
_SQL_CLAUSE_KW = re.compile(
    r"\b(SELECT|FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|FULL\s+JOIN|"
    r"CROSS\s+JOIN|LEFT\s+OUTER\s+JOIN|WHERE|AND|OR|GROUP\s+BY|ORDER\s+BY|"
    r"HAVING|LIMIT|OFFSET|UNION\s+ALL|UNION|EXCEPT|INTERSECT|"
    r"WITH|ON|RETURNING)\b",
    re.IGNORECASE,
)

# Keywords that get indented (sub-clauses)
_INDENT_KW = {"AND", "OR", "ON"}


def format_sql(sql: str) -> str:
    """
    Format a single-line SQL string into properly indented multi-line SQL.
    If the SQL already contains newlines, assume it's already formatted.
    """
    # Already multi-line? Leave it alone.
    if "\n" in sql.strip() and sql.strip().count("\n") > 1:
        return sql.strip()

    # Normalize whitespace
    sql = " ".join(sql.split())

    # Handle CTE: split on outer-level WITH ... AS (...), then format each part
    # For simplicity, insert newlines before major clauses
    parts = []
    last_end = 0

    for match in _SQL_CLAUSE_KW.finditer(sql):
        kw = match.group(0).upper().strip()
        start = match.start()

        # Don't break if this keyword is inside parentheses
        prefix = sql[:start]
        open_parens = prefix.count("(") - prefix.count(")")
        if open_parens > 0:
            continue

        # Don't break on the very first keyword (SELECT at position 0, or WITH)
        if start == 0:
            continue

        # Add text before this keyword
        before = sql[last_end:start].strip()
        if before:
            parts.append(before)

        last_end = start

    # Add remainder
    remainder = sql[last_end:].strip()
    if remainder:
        parts.append(remainder)

    if not parts:
        return sql

    # Rebuild with newlines and indentation
    lines = []
    for part in parts:
        part_upper = part.lstrip().split()[0].upper() if part.strip() else ""
        if part_upper in _INDENT_KW:
            lines.append("  " + part)
        else:
            lines.append(part)

    formatted = "\n".join(lines)

    # Indent SELECT column lists: after SELECT, put each comma-separated column on its own line
    def indent_select_cols(m):
        prefix = m.group(1)  # "SELECT" or "SELECT DISTINCT"
        cols_str = m.group(2)
        # Only split if there are multiple columns
        if "," not in cols_str:
            return prefix + "\n  " + cols_str.strip()
        cols = [c.strip() for c in cols_str.split(",")]
        return prefix + "\n  " + ",\n  ".join(cols)

    formatted = re.sub(
        r"(SELECT(?:\s+DISTINCT)?)\s+(.+?)(?=\nFROM)",
        indent_select_cols,
        formatted,
        flags=re.DOTALL | re.IGNORECASE,
    )

    return formatted


def call_claude(prompt: str, timeout: int = 120) -> str:
    """Call Claude CLI with the given prompt and return stdout."""
    result = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "text"],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        env={**os.environ, "NO_COLOR": "1"},
    )
    if result.returncode != 0:
        print(f"ERROR: Claude CLI failed:\n{result.stderr}", file=sys.stderr)
        return ""
    return result.stdout.strip()


def parse_json_output(raw_output: str) -> list[dict] | None:
    """Parse JSON array from Claude output, handling markdown fences."""
    output = raw_output.strip()
    if not output:
        return None

    # Strip markdown fences if present
    if output.startswith("```"):
        lines = output.split("\n")
        # Find the opening and closing fence lines
        start = 1
        end = len(lines) - 1
        if end > start and lines[end].strip().startswith("```"):
            output = "\n".join(lines[start:end])
        else:
            output = "\n".join(lines[start:])

    try:
        parsed = json.loads(output)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try to find JSON array in the output
    start_idx = output.find("[")
    end_idx = output.rfind("]")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        try:
            parsed = json.loads(output[start_idx : end_idx + 1])
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    return None


def validate_sql(sql: str, db_url: str) -> tuple[bool, str]:
    """Validate SQL by running EXPLAIN against the real database."""
    import psycopg2

    try:
        conn = psycopg2.connect(db_url)
        try:
            with conn.cursor() as cur:
                cur.execute(f"EXPLAIN {sql}")
                cur.fetchall()
            return True, ""
        except Exception as e:
            conn.rollback()
            return False, str(e)
        finally:
            conn.close()
    except Exception as e:
        return False, f"Connection error: {e}"


def normalize_sql(sql: str) -> str:
    """Normalize SQL whitespace for deduplication."""
    return " ".join(sql.split())


def merge_queries(existing: list[dict], new_entries: list[dict]) -> list[dict]:
    """Merge new entries into existing, deduplicating by normalized SQL."""
    seen_sql = set()
    for entry in existing:
        seen_sql.add(normalize_sql(entry["sql"]))

    merged = list(existing)
    added = 0
    for entry in new_entries:
        norm = normalize_sql(entry["sql"])
        if norm not in seen_sql:
            seen_sql.add(norm)
            merged.append(entry)
            added += 1

    print(
        f"Merged: {added} new queries added, {len(new_entries) - added} duplicates skipped.",
        file=sys.stderr,
    )
    return merged


def main():
    parser = argparse.ArgumentParser(description="Generate golden queries using Claude")
    parser.add_argument(
        "--dry-run", action="store_true", help="Generate but don't write to file"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=60,
        help="Target number of queries to generate (default: 60)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=15,
        help="Queries per Claude call (default: 15)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace file instead of merging",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip SQL validation via EXPLAIN",
    )
    args = parser.parse_args()

    # Read schema
    if not SCHEMA_FILE.exists():
        print(f"ERROR: Schema file not found: {SCHEMA_FILE}", file=sys.stderr)
        sys.exit(1)

    schema_text = SCHEMA_FILE.read_text()

    # Load existing
    existing = [] if args.replace else load_existing()

    # Collect descriptions of existing queries for dedup
    all_descriptions = []
    for entry in existing:
        desc = entry.get("description", "")
        patterns = entry.get("patterns", [])
        all_descriptions.append(desc if desc else (patterns[0] if patterns else ""))

    # Calculate batches
    total_batches = math.ceil(args.count / args.batch_size)
    print(
        f"Generating ~{args.count} golden queries in {total_batches} batches "
        f"of ~{args.batch_size} each...",
        file=sys.stderr,
    )

    all_generated: list[dict] = []

    for batch_num in range(total_batches):
        # How many queries in this batch
        remaining = args.count - len(all_generated)
        batch_count = min(args.batch_size, remaining)
        if batch_count <= 0:
            break

        # Pick focus tables for this batch (cycle through groups)
        focus_idx = batch_num % len(TABLE_FOCUS_GROUPS)
        focus_tables = TABLE_FOCUS_GROUPS[focus_idx]

        focus_label = ", ".join(focus_tables) if focus_tables else "cross-table/complex"
        print(
            f"\n  Batch {batch_num + 1}/{total_batches}: "
            f"generating {batch_count} queries (focus: {focus_label})...",
            file=sys.stderr,
        )

        prompt = build_batch_prompt(
            schema_text=schema_text,
            all_existing_descriptions=all_descriptions,
            batch_count=batch_count,
            focus_tables=focus_tables,
            batch_num=batch_num,
            total_batches=total_batches,
        )

        raw_output = call_claude(prompt, timeout=120)
        if not raw_output:
            print(f"  WARNING: Batch {batch_num + 1} returned empty output, skipping.", file=sys.stderr)
            continue

        parsed = parse_json_output(raw_output)
        if parsed is None:
            print(
                f"  WARNING: Batch {batch_num + 1} returned unparseable JSON, skipping.",
                file=sys.stderr,
            )
            # Save for debugging
            debug_path = PROJECT_ROOT / "references" / f"golden-queries-raw-batch{batch_num + 1}.txt"
            debug_path.write_text(raw_output)
            print(f"  Raw output saved to {debug_path}", file=sys.stderr)
            continue

        print(f"  Got {len(parsed)} queries from batch {batch_num + 1}.", file=sys.stderr)

        # Add to running list & descriptions (so next batch avoids duplicates)
        for entry in parsed:
            desc = entry.get("description", "")
            patterns = entry.get("patterns", [])
            all_descriptions.append(desc if desc else (patterns[0] if patterns else ""))

        all_generated.extend(parsed)

    print(f"\nTotal generated: {len(all_generated)} queries.", file=sys.stderr)

    # Validate each query
    if not args.skip_validation:
        db_url = get_db_url()
        if not db_url:
            print(
                "WARNING: DATABASE_URL not set — skipping SQL validation.",
                file=sys.stderr,
            )
        else:
            valid = []
            invalid_count = 0
            for entry in all_generated:
                sql = entry.get("sql", "")
                ok, err = validate_sql(sql, db_url)
                if ok:
                    valid.append(entry)
                else:
                    invalid_count += 1
                    desc = entry.get("description", entry.get("patterns", ["?"])[0])
                    print(f"  INVALID: {desc}\n    Error: {err}", file=sys.stderr)

            print(
                f"Validation: {len(valid)} valid, {invalid_count} invalid.",
                file=sys.stderr,
            )
            all_generated = valid

    # Ensure each entry has required fields
    cleaned = []
    for entry in all_generated:
        if not entry.get("patterns") or not entry.get("sql"):
            continue
        cleaned.append(
            {
                "patterns": entry["patterns"],
                "sql": format_sql(entry["sql"]),
                "description": entry.get("description", ""),
            }
        )

    # Merge or replace
    if args.replace:
        final = cleaned
    else:
        final = merge_queries(existing, cleaned)

    if args.dry_run:
        print(json.dumps(final, indent=2))
        print(f"\nDry run complete. {len(final)} total queries.", file=sys.stderr)
    else:
        GOLDEN_QUERIES_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(GOLDEN_QUERIES_PATH, "w") as f:
            json.dump(final, f, indent=2)
            f.write("\n")
        print(
            f"\nWrote {len(final)} queries to {GOLDEN_QUERIES_PATH}",
            file=sys.stderr,
        )
        print(
            "\nNext steps:\n"
            "  1. Review: cat references/golden-queries.json | python3 -m json.tool | head\n"
            "  2. Seed to Postgres: python3 scripts/seed_golden_queries.py --force\n"
            "  3. Rebuild fingerprints: python3 scripts/query_matcher.py build-fingerprints\n"
            "  Or run all at once: npm run golden:generate-and-seed",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
