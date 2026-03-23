"use client";

import { useEffect, useState } from "react";
import { TrendingUp, BarChart3, Award } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { AttendanceLineChart } from "@/components/charts/attendance-line-chart";
import { GnanTrendArea } from "@/components/charts/gnan-trend-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/constants";
import type { OverviewStats, AttendanceTrend } from "@/types/api";

interface RetentionData {
  year: number;
  total: number;
  newMembers: number;
  returningMembers: number;
}

const retentionChartConfig = {
  newMembers: {
    label: "New Members",
    color: CHART_COLORS[1],
  },
  returningMembers: {
    label: "Returning Members",
    color: CHART_COLORS[0],
  },
} satisfies ChartConfig;

export default function GrowthPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTrend[] | null>(null);
  const [retention, setRetention] = useState<RetentionData[] | null>(null);
  const [gnan, setGnan] = useState<{ year: number; count: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, attendanceRes, retentionRes, gnanRes] = await Promise.all([
          fetch("/api/stats/overview"),
          fetch("/api/growth/attendance"),
          fetch("/api/growth/retention"),
          fetch("/api/growth/gnan"),
        ]);
        const [statsData, attendanceData, retentionData, gnanData] = await Promise.all([
          statsRes.json(),
          attendanceRes.json(),
          retentionRes.json(),
          gnanRes.json(),
        ]);
        setStats(statsData);
        setAttendance(attendanceData);
        setRetention(retentionData);
        setGnan(gnanData);
      } catch (error) {
        console.error("Failed to fetch growth data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const latestGP = attendance?.length
    ? attendance[attendance.length - 1].gpAttendance
    : 0;

  const cumulativeGnan = gnan?.reduce((sum, d) => sum + d.count, 0) ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Growth Trends</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
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
              title="GP 2025 Attendance"
              value={latestGP.toLocaleString()}
              icon={TrendingUp}
              description="Latest GP event"
            />
            <KpiCard
              title="YoY Growth %"
              value={`${stats?.gpGrowthPct?.toFixed(1) ?? "0"}%`}
              icon={BarChart3}
              trend={
                stats?.gpGrowthPct != null
                  ? { value: stats.gpGrowthPct, isPositive: stats.gpGrowthPct >= 0 }
                  : undefined
              }
              description="GP attendance growth"
            />
            <KpiCard
              title="Cumulative Gnan"
              value={cumulativeGnan.toLocaleString()}
              icon={Award}
              description="Total initiations"
            />
          </>
        )}
      </div>

      {/* Row 2: Attendance Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle>GP Attendance Trajectory</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !attendance ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <AttendanceLineChart data={attendance} />
          )}
        </CardContent>
      </Card>

      {/* Row 3: New vs Returning Members */}
      <Card>
        <CardHeader>
          <CardTitle>New vs Returning Members</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !retention ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ChartContainer config={retentionChartConfig} className="min-h-[300px] w-full">
              <BarChart data={retention} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => String(value)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value.toLocaleString()}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Legend />
                <Bar
                  dataKey="returningMembers"
                  stackId="members"
                  fill="var(--color-returningMembers)"
                  radius={[0, 0, 0, 0]}
                  name="Returning Members"
                />
                <Bar
                  dataKey="newMembers"
                  stackId="members"
                  fill="var(--color-newMembers)"
                  radius={[4, 4, 0, 0]}
                  name="New Members"
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Row 4: Gnan Date Trend — full width */}
      <Card>
        <CardHeader>
          <CardTitle>Gnan Date Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !gnan ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <GnanTrendArea data={gnan} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
