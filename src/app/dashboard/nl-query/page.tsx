"use client";

import { useState, useRef } from "react";
import { Search, Loader2, Clock, Database, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface QueryResult {
  sql: string;
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  source: "golden" | "cache" | "llm";
}

const EXAMPLE_QUERIES = [
  "How many members attended GP events each year?",
  "Top 10 hotels by total bookings across all events",
  "Show the gender split for each zone",
  "Which members attended every GP event?",
  "Average family size by zone",
  "Monthly gnan record count for 2024",
];

export default function NLQueryPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(q?: string) {
    const query = q ?? question;
    if (!query.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/nl-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Request failed");
      } else {
        setResult(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(q: string) {
    setQuestion(q);
    handleSubmit(q);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Natural Language Query</h2>
        <p className="text-muted-foreground mt-1">
          Ask questions about your data in plain English. Claude translates them
          into SQL and runs them against the database.
        </p>
      </div>

      {/* Query Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <textarea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="e.g. How many members attended events in 2024?"
              rows={2}
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              onClick={() => handleSubmit()}
              disabled={loading || !question.trim()}
              className="inline-flex h-auto items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
            </button>
          </div>

          {/* Example queries */}
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => handleExampleClick(q)}
                disabled={loading}
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">Query failed</p>
                <p className="mt-1 text-sm">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Generated SQL */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="size-4" />
                Generated SQL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-4 text-xs leading-relaxed">
                <code>{result.sql}</code>
              </pre>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  {result.durationMs}ms
                </span>
                <span>{result.rowCount} row{result.rowCount !== 1 ? "s" : ""} returned</span>
                <span className={
                  result.source === "golden"
                    ? "rounded-full bg-green-100 px-2 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : result.source === "cache"
                      ? "rounded-full bg-blue-100 px-2 py-0.5 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                }>
                  {result.source === "golden" ? "Catalog" : result.source === "cache" ? "Cached" : "LLM Generated"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          {result.rows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {Object.keys(result.rows[0]).map((col) => (
                          <th
                            key={col}
                            className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b last:border-0 hover:bg-muted/50"
                        >
                          {Object.values(row).map((val, j) => (
                            <td
                              key={j}
                              className="whitespace-nowrap px-3 py-2"
                            >
                              {val === null
                                ? <span className="text-muted-foreground italic">null</span>
                                : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
