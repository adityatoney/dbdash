# DBDash: Multi-Year Event Analytics Dashboard

## Context

We have a multi-year event attendance dataset (2017-2025) in an XLSX file with 78,124 rows across 118 events, 23,206 members, and 10,967 families. A comprehensive data analysis has already been completed (see `docs/event_docs/DATA_ANALYSIS_REPORT.md`), identifying a normalized 13-table PostgreSQL schema, data quality issues (gender encoding, null blocks, room type fragmentation), and dashboard trend dimensions. The goal is to build a full-stack interactive analytics dashboard from scratch.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | Next.js 15 (App Router, TypeScript) | Server Components for initial render, Client Components for interactive filters |
| **UI Library** | ShadCN UI + Tailwind CSS | Charts via ShadCN's Recharts wrappers |
| **Charts** | Recharts (via ShadCN `chart` component) | Line, Bar, Area, Pie, Radar charts |
| **World Map** | `react-simple-maps` + world TopoJSON | Choropleth heatmap for geographic analysis |
| **Database** | PostgreSQL 16 | 13 normalized tables (3NF) |
| **ORM** | Prisma | Type-safe queries, migrations, `$queryRaw` for complex aggregates |
| **ETL** | Python 3.12 (pandas + openpyxl + psycopg2) | Seed script + upload-triggered re-import |
| **Theming** | `next-themes` | Dark/light toggle |
| **Deployment** | Docker Compose (3 services) | `db`, `etl`, `web` |
| **Auth** | None | Open dashboard |

---

## Project Structure

```
dbdash/
├── docker-compose.yml
├── Dockerfile                        # Next.js multi-stage build
├── .env.example
├── .gitignore
├── docs/event_docs/                  # Existing analysis + XLSX
│
├── etl/
│   ├── Dockerfile
│   ├── requirements.txt              # pandas, openpyxl, psycopg2-binary
│   ├── seed.py                       # Main ETL orchestrator
│   ├── normalization/
│   │   ├── gender.py                 # M/F ↔ 1/2 normalization
│   │   ├── room_types.py             # 65+ variants → 8 canonical
│   │   ├── hotels.py                 # Title-case dedup
│   │   ├── phones.py                 # Float → VARCHAR
│   │   ├── zipcodes.py               # Float → zero-padded VARCHAR
│   │   └── event_classifier.py       # Name → type/zone/flags
│   └── mappings/
│       ├── room_type_map.json
│       ├── event_type_map.json
│       └── zone_map.json
│
├── prisma/
│   └── schema.prisma                 # 13 models
│
├── src/
│   ├── app/
│   │   ├── layout.tsx                # Root layout + theme provider
│   │   ├── page.tsx                  # Redirect → /dashboard
│   │   ├── globals.css
│   │   ├── dashboard/
│   │   │   ├── layout.tsx            # Sidebar + header shell
│   │   │   ├── page.tsx              # Overview
│   │   │   ├── growth/page.tsx
│   │   │   ├── events/page.tsx
│   │   │   ├── geography/page.tsx
│   │   │   ├── demographics/page.tsx
│   │   │   ├── accommodation/page.tsx
│   │   │   ├── data-quality/page.tsx
│   │   │   └── upload/page.tsx       # XLSX re-upload page
│   │   └── api/
│   │       ├── stats/overview/route.ts
│   │       ├── growth/{attendance,gnan,members}/route.ts
│   │       ├── events/{distribution,attendance,seasonal}/route.ts
│   │       ├── geography/{states,zones,countries}/route.ts
│   │       ├── demographics/{age,gender,families,retention}/route.ts
│   │       ├── accommodation/{utilization,room-types,hotels}/route.ts
│   │       ├── data-quality/route.ts
│   │       └── upload/route.ts       # POST: receive XLSX, trigger ETL
│   ├── components/
│   │   ├── ui/                       # ShadCN generated
│   │   ├── layout/                   # sidebar, header, nav-item, theme-toggle
│   │   ├── charts/                   # 9 chart components (see below)
│   │   ├── cards/                    # kpi-card, trend-card
│   │   └── filters/                  # year, event-type, zone filters
│   ├── lib/
│   │   ├── prisma.ts                 # Singleton client
│   │   ├── utils.ts                  # cn() utility
│   │   └── constants.ts              # Colors, config
│   ├── hooks/
│   │   └── use-filters.ts
│   └── types/
│       ├── api.ts
│       └── dashboard.ts
│
├── components.json                   # ShadCN config
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
├── package.json
└── postcss.config.mjs
```

