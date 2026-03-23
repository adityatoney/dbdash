#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# DBDash — Single dev script
# Installs deps, starts DB, runs migrations, seeds data,
# and launches the Next.js dev server.
#
# Usage:
#   ./dev.sh              # Full setup + dev server
#   ./dev.sh --skip-seed  # Skip ETL seed (DB already populated)
#   ./dev.sh --reset      # Wipe DB volume and start fresh
# ─────────────────────────────────────────────────────────

SKIP_SEED=false
RESET=false

for arg in "$@"; do
  case $arg in
    --skip-seed) SKIP_SEED=true ;;
    --reset)     RESET=true ;;
    *)           echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }

# ── 0. Pre-flight checks ──────────────────────────────
step "Pre-flight checks"
command -v node  >/dev/null 2>&1 || fail "node not found. Install Node.js >= 20."
command -v npm   >/dev/null 2>&1 || fail "npm not found."
command -v docker >/dev/null 2>&1 || fail "docker not found. Install Docker Desktop."
command -v python3 >/dev/null 2>&1 || fail "python3 not found."
ok "All required tools found"

# ── 1. Install / update Node dependencies ─────────────
step "Installing Node dependencies"
npm install --legacy-peer-deps 2>&1 | tail -3
ok "Node dependencies up to date"

# ── 2. Install Python ETL dependencies ────────────────
step "Installing Python ETL dependencies"
pip3 install -q -r etl/requirements.txt 2>&1 | tail -3
ok "Python dependencies up to date"

# ── 3. Reset DB if requested ──────────────────────────
if [ "$RESET" = true ]; then
  step "Resetting database (wiping volume)"
  docker compose down -v 2>&1 | tail -3
  ok "Database volume removed"
fi

# ── 4. Start PostgreSQL ───────────────────────────────
step "Starting PostgreSQL"
docker compose up db -d 2>&1 | tail -3

# Wait for healthy
echo -n "  Waiting for DB to be healthy"
for i in $(seq 1 30); do
  if docker compose exec db pg_isready -U dbdash -d dbdash >/dev/null 2>&1; then
    echo ""
    ok "PostgreSQL is ready (port 5433)"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo ""
    fail "PostgreSQL did not become healthy in 30s"
  fi
done

# ── 5. Run Prisma migrations ─────────────────────────
step "Running Prisma migrations"
npx prisma migrate dev 2>&1 | tail -5
ok "Database schema is up to date"

# ── 6. Generate Prisma client ─────────────────────────
step "Generating Prisma client"
npx prisma generate 2>&1 | tail -3
ok "Prisma client generated"

# ── 7. Seed database via ETL ──────────────────────────
if [ "$SKIP_SEED" = true ]; then
  warn "Skipping ETL seed (--skip-seed)"
else
  step "Seeding database (ETL pipeline)"
  python3 etl/seed.py 2>&1
  ok "Database seeded"
fi

# ── 8. Start Next.js dev server ───────────────────────
step "Starting Next.js dev server"
echo -e "${GREEN}Dashboard will be available at: ${CYAN}http://localhost:3000${NC}"
echo ""
exec npm run dev
