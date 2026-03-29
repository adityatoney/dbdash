# Plan: Natural Language-to-SQL Querying via Kimi K2.5

## Context
The dbdash project is a Next.js 16 analytics dashboard backed by Postgres (via Prisma). It has 13+ tables covering members, families, events, attendance, hotels, room bookings, gnan records, and geography. There are no existing LLM integrations. The goal is to let users type a plain-English question, have Kimi K2.5 generate the SQL, execute it against Postgres, and return the raw result rows — **no LLM post-processing of results**.

## Architecture

```
User (browser)
  │  POST { question }
  ▼
/api/nl-query/route.ts          ← Next.js API route
  │
  ▼
src/lib/nl-to-sql.ts            ← Core module
  ├── Calls Kimi K2.5 via OpenAI SDK (src/lib/kimi.ts)
  │     • System prompt embeds full DDL schema + relationship summary
  │     • Thinking mode enabled (extra_body: { thinking: true })
  │     • temperature: 0 for deterministic SQL
  ├── Sanitises output (SELECT-only, forbidden keyword check)
  └── Executes via prisma.$queryRawUnsafe → returns raw rows
  │
  ▼
src/app/dashboard/nl-query/page.tsx  ← Frontend UI
```

## Schema Injection Strategy
- Embed the **full DDL** (CREATE TABLE statements with real PG column names from `@@map`/`@map`) as a `<schema>` block in the system prompt
- Append a **relationships summary** comment block so the model understands FK join paths
- This is inlined (not fetched at runtime) since the schema is static and small (~120 lines)

## Files to Create / Modify

| File | Status | Description |
|------|--------|-------------|
| `src/lib/kimi.ts` | ✅ Done | OpenAI SDK singleton pointing at `api.moonshot.cn/v1` |
| `src/lib/nl-to-sql.ts` | ✅ Done | Schema context, Kimi call, SQL sanitiser, query executor |
| `src/app/api/nl-query/route.ts` | ✅ Done | POST endpoint: validates input, calls `executeNLQuery`, returns JSON |
| `src/app/dashboard/nl-query/page.tsx` | ✅ Done | Full UI: textarea input, example chips, SQL display, results table |
| `src/components/layout/sidebar.tsx` | ⬜ TODO | Add "NL Query" nav item with `MessageSquare` icon |
| `.env.example` | ⬜ TODO | Add `KIMI_API_KEY=` placeholder |
| `src/types/api.ts` | ⬜ TODO | Add `NLQueryResult` interface |

## Safety Guardrails (implemented in nl-to-sql.ts)
- Only `SELECT` / `WITH ... SELECT` statements pass validation
- Blocklist of forbidden keywords: INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, EXECUTE, CALL
- Markdown fence stripping (models sometimes wrap output in ```sql)
- BigInt → Number serialisation for JSON compatibility

## Verification
1. `npm run build` — ensure no TypeScript errors
2. Start dev server, navigate to `/dashboard/nl-query`
3. Submit a query like "How many members attended GP events each year?"
4. Confirm: generated SQL is displayed, results table renders, no LLM post-processing
