"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Database } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { DataQualityHeatmap } from "@/components/charts/data-quality-heatmap";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataQualityCell } from "@/types/api";

export default function DataQualityPage() {
  const [data, setData] = useState<DataQualityCell[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/data-quality");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Failed to fetch data quality:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute KPI values
  const totalIssues = data?.filter((d) => d.nullPct > 0).length ?? 0;
  const highestNullColumn = data?.length
    ? (() => {
        const columnAvg = new Map<string, { sum: number; count: number }>();
        for (const d of data) {
          if (!columnAvg.has(d.column)) {
            columnAvg.set(d.column, { sum: 0, count: 0 });
          }
          const entry = columnAvg.get(d.column)!;
          entry.sum += d.nullPct;
          entry.count += 1;
        }
        let worst = "";
        let worstAvg = 0;
        for (const [col, { sum, count }] of columnAvg) {
          const avg = sum / count;
          if (avg > worstAvg) {
            worstAvg = avg;
            worst = col;
          }
        }
        return worst || "N/A";
      })()
    : "N/A";

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Data Quality</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Data Issues"
              value={totalIssues}
              icon={AlertTriangle}
              description="Column-year cells with nulls"
            />
            <KpiCard
              title="Highest Null Column"
              value={highestNullColumn}
              icon={Database}
              description="Highest avg null rate"
            />
          </>
        )}
      </div>

      {/* Row 2: Data Quality Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Data Quality Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !data ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <DataQualityHeatmap data={data} />
          )}
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground leading-relaxed">
            The heatmap above shows the null/missing value rate for each database column
            across all years. Columns are sorted by their average null rate (worst at top).
            Green cells indicate complete data (0% null), while red cells indicate high
            rates of missing values. Use this view to identify data quality issues and
            prioritize data collection or imputation efforts for specific columns and years.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
