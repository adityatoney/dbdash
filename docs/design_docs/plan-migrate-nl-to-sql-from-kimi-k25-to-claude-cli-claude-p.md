# Plan: Migrate NL-to-SQL from Kimi K2.5 to Claude CLI (`claude -p`)

## Context
The NL-to-SQL feature currently uses Moonshot AI's Kimi K2.5 via the OpenAI SDK. The user has a Claude Max subscription and wants to use Claude instead. Since Max uses OAuth login (not API keys), we use the **headless CLI** (`claude -p`) which inherits the existing OAuth session — no `ANTHROPIC_API_KEY` needed.

## What Changes

| File | Action | Details |
|------|--------|---------|
| `package.json` | Modify | Remove `openai` dependency (no new package needed — `claude` CLI is already installed globally) |
| `src/lib/kimi.ts` | **Delete** | No longer needed |
| `src/lib/nl-to-sql.ts` | Rewrite LLM call | Replace OpenAI SDK call with `claude -p` subprocess |
| `src/app/api/nl-query/route.ts` | Simplify | Remove `KIMI_API_KEY` env check entirely (OAuth handles auth) |
| `.env.example` | Update | Remove `KIMI_API_KEY` line |
| `src/app/dashboard/nl-query/page.tsx` | Update copy | "Kimi K2.5" → "Claude" in description text |

## What Stays the Same
- `SCHEMA_CONTEXT` (full DDL) and `SYSTEM_PROMPT` — model-agnostic
- `sanitiseSQL()` with SELECT-only enforcement + forbidden keyword blocklist
- `prisma.$queryRawUnsafe` execution + BigInt serialisation
- `NLQueryResult` interface and API response shape
- Frontend UI (textarea, example chips, SQL display, results table)
- Sidebar nav item

## Implementation Details

### `src/lib/nl-to-sql.ts` — new LLM call via `claude -p`

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Inside executeNLQuery():
const { stdout } = await execFileAsync("claude", [
  "-p", combinedPrompt,       // system prompt + schema + question as single prompt
  "--output-format", "json",  // structured JSON response
  "--model", "sonnet",        // fast + capable for SQL gen
  "--allowedTools", "",       // no tools — pure text generation
  "--max-turns", "1",         // single turn, no looping
], {
  timeout: 30_000,            // 30s safety timeout
});

const parsed = JSON.parse(stdout);
const rawSQL = parsed.result.trim();
```

**Key flags:**
- **`-p`** — headless/non-interactive mode, uses existing Max OAuth session
- **`--output-format json`** — returns `{ result, session_id, ... }` as JSON
- **`--allowedTools ""`** — disables all tools (Bash/Read/Write/etc.), pure text generation
- **`--max-turns 1`** — single prompt→response, no agent loop
- **`--model sonnet`** — Claude Sonnet for fast SQL generation

**Prompt strategy:** Concatenate `SYSTEM_PROMPT` (which contains `SCHEMA_CONTEXT`) with the user question into a single `-p` argument. Use `--append-system-prompt` for the schema/rules and pass the user question as the `-p` value:

```typescript
const { stdout } = await execFileAsync("claude", [
  "-p", question,
  "--append-system-prompt", SYSTEM_PROMPT,
  "--output-format", "json",
  "--model", "sonnet",
  "--allowedTools", "",
  "--max-turns", "1",
], { timeout: 30_000 });
```

### `src/app/api/nl-query/route.ts` — simplified

Remove the `KIMI_API_KEY` env check entirely. The CLI authenticates via the user's existing `claude` login session on the machine.

### Environment
- Remove `KIMI_API_KEY` from `.env.example`
- No new env vars needed — `claude` CLI uses OAuth from `~/.claude/`
- **Prerequisite:** `claude` CLI installed and logged in (`claude login` done once)

## Verification
1. `npm uninstall openai --legacy-peer-deps`
2. `rm src/lib/kimi.ts`
3. `npx tsc --noEmit` — no TypeScript errors in changed files
4. Confirm `claude -p "SELECT 1" --output-format json` works from terminal (OAuth active)
5. Start dev server, navigate to `/dashboard/nl-query`
6. Submit "How many members attended GP events each year?" → confirm SQL + results render
