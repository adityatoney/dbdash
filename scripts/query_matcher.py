#!/usr/bin/env python3
"""
NLTK-powered query matcher for the NL-to-SQL pipeline.

Commands:
  match <question>         Match against golden queries (JSON to stdout)
  learn <question> <sql>   Append a new question+SQL to golden-queries.json
  build-fingerprints       Force-rebuild the fingerprint cache

Uses lemmatized TF-IDF cosine similarity with a 0.85 confidence threshold.
"""

import sys
import os
import json
import math
import fcntl
from pathlib import Path
from datetime import datetime, timezone
from collections import Counter

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
GOLDEN_QUERIES_PATH = PROJECT_ROOT / "references" / "golden-queries.json"
FINGERPRINTS_CACHE_PATH = PROJECT_ROOT / "references" / "golden-fingerprints.json"
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
# Fingerprint cache management
# ---------------------------------------------------------------------------


def _is_cache_stale() -> bool:
    """Check if fingerprint cache needs rebuilding."""
    if not FINGERPRINTS_CACHE_PATH.exists():
        return True
    if not GOLDEN_QUERIES_PATH.exists():
        return True
    return (
        GOLDEN_QUERIES_PATH.stat().st_mtime
        > FINGERPRINTS_CACHE_PATH.stat().st_mtime
    )


def _build_fingerprints() -> list[dict]:
    """Build fingerprint entries from golden-queries.json."""
    with open(GOLDEN_QUERIES_PATH, "r") as f:
        golden = json.load(f)

    entries = []
    for idx, query in enumerate(golden):
        sql = query["sql"]
        desc = query.get("description", "")
        for pattern in query.get("patterns", []):
            fp = fingerprint(pattern)
            entries.append(
                {
                    "index": idx,
                    "pattern": pattern,
                    "fingerprint": fp,
                    "sql": sql,
                    "description": desc,
                }
            )

    cache = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "entries": entries,
    }
    with open(FINGERPRINTS_CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)
        f.write("\n")

    return entries


def load_fingerprints() -> list[dict]:
    """Load fingerprint entries, rebuilding cache if stale."""
    if _is_cache_stale():
        return _build_fingerprints()
    with open(FINGERPRINTS_CACHE_PATH, "r") as f:
        return json.load(f)["entries"]


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
    if not GOLDEN_QUERIES_PATH.exists():
        json.dump({"matched": False, "confidence": 0.0, "best_pattern": ""}, sys.stdout)
        return

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
    """Append a question+SQL pair to golden-queries.json."""
    if not GOLDEN_QUERIES_PATH.exists():
        golden = []
    else:
        with open(GOLDEN_QUERIES_PATH, "r") as f:
            golden = json.load(f)

    # Normalise SQL whitespace for comparison
    norm_sql = " ".join(sql.split())

    # Check if this SQL already exists in any entry
    found = False
    for entry in golden:
        if " ".join(entry["sql"].split()) == norm_sql:
            # Avoid duplicate patterns
            if question not in entry["patterns"]:
                entry["patterns"].append(question)
            found = True
            break

    if not found:
        golden.append(
            {
                "patterns": [question],
                "sql": sql,
                "description": "Auto-learned query",
                "source": "learned",
            }
        )

    # Write with file locking to prevent races
    with open(GOLDEN_QUERIES_PATH, "w") as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            json.dump(golden, f, indent=2)
            f.write("\n")
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)

    # Invalidate fingerprint cache
    if FINGERPRINTS_CACHE_PATH.exists():
        FINGERPRINTS_CACHE_PATH.unlink()


def cmd_build_fingerprints() -> None:
    """Force-rebuild the fingerprint cache."""
    entries = _build_fingerprints()
    print(f"Built {len(entries)} fingerprint entries.", file=sys.stderr)


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