---

## Implementation Phases

### Phase 1: Project Scaffolding

**Step 1.1 — Initialize Next.js**
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

**Step 1.2 — Initialize ShadCN + install components**
```bash
npx shadcn@latest init    # New York style, Slate base, CSS variables
npx shadcn@latest add card button table select badge separator tabs chart skeleton sheet tooltip
```

**Step 1.3 — Install dependencies**
```bash
npm install @prisma/client recharts react-simple-maps next-themes lucide-react
npm install -D prisma @types/react-simple-maps
```

**Step 1.4 — Create Docker + env files**
- `docker-compose.yml` (3 services: `db`, `etl`, `web`)
- `.env.example` with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`
- `.gitignore` (node_modules, .next, .env, pgdata)
- `Dockerfile` (multi-stage: deps → build → standalone runner)
- `etl/Dockerfile` (python:3.12-slim)
- `etl/requirements.txt`

**Docker Compose services:**

| Service | Image | Ports | Depends On | Notes |
|---------|-------|-------|------------|-------|
| `db` | postgres:16-alpine | 5432:5432 | — | Named volume `pgdata`, healthcheck via `pg_isready` |
| `etl` | ./etl (build) | — | db (healthy) | One-shot, mounts `./docs/event_docs:/data:ro` |
| `web` | ./ (build) | 3000:3000 | db (healthy) | Runs `prisma migrate deploy` then `node server.js` |

---

### Phase 2: Database Layer

**Step 2.1 — Define Prisma schema** (`prisma/schema.prisma`)

13 models mapped from the analysis report schema (section 6.3):

| Model | Table | PK Strategy | Key Relations |
|-------|-------|-------------|---------------|
| `Member` | members | Source `member_id` | → Family, → EventAttendance[], → RoomBooking[], → GnanRecord[], → MemberAddress[] |
| `Family` | families | Source `family_id` | → Member[] |
| `Event` | events | Source `event_id` | → EventType, → Zone?, → EventAttendance[], → RoomBooking[] |
| `EventType` | event_types | Auto-increment | → Event[] |
| `Zone` | zones | Auto-increment | → Event[] |
| `Hotel` | hotels | Auto-increment | → RoomBooking[], → HotelRoomInventory[] |
| `RoomType` | room_types | Auto-increment | → RoomBooking[], → RoomTypeAlias[] |
| `RoomTypeAlias` | room_type_aliases | Auto-increment | → RoomType |
| `EventAttendance` | event_attendance | Auto-increment | → Member, → Event. `@@unique([memberId, eventId])` |
| `RoomBooking` | room_bookings | Auto-increment | → Member, → Event, → Hotel, → RoomType, → Family |
| `GnanRecord` | gnan_records | Auto-increment | → Member, → Event? |
| `MemberAddress` | member_addresses | Auto-increment | → Member. SCD2 with `validFrom`, `validTo`, `isCurrent` |
| `HotelRoomInventory` | hotel_room_inventory | Auto-increment | → Hotel, → RoomType, → Event |
| `DataQualityLog` | data_quality_log | Auto-increment | Standalone audit table |

Key indexes (from report section 6.4):
- `event_attendance(member_id)`, `event_attendance(event_id)`, unique on `(member_id, event_id)`
- `members(family_id)`, `members(mahatma_id)` (partial, WHERE NOT NULL)
- `events(year)`, `events(event_type_id)`
- `member_addresses(member_id, is_current)` (partial, WHERE TRUE)

**Step 2.2 — Create Prisma singleton** (`src/lib/prisma.ts`)

**Step 2.3 — Run initial migration**
```bash
docker compose up db -d
npx prisma migrate dev --name init
```

---

### Phase 3: ETL Pipeline

**Step 3.1 — Build normalization modules** (`etl/normalization/`)

| Module | Logic |
|--------|-------|
| `gender.py` | `1.0→'M'`, `2.0→'F'`, pass-through `'M'`/`'F'`, else `None` + log |
| `room_types.py` | Lowercase+strip input → match against `room_type_map.json` → canonical ID |
| `hotels.py` | `.strip().title()` → dedup by normalized name |
| `phones.py` | `float→int→str`, left-pad to 10 digits (US) |
| `zipcodes.py` | `float→int→str`, left-pad to 5 digits |
| `event_classifier.py` | Regex patterns → `(type, zone, is_virtual, has_gnanvidhi, target_demographic)` |

**Step 3.2 — Build mapping JSON files** (`etl/mappings/`)

- `room_type_map.json`: All 65+ raw strings → 8 canonical types (Double Queen, King, Suite, Single, Accessible, Studio, Parlor, Unknown)
- `event_type_map.json`: Regex patterns for 9 categories
- `zone_map.json`: State → zone (North East, South East, South Central, North Central, West Coast, Canada, International)

**Step 3.3 — Build main ETL script** (`etl/seed.py`)

Idempotent: `TRUNCATE ... CASCADE` all tables, then insert in FK-safe order:

1. Read XLSX "Data" sheet → `df.dropna(how='all')` (drops 13,902 null rows)
2. Read XLSX "GP 2025" sheet for hotel room inventory
3. Insert lookups: `event_types` (9), `zones` (7), `room_types` (8)
4. Extract+insert `events` (118 unique by EventID)
5. Extract+insert `families` (10,967 unique)
6. Extract+insert `hotels` (~20 unique, normalized)
7. Insert `room_type_aliases` (65+ mappings)
8. Extract+insert `members` (23,206 unique by MemberID)
9. Insert `member_addresses` (deduped, SCD2 with `is_current`)
10. Insert `event_attendance` (~64,222 rows)
11. Insert `room_bookings` (where `HasRoomBookedByFamily=1`)
12. Insert `gnan_records` (where `HasGnanTakenInThisEvent=1` or `GnanDate` not null)
13. Insert `hotel_room_inventory` (from GP 2025 sheet)
14. Insert `data_quality_log` entries accumulated during all steps

**Step 3.4 — Upload API endpoint** (`src/app/api/upload/route.ts`)

- `POST` endpoint accepting multipart XLSX file
- Saves file to `/tmp`, spawns ETL subprocess (child_process.exec calling Python seed.py with the uploaded file path)
- Returns progress/status via response
- Upload page (`/dashboard/upload/page.tsx`) with drag-drop zone + progress indicator

---

### Phase 4: API Layer

**Step 4.1 — Build API routes** (`src/app/api/`)

All routes: import Prisma singleton, accept filter query params (`?year=`, `?eventType=`, `?zone=`), return `NextResponse.json()`.

| Endpoint | Query Strategy | Returns |
|----------|---------------|---------|
| `GET /api/stats/overview` | `count`, `aggregate` | `{totalMembers, totalFamilies, totalEvents, latestGPAttendance, gpGrowthPct, totalGnan}` |
| `GET /api/growth/attendance` | `groupBy` attendance + events by year | `[{year, count}]` |
| `GET /api/growth/gnan` | `groupBy` gnan_records by year | `[{year, count}]` |
| `GET /api/growth/members` | `$queryRaw` first-event-year per member | `[{year, newMembers}]` |
| `GET /api/events/distribution` | `groupBy` events by type | `[{type, count}]` |
| `GET /api/events/attendance` | `groupBy` attendance by event_type, avg | `[{type, avgAttendance}]` |
| `GET /api/events/seasonal` | `groupBy` events by month | `[{month, count}]` |
| `GET /api/geography/countries` | `groupBy` addresses by country | `[{country, iso, count}]` |
| `GET /api/geography/states` | `groupBy` current addresses by state | `[{state, count}]` |
| `GET /api/geography/zones` | Join events+zones, aggregate | `[{zone, attendance}]` |
| `GET /api/demographics/age` | `$queryRaw` bucket age_at_event | `[{bucket, count}]` |
| `GET /api/demographics/gender` | `groupBy` members by gender, optionally by year | `[{gender, count}]` or `[{year, M, F}]` |
| `GET /api/demographics/families` | `groupBy` families by member_count | `[{size, count}]` |
| `GET /api/demographics/retention` | `$queryRaw` members by # events | `[{bucket, count}]` |
| `GET /api/accommodation/utilization` | Join bookings+inventory | `[{event, rate}]` |
| `GET /api/accommodation/room-types` | `groupBy` bookings by room_type | `[{type, count}]` |
| `GET /api/accommodation/hotels` | `groupBy` bookings by hotel | `[{hotel, count}]` |
| `GET /api/data-quality` | `$queryRaw` null% per column per year | `[{column, year, nullPct}]` |

**Step 4.2 — Define shared types** (`src/types/api.ts`, `src/types/dashboard.ts`)

---

### Phase 5: Frontend — Layout & Components

**Step 5.1 — Root layout + theme** (`src/app/layout.tsx`)
- Wrap with `ThemeProvider` from `next-themes`
- ShadCN CSS variables in `globals.css`

**Step 5.2 — Dashboard shell** (`src/app/dashboard/layout.tsx`)
- Fixed left sidebar (240px) with nav items using `lucide-react` icons
- Collapsible to hamburger on mobile via ShadCN `Sheet`
- Theme toggle button in header
- Nav items: Overview, Growth, Events, Geography, Demographics, Accommodation, Data Quality, Upload

**Step 5.3 — Reusable components**

| Component | Location | Description |
|-----------|----------|-------------|
| `kpi-card` | `components/cards/` | ShadCN Card + large number + delta badge |
| `trend-card` | `components/cards/` | KPI card + sparkline |
| `year-filter` | `components/filters/` | ShadCN Select, 2017-2025 + "All" |
| `event-type-filter` | `components/filters/` | Multi-select for 9 event types |
| `zone-filter` | `components/filters/` | Select for zones |
| `theme-toggle` | `components/layout/` | Dark/light switch |

**Step 5.4 — Chart components** (`src/components/charts/`)

| Chart | Type | Library |
|-------|------|---------|
| `attendance-line-chart` | Multi-line (year vs attendance) | ShadCN ChartContainer + Recharts LineChart |
| `event-type-pie-chart` | Pie (9 event types) | ShadCN + Recharts PieChart |
| `age-histogram` | Horizontal bar (5-year buckets) | ShadCN + Recharts BarChart |
| `gender-ratio-bar` | Stacked bar (M/F per year) | ShadCN + Recharts BarChart |
| `room-utilization-bar` | Grouped bar (capacity vs booked) | ShadCN + Recharts BarChart |
| `gnan-trend-area` | Area chart (initiations/year) | ShadCN + Recharts AreaChart |
| `seasonal-radar` | Radar (12 months) | ShadCN + Recharts RadarChart |
| `world-heatmap` | Choropleth map | `react-simple-maps` + world TopoJSON |
| `data-quality-heatmap` | Custom HTML table | Tailwind bg colors (green→yellow→red gradient) |

---

### Phase 6: Frontend — Dashboard Pages

**Page 1: Overview** (`/dashboard`)
- Row 1: 4 KPI cards (Total Members, Total Events, Latest GP Attendance, Total Gnan)
- Row 2: GP Attendance Trend line chart (full width, flagship)
- Row 3: 2-col grid — Event Type pie | YoY Member Growth bar

**Page 2: Growth Trends** (`/dashboard/growth`)
- KPIs: GP 2025 count, YoY growth %, cumulative Gnan
- GP attendance line chart (with COVID dip annotation)
- New members per year bar chart
- Gnan initiations area chart

**Page 3: Event Analytics** (`/dashboard/events`)
- KPIs: Total events, avg attendance, most popular type
- Event type distribution stacked area (over time)
- Avg attendance by type (horizontal bar)
- Seasonal radar (events by month)
- Filters: Year, Event type

**Page 4: Geography** (`/dashboard/geography`)
- KPIs: Countries, top country, top state
- World choropleth heatmap (full width) — member concentration by country
- US state detail table (top 20)
- Zone-level attendance bar chart

**Page 5: Demographics** (`/dashboard/demographics`)
- KPIs: Avg age, gender ratio, avg family size
- Age distribution histogram
- Gender ratio trend (stacked bar by year)
- Family size distribution bar
- Member retention (# events attended buckets)

**Page 6: Accommodation** (`/dashboard/accommodation`)
- KPIs: Total bookings, avg occupancy, top room type
- Room utilization by GP event year (bar)
- Room type preference trend (stacked area)
- Hotel comparison table
- Filter: GP events only toggle

**Page 7: Data Quality** (`/dashboard/data-quality`)
- KPIs: Total issues logged, worst column, cleanest year
- **Discrepancy heatmap** (full width): HTML table, rows = dataset columns, cols = years 2017-2025, cells = null % colored green→yellow→orange→red
- Issue type bar chart
- Scrollable log table (ShadCN Table with pagination)

**Page 8: Upload** (`/dashboard/upload`)
- Drag-and-drop zone for XLSX file
- Upload button + progress indicator
- Status: last import timestamp, row counts
- Re-import triggers truncate + full reload

---

### Phase 7: Docker & Deployment

**Step 7.1 — Next.js Dockerfile** (multi-stage)
- Stage 1 `deps`: `node:20-alpine`, `npm ci`
- Stage 2 `builder`: copy source, `npx prisma generate`, `npm run build`
- Stage 3 `runner`: copy `.next/standalone` + `.next/static` + `public`, expose 3000
- `next.config.ts`: set `output: 'standalone'`
- Entrypoint script: `npx prisma migrate deploy && node server.js`

**Step 7.2 — ETL Dockerfile**
- `python:3.12-slim`, install requirements, `CMD ["python", "seed.py"]`

**Step 7.3 — docker-compose.yml**
- `db`: postgres:16-alpine, volume `pgdata`, healthcheck
- `etl`: build `./etl`, depends_on db healthy, mounts `./docs/event_docs:/data:ro`, runs once
- `web`: build `.`, depends_on db healthy, port 3000

**Local dev workflow:**
```bash
docker compose up db -d          # Start Postgres only
npx prisma migrate dev           # Apply migrations
docker compose run etl           # Seed data
npm run dev                      # Next.js with hot-reload
```

---

## Verification Plan

1. **Database**: `docker compose up db` → `npx prisma migrate dev` → verify 13 tables created via `npx prisma studio`
2. **ETL**: `docker compose run etl` → verify row counts match expectations:
   - `members`: ~23,206 | `events`: ~118 | `event_attendance`: ~64,222 | `room_bookings`: ~16,000 | `gnan_records`: ~3,000
3. **API**: `npm run dev` → hit each `/api/*` endpoint in browser/curl, verify JSON responses
4. **Frontend**: Navigate all 8 pages, verify charts render, filters work, theme toggles
5. **Data Quality**: Confirm heatmap matches the year-level null analysis from the report
6. **Upload**: Upload the same XLSX via `/dashboard/upload`, verify data re-imports correctly
7. **Full Docker**: `docker compose up --build` → verify all 3 services start, app accessible at `localhost:3000`

---

## Critical Files (in implementation order)

1. `prisma/schema.prisma` — All 13 models, relations, indexes
2. `docker-compose.yml` — Service orchestration
3. `etl/seed.py` — Main ETL orchestrator
4. `etl/normalization/*.py` — Data cleaning modules
5. `etl/mappings/*.json` — Normalization lookup tables
6. `src/lib/prisma.ts` — DB client singleton
7. `src/app/dashboard/layout.tsx` — Dashboard shell
8. `src/app/api/*/route.ts` — All API endpoints
9. `src/components/charts/*.tsx` — 9 chart components
10. `src/app/dashboard/*/page.tsx` — 8 dashboard pages
