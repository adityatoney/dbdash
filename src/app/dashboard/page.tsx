"use client";

import { useEffect, useState } from "react";
import { Users, Calendar, TrendingUp, Award } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { AttendanceLineChart } from "@/components/charts/attendance-line-chart";
import { EventTypePieChart } from "@/components/charts/event-type-pie-chart";
import { GnanTrendArea } from "@/components/charts/gnan-trend-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  OverviewStats,
  AttendanceTrend,
  EventDistribution,
} from "@/types/api";

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [attendance, setAttendance] = useState<AttendanceTrend[] | null>(null);
  const [distribution, setDistribution] = useState<EventDistribution[] | null>(null);
  const [gnan, setGnan] = useState<{ year: number; count: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, attendanceRes, distRes, gnanRes] = await Promise.all([
          fetch("/api/stats/overview"),
          fetch("/api/growth/attendance"),
          fetch("/api/events/distribution"),
          fetch("/api/growth/gnan"),
        ]);
        const [statsData, attendanceData, distData, gnanData] = await Promise.all([
          statsRes.json(),
          attendanceRes.json(),
          distRes.json(),
          gnanRes.json(),
        ]);
        setStats(statsData);
        setAttendance(attendanceData);
        setDistribution(distData);
        setGnan(gnanData);
      } catch (error) {
        console.error("Failed to fetch overview data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard Overview</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
                <Skeleton className="mt-2 h-3 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Members"
              value={stats?.totalMembers?.toLocaleString() ?? "0"}
              icon={Users}
              description="Registered members"
            />
            <KpiCard
              title="Total Events"
              value={stats?.totalEvents?.toLocaleString() ?? "0"}
              icon={Calendar}
              description="Events organized"
            />
            <KpiCard
              title="Latest GP Attendance"
              value={stats?.latestGPAttendance?.toLocaleString() ?? "0"}
              icon={TrendingUp}
              trend={
                stats?.gpGrowthPct != null
                  ? { value: stats.gpGrowthPct, isPositive: stats.gpGrowthPct >= 0 }
                  : undefined
              }
              description="Year-over-year"
              footnote="Unique attendees (deduplicated by member). Source XLSX may show higher counts due to multiple room-booking rows per person."
            />
            <KpiCard
              title="Total Gnan Initiations"
              value={stats?.totalGnan?.toLocaleString() ?? "0"}
              icon={Award}
              description="Cumulative initiations"
            />
          </>
        )}
      </div>

      {/* Row 2: Attendance Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !attendance ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <AttendanceLineChart data={attendance} />
          )}
        </CardContent>
      </Card>

      {/* Row 3: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Event Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !distribution ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <EventTypePieChart data={distribution} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gnan Initiation Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !gnan ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <GnanTrendArea data={gnan} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
